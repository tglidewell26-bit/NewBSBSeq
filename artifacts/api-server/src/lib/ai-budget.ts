import { pool } from "@workspace/db";

// Independent of saved assets: deleting a file never erases its AI usage.
export async function initializeAssetAnalysisRuns() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bsb_v2_asset_analysis_runs (
    id text PRIMARY KEY, input_hash text UNIQUE NOT NULL, state text NOT NULL,
    reserved_micro_usd integer NOT NULL, result jsonb, error jsonb, usage jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz);
    ALTER TABLE bsb_v2_asset_analysis_runs ADD COLUMN IF NOT EXISTS usage jsonb;`);
}

type Charge = { kind: string; state: string; reserved_micro_usd: number; usage: unknown; edited?: boolean };
function cost(usage: any): number | null {
  if (!usage || !Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0 ||
    !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 0 ||
    typeof usage.estimatedCostUsd !== "number" || !Number.isFinite(usage.estimatedCostUsd) || usage.estimatedCostUsd < 0) return null;
  return Math.ceil(usage.estimatedCostUsd * 1e6);
}

export function summarizeAiCharges(rows: Charge[]) {
  let spentMicroUsd = 0, heldMicroUsd = 0;
  for (const row of rows) {
    let settled: number | null = null;
    if (row.kind === "sequence") {
      const stages = row.edited ? ["VALIDATING"] : ["WRITING", "VALIDATING"];
      const usage = row.usage;
      if (["APPROVED", "VALIDATION_FAILED"].includes(row.state) && Array.isArray(usage) &&
        usage.length === stages.length && stages.every(stage => usage.filter(u => u?.stage === stage).length === 1)) {
        const costs = usage.map(cost);
        if (costs.every(c => c !== null)) settled = costs.reduce<number>((sum, c) => sum + c!, 0);
      }
    } else if (["COMPLETE", "COMPLETED", "FAILED"].includes(row.state)) settled = cost(row.usage);
    // Running, interrupted, partial, and legacy calls without usable usage retain their hold.
    if (settled === null) heldMicroUsd += Number(row.reserved_micro_usd);
    else spentMicroUsd += settled;
  }
  return { spentMicroUsd, heldMicroUsd, totalMicroUsd: spentMicroUsd + heldMicroUsd };
}

export async function dailyAiBudget(client: { query: (sql: string) => Promise<any> } = pool) {
  const today = "date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'";
  const { rows } = await client.query(`
    SELECT 'assessment' AS kind,state,reserved_micro_usd,usage,false AS edited FROM bsb_v2_assessment_runs
      WHERE started_at >= ${today} OR finished_at >= ${today} OR state IN ('RUNNING','OUTCOME_UNKNOWN')
    UNION ALL SELECT 'sequence',state,reserved_micro_usd,usage,revision_of IS NOT NULL FROM bsb_v2_sequence_jobs
      WHERE created_at >= ${today} OR updated_at >= ${today} OR state IN ('QUEUED','WRITING','VALIDATING','RECOVERY_REQUIRED')
    UNION ALL SELECT 'asset',state,reserved_micro_usd,COALESCE(usage,result->'usage'),false FROM bsb_v2_asset_analysis_runs
      WHERE created_at >= ${today} OR finished_at >= ${today} OR state IN ('RUNNING','OUTCOME_UNKNOWN')`);
  return summarizeAiCharges(rows);
}

// All reservation callers hold pg_advisory_xact_lock(724019).
export async function dailyAiReserved(client: { query: (sql: string) => Promise<any> }): Promise<number> {
  return (await dailyAiBudget(client)).totalMicroUsd;
}
