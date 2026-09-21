import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { touchIds } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import app from "../src/app";
import { initializeAssessmentRuns } from "../src/lib/assessment-runs";
import { providerResponse } from "./assessment-fixture";
import { sequenceFixture, settings } from "./sequence-fixture";
import { hashPacket, normalizeEvidence } from "../src/lib/bsb-v2";
import { validateModelAssessment } from "../src/lib/live-assessment";
import { assessmentFixture } from "./assessment-fixture";

let server: Server, base: string;
const realFetch = fetch;
const packets: string[] = [];
let calls: string[] = [];
let modelInputs: any[] = [];
let writer: () => Promise<Response>;
let reviewer: () => Promise<Response>;
let release: undefined | (() => void);
beforeAll(async () => {
  await initializeAssessmentRuns();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("no server");
  base = `http://127.0.0.1:${addr.port}/api/bsb-v2`;
});
beforeEach(() => {
  calls = [];
  modelInputs = [];
  release = undefined;
  writer = async () => providerResponse({ touches: sequenceFixture().touches });
  reviewer = async () => providerResponse(sequenceFixture().review);
  for (const [k, v] of Object.entries({
    BSB_LIVE_ASSESSMENT: "true",
    OPENAI_API_KEY: "synthetic",
    BSB_ASSESSMENT_MODEL: "gpt-5.6-terra",
    BSB_AI_MAX_JOB_USD: "2",
    BSB_AI_DAILY_BUDGET_USD: "5",
  }))
    vi.stubEnv(k, v);
  vi.stubGlobal("fetch", async (url: any, init: any) => {
    if (String(url) !== "https://api.openai.com/v1/responses")
      return realFetch(url, init);
    const request = JSON.parse(init.body);
    const name = request.text.format.name;
    calls.push(name);
    modelInputs.push(JSON.parse(request.input));
    if (name === "bsb_sequence") return writer();
    if (name === "bsb_sequence_review") return reviewer();
    throw Error("Unexpected provider request");
  });
});
afterEach(async () => {
  release?.();
  for (const id of packets) {
    for (let n = 0; n < 100; n++) {
      const { rows } = await pool.query(
        "SELECT id FROM bsb_v2_sequence_jobs WHERE packet_id=$1 AND state IN ('QUEUED','WRITING','VALIDATING')",
        [id],
      );
      if (!rows.length) break;
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await pool.query(
    "DELETE FROM bsb_v2_sequence_jobs WHERE packet_id=ANY($1::text[])",
    [packets],
  );
  await pool.query(
    "DELETE FROM bsb_v2_assessment_runs WHERE packet_id=ANY($1::text[])",
    [packets],
  );
  await pool.query("DELETE FROM bsb_v2_packets WHERE id=ANY($1::text[])", [
    packets,
  ]);
  packets.length = 0;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
async function request(path: string, body?: unknown, signal?: AbortSignal) {
  const res = await realFetch(base + path, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal,
  });
  const data = res.headers.get("content-type")?.includes("json")
    ? await res.json()
    : await res.text();
  return { status: res.status, body: data as any };
}
async function packet() {
  const f = assessmentFixture();
  f.packet.brief += randomUUID();
  const version = hashPacket(f.packet);
  const a = validateModelAssessment(f.model, f.evidence, version);
  const id = randomUUID();
  packets.push(id);
  await pool.query(
    `INSERT INTO bsb_v2_packets(id,owner_id,input_hash,evidence_version,stage,research_packet,normalized_evidence,validation,assessment,review) VALUES($1,'shared-workspace',$2,$2,'APPROVED',$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb)`,
    [
      id,
      version,
      JSON.stringify(f.packet),
      JSON.stringify(normalizeEvidence(f.packet).normalized),
      JSON.stringify({
        structurallyValid: true,
        supportValid: false,
        errors: [],
        warnings: [],
      }),
      JSON.stringify(a),
      JSON.stringify({
        id: randomUUID(),
        decision: "APPROVE",
        approvedInstruments: ["CosMx"],
        evidenceVersion: version,
        demoMode: false,
      }),
    ],
  );
  return id;
}
const body = () => ({ idempotencyKey: randomUUID(), settings });
async function terminal(id: string) {
  for (let n = 0; n < 200; n++) {
    const r = await request(`/sequences/${id}`);
    if (!["QUEUED", "WRITING", "VALIDATING"].includes(r.body.state))
      return r.body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("job never finished");
}
const paused = () =>
  new Promise<void>((r) => {
    release = r;
  });
function unsafeReview() {
  const r = sequenceFixture().review as any;
  r.reviews[0].violations = [
    {
      ruleId: "UNSUPPORTED_BRIDGE",
      rejectedSpan:
        "I thought this would be relevant to your research model training.",
      message: "Synthetic adversarial rejection of the proposed bridge.",
      nextAction: "Use a narrower supported relationship.",
    },
  ];
  return r;
}

describe("durable sequence HTTP workflow", () => {
  it("continues after the submitting client disconnects and reconnects without a duplicate call", async () => {
    const id = await packet();
    const input = body();
    const wait = paused();
    writer = async () => {
      await wait;
      return providerResponse({ touches: sequenceFixture().touches });
    };
    const controller = new AbortController();
    const pendingRequest = request(
      `/packets/${id}/sequences`,
      input,
      controller.signal,
    ).catch(() => null);
    for (let n = 0; n < 100 && calls.length === 0; n++)
      await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(1);
    controller.abort();
    await pendingRequest;
    const history = await request(`/packets/${id}/sequences`);
    expect(history.body).toHaveLength(1);
    const resumed = await request(`/packets/${id}/sequences`, input);
    expect(resumed.body.id).toBe(history.body[0].id);
    release!();
    expect((await terminal(resumed.body.id)).state).toBe("APPROVED");
    expect(calls).toEqual(["bsb_sequence", "bsb_sequence_review"]);
  });
  it("saves eight ordered validated touches, provenance, usage and hash exactly once", async () => {
    const id = await packet();
    const input = body();
    const start = await request(`/packets/${id}/sequences`, input);
    expect(start.status).toBe(202);
    const job = await terminal(start.body.id);
    expect(job.state).toBe("APPROVED");
    expect(job.sequence.map((t: any) => t.touchId)).toEqual(touchIds);
    expect(job.usage).toHaveLength(2);
    expect(job.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const again = await request(`/packets/${id}/sequences`, input);
    expect(again.body.id).toBe(job.id);
    expect(calls).toEqual(["bsb_sequence", "bsb_sequence_review"]);
    const exported = await request(`/sequences/${job.id}/export`);
    expect(exported.status).toBe(200);
    expect(exported.body).toContain("Best regards,");
  });
  it("deduplicates concurrent actions and rejects same key with different settings", async () => {
    const id = await packet();
    const input = body();
    const pending = paused();
    writer = async () => {
      await pending;
      return providerResponse({ touches: sequenceFixture().touches });
    };
    const [a, b] = await Promise.all([
      request(`/packets/${id}/sequences`, input),
      request(`/packets/${id}/sequences`, input),
    ]);
    expect(a.body.id).toBe(b.body.id);
    expect(calls).toHaveLength(1);
    expect(
      (
        await request(`/packets/${id}/sequences`, {
          ...input,
          settings: { ...settings, mode: "INDIVIDUAL", firstName: "Alex" },
        })
      ).status,
    ).toBe(409);
    release!();
    await terminal(a.body.id);
  });
  it("blocks unapproved input and malformed settings before a paid call", async () => {
    const id = await packet();
    await pool.query("UPDATE bsb_v2_packets SET stage='ASSESSED' WHERE id=$1", [
      id,
    ]);
    expect((await request(`/packets/${id}/sequences`, body())).status).toBe(
      409,
    );
    await pool.query("UPDATE bsb_v2_packets SET stage='APPROVED' WHERE id=$1", [
      id,
    ]);
    expect(
      (
        await request(`/packets/${id}/sequences`, {
          ...body(),
          settings: { ...settings, timezone: "invalid" },
        })
      ).status,
    ).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("blocks deterministic violations even when the semantic reviewer returns no findings", async () => {
    const id = await packet();
    const t = sequenceFixture().touches;
    t[0].middle = "GeoMx cures disease with 99 proteins.";
    writer = async () => providerResponse({ touches: t });
    const job = await terminal(
      (await request(`/packets/${id}/sequences`, body())).body.id,
    );
    expect(job.state).toBe("VALIDATION_FAILED");
    expect(job.sequence).toBeNull();
    expect(
      job.violations.some((v: any) => v.ruleId === "INSTRUMENT_SCOPE"),
    ).toBe(true);
    expect((await request(`/sequences/${job.id}/export`)).status).toBe(409);
    const row = (
      await pool.query(
        "SELECT sequence,safe_touches FROM bsb_v2_sequence_jobs WHERE id=$1",
        [job.id],
      )
    ).rows[0];
    expect(JSON.stringify(row)).not.toContain("GeoMx cures");
  });
  it("regenerates only rejected touches once and revalidates the entire sequence", async () => {
    const id = await packet();
    reviewer = async () => providerResponse(unsafeReview());
    const first = await terminal(
      (await request(`/packets/${id}/sequences`, body())).body.id,
    );
    expect(first.canRegenerate).toBe(true);
    reviewer = async () => providerResponse(sequenceFixture().review);
    const next = await terminal(
      (
        await request(`/sequences/${first.id}/regenerate`, {
          idempotencyKey: randomUUID(),
        })
      ).body.id,
    );
    expect(next.state).toBe("APPROVED");
    expect(next.retryOf).toBe(first.id);
    expect(modelInputs[2].repairIds).toEqual(["email1"]);
    expect(modelInputs[2].feedback).toEqual(first.violations);
    expect(modelInputs[2].preservedTouches).toHaveLength(7);
    expect((await request(`/sequences/${first.id}`)).body.canRegenerate).toBe(
      false,
    );
    expect(calls).toHaveLength(4);
    expect(
      (
        await request(`/sequences/${first.id}/regenerate`, {
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe(409);
  });
  it.each(["changed", "omitted"])(
    "stops when targeted regeneration has a %s preserved touch",
    async (fault) => {
      const id = await packet();
      reviewer = async () => providerResponse(unsafeReview());
      const first = await terminal(
        (await request(`/packets/${id}/sequences`, body())).body.id,
      );
      const t = sequenceFixture().touches;
      if (fault === "changed") t[1].middle += " Altered.";
      else t[1] = { ...t[0] };
      writer = async () => providerResponse({ touches: t });
      const next = await terminal(
        (
          await request(`/sequences/${first.id}/regenerate`, {
            idempotencyKey: randomUUID(),
          })
        ).body.id,
      );
      expect(next.state).toBe("PROVIDER_FAILED");
      expect(next.error).toContain("preserved");
      expect(next.sequence).toBeNull();
      expect(calls).toHaveLength(3);
      expect((await request(`/sequences/${next.id}/export`)).status).toBe(409);
      writer = async () =>
        providerResponse({ touches: sequenceFixture().touches });
      reviewer = async () => providerResponse(sequenceFixture().review);
      const restarted = await request(`/packets/${id}/sequences`, body());
      expect(restarted.status).toBe(202);
      expect((await terminal(restarted.body.id)).state).toBe("APPROVED");
    },
  );
  it("keeps a second unsafe regeneration unsaved and stops at its cap", async () => {
    const id = await packet();
    reviewer = async () => providerResponse(unsafeReview());
    const first = await terminal(
      (await request(`/packets/${id}/sequences`, body())).body.id,
    );
    const next = await terminal(
      (
        await request(`/sequences/${first.id}/regenerate`, {
          idempotencyKey: randomUUID(),
        })
      ).body.id,
    );
    expect(next.state).toBe("VALIDATION_FAILED");
    expect(next.canRegenerate).toBe(false);
    expect(next.sequence).toBeNull();
  });
  it("validates edited revisions without overwriting approved history", async () => {
    const id = await packet();
    const first = await terminal(
      (await request(`/packets/${id}/sequences`, body())).body.id,
    );
    const t = sequenceFixture().touches;
    t[0].subject = "Spatial RNA research";
    const next = await terminal(
      (
        await request(`/packets/${id}/sequences`, {
          ...body(),
          editOf: first.id,
          edits: t,
        })
      ).body.id,
    );
    expect(next.state).toBe("APPROVED");
    expect(next.revisionOf).toBe(first.id);
    expect(next.usage).toHaveLength(1);
    expect(calls.filter((c) => c === "bsb_sequence")).toHaveLength(1);
    expect((await request(`/sequences/${first.id}`)).body.contentHash).toBe(
      first.contentHash,
    );
    expect(next.contentHash).not.toBe(first.contentHash);
  });
  it("does not export an unsafe edit; the previous approved revision stays readable", async () => {
    const id = await packet();
    const first = await terminal(
      (await request(`/packets/${id}/sequences`, body())).body.id,
    );
    const t = sequenceFixture().touches;
    t[0].middle = "GeoMx cures disease.";
    const next = await terminal(
      (
        await request(`/packets/${id}/sequences`, {
          ...body(),
          editOf: first.id,
          edits: t,
        })
      ).body.id,
    );
    expect(next.state).toBe("VALIDATION_FAILED");
    expect((await request(`/sequences/${next.id}/export`)).status).toBe(409);
    expect((await request(`/sequences/${first.id}/export`)).status).toBe(200);
  });
  it("cancels during writing and starts no semantic call or approved save", async () => {
    const id = await packet();
    const wait = paused();
    writer = async () => {
      await wait;
      return providerResponse({ touches: sequenceFixture().touches });
    };
    const start = await request(`/packets/${id}/sequences`, body());
    expect(
      (await request(`/sequences/${start.body.id}/cancel`, {})).body.state,
    ).toBe("CANCELED");
    release!();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toHaveLength(1);
    expect(
      (await request(`/sequences/${start.body.id}`)).body.sequence,
    ).toBeNull();
  });
  it("serializes cancellation against final save and reports approval when it already won", async () => {
    const id = await packet();
    const wait = paused();
    reviewer = async () => {
      await wait;
      return providerResponse(sequenceFixture().review);
    };
    const start = await request(`/packets/${id}/sequences`, body());
    for (let n = 0; n < 100 && calls.length < 2; n++)
      await new Promise((r) => setTimeout(r, 10));
    await request(`/sequences/${start.body.id}/cancel`, {});
    release!();
    await new Promise((r) => setTimeout(r, 30));
    expect((await request(`/sequences/${start.body.id}`)).body.state).toBe(
      "CANCELED",
    );
    reviewer = async () => providerResponse(sequenceFixture().review);
    const next = await terminal(
      (await request(`/packets/${id}/sequences`, body())).body.id,
    );
    expect((await request(`/sequences/${next.id}/cancel`, {})).body.state).toBe(
      "APPROVED",
    );
  });
  it("blocks saving after authority changes during a paid call", async () => {
    const id = await packet();
    const wait = paused();
    writer = async () => {
      await wait;
      return providerResponse({ touches: sequenceFixture().touches });
    };
    const start = await request(`/packets/${id}/sequences`, body());
    await pool.query(
      "UPDATE bsb_v2_packets SET review=jsonb_set(review,'{id}','\"changed-review\"') WHERE id=$1",
      [id],
    );
    release!();
    const job = await terminal(start.body.id);
    expect(job.state).toBe("PROVIDER_FAILED");
    expect(job.error).toContain("changed");
    expect(job.sequence).toBeNull();
    expect(calls).toHaveLength(1);
  });
  it("retains uncertain charges and blocks another paid job after a provider disconnect", async () => {
    const id = await packet();
    writer = async () => {
      throw Error("provider disconnected");
    };
    const job = await terminal(
      (await request(`/packets/${id}/sequences`, body())).body.id,
    );
    expect(job.state).toBe("RECOVERY_REQUIRED");
    expect(job.reservedUsd).toBe(0.7);
    expect((await request(`/packets/${id}/sequences`, body())).status).toBe(
      409,
    );
    expect(calls).toHaveLength(1);
  });
  it("marks a lost worker uncertain instead of automatically re-running it", async () => {
    const id = await packet();
    const wait = paused();
    writer = async () => {
      await wait;
      return providerResponse({ touches: sequenceFixture().touches });
    };
    const start = await request(`/packets/${id}/sequences`, body());
    await pool.query(
      "UPDATE bsb_v2_sequence_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",
      [start.body.id],
    );
    expect((await request(`/sequences/${start.body.id}`)).body.state).toBe(
      "RECOVERY_REQUIRED",
    );
    release!();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toHaveLength(1);
    expect((await request(`/sequences/${start.body.id}/export`)).status).toBe(
      409,
    );
  });
  it("shares the daily cap with assessment and respects the regeneration job cap", async () => {
    const id = await packet();
    vi.stubEnv("BSB_AI_DAILY_BUDGET_USD", "1");
    await pool.query(
      "INSERT INTO bsb_v2_assessment_runs(id,packet_id,evidence_version,attempt,state,reserved_micro_usd,model,prompt_version) VALUES($1,$2,'v',1,'COMPLETED',350000,'test','test')",
      [randomUUID(), id],
    );
    expect((await request(`/packets/${id}/sequences`, body())).status).toBe(
      429,
    );
    expect(calls).toHaveLength(0);
    vi.stubEnv("BSB_AI_DAILY_BUDGET_USD", "5");
    vi.stubEnv("BSB_AI_MAX_JOB_USD", "1");
    reviewer = async () => providerResponse(unsafeReview());
    const first = await terminal(
      (await request(`/packets/${id}/sequences`, body())).body.id,
    );
    expect(
      (
        await request(`/sequences/${first.id}/regenerate`, {
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe(429);
    expect(calls).toHaveLength(2);
  });
});
