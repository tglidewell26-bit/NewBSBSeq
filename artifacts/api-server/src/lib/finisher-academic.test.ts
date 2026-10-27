import { describe, expect, it } from "vitest";
import { finishRequestSchema, blockingPlaceholders } from "@workspace/api-zod/finisher";
import { finishText } from "./finisher";

const base = {
  company: "Christina Curtis", location: "Stanford", timezone: "America/Los_Angeles",
  trip1: [{ date: "2099-01-05", start: "10:00", end: "11:00" }],
  trip2: [{ date: "2099-02-05", start: "10:00", end: "11:00" }],
};
describe("academic sequence modes", () => {
  it("inserts the researcher's last name and both visits", () => {
    const input = { ...base, sequenceType: "researcher", lastName: "Curtis", source: "Email 1\nHello Dr. {{last_name}},\n{{TRIP_1_DATES}}\n{{TRIP_1_AVAILABILITY}}\nEmail 4\nHello Dr. {{last_name}},\n{{TRIP_2_DATES}}\n{{TRIP_2_AVAILABILITY}}" };
    const result = finishText(finishRequestSchema.parse(input));
    expect(result.messages[0].body).toContain("Hello Dr. Curtis,");
    expect(result.messages[1].body).toContain("Hello Dr. Curtis,");
    expect(blockingPlaceholders(result.messages)).toEqual([]);
  });
  it("rejects researcher first-name merge fields and missing last names", () => {
    expect(finishRequestSchema.safeParse({ ...base, sequenceType: "researcher", lastName: "Curtis", source: "Hi {{first_name}}" }).success).toBe(false);
    expect(finishRequestSchema.safeParse({ ...base, sequenceType: "researcher", source: "Hi Dr. {{last_name}}" }).success).toBe(false);
  });
  it("fills the lab name while preserving recipient merge fields", () => {
    const result = finishText(finishRequestSchema.parse({ ...base, company: "Genomics Core", sequenceType: "lab_core", source: "Email 1\nHello {{first_name}},\nI saw {{LAB_OR_CORE_NAME}}." }));
    expect(result.messages[0].body).toContain("Hello {{first_name}},");
    expect(result.messages[0].body).toContain("I saw Genomics Core.");
    expect(blockingPlaceholders(result.messages)).toEqual([]);
  });
  it("defaults old company inputs to the original workflow", () => {
    const input = finishRequestSchema.parse({ ...base, source: "Email 1\nHi {{first_name}}" });
    expect(input.sequenceType).toBe("company");
    expect(finishText(input).messages[0].body).toContain("{{first_name}}");
  });
});
