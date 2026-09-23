## September 21: original sequence and trip UI alignment

New sequences use nine steps: email1, email2, liConnect, liMsg1, email3, email4, email5, liMsg2, email6. The first five steps belong to trip 1 (the connection request omits availability). Email 4 begins “Sorry I missed you last time” only for in-person outreach with a second trip. Email 4 onward uses trip 2, falling back to trip 1 when no second trip is supplied. Virtual outreach never uses missed-you wording. Email 6 is the final neutral follow-up.

The plan version changed. Existing approved sequences remain immutable and can still be read, copied, and exported. Legacy eight-step sequences cannot be edited into the new schema; create a new sequence to use the new order. Retry/revision authority checks reject older plans rather than silently reassigning saved messages.

Trip controls now use start/end dates and daily availability cards with morning, afternoon, all-day, unavailable, and half-hour time choices. Unset/unavailable days are excluded from outgoing availability. Named trips persist available time windows; loading one reconstructs its date range. Custom saved times outside the dropdown choices remain selectable. Separate subject/body copy buttons use the saved validated text.

# Phase 2: reviewed nine-touch outreach

Implementation and test record, September 20, 2026. This extends the existing shared, single-user workspace at main `a97afe21a8846972779fb954f8967cd225be759e`. It preserves the assessment scrolling fix. The user's later shared-workspace instruction supersedes the original specification's authentication requirement.

## Behavior

- A real, approved instrument assessment is required. The planner freezes the evidence, approval, instrument assignments, catalog version and outreach settings. Canonical hashes tolerate PostgreSQL JSONB key ordering.
- Exact order: `email1`, `email2`, `liConnect`, `liMsg1`, `email3`, `email4`, `email5`, `liMsg2`, `email6`. Separately approved secondary instruments appear in email3 and liMsg2. Account-confirmed evidence requires the explicit outreach checkbox.
- Planning is deterministic and free. Generation makes one strict-schema writer call and one independent semantic review call. Deterministic checks block invalid output even when the reviewer returns no findings. Only validated output is saved as approved and made available for copy/export.
- The application renders greetings, Tim's introduction, links, meeting availability, and signatures. General mode uses `{{first_name}}`; individual mode uses the supplied name. In-person dates are calendar-validated, ordered, future/current in the selected IANA timezone, and nonoverlapping. Virtual mode uses no trip dates. Email5 introduces the optional second trip and missed-you line, following the user's later Email5 direction.
- The small versioned catalog contains six sourced, qualitative capabilities and their limitations. Optional marketing assets are omitted; catalog/asset import remains later scope.
- Jobs persist their stage and usage independently of the submitting browser. Idempotency keys prevent duplicate submissions; cancellation races with save resolve to one actual terminal result. Lost workers and uncertain provider outcomes become `RECOVERY_REQUIRED` and block another paid job for that packet. There is no automatic restart or paid replay. Operator reconciliation of an uncertain outcome is required; no recovery-reset button is provided in this phase.
- A readable validation failure permits one explicit targeted regeneration. Only validated touches are retained for preservation; rejected full drafts are not stored as approved content. The regeneration cannot change preserved touches and revalidates the full sequence. A second failure stops.
- Editing scientific text creates a separately validated revision using one reviewer call. Previous approved history remains unchanged. Names, availability and other fixed blocks are not model-editable.

## Configuration and deployment

The existing OpenAI configuration is reused: `OPENAI_API_KEY`, `BSB_LIVE_ASSESSMENT=true`, `BSB_ASSESSMENT_MODEL=gpt-5.6-terra`. No additional external package or API key is required; the frontend adds a link to the existing workspace types package.

Generation makes two paid model calls; an edited revision makes one. Recorded token-based cost estimates remain visible. Daily/per-job dollar caps, reservations, and shared budget checks have been removed. Old budget environment variables and historical reservation values do not restrict new requests. Provider billing and rate limits still apply. The existing explicit regeneration and duplicate-outcome protections remain.

Server initialization adds `bsb_v2_sequence_jobs` and its indexes with `CREATE ... IF NOT EXISTS`; existing packet data is unchanged. Pull the merged change, install with the frozen pnpm lockfile, rebuild both artifacts, and republish through Replit. No deployment was performed while preparing this change.

## Executed verification

- **114 tests passed across 9 files**: existing 74 plus 23 sequence unit cases and 17 sequence HTTP/database cases. Fake provider only; **zero paid model calls** for this implementation. Includes the PR review regression: a regeneration that omits a preserved touch is rejected without incorrectly locking the packet in recovery.
- Tests exercised the actual Express routes and a disposable PGlite PostgreSQL-wire database: authority checks, explicit account-fact permission, two-instrument scope, fixed copy, schema/semantic coverage, unsafe output with an apparently passing reviewer, approved export, targeted regeneration, edits, cancellation/save races, client disconnect/reconnect, uncertain provider response, worker inactivity, idempotency, and (historically) shared spend caps. The current no-cap regressions replace spending-cap enforcement tests.
- Shared-library, API-server and frontend TypeScript checks passed. Both production builds passed. Vite retained its existing tooltip/label sourcemap warnings; these did not fail the build.
- A root-wide typecheck also sees an unrelated incomplete local `artifacts/mockup-sandbox` without its tsconfig. That directory is excluded from this change; the two delivered application packages and shared libraries were checked directly.
- Browser verification is **pending**: the browser environment returned `ERR_BLOCKED_BY_CLIENT` for the local preview; the Replit development preview was already blocked by its access challenge. No claim of live visual or live-model Phase 2 acceptance is made.

Commands executed from the repository root:

```sh
LOG_LEVEL=silent node ../bsb-test-runtime/server.mjs
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/bsb-sequence-generator-v2 run typecheck
pnpm --filter @workspace/api-server run build
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/bsb-sequence-generator-v2 run build
```

The temporary test launcher initializes an isolated PGlite database and invokes Vitest with a single-connection setup. For normal reproduction, initialize a disposable PostgreSQL database with the packet schema, set `DATABASE_URL` to that database and run `pnpm --filter @workspace/api-server test`. Do not run synthetic cleanup against production.

## Remaining acceptance after deployment

1. Open an approved real packet, select **Outreach Sequence**, and check scrolling, general/named recipient settings, and virtual/in-person fields. Verify changing packets does not retain the previous packet's editor state.
2. Run one authorized sequence generation. Refresh while it runs and confirm the same job resumes. Review all nine touches, their evidence/assignments, actual model/cost, and fixed copy. A specific actionable rejection is an acceptable diagnostic outcome; do not automatically retry.
3. On approved output, test copy/download and an edited revision. Check the prior approved version remains available. For two trips, verify Email5's dates and missed-you timing before sending.
4. Complete the private Noetik live generation/human review gate and a published-layout check before declaring Phase 2 accepted. Model semantic review is a safeguard, not proof of factual correctness. No messages are sent by this application.
