import { useState } from "react";
import type { SavedTrip } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dayLabel, presets, orderTripSlots, todayInTimezone, rangeDays, halfHourTimes, timeLabel, type TripSlot } from "./trip-utils";

export default function TripPicker({ title, slots, timezone, savedTrips, loading, disabled, onChange, onLoad, onSave }: {
  title: string; slots: TripSlot[]; timezone: string; savedTrips: SavedTrip[];
  loading: boolean; disabled: boolean;
  onChange: (slots: TripSlot[]) => void;
  onLoad: (trip: SavedTrip) => void;
  onSave: (input: { id: string; name: string; slots: TripSlot[]; timezone: string }) => Promise<void>;
}) {
  const ordered = orderTripSlots(slots);
  const [start, setStart] = useState(ordered[0]?.date ?? "");
  const [end, setEnd] = useState(ordered.at(-1)?.date ?? "");
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [selectedTrip, setSelectedTrip] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const today = todayInTimezone(timezone);
  const days = rangeDays(start, end);
  const changed = (next: TripSlot[]) => {
    if (next.length > 31) { setMessage("Each trip supports up to 31 availability slots."); return; }
    setMessage(""); onChange(orderTripSlots(next));
  };
  const setRange = (a: string, b: string) => {
    setStart(a); setEnd(b);
    const next = rangeDays(a, b);
    if (!next.length) {
      onChange([]);
      setMessage(a && b ? "Choose an end on or after the start, within 31 days." : "Choose both a start and end date.");
      return;
    }
    setUnavailable(unavailable.filter(d => next.includes(d)));
    changed(slots.filter(s => next.includes(s.date)));
  };
  const preset = (date: string, p: typeof presets[number]) => {
    changed([...slots.filter(s => s.date !== date), { date, start: p.start, end: p.end }]);
    setUnavailable(unavailable.filter(d => d !== date));
  };
  const remaining = days.filter(d => !slots.some(s => s.date === d) && !unavailable.includes(d));
  async function save() {
    setSaving(true); setMessage("");
    try {
      await onSave({ id: crypto.randomUUID(), name: name.trim(), slots, timezone });
      setMessage(`Saved “${name.trim()}”. You can reuse it in either trip.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Trip could not be saved."); }
    finally { setSaving(false); }
  }
  return <fieldset disabled={disabled || saving} className="min-w-0 rounded-lg border p-4 space-y-4">
    <legend className="px-2 font-semibold">{title}</legend>
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-sm">Load from a past trip
        <select aria-label={`${title} previous trips`} className="block w-full rounded border bg-background p-2 mt-1" value={selectedTrip} onChange={e => setSelectedTrip(e.target.value)}>
          <option value="">{loading ? "Loading saved trips…" : "Choose a saved trip"}</option>
          {savedTrips.map(t => <option key={t.id} value={t.id}>{t.name} · {t.slots[0].date} – {t.slots.at(-1)!.date}</option>)}
        </select>
      </label>
      <Button type="button" variant="outline" disabled={!selectedTrip} onClick={() => {
        const trip = savedTrips.find(t => t.id === selectedTrip); if (!trip) return;
        onLoad(trip); setStart(trip.slots[0].date); setEnd(trip.slots.at(-1)!.date);
        setName(trip.name); setUnavailable([]); setMessage(`Loaded “${trip.name}”. Both trips use ${trip.timezone}.`);
      }}>Load trip</Button>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Start<Input aria-label={`${title} start date`} type="date" value={start} min={today} onChange={e => setRange(e.target.value, end)} /></label>
      <label className="text-sm">End<Input aria-label={`${title} end date`} type="date" value={end} min={start || today} onChange={e => setRange(start, e.target.value)} /></label>
      <Button type="button" variant="ghost" onClick={() => { setStart(""); setEnd(""); setUnavailable([]); setSelectedTrip(""); changed([]); }}>Clear block</Button>
    </div>
    <p className="text-sm text-muted-foreground">Choose a date range, then mark availability for each day. Only available times appear in outreach. Up to 31 days and 31 time windows per trip.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={!remaining.length} onClick={() => setUnavailable([...unavailable, ...remaining])}>Mark remaining Not available</Button>
      <Button type="button" variant="outline" size="sm" disabled={!remaining.length} onClick={() => changed([...slots, ...remaining.map(date => ({ date, start: "10:00", end: "16:00" }))])}>Mark remaining Available all day</Button>
    </div>
    {slots.some(s => s.date < today) && <p role="alert" className="text-sm text-amber-700">This trip contains past dates. Select new dates before generating outreach.</p>}
    {!days.length && <p className="text-sm text-muted-foreground">Choose a valid start and end date to see daily availability.</p>}
    {days.map(date => {
      const windows = slots.filter(s => s.date === date);
      return <article key={date} className="rounded border p-3 space-y-3">
        <div className="flex justify-between gap-3"><strong>{dayLabel(date)}</strong><span className="text-sm text-muted-foreground">{windows.length ? "Available" : unavailable.includes(date) ? "Not available" : "Not set"}</span></div>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => <Button type="button" key={p.name} size="sm" variant={windows.length === 1 && windows[0].start === p.start && windows[0].end === p.end ? "default" : "outline"} onClick={() => preset(date, p)}>{p.name === "All day" ? "Available all day" : p.name}</Button>)}
          <Button type="button" size="sm" variant={!windows.length && unavailable.includes(date) ? "default" : "outline"} onClick={() => { changed(slots.filter(s => s.date !== date)); setUnavailable([...unavailable.filter(d => d !== date), date]); }}>Not available</Button>
        </div>
        {windows.map((s, i) => <div key={i} className="flex flex-wrap items-end gap-3">
          {(["start", "end"] as const).map(field => <label className="text-xs" key={field}>{field === "start" ? "From" : "To"}
            <select aria-label={`${title} ${date} slot ${i + 1} ${field}`} className="block rounded border bg-background p-2" value={s[field]} onChange={e => changed(slots.map(v => v === s ? { ...v, [field]: e.target.value } : v))}>
              <option value="">Choose time</option>
              {s[field] && !halfHourTimes.includes(s[field]) && <option value={s[field]}>{timeLabel(s[field])}</option>}
              {halfHourTimes.map(t => <option key={t} value={t}>{timeLabel(t)}</option>)}
            </select>
          </label>)}
          <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${title} ${date} slot ${i + 1}`} onClick={() => changed(slots.filter(v => v !== s))}>Remove</Button>
        </div>)}
        {!!windows.length && <Button type="button" variant="outline" size="sm" disabled={slots.length >= 31} onClick={() => changed([...slots, { date, start: "", end: "" }])}>Add time window</Button>}
      </article>;
    })}
    <div className="flex flex-wrap items-end gap-2 border-t pt-3">
      <label className="text-sm flex-1 min-w-48">Trip name<Input aria-label={`${title} trip name`} placeholder="e.g. October Palo Alto visit" maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
      <Button type="button" variant="outline" disabled={!slots.length || !name.trim()} onClick={() => void save()}>{saving ? "Saving…" : "Save as new trip"}</Button>
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </fieldset>;
}
