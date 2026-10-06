# Account research dossier intake

The ChatGPT research project produces an **account research dossier**
(`schema_version: "bsb-account-dossier-v1"`; `"1.0"` is also accepted). The
researcher gathers evidence only and never selects instruments.

## How intake handles it

- Paste or upload the dossier on the intake page. Code fences (```json) and
  short text around the JSON are stripped automatically.
- `POST /api/bsb-v2/packets` accepts the dossier either wrapped as
  `{ "researchPacket": <dossier> }` or bare.
- The server converts it into a frozen `bsb-company-research-v1` packet
  (`artifacts/api-server/src/lib/account-dossier.ts`). Everything after that —
  normalization, assessment, review — is unchanged.
- Conversion is deterministic, so uploading the same dossier twice returns the
  same record.

## Mapping

| Dossier | Packet category |
|---|---|
| `must_be_right_facts`, modalities, disease areas, pipeline programs, unit research focus | `scientificNeeds` |
| Unit RNA/protein signals, measurement summary, resolution signals, job postings | `workflows` |
| Species/model systems, unit sample types and species | `samples` |
| Computational team, software, data preferences, infrastructure, spatial platforms detected, publications | `technologies` |
| `organization.company_stage` | `translationalStage` |
| Recent milestones, latest funding | `buyingReadinessSignals` |
| Contradicted inferences | `negativeOrContradictoryEvidence` (CONTRADICTED) |
| `open_unknowns`, weakened / no-evidence contradiction checks | `materialUnknowns` (UNKNOWN) |
| — | `instrumentDiscriminatingEvidence` stays empty (the decider's job) |

Every buyer-unit claim is prefixed with `[Unit name]` so departments stay
separate. Tags map as Stated → `EXPLICIT`, Inferred → `INFERRED` (reasoning and
confidence kept in `inference`), Unknown → `UNKNOWN`.

## Tolerated deviations (kept, listed as review warnings)

- Tags in any letter case; missing or unrecognized tags are treated as Unknown
  and never promoted to stated facts based on the presence of a link.
- Invalid or partial source URLs (dropped, item kept).
- Plain strings instead of evidence objects (kept as unsupported inferences, so
  they can never support a recommendation).
- Missing `schema_version`.

## Rejected (400, with field paths)

- No organization name (`organization.official_name` or `input.organization_name`).
- An unsupported `schema_version`.
- List fields (`buyer_units`, `job_postings`, etc.) that are not arrays.

Synthetic example: `samples/account-dossier-synthetic.json`.

## Source details for outreach

Include exact job titles and publication/presentation titles, with venue and year
when known. Use the same source URL on the evidence item and its source record:
the sequence planner links them to supply accurate attribution without borrowing
the source record's other research facts. Job records may include `status` (for
example, `closed; historical responsibilities only`); intake preserves it.
An unknown posting date should be null, not the research date. Closed or undated
roles do not establish active hiring or expansion.

Keep species, buyer units, sample preparation and assay relationships explicit.
RNA analysis does not by itself establish in-house RNA generation, spatial
profiling, matched tissue sections or a buying project. Leave those unknown when
the sources do not establish them. The researcher still does not select a product.
