import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseSequence,
  customerText,
  customerClipboard,
  messageHtml,
  blockingPlaceholders,
  normalizeFirstName,
  type Resource,
} from "@workspace/api-zod/finisher";
import {
  finishText,
  suggestResources,
  fallbackSuggestions,
  resourceMatchRequest,
} from "./finisher";
afterEach(() => vi.unstubAllEnvs());
const asset: Resource = {
  id: "photo",
  displayName: "CellScape instrument",
  fileName: "photo.png",
  fileKind: "image",
  instrument: "CellScape",
  description: "An instrument photograph",
  keywords: [],
  assetType: "Images",
};
describe("channel-specific finishing", () => {
  it("keeps connection requests plain and removes supplied URLs in display and both copy formats", () => {
    const m = parseSequence(
      "LinkedIn Connection Request\nSubject: ignored\nHi {{FIRST_NAME}}, **CellScape** [GeoMx](https://example.com) https://example.com/test www.example.com\nResource note: instrument photo",
    )[0];
    expect(m.subject).toBe("");
    const output = customerClipboard([m], true);
    for (const text of [
      output.html,
      output.text,
      customerText([m]),
      messageHtml(m),
    ]) {
      expect(text).not.toMatch(/https?:|www\.|<a |<strong>|\*\*/);
      expect(text).toContain("CellScape");
      expect(text).toContain("{{first_name}}");
    }
  });
  it("excludes connections from fallback and AI requests without changing follow-up matching", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test");
    const messages = parseSequence(
      "LinkedIn Connection Request\nCellScape instrument\nLinkedIn Message 1\nSubject: Follow-up\nCellScape instrument",
    );
    expect(
      fallbackSuggestions(messages, "CellScape", [asset]).map(
        (s) => s.messageId,
      ),
    ).toEqual(["message-2"]);
    expect(
      JSON.parse(
        resourceMatchRequest(messages, "CellScape", [asset]).input,
      ).messages.map((m: any) => m.id),
    ).toEqual(["message-2"]);
    const caller = vi.fn().mockResolvedValue({
      value: {
        matches: [
          {
            messageId: "message-1",
            assetId: "photo",
            relevance: "platform",
            reason: "bad",
          },
          {
            messageId: "message-2",
            assetId: "photo",
            relevance: "platform",
            reason: "good",
          },
        ],
      },
    });
    expect(
      (
        await suggestResources(messages, "CellScape", [asset], caller)
      ).suggestions.map((s) => s.messageId),
    ).toEqual(["message-2"]);
    caller.mockClear();
    expect(
      (await suggestResources([messages[0]], "CellScape", [asset], caller))
        .suggestions,
    ).toEqual([]);
    expect(caller).not.toHaveBeenCalled();
  });
  it.each([
    "{{first_name}}",
    "{{FIRST_NAME}}",
    "{{First_Name}}",
    "{first_name}",
    "{{ first_name }}",
    "[First Name]",
  ])("normalizes %s for old drafts, new handoffs and exports", (token) => {
    const m = parseSequence("Email 1\nSubject: Hello\nHi")[0];
    m.subject = token;
    m.body = "Hi " + token;
    expect(normalizeFirstName(token)).toBe("{{first_name}}");
    expect(blockingPlaceholders([m])).toEqual([]);
    expect(customerText([m])).toContain("Subject: {{first_name}}");
    expect(customerClipboard([m], true).text).toBe("Hi {{first_name}}");
    expect(messageHtml(m)).toContain("Hi {{first_name}}");
    expect(parseSequence("Email 1\nHi " + token)[0].body).toBe(
      "Hi {{first_name}}",
    );
  });
  it.each([1, 2])(
    "gives LinkedIn Message %i a subject, bold availability and real links",
    (n) => {
      const result = finishText(
        {
          company: "Astellas",
          source: `LinkedIn Message ${n}\nSubject: A discussion\nHi {first_name},\nCellScape and GeoMx\nVisit {{TRIP_${n}_DATES}}:\n{{TRIP_${n}_AVAILABILITY}}`,
          trip1: [{ date: "2026-10-27", start: "13:00", end: "16:00" }],
          trip2: [{ date: "2026-11-10", start: "09:00", end: "11:00" }],
        },
        new Date("2026-10-10T12:00:00Z"),
      );
      const m = result.messages[0],
        payload = customerClipboard([m]);
      expect(m.subject).toBe("A discussion");
      expect(m.body).toContain("Hi {{first_name}}");
      expect(payload.html).toContain("<li><strong>");
      expect(payload.html).toContain(
        '<a href="https://brukerspatialbiology.com/',
      );
      expect(payload.html).not.toContain("CellScape (https");
      expect(payload.text).toContain("Subject: A discussion");
    },
  );
});
