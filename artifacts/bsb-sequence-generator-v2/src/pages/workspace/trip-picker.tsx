import { useState } from "react";
import type { SavedTrip } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  calendarDate,
  dayLabel,
  presets,
  selectTripDays,
  orderTripSlots,
  todayInTimezone,
  type TripSlot,
} from "./trip-utils";

export default function TripPicker({
  title,
  slots,
  timezone,
  savedTrips,
  loading,
  disabled,
  onChange,
  onLoad,
  onSave,
}: {
  title: string;
  slots: TripSlot[];
  timezone: string;
  savedTrips: SavedTrip[];
  loading: boolean;
  disabled: boolean;
  onChange: (slots: TripSlot[]) => void;
  onLoad: (trip: SavedTrip) => void;
  onSave: (input: {
    id: string;
    name: string;
    slots: TripSlot[];
    timezone: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [selectedTrip, setSelectedTrip] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(() =>
    slots[0] ? calendarDate(slots[0].date) : new Date(),
  );
  const today = todayInTimezone(timezone);
  const days = [...new Set(slots.map((s) => s.date))];
  const past = slots.some((s) => s.date < today);
  const changed = (value: TripSlot[]) => {
    setMessage("");
    onChange(orderTripSlots(value));
  };
  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await onSave({
        id: crypto.randomUUID(),
        name: name.trim(),
        slots,
        timezone,
      });
      setMessage(`Saved “${name.trim()}”. You can reuse it in either trip.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Trip could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <fieldset
      disabled={disabled || saving}
      className="min-w-0 rounded-lg border p-4 space-y-4"
    >
      <legend className="px-2 font-semibold">{title}</legend>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-sm">
          Previous trips
          <select
            aria-label={`${title} previous trips`}
            className="block w-full rounded border bg-background p-2 mt-1"
            value={selectedTrip}
            onChange={(e) => setSelectedTrip(e.target.value)}
          >
            <option value="">
              {loading ? "Loading saved trips…" : "Choose a saved trip"}
            </option>
            {savedTrips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.slots[0].date} – {t.slots.at(-1)!.date}
                {t.slots.some((s) => s.date < today) ? " · past dates" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!selectedTrip}
          onClick={() => {
            const trip = savedTrips.find((t) => t.id === selectedTrip);
            if (!trip) return;
            onLoad(trip);
            setName(trip.name);
            setMonth(calendarDate(trip.slots[0].date));
            setMessage(
              `Loaded “${trip.name}”. Both trip blocks use ${trip.timezone}.`,
            );
          }}
        >
          Load trip
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Select each travel day on the calendar. New days start at 10 AM–4 PM;
        choose a preset or adjust the times below. Up to 31 availability slots
        per trip.
      </p>
      <div className="flex flex-wrap items-start gap-5">
        <div className="rounded-md border shrink-0 max-w-full overflow-x-auto">
          <Calendar
            mode="multiple"
            month={month}
            onMonthChange={setMonth}
            selected={days.map(calendarDate)}
            onSelect={(dates) => {
              const next = selectTripDays(dates ?? [], slots);
              if (next.length > 31) {
                setMessage("Each trip supports up to 31 availability slots.");
                return;
              }
              changed(next);
            }}
            disabled={
              disabled || saving ? true : { before: calendarDate(today) }
            }
          />
        </div>
        <div className="min-w-0 flex-1 space-y-3 basis-72">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium">Apply to all days:</span>
            {presets.map((p) => (
              <Button
                type="button"
                key={p.name}
                size="sm"
                variant="outline"
                disabled={!slots.length}
                onClick={() =>
                  changed(
                    days.map((date) => ({ date, start: p.start, end: p.end })),
                  )
                }
              >
                {p.name}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!slots.length}
              onClick={() => {
                changed([]);
                setSelectedTrip("");
              }}
            >
              Clear days
            </Button>
          </div>
          {!slots.length && (
            <p className="text-sm text-muted-foreground">
              No travel days selected.
            </p>
          )}
          {past && (
            <p role="alert" className="text-sm text-amber-700">
              This trip contains past dates. Remove those days and select new
              dates before generating outreach.
            </p>
          )}
          {slots.map((s, i) => (
            <div
              key={`${s.date}-${i}`}
              className="rounded border p-3 space-y-2"
            >
              <div className="flex justify-between gap-2 items-center">
                <strong className="text-sm">{dayLabel(s.date)}</strong>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${title} ${s.date} slot ${i + 1}`}
                  onClick={() => changed(slots.filter((_, n) => n !== i))}
                >
                  Remove
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <Button
                    type="button"
                    key={p.name}
                    size="sm"
                    variant={
                      s.start === p.start && s.end === p.end
                        ? "default"
                        : "outline"
                    }
                    aria-pressed={s.start === p.start && s.end === p.end}
                    onClick={() =>
                      changed(
                        slots.map((v, n) =>
                          n === i ? { ...v, start: p.start, end: p.end } : v,
                        ),
                      )
                    }
                  >
                    {p.name}{" "}
                    <span className="text-xs opacity-80">{p.label}</span>
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                {(["start", "end"] as const).map((field) => (
                  <label key={field} className="text-xs">
                    {field === "start" ? "From" : "To"}
                    <Input
                      aria-label={`${title} ${s.date} slot ${i + 1} ${field}`}
                      type="time"
                      value={s[field]}
                      onChange={(e) =>
                        changed(
                          slots.map((v, n) =>
                            n === i ? { ...v, [field]: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              {slots.findLastIndex((slot) => slot.date === s.date) === i && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={slots.length >= 31}
                  aria-label={`Add time window for ${title} ${s.date}`}
                  onClick={() =>
                    changed([...slots, { date: s.date, start: "", end: "" }])
                  }
                >
                  Add time window
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <label className="text-sm flex-1 min-w-48">
          Trip name
          <Input
            aria-label={`${title} trip name`}
            placeholder="e.g. October Palo Alto visit"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!slots.length || !name.trim()}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save as new trip"}
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </fieldset>
  );
}
