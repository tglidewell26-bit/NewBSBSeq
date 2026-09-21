# Saved trips and calendar availability

September 21, 2026. Adds the original BSB app's convenient travel controls to the V2 Outreach Sequence tab. The original interface was inspected in the browser to confirm its preset hours.

- Select multiple travel dates, including nonconsecutive dates across months, from a calendar in each trip block. Select again or use Remove to remove a day. Up to 31 availability slots are supported per trip (previously six).
- Morning is 10 AM–1 PM, Afternoon is 1–4 PM, and All day is 10 AM–4 PM, matching the original app. Apply a preset to one day or all selected days. Custom start/end times remain editable. Add time window creates an additional interval on the same day; windows are ordered automatically and overlaps remain invalid. Unfinished time fields survive a browser refresh but must be completed before saving or generation.
- Save a named trip to the shared workspace and load it into either outreach wave. Saved trips are immutable snapshots; saving edited availability creates a new trip. Each snapshot includes its timezone. Both outreach waves use the form's shared timezone, which is displayed when a saved trip is loaded.
- Current trip selections are remembered in this browser between packets and reloads. Switching to Virtual retains those selections for a later switch back, but sends empty trip arrays for virtual generation. Recipient names and permission to use account-confirmed facts are never restored from trip storage.
- Previous dates remain visible in trip history. The UI labels them as past, and sequence generation still rejects past dates. Removing past days and selecting new dates is explicit; the application does not silently reschedule a trip.

Persistence adds `bsb_v2_saved_trips` at server initialization. `GET /api/bsb-v2/trips` lists saved snapshots; `POST /api/bsb-v2/trips` validates and saves one. Reusing an identical save ID is idempotent; using that ID for different content returns a conflict. Trip operations require no model calls. The original BSB app's existing history is not imported.

Verification: **130 tests passed across 10 files**, with zero paid model calls. The 16 new cases cover durable save/list/reinitialization, idempotency, invalid inputs, past-date history versus generation, 31 slots, multi-month selection, split/custom windows, timezone day boundaries, and safe browser-draft restoration. Review regressions also verify split-window creation and that 7- and 31-day trips do not add availability to LinkedIn connection copy or exceed its 300-character limit. Shared-library, server and frontend type checks and both production builds passed. Vite reports nonfatal component sourcemap warnings and a 512 kB bundle-size advisory after adding the calendar.

Executed from the repository root:

```sh
LOG_LEVEL=silent node ../bsb-test-runtime/server.mjs
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/bsb-sequence-generator-v2 run typecheck
pnpm --filter @workspace/api-server run build
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/bsb-sequence-generator-v2 run build
```

The disposable PGlite test harness remains outside the repository; the normal test command is `pnpm --filter @workspace/api-server test` against a separate schema-initialized PostgreSQL test database. No production data or live model calls were used for automated tests.

After merge, pull and republish in Replit. The new interface still needs a visual acceptance check on deployment: select three nonconsecutive dates, apply each preset and one custom time, save a named trip, reload the page, load the trip in another packet, switch Virtual/In person, and check scrolling in both trip blocks. Confirm only the intended future dates reach generation. No live sequence run is needed to check the trip controls.
