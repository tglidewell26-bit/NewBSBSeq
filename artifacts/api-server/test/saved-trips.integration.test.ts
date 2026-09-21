import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { pool } from "@workspace/db";
import app from "../src/app";
import { initializeSavedTrips } from "../src/lib/saved-trips";
import { validateSettings } from "../src/lib/sequences";
import { settings } from "./sequence-fixture";
import {
  calendarDate,
  dateKey,
  selectTripDays,
  restoreTripDraft,
  todayInTimezone,
} from "../../bsb-sequence-generator-v2/src/pages/workspace/trip-utils";

let server: Server, base: string;
const ids: string[] = [];
beforeAll(async () => {
  await initializeSavedTrips();
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", r);
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("No server");
  base = `http://127.0.0.1:${addr.port}/api/bsb-v2/trips`;
});
afterEach(async () => {
  await pool.query("DELETE FROM bsb_v2_saved_trips WHERE id=ANY($1::text[])", [
    ids,
  ]);
  ids.length = 0;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
const slot = { date: "2099-09-29", start: "10:00", end: "13:00" };
function trip() {
  const id = randomUUID();
  ids.push(id);
  return {
    id,
    name: "Synthetic Bay Area visit",
    timezone: "America/Los_Angeles",
    slots: [slot, { date: "2099-10-01", start: "13:00", end: "16:00" }],
  };
}
async function save(body: unknown) {
  const r = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

describe("saved trip persistence and validation", () => {
  it("preserves named trip dates, timezone and custom times across reload and initialization", async () => {
    const input = trip();
    input.slots[1].start = "13:30";
    const saved = await save(input);
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject(input);
    await initializeSavedTrips();
    expect(await (await fetch(base)).json()).toContainEqual(saved.body);
    expect((await save(input)).body).toEqual(saved.body);
    const history = await (await fetch(base)).json();
    expect(history.filter((t: any) => t.id === input.id)).toHaveLength(1);
    expect((await save({ ...input, name: "Changed name" })).status).toBe(409);
  });
  it("keeps previous trips available but blocks using past dates for generation", async () => {
    const input = { ...trip(), slots: [{ ...slot, date: "2020-01-01" }] };
    expect((await save(input)).status).toBe(201);
    expect(() =>
      validateSettings({
        ...settings,
        meetingMode: "IN_PERSON",
        trip1: input.slots,
      }),
    ).toThrow(/past date/);
  });
  it.each([
    { slots: [{ ...slot, date: "2099-02-30" }] },
    { slots: [{ ...slot, start: "16:00", end: "10:00" }] },
    { slots: [slot, slot] },
    { slots: [] },
    { name: " " },
    { timezone: "Invalid/Timezone" },
  ])("rejects invalid saved trip input: %j", async (change) => {
    expect((await save({ ...trip(), ...change })).status).toBe(400);
  });
  it("accepts a month of selected days through the same generation validator", async () => {
    const slots = Array.from({ length: 31 }, (_, i) => ({
      ...slot,
      date: `2099-10-${String(i + 1).padStart(2, "0")}`,
    }));
    expect((await save({ ...trip(), slots })).status).toBe(201);
    expect(
      validateSettings({ ...settings, meetingMode: "IN_PERSON", trip1: slots })
        .trip1,
    ).toHaveLength(31);
  });
});
describe("calendar selection and remembered trips", () => {
  it("sorts nonconsecutive days across months without changing custom availability", () => {
    const current = [{ ...slot, start: "10:30" }];
    const selected = selectTripDays(
      [calendarDate("2099-10-01"), calendarDate(slot.date)],
      current,
    );
    expect(selected).toEqual([
      current[0],
      { date: "2099-10-01", start: "10:00", end: "16:00" },
    ]);
    expect(selectTripDays([calendarDate("2099-10-01")], selected)).toEqual([
      selected[1],
    ]);
    expect(dateKey(calendarDate("2099-10-01"))).toBe("2099-10-01");
  });
  it("preserves split time windows for selected dates", () => {
    const current = [slot, { ...slot, start: "14:00", end: "16:00" }];
    expect(selectTripDays([calendarDate(slot.date)], current)).toEqual(current);
  });
  it("restores trip settings without carrying recipient or account permission to another packet", () => {
    const s = {
      ...settings,
      meetingMode: "IN_PERSON",
      trip1: [slot],
      firstName: "Private",
      allowAccountFacts: true,
    };
    const restored = restoreTripDraft(JSON.stringify(s));
    expect(restored.trip1).toEqual([slot]);
    expect(restored).not.toHaveProperty("firstName");
    expect(restored).not.toHaveProperty("allowAccountFacts");
    expect(restoreTripDraft("bad json")).toEqual({});
    expect(
      restoreTripDraft(
        JSON.stringify({ ...s, trip1: [{ ...slot, date: "2099-02-30" }] }),
      ),
    ).toEqual({});
  });
  it("uses the trip timezone at the date boundary", () => {
    expect(
      todayInTimezone("America/Los_Angeles", new Date("2026-09-21T01:00:00Z")),
    ).toBe("2026-09-20");
    expect(
      todayInTimezone("Asia/Tokyo", new Date("2026-09-21T01:00:00Z")),
    ).toBe("2026-09-21");
  });
});
