# Live company assessment

Pull GitHub main into Replit and republish. The app still opens without login.
Research packets and existing records retain their original shape. Server startup
adds one assessment-run table and index; it does not reset or migrate packet data.
The database role needs permission to create that table/index.

## Enable only after choosing spending limits

Set these in **Replit Secrets**, including the published deployment's environment.
Do not put the API key into a packet, browser code, GitHub, or a chat message.

| Variable | Value |
| --- | --- |
| `OPENAI_API_KEY` | Your OpenAI API key with access to the selected model |
| `BSB_ASSESSMENT_MODEL` | `gpt-5.6-terra` |
| `BSB_AI_MAX_JOB_USD` | Agreed per-packet limit in USD; at least `0.35` |
| `BSB_AI_DAILY_BUDGET_USD` | Agreed shared daily limit in USD |
| `BSB_LIVE_ASSESSMENT` | `true` after all settings are ready |

An initial **$1 per packet and $5 per day** is a proposal, not a configured or
approved budget. Live assessment remains disabled if any required setting is
missing. To stop new paid calls, set `BSB_LIVE_ASSESSMENT=false` and restart or
republish. Already submitted provider calls may still finish and incur charges.

Each attempt reserves $0.35 before making one Responses API call. Reservations
are shared across visitors and server instances, persist in PostgreSQL, and
count against the per-packet and UTC daily limits. Completed and failed attempts
retain their full daily reservation, even when estimated usage is lower. A
known failure allows one explicit retry if both budgets permit; two attempts is
the maximum per packet. Double-clicks and refreshes do not authorize new calls.
Successful assessments are reused. There are no automatic repair or retry loops.

An interrupted or uncertain call retains its reservation across midnight and
blocks another attempt for that packet. Check the saved result and provider
usage before investigating a stuck run; do not resubmit copies to bypass it.
Provider errors and incomplete outputs may lack recorded token usage, but their
full reservation remains held. The displayed cost is an estimate, not an invoice.
The limits cover this app's assessment calls, not Replit hosting or other API use.
Because the workspace has no login, anyone able to reach it shares these limits.

The reservation conservatively covers bounded input and 8,000 output tokens at
the model pricing checked on 2026-09-19, including input cache-write headroom.
Recheck pricing before changing the model or request limits:
[model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-terra),
[structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

## First live check

1. Open the published workspace and confirm it shows AI assessment enabled.
2. Paste the complete Noetik research packet, including `qualificationEvidence`.
   The existing exact packet can be reused if it only has the old unapprovable mock.
3. Click **Assess company** once. A reload shows the saved running/completed state.
4. Review CosMx fit, active use, installed-base status, and unknown commercial
   readiness separately. Confirm every positive finding cites supplied evidence.
   Public excerpts remain supplied excerpts, not independently retrieved sources.
5. Approve only after reviewing the result. Report any specific field/rule error
   before authorizing a retry. Sequence writing is not implemented yet.

The implementation checks structure, exact quotations, evidence IDs, rubric
ownership, and several contradiction/claim safeguards. Semantic assessment is
still model judgment and requires human review; it is not independent factual
verification. No live model accuracy result is claimed by the automated tests.
