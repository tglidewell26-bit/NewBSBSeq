# BSB Sequence Generator V2 — Phase 1 contract

This application accepts exactly one request property:

```json
{ "researchPacket": { "...": "the producer packet" } }
```

The producer packet's outer object contains only `schemaVersion`, `brief`, and
`qualificationEvidence`. Its version is `bsb-company-research-v1`.
`qualificationEvidence` contains only `schemaVersion`, `purpose`,
`generationStatus`, `categories`, and `instrumentDiscriminatingEvidence`.
Its version is `1.0`; its purpose is
`EVIDENCE_ONLY_NO_INSTRUMENT_SELECTION`.

The complete machine-readable contract is `lib/api-spec/openapi.yaml`.
Objects use `additionalProperties: false`; therefore duplicate evidence
properties, legacy markers, and prose-extraction envelopes are rejected.

## Evidence handling

- Raw accepted packets are persisted unchanged.
- Evidence is normalized once with its original source locations.
- Identical items sharing an ID count once; conflicting content sharing an ID
  is rejected and both locations are reported.
- Bucket placement is not treated as authority or buying intent.
- Structural validity is separate from factual support.
- Unsupported items remain visible and are excluded from recommendation support.
- `CONFIRMED_ACCOUNT` evidence never requires a public URL.
- `PUBLIC_SOURCE` affirmative facts require supplied excerpts and HTTP(S) URLs.
- Basis excerpts are supplied context, not independent verification.
- Unknown is not negative. Current use, account status, commercial readiness,
  and scientific fit remain separate.

## Assessment limits

Real-company assessment uses one explicitly enabled GPT-5.6 Terra call, followed
by server evidence checks and human review. Configuration and persistent spending
controls are documented in `live-assessment-setup.md`. Calls default off.
Explicit synthetic demonstration mode remains deterministic and visibly labeled;
it makes zero paid calls and cannot become a validated real-company assessment.

Public-source claims are retained as `SUPPORT_NOT_VERIFIED` only when their
supplied URL and basis structure pass development checks; those checks do not
independently verify the claim. Malformed or overstated public claims are
`UNSUPPORTED`. Independently valid confirmed-account evidence remains
`SUPPORTED`. Inferences remain non-authoritative.

Live assessment can cite eligible public excerpts after model entailment review,
without promoting their original provenance or claiming independent retrieval.
Every supplied item receives a review; rejected individual claims do not erase
separately supported workflow evidence. Fit, current use, account status, and
commercial readiness each retain their own supporting evidence IDs.

One instrument is recommended by default. Two require strong fit and distinct
evidence for each. At most two eligible instruments can be approved, and a second instrument
requires explicit confirmation. Approval revalidates every cited evidence ID
against current evidence. Version-bound compare-and-set writes prevent stale or
concurrent assessment/review changes from silently winning. Review notes remain
attached to the persisted review.

Sequence writing, email timing, sending, exporting, scraping, and scheduling
remain outside this implementation.

## Security

The app opens directly into one shared workspace without sign-in. Packet,
assessment, and review endpoints do not require credentials. Anyone with access
to the published URL can read packets and submit assessments/reviews.

Existing records remain accessible regardless of their former owner ID. The
existing database column and unique index are retained only for compatibility;
new records use a constant shared-workspace value. No data migration or schema
push is required for packet records. Startup adds only an assessment-run ledger
table/index. Duplicate submissions return the existing intact record.

Request logging strips query strings and redacts cookies/authorization headers.
Packet bodies are not logged. Live AI defaults disabled until configured.
Committed samples and tests use synthetic companies only.
