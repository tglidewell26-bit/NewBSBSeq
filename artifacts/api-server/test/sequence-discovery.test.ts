import { describe, expect, it } from "vitest";
import { sequenceFixture } from "./sequence-fixture";
import { sequenceModelRequest } from "../src/lib/sequences";
describe("conditional discovery for existing saved plans", () => {
  it("corrects legacy briefs without mutating saved repair authority", () => {
    const { authority, touches } = sequenceFixture();
    const original = JSON.stringify(authority);
    for (const stage of ["WRITING", "VALIDATING"] as const) {
      const request = sequenceModelRequest(stage, authority, touches.slice(1), ["email1"]);
      const input = JSON.parse(request.input);
      expect(input.assignments[0].purpose).toContain("whether a proposed measurement is relevant");
      expect(input.assignments[0].purpose).not.toContain("how the prospect studies");
      expect(input.repairIds).toEqual(["email1"]);
      if (stage === "WRITING") expect(input.preservedTouches).toEqual(touches.slice(1));
    }
    expect(JSON.stringify(authority)).toBe(original);
  });
});
