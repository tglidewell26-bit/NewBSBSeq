import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import app from "../src/app";
import { initializeAssessmentRuns } from "../src/lib/assessment-runs";
import { DeterministicFakeProvider, hashPacket } from "../src/lib/bsb-v2";
import { assessmentFixture, providerResponse } from "./assessment-fixture";

let server: Server;
let baseUrl: string;
const ids: string[] = [];
const realFetch = fetch;
let providerCalls = 0;
let provider: () => Promise<Response>;

beforeAll(async () => {
  await initializeAssessmentRuns();
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  providerCalls = 0;
  provider = async () => providerResponse(assessmentFixture().model);
  for (const [key, value] of Object.entries({ BSB_LIVE_ASSESSMENT: "true", OPENAI_API_KEY: "synthetic-test-key",
    BSB_ASSESSMENT_MODEL: "gpt-5.6-terra", BSB_AI_MAX_JOB_USD: "1", BSB_AI_DAILY_BUDGET_USD: "5" })) vi.stubEnv(key, value);
  vi.stubGlobal("fetch", (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) !== "https://api.openai.com/v1/responses") return realFetch(url, init);
    providerCalls++;
    const payload = JSON.parse(String(init?.body));
    expect(JSON.parse(payload.input).evidence.map((e: any) => e.evidenceId)).toEqual(["account-workflow", "public-research"]);
    return provider();
  });
});
afterEach(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  await pool.query("DELETE FROM bsb_v2_assessment_runs WHERE packet_id = ANY($1::text[])", [ids]);
  await pool.query("DELETE FROM bsb_v2_packets WHERE id = ANY($1::text[])", [ids]);
  ids.length = 0;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

async function request(path: string, body?: unknown, signal?: AbortSignal) {
  const res = await realFetch(`${baseUrl}/api/bsb-v2${path}`, body === undefined ? { signal } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal,
  });
  return { status: res.status, body: await res.json() as any };
}
async function submit() {
  const { packet } = assessmentFixture();
  packet.brief += ` ${randomUUID()}`;
  const result = await request("/packets", { researchPacket: packet });
  expect(result.status).toBe(201); ids.push(result.body.id);
  return result.body;
}

