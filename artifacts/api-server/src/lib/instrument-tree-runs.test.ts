import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), release: vi.fn(), model: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock("./sequence-jobs", () => ({ initializeSequenceJobs: vi.fn() }));
vi.mock("./live-assessment", async importOriginal => ({ ...await importOriginal<typeof import("./live-assessment")>(), callAssessmentModel: mocks.model }));
import { AssessmentError } from "./live-assessment";
import { runLiveAssessment, treeBudget } from "./assessment-runs";
import { convertDossier } from "./account-dossier";
import { hashPacket } from "./bsb-v2";
let row: any, run: any;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BSB_LIVE_ASSESSMENT", "true"); vi.stubEnv("BSB_ASSESSMENT_MODEL", "gpt-5.6-terra"); vi.stubEnv("OPENAI_API_KEY", "synthetic-not-a-real-key"); vi.stubEnv("BSB_TREE_MAX_COST_USD", "2");
  const sample = JSON.parse(readFileSync(new URL("../../../../samples/account-dossier-synthetic.json", import.meta.url), "utf8"));
  const packet = convertDossier(sample).researchPacket;
  row = { id: "synthetic", research_packet: packet, evidence_version: hashPacket(packet), stage: "VALIDATED" };
  run = undefined;
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.query.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.startsWith("SELECT * FROM bsb_v2_packets")) return { rows: [row] };
    if (sql.startsWith("SELECT * FROM bsb_v2_assessment_runs")) return { rows: run ? [run] : [] };
    if (sql.startsWith("INSERT INTO bsb_v2_assessment_runs")) run = { id: params[0], attempt: params[3], state: "RUNNING", reserved_micro_usd: params[4] };
    if (sql.startsWith("UPDATE bsb_v2_assessment_runs SET usage")) { run.usage = JSON.parse(params[0]); run.progress = JSON.parse(params[1]); }
    if (sql.startsWith("UPDATE bsb_v2_packets SET assessment")) row.assessment = JSON.parse(params[0]);
    if (sql.startsWith("UPDATE bsb_v2_assessment_runs SET state='COMPLETED'")) run.state = "COMPLETED";
    if (sql.startsWith("UPDATE bsb_v2_assessment_runs SET state=$1")) { run.state = params[0]; run.error = JSON.parse(params[1]); }
    return { rows: [], rowCount: 1 };
  });
  mocks.model.mockResolvedValue({ value: { label: "Unknown", evidenceIds: [], citations: [], reasoning: "No supported evidence answers this question." }, usage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001, model: "gpt-5.6-terra" } });
});
afterEach(() => vi.unstubAllEnvs());
describe("bounded decision-tree runs (synthetic database and model)", () => {
  it("revises a completed run, archives review, and makes zero calls when the edit reaches an outcome", async () => {
    const old = await runLiveAssessment("synthetic");
    row.review = { decision: "APPROVE" };
    const count = mocks.model.mock.calls.length;
    const revised = await runLiveAssessment("synthetic", false, undefined, { assessmentId: old.id, nodeId: "s1", label: "No", reason: "Synthetic customer confirmed no tissue work." });
    expect(mocks.model).toHaveBeenCalledTimes(count);
    expect(revised.decisionTrace.outcome.instrument).toBe("No fit");
    expect(revised.id).not.toBe(old.id);
    expect(revised.parentAssessmentId).toBe(old.id);
    expect(revised.usage.estimatedCostUsd).toBe(0);
    expect(mocks.query.mock.calls.some(([sql, values]) => sql.includes("SET revision=") && JSON.parse(values[0]).originalAssessment.id === old.id)).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE bsb_v2_packets SET assessment") && sql.includes("review=NULL"))).toBe(true);
    await expect(runLiveAssessment("synthetic", false, undefined, { assessmentId: old.id, nodeId: "s1", label: "Yes", reason: "Stale tab" })).rejects.toMatchObject({ code: "STALE_ASSESSMENT" });
    expect(mocks.model).toHaveBeenCalledTimes(count);
  });
  it("blocks edits while another run is active", async () => {
    const old = await runLiveAssessment("synthetic");
    run.state = "RUNNING";
    const count = mocks.model.mock.calls.length;
    await expect(runLiveAssessment("synthetic", false, undefined, { assessmentId: old.id, nodeId: "s1", label: "No", reason: "Synthetic" })).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(mocks.model).toHaveBeenCalledTimes(count);
  });
  it("preserves the previous assessment if the revised suffix fails", async () => {
    const old = await runLiveAssessment("synthetic");
    mocks.model.mockRejectedValueOnce(new AssessmentError("INVALID_MODEL_OUTPUT", "Synthetic failure"));
    await expect(runLiveAssessment("synthetic", false, undefined, { assessmentId: old.id, nodeId: "s1", label: "Yes", reason: "Synthetic confirmation" })).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(row.assessment.id).toBe(old.id);
    expect(run.progress.path[0].humanOverride).toBeDefined();
    expect(run.progress.pendingNodeId).toBe("s3");
  });
  it("saves every step, aggregate usage, snapshot and outcome; repeated submit makes no new calls", async () => {
    const a = await runLiveAssessment("synthetic");
    expect(a.decisionTrace.outcome.instrument).toBe("Keep researching");
    expect(run.progress.path).toEqual(a.decisionTrace.path);
    expect(run.progress.graph).toEqual(a.decisionTrace.graph);
    expect(a.usage.outputTokens).toBe(50 * mocks.model.mock.calls.length);
    expect(run.reserved_micro_usd).toBe(2000000);
    expect(run.state).toBe("COMPLETED");
    const count = mocks.model.mock.calls.length;
    expect(await runLiveAssessment("synthetic")).toEqual(a);
    expect(mocks.model).toHaveBeenCalledTimes(count);
  });
  it("does not silently return a different buyer unit's cached decision", async () => {
    await runLiveAssessment("synthetic");
    const count = mocks.model.mock.calls.length;
    await expect(runLiveAssessment("synthetic", false, "Other unit")).rejects.toMatchObject({ code: "BUYER_UNIT_ALREADY_ASSESSED" });
    expect(mocks.model).toHaveBeenCalledTimes(count);
  });
  it("does not call a provider when live AI is disabled", async () => {
    vi.stubEnv("BSB_LIVE_ASSESSMENT", "false");
    await expect(runLiveAssessment("synthetic")).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it("checks estimated spending before each call", async () => {
    vi.stubEnv("BSB_TREE_MAX_COST_USD", "0.00001");
    await expect(runLiveAssessment("synthetic")).rejects.toMatchObject({ code: "SPENDING_LIMIT" });
    expect(mocks.model).not.toHaveBeenCalled();
    expect(run.state).toBe("FAILED");
    expect(() => treeBudget({ BSB_TREE_MAX_COST_USD: "NaN" })).toThrow();
  });
  it("retains partial progress and charged usage when a later answer is invalid", async () => {
    mocks.model.mockResolvedValueOnce({ value: { label: "Unknown", evidenceIds: [], citations: [], reasoning: "Missing evidence" }, usage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 } });
    mocks.model.mockResolvedValueOnce({ value: { label: "invented" }, usage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 } });
    await expect(runLiveAssessment("synthetic")).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(run.progress.path).toHaveLength(1);
    expect(run.usage.outputTokens).toBe(100);
    expect(run.state).toBe("FAILED");
    expect(row.assessment).toBeUndefined();
    await expect(runLiveAssessment("synthetic")).rejects.toMatchObject({ code: "RETRY_CONFIRMATION_REQUIRED" });
    expect(mocks.model).toHaveBeenCalledTimes(2);
  });
  it("blocks further spending after uncertain provider outcomes", async () => {
    mocks.model.mockRejectedValue(new AssessmentError("OUTCOME_UNKNOWN", "Synthetic timeout"));
    await expect(runLiveAssessment("synthetic")).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(run.state).toBe("OUTCOME_UNKNOWN");
    await expect(runLiveAssessment("synthetic", true)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(mocks.model).toHaveBeenCalledTimes(1);
  });
  it("keeps the explicit two-attempt limit", async () => {
    run = { attempt: 2, state: "FAILED" };
    await expect(runLiveAssessment("synthetic", true)).rejects.toMatchObject({ code: "ATTEMPT_LIMIT" });
    expect(mocks.model).not.toHaveBeenCalled();
  });
});
