# Phase 2: reviewed eight-touch outreach

Implementation and test record, September 20, 2026. This extends the existing shared, single-user workspace at main `a97afe21a8846972779fb954f8967cd225be759e`. It preserves the assessment scrolling fix. The user's later shared-workspace instruction supersedes the original specification's authentication requirement.

## Behavior

- A real, approved instrument assessment is required. The planner freezes the evidence, approval, instrument assignments, catalog version and outreach settings. Canonical hashes tolerate PostgreSQL JSONB key ordering.
- Exact order: `email1`, `email2`, `liConnect`, `liMsg1`, `email3`, `liMsg2`, `email4`, `email5`. Separately approved secondary instruments appear in email3 and liMsg2. Account-confirmed evidence requires the explicit outreach checkbox.
- Planning is deterministic and free. Generation makes one strict-schema writer call and one independent semantic review call. Deterministic checks block invalid output even when the reviewer returns no findings. Only validated output is saved as approved and made available for copy/export.
- The application renders greetings, Tim's introduction, links, meeting availability, and signatures. General mode uses `{{first_name}}`; individual mode uses the supplied name. In-person dates are calendar-validated, ordered, future/current in the selected IANA timezone, and nonoverlapping. Virtual mode uses no trip dates. Email5 introduces the optional second trip and missed-you line, following the user's later Email5 direction.
- The small versioned catalog contains six sourced, qualitative capabilities and their limitations. Optional marketing assets are omitted; catalog/asset import remains later scope.
- Jobs persist their stage and usage independently of the submitting browser. Idempotency keys prevent duplicate submissions; cancellation races with save resolve to one actual terminal result. Lost workers and uncertain provider outcomes become `RECOVERY_REQUIRED`, retain their budget reservation, and block another paid job for that packet. There is no automatic restart or paid replay. Operator reconciliation of an uncertain outcome is required; no recovery-reset button is provided in this phase.
- A readable validation failure permits one explicit targeted regeneration. Only validated touches are retained for preservation; rejected full drafts are not stored as approved content. The regeneration cannot change preserved touches and revalidates the full sequence. A second failure stops.
- Editing scientific text creates a separately validated revision using one reviewer call. Previous approved history remains unchanged. Names, availability and other fixed blocks are not model-editable.

## Configuration and deployment

The existing OpenAI configuration is reused: `OPENAI_API_KEY`, `BSB_LIVE_ASSESSMENT=true`, `BSB_ASSESSMENT_MODEL=gpt-5.6-terra`, `BSB_AI_MAX_JOB_USD`, and `BSB_AI_DAILY_BUDGET_USD`. No additional external package or API key is required; the frontend adds a link to the existing workspace types package.

A generation reserves $0.70 for two calls; an edited revision reserves $0.35. These are conservative reservations, not measured charges. Actual token-based cost estimates are recorded separately. Assessment and generation share the daily reservation budget and database advisory lock. The current $1 job cap permits initial generation but blocks a $0.70 regeneration after it; generation plus one regeneration requires a configured cap of at least $1.40. This change does not raise the user's cap automatically.

Server initialization adds `bsb_v2_sequence_jobs` and its indexes with `CREATE ... IF NOT EXISTS`; existing packet data is unchanged. Pull the merged change, install with the frozen pnpm lockfile, rebuild both artifacts, and republish through Replit. No deployment was performed while preparing this change.

## Executed verification

- **113 tests passed across 9 files**: existing 74 plus 23 sequence unit cases and 16 sequence HTTP/database cases. Fake provider only; **zero paid model calls** for this implementation.
- Tests exercised the actual Express routes and a disposable PGlite PostgreSQL-wire database: authority checks, explicit account-fact permission, two-instrument scope, fixed copy, schema/semantic coverage, unsafe output with an apparently passing reviewer, approved export, targeted regeneration, edits, cancellation/save races, client disconnect/reconnect, uncertain provider response, worker inactivity, idempotency, and shared spend caps.
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
2. Run one authorized sequence generation. Refresh while it runs and confirm the same job resumes. Review all eight touches, their evidence/assignments, actual model/cost, and fixed copy. A specific actionable rejection is an acceptable diagnostic outcome; do not automatically retry.
3. On approved output, test copy/download and an edited revision. Check the prior approved version remains available. For two trips, verify Email5's dates and missed-you timing before sending.
4. Complete the private Noetik live generation/human review gate and a published-layout check before declaring Phase 2 accepted. Model semantic review is a safeguard, not proof of factual correctness. No messages are sent by this application.
