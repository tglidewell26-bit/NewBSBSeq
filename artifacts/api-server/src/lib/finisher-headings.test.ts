import { describe, it, expect } from "vitest";
import { finishText } from "./finisher";
import {
  parseSequence,
  customerText,
  customerClipboard,
  blockingPlaceholders,
  isConnectionRequest,
} from "@workspace/api-zod/finisher";
const titles = [
  "Email 1",
  "Email 2",
  "LinkedIn Connection Request",
  "LinkedIn Message 1",
  "Email 3",
  "Email 4",
  "Email 5",
  "LinkedIn Message 2",
  "Email 6",
];
const opening =
  "Sorry I missed you last time. As a reminder, my name is Tim Glidewell and I am your Spatial Regional Account Manager with Bruker Spatial Biology.";
const input = {
  company: "Earli",
  source: "",
  timezone: "America/Los_Angeles",
  trip1: [{ date: "2026-10-27", start: "13:00", end: "16:00" }],
  trip2: [{ date: "2026-11-10", start: "09:00", end: "11:00" }],
};
const now = new Date("2026-10-08T18:00:00Z");
describe("new handoff headings", () => {
  it("parses all nine messages in order, keeping notes and bodies separate", () => {
    const messages = parseSequence(
      titles
        .map(
          (title, i) =>
            `## **${title}**\nSubject: Subject ${i}\nHi {{first_name}},\n\nBody ${i}.\nResource note: note ${i}`,
        )
        .join("\n\n---\n\n"),
    );
    expect(messages.map((m) => m.title)).toEqual(titles);
    messages.forEach((m, i) => {
      expect(m.body).toBe(`Hi {{first_name}},\n\nBody ${i}.`);
      expect(m.resourceNote).toBe(`note ${i}`);
      expect(m.subject).toBe(isConnectionRequest(m) ? "" : `Subject ${i}`);
    });
  });
  it("maps old headings and omits old saved LinkedIn subjects from exports and warnings", () => {
    const old = parseSequence(
      "LinkedIn 1\nConnect\nLinkedIn 2\nFirst follow-up\nLinkedIn 3\nSecond follow-up",
    );
    expect(old.map((m) => m.title)).toEqual([
      "LinkedIn Connection Request",
      "LinkedIn Message 1",
      "LinkedIn Message 2",
    ]);
    old[0].title = "LinkedIn 1";
    old[0].subject = "{{OLD_SUBJECT}}";
    expect(customerText(old)).toContain("LinkedIn Connection Request");
    expect(customerClipboard(old).html).not.toContain("Subject:");
    expect(customerText(old)).not.toContain("OLD_SUBJECT");
    expect(blockingPlaceholders(old)).toEqual([]);
  });
  it("maps LinkedIn follow-ups to their trips even with wrong trip placeholders", () => {
    const result = finishText(
      {
        ...input,
        source:
          "LinkedIn Connection Request\nLet's connect.\nLinkedIn Message 1\nVisit {{TRIP_2_DATES}}:\n{{TRIP_2_AVAILABILITY}}\nLinkedIn Message 2\nVisit {{TRIP_1_DATES}}:\n{{TRIP_1_AVAILABILITY}}",
      },
      now,
    );
    expect(result.messages[0].body).toBe("Let's connect.");
    expect(result.messages[1].body).toContain("October 27");
    expect(result.messages[1].body).not.toContain("November");
    expect(result.messages[2].body).toContain("November 10");
    expect(result.messages[2].body).not.toContain("October");
    expect(result.messages[1].body).toContain("- **Tuesday");
    expect(customerText(result.messages)).not.toContain("**");
  });
  it("does not insert availability into a connection request; flags an invalid handoff", () => {
    const result = finishText(
      { ...input, source: "LinkedIn 1\n{{TRIP_1_AVAILABILITY}}" },
      now,
    );
    expect(result.messages[0].body).toBe("{{TRIP_1_AVAILABILITY}}");
    expect(result.warnings.join()).toContain("Connection Request does not use");
  });
  it("preserves Email 4 opening exactly after the greeting without warnings", () => {
    const body = `Hi {{first_name}},\n\n${opening}\n\nA useful new point.`;
    const result = finishText(
      { ...input, source: `Email 4\nSubject: Another visit\n${body}` },
      now,
    );
    expect(result.messages[0].body).toBe(body);
    expect(result.warnings.filter((w) => /Sorry|missed/i.test(w))).toEqual([]);
    expect(blockingPlaceholders(result.messages)).toEqual([]);
    // Presentation adds the requested company hyperlink without changing the words.
    expect(customerClipboard(result.messages, true).html).toContain(
      "Sorry I missed you last time. As a reminder, my name is Tim Glidewell",
    );
  });
});
