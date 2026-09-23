# Live company assessment

Pull GitHub main into Replit and republish. The app still opens without login.
Existing packets, reviews, files, and usage history are preserved.

## Configuration

Set these in **Replit Secrets**, including the published deployment's environment.
Never put the API key into a packet, browser code, GitHub, or a chat message.

| Variable | Value |
| --- | --- |
| `OPENAI_API_KEY` | Your OpenAI API key with access to the selected model |
| `BSB_ASSESSMENT_MODEL` | `gpt-5.6-terra` |
| `BSB_LIVE_ASSESSMENT` | `true` |

The app has **no daily or per-job dollar spending cap**. The former
`BSB_AI_MAX_JOB_USD` and `BSB_AI_DAILY_BUDGET_USD` variables are ignored and
can be removed from Replit. No replacement $100 limit has been introduced.
Provider billing, account quotas, and rate limits still apply.

The workspace has no login. Anyone able to reach it can initiate paid requests.
This change does not add authentication. To disable new paid calls, set
`BSB_LIVE_ASSESSMENT=false` and restart or republish. Calls already submitted
may finish and incur charges.

## Calls and usage

Each assessment makes one model call. A known failure permits one explicitly
requested retry; the existing two-attempt ceiling remains. Double-clicks and
refreshes do not authorize new calls. Successful assessments are reused.
There are no automatic repair or retry loops.

An uncertain outcome still blocks a duplicate attempt for that same packet,
but cannot consume a shared balance or block unrelated documents or packets.
Input-size bounds, output validation, and evidence checks remain.
Recorded token usage and estimated costs are available on completed calls;
cost estimates are not invoices. Provider failures can lack usage information.

Legacy reservation columns remain solely to preserve database compatibility
and historical records. New runs write zero; no request reads or totals those
columns to decide whether another call is allowed.

## Published acceptance

1. Confirm AI assessment is enabled with only the three settings above.
2. Open a valid research packet and assess it once.
3. Review instrument fit and evidence before approving the assessment.
4. Upload several knowledge files and confirm automatic analysis begins
   without a balance or reservation warning. Review and save their metadata.
5. Inspect completed assessment/sequence usage or the analyzed file's estimated
   cost. No live paid calls are required for the automated test suite.

The implementation checks structure, quotations, evidence IDs, rubric ownership,
and claim safeguards. Semantic assessment still requires human review.
