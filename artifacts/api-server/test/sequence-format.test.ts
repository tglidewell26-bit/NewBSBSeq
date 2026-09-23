import { describe, expect, it } from "vitest";
import { cleanSequenceBody, sequenceBodyHtml, sequenceBodyParts, sequenceBodyText } from "@workspace/api-zod/sequence-format";
import { meetingBlock } from "../src/lib/sequences";
import { settings } from "./sequence-fixture";

describe("sequence display, copy and export formatting", () => {
  const links = "[CellScape](https://brukerspatialbiology.com/support/knowledgebase/cellscape-psp-kb/) | [Bruker Spatial Biology](https://brukerspatialbiology.com/)";
  it("provides clickable link parts and rich/plain clipboard versions", () => {
    expect(sequenceBodyParts(links).filter(p => p.href).map(p => p.text)).toEqual(["CellScape", "Bruker Spatial Biology"]);
    expect(sequenceBodyText(links)).toBe("CellScape (https://brukerspatialbiology.com/support/knowledgebase/cellscape-psp-kb/) | Bruker Spatial Biology (https://brukerspatialbiology.com/)");
    expect(sequenceBodyHtml(links)).toContain('href="https://brukerspatialbiology.com/">Bruker Spatial Biology</a>');
    expect(sequenceBodyHtml("Hi Tim,\n\n" + links)).toContain("Hi Tim,<br><br>");
  });
  it("hides legacy time-zone lines without changing dates or meeting times", () => {
    const old = "Wednesday September 23: 10 AM–1 PM\nTimes: America/Los_Angeles\nLook forward to possibly connecting.";
    expect(cleanSequenceBody(old)).toBe("Wednesday September 23: 10 AM–1 PM\nLook forward to possibly connecting.");
    for (const body of [sequenceBodyText(old), sequenceBodyHtml(old)]) expect(body).not.toContain("America/Los_Angeles");
    const body = meetingBlock({ ...settings, meetingMode: "IN_PERSON", trip1: [{ date: "2099-04-06", start: "10:00", end: "13:00" }] });
    expect(body).toContain("10 AM–1 PM");
    expect(body).not.toMatch(/Times:|Los_Angeles/);
  });
  it("escapes HTML and never creates script or credential-bearing links", () => {
    const input = '<img src=x onerror=alert(1)> [unsafe](javascript:alert) [credential](https://user:pass@example.org/)';
    expect(sequenceBodyHtml(input)).not.toContain("<img");
    expect(sequenceBodyHtml(input)).toContain("&lt;img");
    expect(sequenceBodyParts(input).some(p => p.href)).toBe(false);
    expect(sequenceBodyHtml('[<script>](https://example.org/?a="b")')).not.toContain("<script>");
  });
});
