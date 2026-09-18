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

Phase 1 uses only `DETERMINISTIC_FAKE`. It maps supported text to stable rubric
rule IDs and is not semantic reasoning. It makes zero paid runtime AI calls.
At most two independently supported instruments can be approved. Changed
evidence invalidates prior approval through the evidence hash.

Live provider selection, model ID, spend cap, sequence writing, email timing,
sending, exporting, scraping, scheduling, and deployment are outside Phase 1.

## Security

All packet, assessment, and review endpoints require Clerk authentication and
filter every record by the server-derived owner ID. Request logging strips query
strings and redacts cookies/authorization headers. Packet bodies are not logged.
Committed samples and tests use synthetic companies only.