import { pool } from "@workspace/db";
import { savedTripSchema, type SavedTrip } from "@workspace/api-zod";
import { AssessmentError } from "./live-assessment";
import { digest, validateSettings } from "./sequences";

export async function initializeSavedTrips() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bsb_v2_saved_trips (
    id text PRIMARY KEY, name text NOT NULL, timezone text NOT NULL,
    slots jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
}
const publicTrip = (r: any): SavedTrip => ({
  id: r.id,
  name: r.name,
  timezone: r.timezone,
  slots: r.slots,
  createdAt: new Date(r.created_at).toISOString(),
});
export async function listSavedTrips() {
  const { rows } = await pool.query(
    "SELECT * FROM bsb_v2_saved_trips ORDER BY created_at DESC, id DESC",
  );
  return rows.map(publicTrip);
}
export async function saveTrip(input: unknown) {
  const parsed = savedTripSchema.safeParse(input);
  if (!parsed.success)
    throw new AssessmentError(
      "INVALID_TRIP",
      "Check the trip name and availability.",
      400,
      parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    );
  const trip = parsed.data;
  // Past trips remain reusable history. Actual generation still rejects past dates.
  validateSettings(
    {
      mode: "GENERAL",
      firstName: "",
      meetingMode: "IN_PERSON",
      timezone: trip.timezone,
      trip1: trip.slots,
      trip2: [],
      allowAccountFacts: false,
    },
    new Date(),
    { allowPastDates: true },
  );
  await pool.query(
    `INSERT INTO bsb_v2_saved_trips(id,name,timezone,slots) VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT(id) DO NOTHING`,
    [trip.id, trip.name, trip.timezone, JSON.stringify(trip.slots)],
  );
  const saved = publicTrip(
    (
      await pool.query("SELECT * FROM bsb_v2_saved_trips WHERE id=$1", [
        trip.id,
      ])
    ).rows[0],
  );
  if (
    digest({
      id: saved.id,
      name: saved.name,
      timezone: saved.timezone,
      slots: saved.slots,
    }) !== digest(trip)
  )
    throw new AssessmentError(
      "TRIP_CONFLICT",
      "This save belongs to a different trip. Save your changes as a new trip.",
      409,
    );
  return saved;
}
