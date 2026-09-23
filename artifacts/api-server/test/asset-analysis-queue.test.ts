import { describe, expect, it, vi } from "vitest";
import { runAnalysisQueue } from "../../bsb-sequence-generator-v2/src/pages/workspace/asset-analysis-queue";
describe("automatic upload analysis queue", () => {
  it("processes every uploaded file strictly in order", async () => {
    const order: string[] = [];
    await runAnalysisQueue([1, 2, 3], { stopped: () => false, failed: vi.fn(), analyze: async item => {
      order.push(`start${item}`); await Promise.resolve(); order.push(`finish${item}`);
    } });
    expect(order).toEqual(["start1", "finish1", "start2", "finish2", "start3", "finish3"]);
  });
  it("continues after a file-specific failure without retrying it", async () => {
    const analyze = vi.fn(async (item: number) => { if (item === 1) throw Object.assign(new Error("Oversized PDF"), { code: "INPUT_TOO_LARGE" }); });
    const failed = vi.fn();
    await runAnalysisQueue([1, 2], { stopped: () => false, failed, analyze });
    expect(analyze.mock.calls).toEqual([[1], [2]]); expect(failed).toHaveBeenCalledTimes(1);
  });
  it.each(["BUDGET_EXHAUSTED", "NOT_CONFIGURED", "OUTCOME_UNKNOWN", "TOKEN_CHECK_FAILED", "PROVIDER_ERROR"])("pauses on %s, leaving remaining files untouched", async code => {
    const analyze = vi.fn(async () => { throw Object.assign(new Error(code), { code }); });
    await runAnalysisQueue([1, 2, 3], { stopped: () => false, failed: vi.fn(), analyze });
    expect(analyze).toHaveBeenCalledTimes(1);
  });
  it("stops after the current request when paused or the page is left", async () => {
    let stopped = false;
    const analyze = vi.fn(async () => { stopped = true; });
    await runAnalysisQueue([1, 2, 3], { stopped: () => stopped, failed: vi.fn(), analyze });
    expect(analyze).toHaveBeenCalledTimes(1);
  });
});
