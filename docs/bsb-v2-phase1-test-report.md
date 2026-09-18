# BSB Sequence Generator V2 — Phase 1 test report

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