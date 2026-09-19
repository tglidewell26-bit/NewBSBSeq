# BSB Sequence Generator V2 — Phase 1 test report

## Live assessment implementation — 2026-09-19

- **65 tests passed across six files**, including the actual Express request path
  and disposable SQL database. New tests cover nested evidence preservation,
  model-output grounding, unsupported claims, separate commercial readiness,
  budget reservations, duplicate calls, explicit bounded retries, uncertain calls
  across midnight, approval, and client abort with a saved server result.
- Shared-library, API, and frontend TypeScript checks passed. Both production
  builds passed; Vite reports existing tooltip/label source-map warnings.
- The private Noetik packet passed unchanged intake and request-preservation
  checks. A deliberately stubbed expected response passed the evidence validator.
  This is not a real model accuracy test. Private account details are not committed.
- **Zero paid API calls** were made. Provider responses in tests were stubbed.
  Live Noetik assessment awaits API configuration and agreed spending limits.
- SQL tests used disposable PGlite with a single-connection harness. Production
  PostgreSQL multi-connection contention and the republished browser UI still
  need deployment verification. No production database was changed during testing.

The sections below record earlier implementation states and test counts.

## Shared workspace update — 2026-09-19

At Tim's request, sign-in and per-user access have been removed from both the
interface and API. The app opens at `/workspace`. Clerk, its proxy, authentication
UI, token helpers, and unused server dependencies are removed. The lockfile only
removes dependencies; remaining package versions are unchanged.

Existing records remain accessible without changing their IDs, packets,
assessments or review notes. The legacy owner column/index remains solely for
database compatibility. No schema push or data migration is required.

Executed after this change:

- All 30 tests pass. The eight HTTP/database tests now exercise the production
  Express app without credentials or simulated authentication. They cover intake,
  listing, reload, assessment, review, old-owner records, duplicate submissions,
  concurrent updates, and rejection of invalid approvals.
- Shared library builds and API/frontend TypeScript checks pass.
- API and frontend production builds pass without Clerk configuration. Vite
  reports existing source-map warnings for the tooltip and label components.
- The dependency lockfile passes pnpm's frozen-lockfile check offline.

Database testing used disposable PGlite with the single-connection harness
described below. No production database was accessed or changed. Browser testing
could not reach the local preview because the cloud browser blocked localhost;
visual acceptance on the republished Replit app remains pending.

Live AI is still disabled. Earlier authenticated-test results below are historical
and describe the previous access model.

## Independent GitHub review — 2026-09-18

The repository is now connected separately as `tglidewell26-bit/NewBSBSeq`.
Source reviewed at commit `4a4994cea8ec1bcd10bf6f46331656555dcb1b18`.
The historical Replit results below are preserved as reported, not independently
reclassified as signed-in browser results.

This correction fixes concurrent duplicate packet intake, rejects negative-fit
and duplicate-instrument approvals, checks the assessment's own evidence version,
and carries server field-level findings into the error message displayed by the
UI. The raw-packet preview also treats a non-string version as invalid text rather
than trying to render an object.

Executed independently after these changes:

- 30 tests passed in four files: 19 evidence/assessment unit tests, two client
  error-message tests, eight HTTP/database tests, and one direct database test.
- The error-message regression failed before its fix. The review-integrity
  regression reproduced an HTTP 200 approval for `NOT_QUALIFIED` before its fix.
