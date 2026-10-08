import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseSequence,
  customerText,
  unresolvedPlaceholders,
  type FinishInput,
  type Resource,
} from "@workspace/api-zod/finisher";
import { finishText, fallbackSuggestions, suggestResources } from "./finisher";
const input: FinishInput = {
  company: "Earli",
  source:
    "Instrument: CellScape\n\n## Email 1\nSubject: A question\n\nHi Tim,\nCould immune profiling help? I’m in {{LOCATION}} on {{TRIP_1_AVAILABILITY}}.\nResource note: A related immune panel or instrument image would help.\n\n## Email 2\nSubject: Another idea\n\nNext visit: {{TRIP_2_AVAILABILITY}}.",
  location: "Palo Alto",
  timezone: "America/Los_Angeles",
  trip1: [{ date: "2026-11-10", start: "10:00", end: "13:00" }],
  trip2: [{ date: "2026-12-10", start: "13:00", end: "16:00" }],
};
const now = new Date("2026-10-08T18:00:00Z");
const assets: Resource[] = [
  {
    id: "panel",
    displayName: "VistaPlex Spatial Immune Profiling",
    fileName: "panel.pdf",
    fileKind: "document",
    instrument: "CellScape",
    description: "A panel for spatial immune profiling.",
    keywords: ["lymphocytes", "protein"],
    assetType: "Panels and Brochures",
  },
  {
    id: "instrument",
    displayName: "CellScape instrument",
    fileName: "instrument.png",
    fileKind: "image",
    instrument: "CellScape",
    description: "A photograph of the instrument.",
    keywords: [],
    assetType: "Images",
  },
  {
    id: "wrong",
    displayName: "CosMx immune profiling",
    fileName: "cosmx.pdf",
    fileKind: "document",
    instrument: "CosMx",
    description: "An immune workflow.",
    keywords: ["immune"],
    assetType: "Publications",
  },
];
afterEach(() => vi.unstubAllEnvs());
describe("Sequence finishing", () => {
  it("preserves message wording, separates notes, and replaces each trip correctly", () => {
    const result = finishText(input, now);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].body).toBe(
      "Hi Tim,\nCould immune profiling help? I’m in Palo Alto on Tuesday, November 10, 2026, 10 AM–1 PM PST.",
    );
    expect(result.messages[1].body).toBe(
      "Next visit: Thursday, December 10, 2026, 1 PM–4 PM PST.",
    );
    expect(customerText(result.messages)).not.toContain("Resource note");
    expect(customerText(result.messages)).not.toContain("related immune panel");
    expect(unresolvedPlaceholders(result.messages)).toEqual([]);
  });
  it("keeps unspecified placeholders visible instead of inventing dates or recipients", () => {
    const result = finishText(
      { ...input, trip2: [], source: input.source + "\nHi {{FIRST_NAME}}." },
      now,
    );
    expect(unresolvedPlaceholders(result.messages)).toEqual([
      "{{TRIP_2_AVAILABILITY}}",
      "{{FIRST_NAME}}",
    ]);
  });
  it("separates private resource notes even without numbered headings", () => {
    const messages = parseSequence(
      "Subject: Hello\nKeep these words.\nResource note: Private guidance.",
    );
    expect(customerText(messages)).not.toContain("Private guidance");
    expect(messages[0].body).toBe("Keep these words.");
  });
  it("preserves unstructured paste rather than rewriting it", () => {
    const source = "Hello there.\n\nMy exact wording.";
    expect(parseSequence(source)[0].body).toBe(source);
  });
  it.each([
    { trip1: [{ date: "2026-10-07", start: "10:00", end: "11:00" }] },
    { trip1: [{ date: "2026-11-31", start: "10:00", end: "11:00" }] },
    { trip1: [{ date: "2026-11-10", start: "13:00", end: "10:00" }] },
    {
      trip1: [
        { date: "2026-11-10", start: "10:00", end: "13:00" },
        { date: "2026-11-10", start: "12:00", end: "14:00" },
      ],
    },
    { timezone: "Invalid/Zone" },
  ])(
    "rejects invalid availability without producing misleading text: %j",
    (patch) => {
      expect(() => finishText({ ...input, ...patch }, now)).toThrow();
    },
  );
  it("finds a related VistaPlex panel and an instrument photo without an exact tumor title", () => {
    const messages = parseSequence(
      "Instrument: CellScape\nEmail 1\nCould tumor immune profiling help your work?",
    );
    const result = fallbackSuggestions(
      messages,
      "Instrument: CellScape",
      assets,
    );
    expect(result.map((s) => s.assetId).sort()).toEqual([
      "instrument",
      "panel",
    ]);
    expect(result.find((s) => s.assetId === "instrument")?.relevance).toBe(
      "platform",
    );
  });
  it("rejects hallucinated IDs and wrong-platform AI suggestions", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const messages = parseSequence(input.source);
    const caller = vi.fn().mockResolvedValue({
      value: {
        matches: [
          {
            messageId: "message-1",
            assetId: "fake",
            reason: "Fake",
            relevance: "direct",
          },
          {
            messageId: "message-1",
            assetId: "wrong",
            reason: "Wrong",
            relevance: "direct",
          },
          {
            messageId: "message-1",
            assetId: "panel",
            reason: "Related immune panel",
            relevance: "related",
          },
        ],
      },
    });
    const result = await suggestResources(
      messages,
      input.source,
      assets,
      caller,
    );
    expect(result.suggestions.map((s) => s.assetId)).toEqual(["panel"]);
  });
  it("keeps useful local suggestions when AI is unavailable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const result = await suggestResources(
      parseSequence(input.source),
      input.source,
      assets,
      vi.fn().mockRejectedValue(new Error("offline")),
    );
    expect(result.warnings[0]).toContain("did not complete");
    expect(result.suggestions.some((s) => s.assetId === "panel")).toBe(true);
  });
  it("considers resources beyond the first batch", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const many = Array.from({ length: 43 }, (_, i) => ({
      ...assets[0],
      id: `asset-${i}`,
    }));
    const caller = vi
      .fn()
      .mockResolvedValueOnce({ value: { matches: [] } })
      .mockResolvedValueOnce({
        value: {
          matches: [
            {
              messageId: "message-1",
              assetId: "asset-42",
              reason: "Best match",
              relevance: "direct",
            },
          ],
        },
      });
    expect(
      (
        await suggestResources(
          parseSequence(input.source),
          input.source,
          many,
          caller,
        )
      ).suggestions[0].assetId,
    ).toBe("asset-42");
    expect(caller).toHaveBeenCalledTimes(2);
  });
});
