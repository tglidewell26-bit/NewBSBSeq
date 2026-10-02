# Instrument decision tree

New live assessments use `lib/decision-tree/instrument-tree.json` instead of the direct three-instrument scoring prompt. The exported `bsb-instrument-graph-v1` file is the source of routing logic. The supplied questions, notes, labels, links and outcomes are preserved. Those notes represent user-authored routing policy, not independently verified scientific/product facts.

## Update the logic

Replace the JSON file with a new export, run the synthetic tests, then rebuild and deploy in Replit. No engine code changes are needed for different questions, labels, links or supported outcomes. The API build copies the graph into its output directory. Every saved decision includes its graph snapshot and SHA-256 hash; editing the file does not rewrite historical decisions.

Question nodes need unique IDs and answer labels, valid destinations, and exactly one label containing the word Unknown. Outcome nodes need text and an instrument string. Recognized instrument choices are CellScape, CosMx, GeoMx, or pairs joined with ` or `. Non-instrument outcomes such as No fit, Other and Keep researching select no instruments. Graph validation rejects cycles, missing targets and paths exceeding 32 questions before any paid call.

## Evidence and departments

Select a buyer unit before assessing a dossier with multiple units. A packet retains one assessment/review; use separate unit-specific dossiers to assess additional departments independently. Unit labels from dossier intake identify scoped evidence. Existing job/publication records with exact parenthesized unit labels are also recognized. Company facts can provide company context; unassigned methods and other departments' claims are excluded. Legacy packets with no unit labels are assessed as Whole organization, so submit unit-specific packets for large organizations.

Each visited question makes one model call with question text, lookFor notes, allowed labels and scoped normalized evidence. The model does not see or choose next links. It returns a label, evidence IDs, exact supporting quotes and short reasoning. Code validates the response, records the step and follows the link. Missing, ambiguous, conflicting or inferred-only evidence requires Unknown, including where tree notes suggest a forgivable assumption. No/Neither also requires positive evidence establishing the negative. A preferred skill in a job ad or outsourced platform use is not proof of ownership.

Public excerpts remain supplied and unverified. Exact quote checking establishes provenance, not semantic truth; human review remains required. Only evidence cited along the path becomes available for downstream outreach. Outcomes produce potential routing candidates, not an independently scored strong fit or evidence of budget/readiness. Two-instrument leaves remain two candidates subject to the existing explicit second-instrument confirmation. Non-instrument outcomes cannot authorize instrument outreach.

## Persistence, approval and spending

The existing assessment endpoint and review workflow remain in use. `assessment.decisionTrace` stores buyer unit, graph/hash, each question/answer/citation/reason, and terminal outcome. `assessmentRun.progress` saves completed steps, pending node, calls and the graph snapshot; aggregate usage is saved after each completed provider call, including a response that fails answer validation. The Instrument Assessment tab displays completed or partial paths.

Approval and outreach replay the saved graph, verify citations against current evidence, and verify derived selections. Old direct-scoring assessments continue using their original validation. The legacy synthetic-demo button remains explicitly labeled and does not make paid calls; automated tree tests use a separate synthetic question provider.

Existing controls remain: `BSB_LIVE_ASSESSMENT=true`, the configured model/key, row-lock run reservation, evidence-version checks, two attempts with explicit retry, no automatic provider retry, and no further spending after an uncertain outcome. Completed assessments are reused.

New per-run bounds:
- At most 32 visited questions and 10 minutes total (at most 120 seconds per call).
- At most 80 scoped evidence items and 64 KB per request; no silent evidence truncation.
- At most 1,600 output tokens per question and 8,000 across the run.
- `BSB_TREE_MAX_COST_USD` defaults to 2; must be positive and at most 20. A conservative next-request estimate is checked before each paid call. Estimated pricing uses the app's existing token rates; this is not a provider billing guarantee. An explicitly authorized retry is a new run with its own budget and starts at the root.

Initialization adds only a nullable `progress` JSONB column to the assessment-runs table. No existing assessments or reviews are migrated.

## Validation and rollout

Run API tests for `instrument-tree.test.ts`, `instrument-tree-runs.test.ts`, `account-dossier.test.ts` and `bsb-v2.test.ts`, then workspace typechecks and API/frontend builds. Tree run tests mock both database and model and make no paid calls. Database-backed HTTP integration tests require a disposable PostgreSQL database; do not point test suites at a production database.

After merging, pull main into Replit, rebuild/redeploy, and check the synthetic dossier. A real-account test such as Retro requires a current dossier and an explicitly initiated live run. No expected instrument result is hardcoded from account history.
