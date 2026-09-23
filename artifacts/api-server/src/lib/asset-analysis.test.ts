import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import { analyzeAsset as runAnalysis, buildAssetRequest } from "./asset-analysis";
import { dailyAiReserved, dailyAiBudget } from "./ai-budget";
import { initializeAssessmentRuns } from "./assessment-runs";
import { fileInfo, initializeKnowledgeAssets, validateAsset } from "./knowledge-assets";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9eAAAAABJRU5ErkJggg==";
const testHashes = new Set<string>();
const analyzeAsset: typeof runAnalysis = (name, data, fake) => {
  testHashes.add(createHash("sha256").update("asset-definer-1").update("gpt-5.6-terra").update(name).update(Buffer.from(data, "base64")).digest("hex"));
  return runAnalysis(name, data, fake);
};
const metadata = { displayName: "Synthetic image", instrument: "Unknown", researchArea: "Unknown", assetType: "Images",
  description: "This is a synthetic test image. It contains no instrument label. It supports no scientific claim.",
  keywords: ["synthetic", "image", "PNG", "test", "unlabelled"], classificationReasoning: "The image does not establish a named instrument." };
const provider = (value: unknown = metadata, count = 500) => vi.fn<typeof fetch>(async url => String(url).endsWith("/input_tokens")
  ? Response.json({ input_tokens: count }) : Response.json({ status: "completed", model: "gpt-5.6-terra", id: "synthetic-response",
    usage: { input_tokens: count, output_tokens: 500 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] }));

beforeAll(async () => { await initializeAssessmentRuns(); await initializeKnowledgeAssets(); });
beforeEach(() => {
  vi.stubEnv("BSB_LIVE_ASSESSMENT", "true"); vi.stubEnv("OPENAI_API_KEY", "synthetic-no-live-key");
  vi.stubEnv("BSB_ASSESSMENT_MODEL", "gpt-5.6-terra"); vi.stubEnv("BSB_AI_MAX_JOB_USD", "0.35"); vi.stubEnv("BSB_AI_DAILY_BUDGET_USD", "5");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await pool.query("DELETE FROM bsb_v2_asset_analysis_runs WHERE input_hash = ANY($1::text[])", [[...testHashes]]);
  testHashes.clear();
});

describe("reviewed asset analysis", () => {
  it("returns editable suggestions without saving an asset and reuses the result", async () => {
    const name = `${randomUUID()}.png`; const fake = provider();
    const before = (await pool.query("SELECT count(*) FROM bsb_v2_knowledge_assets")).rows[0].count;
    const result = await analyzeAsset(name, png, fake);
    expect(result.metadata).toEqual(metadata);
    expect(await analyzeAsset(name, png, fake)).toEqual(result);
    expect(fake).toHaveBeenCalledTimes(2); // one token check, one generation
    expect((await pool.query("SELECT count(*) FROM bsb_v2_knowledge_assets")).rows[0].count).toBe(before);
    const countRequest = JSON.parse(String(fake.mock.calls[0][1]?.body));
    const generation = JSON.parse(String(fake.mock.calls[1][1]?.body));
    expect(countRequest.input).toEqual(generation.input);
    expect(generation.store).toBe(false);
    expect(generation.input[0].content[1].image_url).toBe(`data:image/png;base64,${png}`);
    expect(await dailyAiReserved(pool)).toBe(7250);
  });

  it("settles legacy successful results and allows a batch beyond the old reservation count", async () => {
    vi.stubEnv("BSB_AI_DAILY_BUDGET_USD", "0.40");
    for (let i = 0; i < 5; i++) await analyzeAsset(`${randomUUID()}.png`, png, provider());
    await pool.query("UPDATE bsb_v2_asset_analysis_runs SET usage=NULL WHERE input_hash = ANY($1::text[])", [[...testHashes]]);
    expect(await dailyAiBudget()).toEqual({ spentMicroUsd: 36250, heldMicroUsd: 0, totalMicroUsd: 36250 });
    await analyzeAsset(`${randomUUID()}.png`, png, provider());
    expect(await dailyAiReserved(pool)).toBe(43500);
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
    const delayed: typeof fetch = async (...args) => { if (String(args[0]).endsWith("/input_tokens")) { entered(); await wait; } return fake(...args); };
    const first = analyzeAsset(name, png, delayed);
    await started;
    try { await expect(analyzeAsset(name, png, fake)).rejects.toMatchObject({ code: "ANALYSIS_PENDING" }); }
    finally { release(); }
    await first;
    expect(fake).toHaveBeenCalledTimes(2);
  });

  it.each([90001, 1000000])("rejects an oversized token count (%s) before generation", async count => {
    const fake = provider(metadata, count);
    await expect(analyzeAsset(`${randomUUID()}.png`, png, fake)).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
    expect(fake).toHaveBeenCalledTimes(1);
    expect((await pool.query("SELECT reserved_micro_usd FROM bsb_v2_asset_analysis_runs")).rows[0].reserved_micro_usd).toBe(0);
  });

  it("fails closed when the token check fails", async () => {
    const name = `${randomUUID()}.png`;
    const fake = vi.fn<typeof fetch>(async () => Response.json({}, { status: 400 }));
    await expect(analyzeAsset(name, png, fake)).rejects.toMatchObject({ code: "TOKEN_CHECK_FAILED" });
    expect(fake).toHaveBeenCalledTimes(1);
    const recovered = provider();
    expect((await analyzeAsset(name, png, recovered)).metadata).toEqual(metadata);
    expect(recovered).toHaveBeenCalledTimes(2);
  });

  it("retains the charge and never retries an uncertain generation", async () => {
    const name = `${randomUUID()}.png`;
    const fake = vi.fn<typeof fetch>(async url => { if (String(url).endsWith("/input_tokens")) return Response.json({ input_tokens: 500 }); throw new Error("network interrupted"); });
    await expect(analyzeAsset(name, png, fake)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    await expect(analyzeAsset(name, png, fake)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(fake).toHaveBeenCalledTimes(2);
    expect((await pool.query("SELECT reserved_micro_usd FROM bsb_v2_asset_analysis_runs")).rows[0].reserved_micro_usd).toBe(350000);
  });

  it("rejects unsupported metadata without saving fabricated defaults", async () => {
    await expect(analyzeAsset(`${randomUUID()}.png`, png, provider({ ...metadata, instrument: "Xenium" }))).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(await dailyAiReserved(pool)).toBe(7250);
  });

  it("uses the shared daily budget and does not call a provider when exhausted", async () => {
    vi.stubEnv("BSB_AI_DAILY_BUDGET_USD", "0.35");
    await analyzeAsset(`${randomUUID()}.png`, png, provider());
    const fake = provider();
    await expect(analyzeAsset(`${randomUUID()}.png`, png, fake)).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
    expect(fake).not.toHaveBeenCalled();
  });

  it("rejects malformed base64, mismatched extensions, and duplicate keywords", () => {
    expect(() => fileInfo("image.png", `${png}!`)).toThrow();
    expect(() => fileInfo("image.pdf", png)).toThrow();
    expect(validateAsset({ ...metadata, fileName: "image.png", fileDataBase64: png, fileKind: "image", keywords: ["PNG", "png", "test", "file", "image"] })).toContain("Exactly five distinct keywords (up to 100 characters each) are required.");
  });
});
