import type { OutreachSettings } from "@workspace/api-zod";

export type TripSlot = OutreachSettings["trip1"][number];
export const orderTripSlots = (slots: TripSlot[]) =>
  [...slots].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.start || "99:99").localeCompare(b.start || "99:99"),
  );
export const presets = [
  { name: "Morning", start: "10:00", end: "13:00", label: "10 AM–1 PM" },
  { name: "Afternoon", start: "13:00", end: "16:00", label: "1–4 PM" },
  { name: "All day", start: "10:00", end: "16:00", label: "10 AM–4 PM" },
] as const;
export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const calendarDate = (key: string) => new Date(`${key}T12:00:00`);
export const dayLabel = (key: string) =>
  calendarDate(key).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export function todayInTimezone(timezone: string, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return dateKey(now);
  }
}
export function selectTripDays(days: Date[], current: TripSlot[]): TripSlot[] {
  return [...new Set(days.map(dateKey))].sort().flatMap((date) => {
    const existing = current.filter((s) => s.date === date);
    return existing.length
      ? existing
      : [{ date, start: "10:00", end: "16:00" }];
  });
}
export const TRIP_DRAFT_KEY = "bsb-v2-trip-draft-v1";
export function restoreTripDraft(
  raw: string | null,
): Partial<OutreachSettings> {
  try {
    const x = JSON.parse(raw ?? "null");
    if (
      !x ||
      !["VIRTUAL", "IN_PERSON"].includes(x.meetingMode) ||
      typeof x.timezone !== "string"
    )
      return {};
    new Intl.DateTimeFormat("en-US", { timeZone: x.timezone });
    for (const slots of [x.trip1, x.trip2]) {
      if (
        !Array.isArray(slots) ||
        slots.length > 31 ||
        slots.some(
          (s) =>
            !s ||
            !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
            !Number.isFinite(calendarDate(s.date).getTime()) ||
            dateKey(calendarDate(s.date)) !== s.date ||
            (s.start !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start)) ||
            (s.end !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end)),
        )
      )
        return {};
    }
    // Never restore recipient names or account-fact permission from trip storage.
    return {
      meetingMode: x.meetingMode,
      timezone: x.timezone,
      trip1: x.trip1.map(({ date, start, end }: TripSlot) => ({
        date,
        start,
        end,
      })),
      trip2: x.trip2.map(({ date, start, end }: TripSlot) => ({
        date,
        start,
        end,
      })),
    };
  } catch {
    return {};
  }
}
