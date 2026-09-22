import { pool } from "@workspace/db";

// Independent of saved assets: deleting a file never erases a paid reservation.
export async function initializeAssetAnalysisRuns() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bsb_v2_asset_analysis_runs (
    id text PRIMARY KEY, input_hash text UNIQUE NOT NULL, state text NOT NULL,
    reserved_micro_usd integer NOT NULL, result jsonb, error jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz);`);
}

// All callers hold pg_advisory_xact_lock(724019) while checking and reserving.
export async function dailyAiReserved(client: { query: (sql: string) => Promise<any> }): Promise<number> {
  const { rows } = await client.query(`SELECT COALESCE(SUM(reserved_micro_usd),0)::bigint AS total FROM (
    SELECT reserved_micro_usd FROM bsb_v2_assessment_runs WHERE started_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR state IN ('RUNNING','OUTCOME_UNKNOWN')
    UNION ALL SELECT reserved_micro_usd FROM bsb_v2_sequence_jobs WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR state IN ('QUEUED','WRITING','VALIDATING','RECOVERY_REQUIRED')
    UNION ALL SELECT reserved_micro_usd FROM bsb_v2_asset_analysis_runs WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR state IN ('RUNNING','OUTCOME_UNKNOWN')) charges`);
  return Number(rows[0].total);
}
