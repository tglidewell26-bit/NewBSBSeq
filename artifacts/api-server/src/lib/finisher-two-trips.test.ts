import { describe, it, expect } from "vitest";
import { finishRequestSchema, saveFinishedSchema, parseSequence } from "@workspace/api-zod/finisher";
const slot = {date:"2027-01-12",start:"10:00",end:"13:00"};
const input = {company:"Earli",source:"Email 1\nHello",trip1:[],trip2:[]};
describe("two required visits", () => {
  it.each([
    {...input},
    {...input,trip1:[slot]},
    {...input,trip2:[slot]},
  ])("rejects missing visits at the finish request boundary", draft => {
    const result = finishRequestSchema.safeParse(draft);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toContain("Every sequence requires two trips");
  });
  it("accepts both visits", () => {
    expect(finishRequestSchema.safeParse({...input,trip1:[slot],trip2:[{...slot,date:"2027-01-26"}]}).success).toBe(true);
  });
  it("keeps old saved history schemas compatible", () => {
    expect(saveFinishedSchema.safeParse({input,messages:parseSequence(input.source)}).success).toBe(true);
  });
});
