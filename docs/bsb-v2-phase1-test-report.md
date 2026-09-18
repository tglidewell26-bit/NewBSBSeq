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

### Synthetic unit tests

Command:

```sh
pnpm --filter @workspace/api-server test
```

Final result: 2 files passed, 17 tests passed, 0 failed.

Covered synthetic cases include exact wrapper/version validation, extra-field
rejection, pasted/uploaded object parity at the shared request boundary,
duplicate and conflicting IDs, confirmed account evidence without a public URL,
missing account confirmation/label, unsupported numeric claim detail, inferred,
unknown and contradictory evidence retention, prompt-injection text remaining
inert, the three instrument rubric families, generic AI insufficiency, and the
two-instrument cap.

An earlier run correctly exposed one failure: generated Zod objects stripped an
unknown legacy field rather than rejecting it. A strict frozen-contract boundary
was added, and the complete suite then passed.

### Disposable database integration

The integration test opens a transaction against the development database,
inserts a synthetic packet, confirms the persisted `VALIDATED` stage, confirms
that a different owner cannot select the row, confirms the unique
owner/input-hash idempotency constraint, and rolls the transaction back.

Result: 1 integration test passed. No synthetic integration row remains.

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

- An authenticated end-to-end browser session was not fabricated. Packet
  submission, reload, assessment, review, stale approval, and cross-user browser
  flows still require a secure signed-in acceptance session.
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