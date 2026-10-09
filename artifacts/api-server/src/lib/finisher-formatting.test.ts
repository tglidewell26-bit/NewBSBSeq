import { describe, expect, it } from "vitest";
import { finishText, tripDates } from "./finisher";
import {
  customerClipboard,
  customerText,
  messageHtml,
  type FinishInput,
} from "@workspace/api-zod/finisher";

const slot = (date: string, start = "13:00", end = "16:00") => ({
  date,
  start,
  end,
});
const now = new Date("2026-10-08T18:00:00Z");
const input: FinishInput = {
  company: "Earli",
  location: "Palo Alto",
  timezone: "America/Los_Angeles",
  source:
    "Email 1\nSubject: Hello\nI'll be in {{LOCATION}} {{TRIP_1_DATES}}, and I have the following dates and times available:\n{{TRIP_1_AVAILABILITY}}\nWould any of those times work?",
  trip1: [
    slot("2026-10-30", "10:00", "13:00"),
    slot("2026-10-28", "14:00"),
    slot("2026-10-27"),
    slot("2026-10-28", "09:00", "11:00"),
  ],
  trip2: [],
};
describe("visit formatting and customer exports", () => {
  it.each([
    [[], ""],
    [[slot("2026-10-27")], "October 27"],
    [[slot("2026-10-30"), slot("2026-10-27")], "October 27–30"],
    [[slot("2026-11-02"), slot("2026-10-30")], "October 30–November 2"],
    [
      [slot("2027-01-02"), slot("2026-12-30")],
      "December 30, 2026–January 2, 2027",
    ],
  ])("formats a trip range", (slots, expected) => {
    expect(tripDates(slots as FinishInput["trip1"])).toBe(expected);
  });
  it("groups and sorts windows, with separate lead-in/list/question blocks", () => {
    const body = finishText(input, now).messages[0].body;
    expect(body).toBe(
      "I'll be in Palo Alto **October 27–30**, and I have the following dates and times available:\n\n- **Tuesday, October 27, 2026, 1 PM–4 PM PDT**\n- **Wednesday, October 28, 2026, 9 AM–11 AM and 2 PM–4 PM PDT**\n- **Friday, October 30, 2026, 10 AM–1 PM PDT**\n\nWould any of those times work?",
    );
  });
  it("resolves trip 2 independently and uses the selected date's time zone", () => {
    const result = finishText(
      {
        ...input,
        source: input.source.replaceAll("TRIP_1", "TRIP_2"),
        trip2: [slot("2026-11-10")],
      },
      now,
    );
    expect(result.messages[0].body).toContain("**November 10**");
    expect(result.messages[0].body).toContain("1 PM–4 PM PST**");
  });
  it("preserves inline legacy availability and warns for missing dates", () => {
    const result = finishText(
      {
        ...input,
        source:
          "Email 1\nAvailable {{TRIP_1_AVAILABILITY}}. Later: {{TRIP_2_DATES}}.",
      },
      now,
    );
    expect(result.messages[0].body).toContain("PDT; Wednesday");
    expect(result.messages[0].body).not.toContain("- **");
    expect(result.messages[0].body).toContain("{{TRIP_2_DATES}}");
    expect(result.warnings.join()).toContain("{{TRIP_2_DATES}}");
  });
  it("copies safe rich lists and bold while plain copy/download omit markers and notes", () => {
    const messages = finishText(
      { ...input, source: input.source + "\nResource note: private" },
      now,
    ).messages;
    const rich = customerClipboard(messages, true);
    expect(rich.html).toContain("<strong>October 27–30</strong>");
    expect(rich.html).toContain("<li><strong>Tuesday, October 27");
    expect(rich.html.match(/<li>/g)).toHaveLength(3);
    expect(rich.text).toContain("\n- Tuesday, October 27");
    expect(rich.text).not.toContain("**");
    expect(rich.html + rich.text + customerText(messages)).not.toContain(
      "private",
    );
    expect(customerClipboard(messages).text).toBe(customerText(messages));
    expect(customerText(messages)).not.toContain("**");
    expect(
      messageHtml({
        title: "Email 1",
        body: '<img src=x onerror="alert(1)"> **safe** [bad](javascript:alert)',
      }),
    ).not.toContain("<img");
  });
  it.each([1, 2, 3])(
    "keeps LinkedIn %i plain in storage, preview and both copy formats",
    (number) => {
      const messages = finishText(
        {
          ...input,
          source: input.source.replace("Email 1", `LinkedIn ${number}`),
        },
        now,
      ).messages;
      expect(messages[0].body).not.toContain("**");
      expect(messages[0].body).toContain("\n- Wednesday, October 28");
      const payload = customerClipboard(messages, true);
      expect(payload.html).not.toMatch(/<strong>|<ul/);
      expect(payload.html).toContain("- Wednesday, October 28");
      expect(payload.text).toBe(messages[0].body);
    },
  );
});