describe("bounded live assessment through actual HTTP and SQL", () => {
  it("keeps disabled or malformed requests free and does not save fake qualification", async () => {
    const packet = await submit();
    vi.stubEnv("BSB_LIVE_ASSESSMENT", "false");
    expect((await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" })).status).toBe(503);
    expect((await request(`/packets/${packet.id}/assess`, { mode: "wrong" })).status).toBe(400);
    const reload = await request(`/packets/${packet.id}`);
    expect(reload.body.assessment).toBeUndefined();
    expect(reload.body.assessmentRun).toBeUndefined();
    expect(providerCalls).toBe(0);
  });

  it("preserves nested evidence, saves a live assessment and approves only the selected instrument", async () => {
    const packet = await submit();
    const result = await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" });
    expect(result.status).toBe(200);
    expect(result.body.selectedInstruments).toEqual(["CosMx"]);
    expect(result.body.mock).toBe(false);
    const reload = (await request(`/packets/${packet.id}`)).body;
    expect(reload.researchPacket).toEqual(packet.researchPacket);
    expect(reload.assessmentRun).toMatchObject({ state: "COMPLETED", attempt: 1, reservedUsd: 0.35 });
    expect(reload.assessmentRun.usage.inputTokens).toBe(1200);
    const review = { assessmentId: result.body.id, evidenceVersion: packet.inputHash, decision: "APPROVE", approvedInstruments: ["GeoMx"], note: "Synthetic review", confirmSecond: false };
    expect((await request(`/packets/${packet.id}/reviews`, review)).status).toBe(409);
    review.approvedInstruments = ["CosMx"];
    expect((await request(`/packets/${packet.id}/reviews`, review)).status).toBe(200);
    expect((await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" })).body.id).toBe(result.body.id);
    expect(providerCalls).toBe(1);
  });

  it("deduplicates concurrent requests before a paid call", async () => {
    const packet = await submit();
    const responses = await Promise.all([request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" }), request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" })]);
    expect(responses.some(r => r.status === 200)).toBe(true);
    expect(responses.every(r => [200, 409].includes(r.status))).toBe(true);
    expect(providerCalls).toBe(1);
  });

  it("serializes the global daily budget across different packets", async () => {
    vi.stubEnv("BSB_AI_DAILY_BUDGET_USD", "0.35");
    const a = await submit(), b = await submit();
    const responses = await Promise.all([a, b].map(packet => request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 429]);
    expect(providerCalls).toBe(1);
  });

  it("rejects unsupported output without saving it and requires an explicit bounded retry", async () => {
    const packet = await submit();
    const bad = assessmentFixture().model;
    bad.instruments[1].evidenceIds = ["invented"];
    provider = async () => providerResponse(bad);
    const rejected = await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" });
    expect(rejected.status).toBe(422);
    expect(rejected.body.issues[0].path).toContain("evidenceIds");
    const reload = (await request(`/packets/${packet.id}`)).body;
    expect(reload.assessment).toBeUndefined();
    expect(reload.assessmentRun).toMatchObject({ state: "FAILED", reservedUsd: 0.35 });
    expect((await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" })).status).toBe(409);
    expect(providerCalls).toBe(1);
    provider = async () => providerResponse(assessmentFixture().model);
    expect((await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT", retry: true })).status).toBe(200);
    expect(providerCalls).toBe(2);
  });

  it("retains uncertain costs across midnight and blocks another paid attempt", async () => {
    vi.stubEnv("BSB_AI_DAILY_BUDGET_USD", "0.35");
    const packet = await submit();
    provider = async () => { throw new Error("simulated timeout"); };
    expect((await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" })).body.errorType).toBe("OUTCOME_UNKNOWN");
    await pool.query("UPDATE bsb_v2_assessment_runs SET started_at=now()-interval '2 days' WHERE packet_id=$1", [packet.id]);
    expect((await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT", retry: true })).status).toBe(409);
    const another = await submit();
    expect((await request(`/packets/${another.id}/assess`, { mode: "REAL_INPUT" })).status).toBe(429);
    expect(providerCalls).toBe(1);
  });

  it("enforces the per-job cap across retries and the two-attempt ceiling", async () => {
    const packet = await submit();
    provider = async () => new Response("unavailable", { status: 503 });
    expect((await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" })).status).toBe(502);
    vi.stubEnv("BSB_AI_MAX_JOB_USD", "0.50");
    expect((await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT", retry: true })).status).toBe(429);
    expect(providerCalls).toBe(1);
    vi.stubEnv("BSB_AI_MAX_JOB_USD", "1");
    expect((await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT", retry: true })).status).toBe(502);
    expect((await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT", retry: true })).body.errorType).toBe("ATTEMPT_LIMIT");
    expect(providerCalls).toBe(2);
  });

  it("preserves completion when the browser stops waiting", async () => {
    const packet = await submit();
    let release!: () => void, started!: () => void;
    const begun = new Promise<void>(resolve => { started = resolve; });
    const waiting = new Promise<void>(resolve => { release = resolve; });
    provider = async () => { started(); await waiting; return providerResponse(assessmentFixture().model); };
    const controller = new AbortController();
    const pending = request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" }, controller.signal).catch(error => error);
    await begun;
    expect((await request(`/packets/${packet.id}`)).body.assessmentRun.state).toBe("RUNNING");
    controller.abort(); release(); await pending;
    await vi.waitFor(async () => expect((await request(`/packets/${packet.id}`)).body.assessmentRun.state).toBe("COMPLETED"));
    expect(providerCalls).toBe(1);
  });

  it("upgrades a saved non-approvable fake result without replacing the research packet", async () => {
    const packet = await submit();
    const fake = new DeterministicFakeProvider().assess(assessmentFixture().evidence, hashPacket(packet.researchPacket));
    await pool.query("UPDATE bsb_v2_packets SET assessment=$1,stage='ASSESSED' WHERE id=$2", [JSON.stringify(fake), packet.id]);
    const result = await request(`/packets/${packet.id}/assess`, { mode: "REAL_INPUT" });
    expect(result.status).toBe(200);
    expect(result.body.provider).toBe("OPENAI");
    expect((await request(`/packets/${packet.id}`)).body.researchPacket).toEqual(packet.researchPacket);
  });
});
