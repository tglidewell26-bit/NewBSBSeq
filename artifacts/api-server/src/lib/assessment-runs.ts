import { initializeSequenceJobs } from "./sequence-jobs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { normalizeEvidence, hashPacket, validateFrozenRequest } from "./bsb-v2";
import { AssessmentError, callAssessmentModel, liveConfiguration, MODEL } from "./live-assessment";

import { loadGraph, scopedEvidence, questionRequest, walkTree, treeAssessment,
  TREE_PROMPT_VERSION, TREE_TIMEOUT_MS, TREE_OUTPUT_LIMIT, treeHash, type Step } from "./instrument-tree";

export function treeBudget(env = process.env) {
  const usd = Number(env.BSB_TREE_MAX_COST_USD ?? "2");
  if (!Number.isFinite(usd) || usd <= 0 || usd > 20) throw new AssessmentError("INVALID_CONFIGURATION", "BSB_TREE_MAX_COST_USD must be greater than zero and at most 20.");
  return usd;
}

// Additive only: existing packet columns, records and reviews are never migrated.
export async function initializeAssessmentRuns() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bsb_v2_assessment_runs (
    id text PRIMARY KEY, packet_id text NOT NULL, evidence_version text NOT NULL,
    attempt integer NOT NULL, state text NOT NULL, reserved_micro_usd integer NOT NULL,
    model text NOT NULL, prompt_version text NOT NULL, error jsonb, usage jsonb,
    started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
  ); CREATE UNIQUE INDEX IF NOT EXISTS bsb_v2_run_attempt_idx
     ON bsb_v2_assessment_runs(packet_id, attempt);`);
  await pool.query("ALTER TABLE bsb_v2_assessment_runs ADD COLUMN IF NOT EXISTS progress jsonb");
  await initializeSequenceJobs();
}

export const failurePayload = (error: AssessmentError) => ({
  error: error.message, errorType: error.code, failedStage: "ASSESSMENT",
  issues: error.issues, retryable: !["OUTCOME_UNKNOWN", "ATTEMPT_LIMIT"].includes(error.code),
});

export async function getAssessmentRun(packetId: string) {
  const { rows } = await pool.query("SELECT * FROM bsb_v2_assessment_runs WHERE packet_id=$1 ORDER BY attempt DESC LIMIT 1", [packetId]);
  const run = rows[0];
  if (!run) return undefined;
  const stale = run.state === "RUNNING" && Date.now() - new Date(run.started_at).getTime() > TREE_TIMEOUT_MS + 30000;
  return { id: run.id, state: stale ? "OUTCOME_UNKNOWN" : run.state, attempt: run.attempt,
    startedAt: new Date(run.started_at).toISOString(),
    error: stale ? failurePayload(new AssessmentError("OUTCOME_UNKNOWN", "The assessment was interrupted. Reload to check for a saved result before submitting another request.")) : run.error ?? undefined,
    usage: run.usage ?? undefined, progress: run.progress ?? undefined };
}

export async function runLiveAssessment(packetId: string, retry = false, buyerUnit?: string) {
  const config = liveConfiguration();
  if (!config.enabled) throw new AssessmentError("NOT_CONFIGURED", "Live assessment is disabled until the API key and model are configured.", 503,
    config.missing.map(name => ({ path: "configuration", message: name })));
  const graph = loadGraph();
  const budget = treeBudget();
  const client = await pool.connect();
  let runId = "";
  let row: any;
  let scope: ReturnType<typeof scopedEvidence>;
  let normalized: ReturnType<typeof normalizeEvidence>["normalized"];
  try {
    await client.query("BEGIN");
    // The packet row lock prevents duplicate submissions across replicas.
    row = (await client.query("SELECT * FROM bsb_v2_packets WHERE id=$1 FOR UPDATE", [packetId])).rows[0];
    if (!row) throw new AssessmentError("NOT_FOUND", "Packet not found.", 404);
    if (row.assessment?.provider === "OPENAI") {
      if (buyerUnit && row.assessment.decisionTrace && row.assessment.decisionTrace.buyerUnit !== buyerUnit) {
        throw new AssessmentError("BUYER_UNIT_ALREADY_ASSESSED", "This packet already has a decision for another buyer unit. Submit a unit-specific dossier for a separate assessment.", 409);
      }
      await client.query("COMMIT"); return row.assessment;
    }
    if (row.review || row.assessment?.demoMode) throw new AssessmentError("ALREADY_REVIEWED", "This packet has a saved demonstration or review. Use a real research packet for live assessment.", 409);
    const parsed = validateFrozenRequest({ researchPacket: row.research_packet });
    if (!parsed.success || hashPacket(row.research_packet) !== row.evidence_version) throw new AssessmentError("INVALID_PACKET", "The saved packet failed structure or evidence-version checks.", 400, parsed.issues);
    const result = normalizeEvidence(row.research_packet);
    if (result.errors.length) throw new AssessmentError("INVALID_PACKET", "The packet contains conflicting evidence IDs.", 400, result.errors);
    normalized = result.normalized;
    scope = scopedEvidence(normalized, buyerUnit);
    // Preflight every reachable question before reserving a paid run.
    for (const node of graph.nodes.filter(n => n.type === "question")) questionRequest(node, scope.evidence, scope.unit);
    const previous = (await client.query("SELECT * FROM bsb_v2_assessment_runs WHERE packet_id=$1 ORDER BY attempt DESC LIMIT 1", [packetId])).rows[0];
    if (previous?.state === "RUNNING" || previous?.state === "OUTCOME_UNKNOWN") throw new AssessmentError("OUTCOME_UNKNOWN", "An assessment is already running or its outcome is uncertain. Reload its status; no additional paid call was started.", 409);
    if (previous && !retry) throw new AssessmentError("RETRY_CONFIRMATION_REQUIRED", "The previous attempt failed. Use the explicit retry action to authorize one more bounded tree run.", 409);
    if (previous?.attempt >= 2) throw new AssessmentError("ATTEMPT_LIMIT", "The two-attempt limit has been reached. Review the reported failure before further work.", 409);
    runId = randomUUID();
    await client.query(`INSERT INTO bsb_v2_assessment_runs
      (id,packet_id,evidence_version,attempt,state,reserved_micro_usd,model,prompt_version)
      VALUES ($1,$2,$3,$4,'RUNNING',$5,$6,$7)`,
      [runId, packetId, row.evidence_version, (previous?.attempt ?? 0) + 1, Math.ceil(budget * 1e6), MODEL, TREE_PROMPT_VERSION]);
    await client.query("UPDATE bsb_v2_packets SET stage='ASSESSING', updated_at=now() WHERE id=$1", [packetId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }

  try {
    const usage = { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, model: MODEL };
    const started = Date.now();
    let path: Step[] = [];
    let calls = 0;
    const persist = async (pendingNodeId: string | null) => {
      await pool.query("UPDATE bsb_v2_assessment_runs SET usage=$1::jsonb, progress=$2::jsonb WHERE id=$3 AND state='RUNNING'",
        [JSON.stringify(usage), JSON.stringify({ treeHash: treeHash(graph), graph, buyerUnit: scope!.unit, path, pendingNodeId, calls, budgetUsd: budget }), runId]);
    };
    const trace = await walkTree(graph, scope!.evidence, scope!.unit, async node => {
      const remainingMs = TREE_TIMEOUT_MS - (Date.now() - started);
      const outputRemaining = TREE_OUTPUT_LIMIT - usage.outputTokens;
      if (remainingMs <= 0 || outputRemaining < 200) throw new AssessmentError("TREE_LIMIT", "Tree time or total output-token limit reached. Completed steps were saved.");
      const request = questionRequest(node, scope!.evidence, scope!.unit, Math.min(1600, outputRemaining));
      // Conservative input bound: UTF-8 bytes, plus framing allowance. Uses
      // the same estimated rates as the existing provider usage accounting.
      const nextCost = ((Buffer.byteLength(JSON.stringify(request)) + 1024) * 2.5 + request.max_output_tokens * 12) / 1e6;
      if (usage.estimatedCostUsd + nextCost > budget) throw new AssessmentError("SPENDING_LIMIT", "The next question would exceed this run's estimated spending limit. Completed steps were saved.");
      calls += 1;
      await persist(node.id);
      const response = await callAssessmentModel(request, fetch, Math.min(120000, remainingMs));
      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
      usage.estimatedCostUsd += response.usage.estimatedCostUsd;
      await persist(node.id);
      return response.value;
    }, async completed => { path = completed; await persist(null); });
    const assessment = { ...treeAssessment(trace, normalized!, row.evidence_version), usage };
    const save = await pool.connect();
    try {
      await save.query("BEGIN");
      const updated = await save.query(`UPDATE bsb_v2_packets SET assessment=$1::jsonb, review=NULL,
        normalized_evidence=$2::jsonb, stage='ASSESSED', updated_at=now()
        WHERE id=$3 AND evidence_version=$4 AND stage='ASSESSING' AND review IS NULL RETURNING id`,
        [JSON.stringify(assessment), JSON.stringify(normalized!), packetId, row.evidence_version]);
      if (!updated.rowCount) throw new AssessmentError("STALE_ASSESSMENT", "The packet changed while assessment was running. No assessment was saved.", 409);
      await save.query("UPDATE bsb_v2_assessment_runs SET state='COMPLETED', usage=$1::jsonb, finished_at=now() WHERE id=$2",
        [JSON.stringify(usage), runId]);
      await save.query("COMMIT");
    } catch (error) { await save.query("ROLLBACK"); throw error; }
    finally { save.release(); }
    return assessment;
  } catch (error) {
    const failure = error instanceof AssessmentError ? error : new AssessmentError("OUTCOME_UNKNOWN", "The assessment could not be saved. Reload to check the outcome before attempting further work.", 502);
    // Preserve usage history. No automatic model repair
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
