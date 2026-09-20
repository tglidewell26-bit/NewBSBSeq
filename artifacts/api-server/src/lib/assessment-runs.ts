import { initializeSequenceJobs } from "./sequence-jobs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { normalizeEvidence, hashPacket, validateFrozenRequest } from "./bsb-v2";
import { AssessmentError, buildAssessmentRequest, callAssessmentModel, liveConfiguration,
  validateModelAssessment, MODEL, PROMPT_VERSION, RESERVATION_MICRO_USD, TIMEOUT_MS } from "./live-assessment";

// Additive only: existing packet columns, records and reviews are never migrated.
export async function initializeAssessmentRuns() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bsb_v2_assessment_runs (
    id text PRIMARY KEY, packet_id text NOT NULL, evidence_version text NOT NULL,
    attempt integer NOT NULL, state text NOT NULL, reserved_micro_usd integer NOT NULL,
    model text NOT NULL, prompt_version text NOT NULL, error jsonb, usage jsonb,
    started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
  ); CREATE UNIQUE INDEX IF NOT EXISTS bsb_v2_run_attempt_idx
     ON bsb_v2_assessment_runs(packet_id, attempt);`);
  await initializeSequenceJobs();
}

export const failurePayload = (error: AssessmentError) => ({
  error: error.message, errorType: error.code, failedStage: "ASSESSMENT",
  issues: error.issues, retryable: !["OUTCOME_UNKNOWN", "BUDGET_EXHAUSTED", "ATTEMPT_LIMIT"].includes(error.code),
});

export async function getAssessmentRun(packetId: string) {
  const { rows } = await pool.query("SELECT * FROM bsb_v2_assessment_runs WHERE packet_id=$1 ORDER BY attempt DESC LIMIT 1", [packetId]);
  const run = rows[0];
  if (!run) return undefined;
  const stale = run.state === "RUNNING" && Date.now() - new Date(run.started_at).getTime() > TIMEOUT_MS + 30000;
  return { id: run.id, state: stale ? "OUTCOME_UNKNOWN" : run.state, attempt: run.attempt,
    reservedUsd: run.reserved_micro_usd / 1e6, startedAt: new Date(run.started_at).toISOString(),
    error: stale ? failurePayload(new AssessmentError("OUTCOME_UNKNOWN", "The assessment was interrupted. Reload to check for a saved result. Its cost reservation remains held; do not submit another paid request.")) : run.error ?? undefined,
    usage: run.usage ?? undefined };
}

export async function runLiveAssessment(packetId: string, retry = false) {
  const config = liveConfiguration();
  if (!config.enabled) throw new AssessmentError("NOT_CONFIGURED", "Live assessment is disabled until the API model and spending limits are configured.", 503,
    config.missing.map(name => ({ path: "configuration", message: name })));
  const client = await pool.connect();
  let runId = "";
  let row: any;
  let request: ReturnType<typeof buildAssessmentRequest>;
  let normalized: ReturnType<typeof normalizeEvidence>["normalized"];
  try {
    await client.query("BEGIN");
    // One brief, database-wide budget lock covers all replicas and concurrent
    // submissions. Never hold a transaction or connection during the model call.
    await client.query("SELECT pg_advisory_xact_lock(724019)");
    row = (await client.query("SELECT * FROM bsb_v2_packets WHERE id=$1 FOR UPDATE", [packetId])).rows[0];
    if (!row) throw new AssessmentError("NOT_FOUND", "Packet not found.", 404);
    if (row.assessment?.provider === "OPENAI") { await client.query("COMMIT"); return row.assessment; }
    if (row.review || row.assessment?.demoMode) throw new AssessmentError("ALREADY_REVIEWED", "This packet has a saved demonstration or review. Use a real research packet for live assessment.", 409);
    const parsed = validateFrozenRequest({ researchPacket: row.research_packet });
    if (!parsed.success || hashPacket(row.research_packet) !== row.evidence_version) throw new AssessmentError("INVALID_PACKET", "The saved packet failed structure or evidence-version checks.", 400, parsed.issues);
    const result = normalizeEvidence(row.research_packet);
    if (result.errors.length) throw new AssessmentError("INVALID_PACKET", "The packet contains conflicting evidence IDs.", 400, result.errors);
    normalized = result.normalized;
    request = buildAssessmentRequest(row.research_packet.brief, normalized);
    const previous = (await client.query("SELECT * FROM bsb_v2_assessment_runs WHERE packet_id=$1 ORDER BY attempt DESC LIMIT 1", [packetId])).rows[0];
    if (previous?.state === "RUNNING" || previous?.state === "OUTCOME_UNKNOWN") throw new AssessmentError("OUTCOME_UNKNOWN", "An assessment is already running or its outcome is uncertain. Reload its status; no additional paid call was started.", 409);
    if (previous && !retry) throw new AssessmentError("RETRY_CONFIRMATION_REQUIRED", "The previous attempt failed. Use the explicit retry action to authorize one more bounded call.", 409);
    if (previous?.attempt >= 2) throw new AssessmentError("ATTEMPT_LIMIT", "The two-attempt limit has been reached. Review the reported failure before further work.", 409);
    if (((previous?.attempt ?? 0) + 1) * RESERVATION_MICRO_USD > config.jobLimitMicroUsd) throw new AssessmentError("BUDGET_EXHAUSTED", "Another attempt would exceed this packet's per-job spending limit. No paid call was started.", 429);
    const spent = (await client.query(`SELECT COALESCE(SUM(reserved_micro_usd),0)::bigint AS reserved FROM (
      SELECT reserved_micro_usd FROM bsb_v2_assessment_runs WHERE started_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR state IN ('RUNNING','OUTCOME_UNKNOWN')
      UNION ALL SELECT reserved_micro_usd FROM bsb_v2_sequence_jobs WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR state IN ('QUEUED','WRITING','VALIDATING','RECOVERY_REQUIRED')) charges`)).rows[0];
    if (Number(spent.reserved) + RESERVATION_MICRO_USD > config.dailyLimitMicroUsd) throw new AssessmentError("BUDGET_EXHAUSTED", "The daily assessment budget is exhausted. No paid call was started. Uncertain calls retain their reservations.", 429);
    runId = randomUUID();
    await client.query(`INSERT INTO bsb_v2_assessment_runs
      (id,packet_id,evidence_version,attempt,state,reserved_micro_usd,model,prompt_version)
      VALUES ($1,$2,$3,$4,'RUNNING',$5,$6,$7)`,
      [runId, packetId, row.evidence_version, (previous?.attempt ?? 0) + 1, RESERVATION_MICRO_USD, MODEL, PROMPT_VERSION]);
    await client.query("UPDATE bsb_v2_packets SET stage='ASSESSING', updated_at=now() WHERE id=$1", [packetId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }

  try {
    const response = await callAssessmentModel(request!);
    await pool.query("UPDATE bsb_v2_assessment_runs SET usage=$1::jsonb WHERE id=$2", [JSON.stringify(response.usage), runId]);
    const assessment = { ...validateModelAssessment(response.value, normalized!, row.evidence_version), usage: response.usage };
    const save = await pool.connect();
    try {
      await save.query("BEGIN");
      const updated = await save.query(`UPDATE bsb_v2_packets SET assessment=$1::jsonb, review=NULL,
        normalized_evidence=$2::jsonb, stage='ASSESSED', updated_at=now()
        WHERE id=$3 AND evidence_version=$4 AND stage='ASSESSING' AND review IS NULL RETURNING id`,
        [JSON.stringify(assessment), JSON.stringify(normalized!), packetId, row.evidence_version]);
      if (!updated.rowCount) throw new AssessmentError("STALE_ASSESSMENT", "The packet changed while assessment was running. No assessment was saved.", 409);
      await save.query("UPDATE bsb_v2_assessment_runs SET state='COMPLETED', usage=$1::jsonb, finished_at=now() WHERE id=$2",
        [JSON.stringify(response.usage), runId]);
      await save.query("COMMIT");
    } catch (error) { await save.query("ROLLBACK"); throw error; }
    finally { save.release(); }
    return assessment;
  } catch (error) {
    const failure = error instanceof AssessmentError ? error : new AssessmentError("OUTCOME_UNKNOWN", "The assessment could not be saved. Reload to check the outcome before attempting further work.", 502);
    // Keep every reservation, including failed calls. No automatic model repair
    // or transport retries. Error payloads contain no provider body or secrets.
    const fail = await pool.connect();
    try {
      await fail.query("BEGIN");
      await fail.query("UPDATE bsb_v2_assessment_runs SET state=$1, error=$2::jsonb, finished_at=now() WHERE id=$3 AND state='RUNNING'",
        [failure.code === "OUTCOME_UNKNOWN" ? "OUTCOME_UNKNOWN" : "FAILED", JSON.stringify(failurePayload(failure)), runId]);
      await fail.query(`UPDATE bsb_v2_packets SET stage=CASE WHEN assessment IS NOT NULL THEN 'ASSESSED'
        WHEN validation->>'supportValid'='true' THEN 'VALIDATED' ELSE 'NEEDS_REVIEW' END,
        updated_at=now() WHERE id=$1 AND stage='ASSESSING'`, [packetId]);
      await fail.query("COMMIT");
    } catch { await fail.query("ROLLBACK"); }
    finally { fail.release(); }
    throw failure;
  }
}