- Shared library builds and API/frontend TypeScript checks passed.
- HTTP tests used an isolated local Express server and a disposable PGlite
  database over the PostgreSQL wire protocol, with simulated test identities.
  The harness limited the database pool to one connection because of the
  [PGlite socket connection limitation](https://pglite.dev/docs/pglite-socket).
  These results exercise real SQL and overlapping HTTP requests, but do not
  establish multi-connection production PostgreSQL concurrency or real Clerk
  authentication. No Replit database was used.

The repository test command remains `pnpm --filter @workspace/api-server test`.
Run database tests against an isolated, schema-initialized PostgreSQL test
database using `DATABASE_URL`. Never point synthetic test cleanup at production.

Runtime AI calls during this review: **0**. No model or provider was enabled.
Still pending: authenticated browser paste/upload/reload acceptance, native
PostgreSQL concurrency confirmation, live semantic provider setup with a spend
cap, and private real-company acceptance. Phase 2 has not started.

Date: 2026-09-18

## Executed checks

### Static and generated-contract checks

Command:

```sh
pnpm run typecheck
```

Result: passed across the shared libraries, API server, BSB V2 web app,
mockup sandbox, and scripts.

### Synthetic unit and server/database tests

Command:

```sh
pnpm --filter @workspace/api-server test
```

Correction-pass final result: 3 files passed, 26 tests passed, 0 failed.

The 19 pure unit tests cover the frozen wrapper/version and buckets,
extra-field rejection, duplicate and conflicting IDs, confirmed account
evidence without a public URL, public support-not-verified behavior,
unsupported numeric and qualitative claim additions, unknown/inferred/contradictory evidence, inert
untrusted text, explicit non-approvable real-input behavior, synthetic
installed-base CosMx with unknown budget, synthetic prospects without
ownership, CellScape, GeoMx, generic AI/oncology insufficiency, negation,
relevant versus unrelated contradiction, and the two-instrument cap.

The 6 HTTP/database acceptance tests start a real Express server, send actual
HTTP requests, and use the development PostgreSQL database inside isolated
synthetic records. They cover unauthenticated/malformed intake without provider
use, duplicate submit and immutable reload, untrusted text round-trip,
cross-account read/assess/review denial, persisted review notes, concurrent
review and assessment compare-and-set behavior, stale and false citations,
excluded evidence states, instrument mismatch, rejection shape, and explicit
second-instrument confirmation.

The remaining disposable database test directly verifies stage persistence,
owner-scoped selection, owner/input-hash uniqueness, and rollback.

An earlier run correctly exposed one failure: generated Zod objects stripped an
unknown legacy field rather than rejecting it. A strict frozen-contract boundary
was added, and the complete suite then passed.

### Authentication boundary for automated tests

The HTTP acceptance tests use an injected test-only identity resolver on an
isolated Express instance. Production Clerk middleware is not disabled or
bypassed. These tests establish route and database authorization behavior under
simulated identities; they are not real Clerk sign-ins and are not counted as
signed-in browser acceptance.

The live development schema was also inspected and contains the expected packet,
owner, hash/version, stage, raw packet, normalized evidence, validation,
assessment, review, and timestamp columns.

### Authentication and service smoke checks

Commands:

```sh
curl http://localhost:80/api/healthz
curl http://localhost:80/api/bsb-v2/packets
```

Results:

- Health endpoint: HTTP 200, `{"status":"ok"}`
- Private packet endpoint without a session: HTTP 401,
  `{"error":"Unauthorized"}`
- API and web workflows restarted and remained running.
- Public browser preview rendered without runtime errors.
- Browser console contained only the expected Clerk development-key warning.

## Runtime AI usage

Paid runtime AI calls: **0**

Automatically enabled runtime AI integrations: **0**

The only assessment provider is `DETERMINISTIC_FAKE`. Its output is visibly
labeled mock data and cannot establish real-company semantic accuracy.

## Review limitations and pending acceptance

- A real Clerk-authenticated end-to-end browser session was not fabricated.
  Paste/upload network parity, signed-in reload, and real two-account browser
  behavior still require a secure signed-in acceptance session.
- No private Noetik or other real-company packet was committed, logged, or used
  in automated tests. Private Noetik acceptance is pending secure real-input
  review and has not passed.
- The deterministic provider uses conservative keyword-to-rubric matching. It
  does not understand arbitrary real packets semantically and must not be
  described as accurate for real companies.
- Live provider, model ID, and spend cap are unset. Live calls remain disabled.
- A separate private GitHub repository has not been connected. The original
  Sequence-Generator repository was not accessed or linked.
- Phase 2 features remain absent: sequence writer, email 4/5 timing, sending,
  export, availability editing, promotion mode, scraping, schedules, Gmail,
  migration, and deployment.
