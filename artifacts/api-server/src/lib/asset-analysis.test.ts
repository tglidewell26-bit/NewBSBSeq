import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import { analyzeAsset as runAnalysis, buildAssetRequest } from "./asset-analysis";
import { initializeAssessmentRuns } from "./assessment-runs";
import { fileInfo, initializeKnowledgeAssets, validateAsset } from "./knowledge-assets";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9eAAAAABJRU5ErkJggg==";
const testHashes = new Set<string>();
const hashFile = (name: string, data: string) => createHash("sha256").update("asset-definer-1").update("gpt-5.6-terra").update(name).update(Buffer.from(data, "base64")).digest("hex");
const analyzeAsset: typeof runAnalysis = (name, data, fake) => {
  testHashes.add(hashFile(name, data));
  return runAnalysis(name, data, fake);
};
const metadata = { displayName: "Synthetic image", instrument: "Unknown", researchArea: "Unknown", assetType: "Images",
  description: "This is a synthetic test image. It contains no instrument label. It supports no scientific claim.",
  keywords: ["synthetic", "image", "PNG", "test", "unlabelled"], classificationReasoning: "The image does not establish a named instrument." };
const provider = (value: unknown = metadata, count = 500) => vi.fn<typeof fetch>(async () =>
  Response.json({ status: "completed", model: "gpt-5.6-terra", id: "synthetic-response",
    usage: { input_tokens: count, output_tokens: 500 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] }));

beforeAll(async () => { await initializeAssessmentRuns(); await initializeKnowledgeAssets(); });
beforeEach(() => {
  vi.stubEnv("BSB_LIVE_ASSESSMENT", "true"); vi.stubEnv("OPENAI_API_KEY", "synthetic-no-live-key");
  vi.stubEnv("BSB_ASSESSMENT_MODEL", "gpt-5.6-terra");
  // Legacy deployment settings must not restrict any new request.
  vi.stubEnv("BSB_AI_MAX_JOB_USD", "0"); vi.stubEnv("BSB_AI_DAILY_BUDGET_USD", "0");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await pool.query("DELETE FROM bsb_v2_asset_analysis_runs WHERE input_hash = ANY($1::text[])", [[...testHashes]]);
  testHashes.clear();
});

describe("reviewed asset analysis without spending caps", () => {
  it("makes one generation, returns usage without saving an asset, and reuses the result", async () => {
    const name = `${randomUUID()}.png`; const fake = provider();
    const before = (await pool.query("SELECT count(*) FROM bsb_v2_knowledge_assets")).rows[0].count;
    const result = await analyzeAsset(name, png, fake);
    expect(result.metadata).toEqual(metadata);
    expect(result.usage.estimatedCostUsd).toBe(0.00725);
    expect(await analyzeAsset(name, png, fake)).toEqual(result);
    expect(fake).toHaveBeenCalledTimes(1);
    expect((await pool.query("SELECT count(*) FROM bsb_v2_knowledge_assets")).rows[0].count).toBe(before);
    expect(fake.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    const generation = JSON.parse(String(fake.mock.calls[0][1]?.body));
    expect(generation.store).toBe(false);
    expect(generation.input[0].content[1].image_url).toBe(`data:image/png;base64,${png}`);
  });

  it("allows a full batch despite zero legacy caps and an old uncertain reservation", async () => {
    const oldHash = randomUUID(); testHashes.add(oldHash);
    await pool.query("INSERT INTO bsb_v2_asset_analysis_runs(id,input_hash,state,reserved_micro_usd,created_at) VALUES($1,$2,'OUTCOME_UNKNOWN',100000000,now()-interval '2 days')", [randomUUID(), oldHash]);
    const fake = provider();
    for (let i = 0; i < 10; i++) await analyzeAsset(`${randomUUID()}.png`, png, fake);
    expect(fake).toHaveBeenCalledTimes(10);
    const { rows } = await pool.query("SELECT reserved_micro_usd FROM bsb_v2_asset_analysis_runs WHERE input_hash = ANY($1::text[]) AND state='COMPLETE'", [[...testHashes]]);
    expect(rows).toHaveLength(10);
    expect(rows.every(row => row.reserved_micro_usd === 0)).toBe(true);
  });

  it("sends PDF bytes as a file instead of treating the filename as content", () => {
    const data = Buffer.from("%PDF-1.4\nsynthetic").toString("base64");
    const request = buildAssetRequest("synthetic.pdf", fileInfo("synthetic.pdf", data));
    expect(request.input[0].content[1]).toMatchObject({ type: "input_file", filename: "synthetic.pdf", file_data: `data:application/pdf;base64,${data}` });
  });

  it("blocks simultaneous submissions for the same file", async () => {
    const name = `${randomUUID()}.png`;
    let release!: () => void; let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    const fake = provider();
    const delayed: typeof fetch = async (...args) => { entered(); await wait; return fake(...args); };
    const first = analyzeAsset(name, png, delayed);
    await started;
    try { await expect(analyzeAsset(name, png, fake)).rejects.toMatchObject({ code: "ANALYSIS_PENDING" }); }
    finally { release(); }
    await first;
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it.each(["TOKEN_CHECK_FAILED", "INPUT_TOO_LARGE"])("allows files previously blocked by %s without a generation", async code => {
    const name = `${randomUUID()}.png`; const hash = hashFile(name, png); testHashes.add(hash);
    await pool.query("INSERT INTO bsb_v2_asset_analysis_runs(id,input_hash,state,reserved_micro_usd,error) VALUES($1,$2,'FAILED',0,$3::jsonb)", [randomUUID(), hash, JSON.stringify({ code, message: "Legacy preflight failure", status: 413 })]);
    const fake = provider(metadata, 110000);
    expect((await analyzeAsset(name, png, fake)).metadata).toEqual(metadata);
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("never automatically repeats an uncertain generation", async () => {
    const name = `${randomUUID()}.png`;
    const fake = vi.fn<typeof fetch>(async () => { throw new Error("network interrupted"); });
    await expect(analyzeAsset(name, png, fake)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    await expect(analyzeAsset(name, png, fake)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported metadata without saving fabricated defaults", async () => {
    await expect(analyzeAsset(`${randomUUID()}.png`, png, provider({ ...metadata, instrument: "Xenium" }))).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
  });

  it("rejects malformed base64, mismatched extensions, and duplicate keywords", () => {
    expect(() => fileInfo("image.png", `${png}!`)).toThrow();
    expect(() => fileInfo("image.pdf", png)).toThrow();
    expect(validateAsset({ ...metadata, fileName: "image.png", fileDataBase64: png, fileKind: "image", keywords: ["PNG", "png", "test", "file", "image"] })).toContain("Exactly five distinct keywords (up to 100 characters each) are required.");
  });
});
