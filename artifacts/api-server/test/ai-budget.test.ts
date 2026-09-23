import { describe, expect, it } from "vitest";
import { summarizeAiCharges } from "../src/lib/ai-budget";
const usage = { inputTokens: 500, outputTokens: 500, estimatedCostUsd: 0.00725 };
const charge = { kind: "asset", state: "COMPLETE", reserved_micro_usd: 350000, usage };
describe("daily app budget settlement", () => {
  it("counts known completed usage and unresolved holds separately", () => {
    expect(summarizeAiCharges([charge, { ...charge, kind: "assessment", state: "COMPLETED" }, { ...charge, state: "OUTCOME_UNKNOWN" }]))
      .toEqual({ spentMicroUsd: 14500, heldMicroUsd: 350000, totalMicroUsd: 364500 });
  });
  it("keeps active and malformed history fully reserved", () => {
    for (const row of [{ ...charge, state: "RUNNING" }, { ...charge, usage: null }, { ...charge, usage: { ...usage, estimatedCostUsd: -1 } }, { ...charge, usage: { estimatedCostUsd: 0 } }])
      expect(summarizeAiCharges([row]).heldMicroUsd).toBe(350000);
  });
  it("settles both sequence stages and a single-stage manual revision", () => {
    const writer = { ...usage, stage: "WRITING" }, reviewer = { ...usage, stage: "VALIDATING" };
    const row = { ...charge, kind: "sequence", state: "APPROVED", reserved_micro_usd: 700000, usage: [writer, reviewer] };
    expect(summarizeAiCharges([row]).totalMicroUsd).toBe(14500);
    expect(summarizeAiCharges([{ ...row, state: "VALIDATION_FAILED" }]).totalMicroUsd).toBe(14500);
    expect(summarizeAiCharges([{ ...row, edited: true, usage: [reviewer] }]).totalMicroUsd).toBe(7250);
    for (const partial of [{ ...row, usage: [writer] }, { ...row, usage: [writer, writer] }, { ...row, state: "RECOVERY_REQUIRED" }, { ...row, state: "PROVIDER_FAILED" }])
      expect(summarizeAiCharges([partial]).heldMicroUsd).toBe(700000);
  });
});
