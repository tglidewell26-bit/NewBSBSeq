import { describe, expect, it } from "vitest";
import { cleanSequenceBody, sequenceBodyHtml, sequenceBodyParts, sequenceBodyText } from "@workspace/api-zod/sequence-format";
import { meetingBlock, tripDateRange, planSequence, renderSequence } from "../src/lib/sequences";
import { sequenceFixture, settings } from "./sequence-fixture";

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
  it("asks throughout the sequence, with future-trip and virtual alternatives", () => {
    const { row, touches } = sequenceFixture();
    const authority = planSequence(row, {
      ...settings,
      meetingMode: "IN_PERSON",
      trip1: [{ date: "2099-04-06", start: "10:00", end: "13:00" }],
      trip2: [{ date: "2099-04-20", start: "13:00", end: "16:00" }],
    });
    const rendered = renderSequence(touches, authority);
    const body = (id: string) => rendered.find(t => t.touchId === id)!.body;
    expect(body("email1")).toContain("Monday, April 6, 2099");
    expect(body("email3")).toContain("Monday, April 6, 2099");
    expect(body("liMsg1")).toContain("Monday, April 6, 2099");
    expect(body("email4")).toContain("Sorry I missed you last time.");
    expect(body("email4")).toContain("Monday, April 20, 2099");
    for (const id of ["email5", "liMsg2", "email6"]) {
      expect(body(id)).toContain("April 20, 2099");
      expect(body(id)).toContain("available to meet");
    }
  });  it("matches the requested meeting format and preserves bold when copied", () => {
    const trip1 = [{ date: "2026-10-12", start: "10:00", end: "16:00" }, { date: "2026-10-13", start: "10:00", end: "13:00" }];
    const body = meetingBlock({ ...settings, meetingMode: "IN_PERSON", trip1 });
    expect(body).toBe("I’ll be in the area **October 12th - 13th**, are you available to meet during the following days and times?\n\nMonday, October 12, 2026: **10 AM–4 PM**\n\nTuesday, October 13, 2026: **10 AM–1 PM**\n\nI look forward to meeting in-person.");
    expect(sequenceBodyHtml(body)).toContain("<strong>October 12th - 13th</strong>");
    expect(sequenceBodyHtml(body)).toContain("<strong>10 AM–4 PM</strong>");
    expect(sequenceBodyText(body)).not.toContain("**");
    expect(tripDateRange([{ ...trip1[0], date: "2026-10-31" }, { ...trip1[1], date: "2026-11-02" }])).toBe("October 31st - November 2nd");
    expect(tripDateRange([{ ...trip1[0], date: "2026-12-31" }, { ...trip1[1], date: "2027-01-01" }])).toBe("December 31st, 2026 - January 1st, 2027");
  });
  it("links only the first brand mentions per email and supplies all requested fixed copy", () => {
    const { row, touches } = sequenceFixture();
    const authority = planSequence(row, { ...settings, meetingMode: "IN_PERSON",
      trip1: [{ date: "2026-10-12", start: "10:00", end: "16:00" }, { date: "2026-10-13", start: "10:00", end: "13:00" }],
      trip2: [{ date: "2026-10-26", start: "10:00", end: "16:00" }, { date: "2026-10-29", start: "13:00", end: "16:00" }],
    });
    const rendered = renderSequence(touches.map(t => ({ ...t, middle: "Bruker Spatial Biology offers CellScape, CosMx and GeoMx. CellScape, CosMx, GeoMx and Bruker Spatial Biology." })), authority);
    const body = (id: string) => rendered.find(t => t.touchId === id)!.body;
    for (const t of rendered.filter(t => t.touchId.startsWith("email"))) {
      const links = sequenceBodyParts(t.body).filter(p => p.href);
      expect(links.map(p => p.text)).toHaveLength(4);
      expect(new Set(links.map(p => p.text)).size).toBe(4);
      expect(links.find(p => p.text === "CellScape")?.href).toContain("/products/cellscape-precise-spatial-proteomics/");
      expect(t.body).not.toMatch(/Best regards|Los_Angeles|Times:|\]\([^)]*\) \|/);
      if (t.touchId !== "email3") expect(t.body.endsWith("I look forward to meeting in-person.")).toBe(true);
    }
    for (const id of ["liMsg1", "liMsg2"]) {
      expect(body(id)).toContain("available to meet");
      expect(body(id)).not.toMatch(/https:/);
      expect(body(id)).toContain("**10 AM–4 PM**");
    }
    expect(body("liConnect")).not.toContain("available to meet");
    const opening4 = body("email4").split("\n\n")[1];
    expect(opening4).toContain("Sorry I missed you last time.");
    expect(opening4).toContain("October 26th - 29th");
    expect(opening4).toContain("Spatial Regional Account Manager");
    expect(opening4).toContain("[Bruker Spatial Biology]");
    expect(opening4).not.toMatch(/AM|PM/);
    expect(opening4).toBe("Sorry I missed you last time. As a reminder, I am Tim Glidewell, and I’m your Spatial Regional Account Manager at [Bruker Spatial Biology](https://brukerspatialbiology.com/). I’ll be back in the area **October 26th - 29th**.");
    expect(body("email1")).toContain("I'm Tim Glidewell, your Spatial Regional Account Manager at [Bruker Spatial Biology](https://brukerspatialbiology.com/). It's nice to e-meet you. We help researchers study where genes and proteins are located in tissue.");
    expect(body("email3")).toContain("I’ll also be back **October 26th - 29th**");
    expect(body("email3")).not.toContain("Monday, October 26");
    expect(body("email3").indexOf("I’ll also be back")).toBeGreaterThan(body("email3").indexOf("I look forward to meeting in-person."));
    for (const id of ["email3", "email4", "email5", "email6"]) expect(body(id)).toContain("virtual meeting");
    for (const id of ["email3", "email5"]) {
      expect(body(id)).toContain("I won’t keep following up");
      expect(body(id)).toContain("later in the year");
      expect(body(id)).toContain("colleague or group");
    }
    expect(body("email6")).toContain("Since I haven’t heard back, I’ll reach out again in three months.");
    expect(body("email6")).toContain("There’s still time to meet");
  });
  it("does not invent a past or future trip when no second trip is configured", () => {
    const { authority, touches } = sequenceFixture();
    authority.settings = { ...settings, meetingMode: "IN_PERSON", trip1: [{ date: "2026-10-12", start: "10:00", end: "16:00" }] };
    for (const t of renderSequence(touches, authority)) {
      expect(t.body).not.toContain("Sorry I missed");
      expect(t.body).not.toContain("I’ll also be back");
      if (t.touchId !== "liConnect") expect(t.body).toContain("Monday, October 12, 2026");
    }
  });

  it("escapes HTML and never creates script or credential-bearing links", () => {
    const input = '<img src=x onerror=alert(1)> [unsafe](javascript:alert) [credential](https://user:pass@example.org/)';
    expect(sequenceBodyHtml(input)).not.toContain("<img");
    expect(sequenceBodyHtml(input)).toContain("&lt;img");
    expect(sequenceBodyParts(input).some(p => p.href)).toBe(false);
    expect(sequenceBodyHtml('[<script>](https://example.org/?a="b")')).not.toContain("<script>");
  });
});
