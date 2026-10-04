# Correcting a saved decision

Click any completed question in **Instrument Assessment**, regardless of its answer.
The popup shows the answer's reason, citations, question guidance, and destination.
Click **Change**, select one of that question's allowed answers, and explain the
correction. **Run** stays disabled for empty or whitespace-only reasons. Multi-choice
questions retain their actual options; they are not reduced to Yes/No/Unknown.

## What runs

The server validates the current assessment ID, saved graph, evidence version, and
active path. It keeps the earlier steps, records the human answer without a model
call, and follows its `next` branch. Only subsequent questions make model calls.
If the changed answer leads directly to an outcome, no model calls are made.
The snapshot of the original graph is used even if a newer tree has been exported.
Old downstream answers are discarded from the new trace, including where branches
converge; they remain available in the archived assessment.

## Evidence and history

The uploaded research packet is not rewritten. Known human answers become separately
labeled `CONFIRMED_ACCOUNT` supplemental evidence with the entered reason and a
server timestamp. Unknown corrections do not create positive evidence. Only
corrections on the retained path are provided to later questions. The model still
has to cite eligible evidence and obey buyer-unit boundaries.

The run's `revision` JSON archives the previous assessment and review before any
paid call. Each edited step also retains its previous answer. **View previous
decisions** displays read-only archived paths. The latest successful revision gets
a new assessment ID and clears approval. Existing outreach is not rewritten, and
new outreach needs a new approval. If a revised run fails, the previous assessment
and review remain intact; partial progress and usage are saved on the failed run.

Existing per-run safeguards remain. Duplicate/in-progress requests, uncertain
provider outcomes, stale tabs, invalid choices, and active outreach jobs are blocked.
There are no automatic retries. Explicit corrections are new revisions, not retries
under the initial assessment's two-attempt counter.

## Qualification card limitation

The current routing adapter sets account status, readiness, and current use to
Unknown. They are not all backed by nodes in the instrument graph. Editing the
scientific route does not establish buying readiness or use of the recommended
instrument. The card explains this rather than offering invented branch links.

## Endpoints and deployment

- `POST /api/bsb-v2/packets/:packetId/decision-override`: `{assessmentId, nodeId, label, reason}`.
- `GET /api/bsb-v2/packets/:packetId/assessment-history`: archived prior assessments/reviews and correction run status.
- Startup adds a nullable `revision` JSONB column to assessment runs. No existing
  packet or review is migrated. Pull the commit into Replit and redeploy both API
  and frontend.

## Synthetic verification

Run the `instrument-tree` and `instrument-tree-runs` Vitest suites in the API server.
For browser verification, install Playwright and its Chromium browser in the test
environment, serve the frontend locally on port 4173, and run
`node scripts/test-decision-editor.mjs`. The script intercepts all API calls and uses
only a synthetic packet; it never invokes a real model or database.
