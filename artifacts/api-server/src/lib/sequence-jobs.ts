import { randomUUID } from "node:crypto";
import { initializeSavedTrips } from "./saved-trips";
import { pool } from "@workspace/db";
import {
  sequenceRequestSchema,
  touchIds,
  type SequenceAuthority,
  type SequenceJob,
  type DraftTouch,
  type TouchId,
  type Violation,
} from "@workspace/api-zod";
import {
  AssessmentError,
  callAssessmentModel,
  liveConfiguration,
  RESERVATION_MICRO_USD,
} from "./live-assessment";
import {
  planSequence,
  validateSettings,
  digest,
  checkDraft,
  checkSemantic,
  renderSequence,
  sequenceModelRequest,
  VOICE_VERSION,
} from "./sequences";

const ACTIVE = ["QUEUED", "WRITING", "VALIDATING"];
const LEASE_MS = 180000;
export async function initializeSequenceJobs() {
  await initializeSavedTrips();
  await pool.query(`CREATE TABLE IF NOT EXISTS bsb_v2_sequence_jobs (
    id text PRIMARY KEY, packet_id text NOT NULL, action_key text NOT NULL UNIQUE, input_hash text NOT NULL,
    state text NOT NULL, authority jsonb NOT NULL, authority_hash text NOT NULL,
    revision_of text, retry_of text UNIQUE, root_id text NOT NULL,
    violations jsonb NOT NULL DEFAULT '[]', safe_touches jsonb NOT NULL DEFAULT '[]',
    error text, usage jsonb NOT NULL DEFAULT '[]', sequence jsonb, content_hash text, validation_record jsonb,
    reserved_micro_usd integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS bsb_v2_sequence_packet_idx ON bsb_v2_sequence_jobs(packet_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS bsb_v2_sequence_active_idx ON bsb_v2_sequence_jobs(packet_id) WHERE state IN ('QUEUED','WRITING','VALIDATING');`);
}
export const sequenceConfig = () => {
  const c = liveConfiguration();
  const missing = [...c.missing];
  if (c.jobLimitMicroUsd < RESERVATION_MICRO_USD * 2)
    missing.push("BSB_AI_MAX_JOB_USD (at least 0.70 for two sequence calls)");
  return {
    enabled: missing.length === 0,
    missing,
    model: c.model,
    maxCalls: 2,
    reservationUsd: (RESERVATION_MICRO_USD * 2) / 1e6,
  };
};
function publicJob(r: any): SequenceJob {
  return {
    id: r.id,
    packetId: r.packet_id,
    state: r.state,
    authority: r.authority,
    violations: r.violations,
    error: r.error,
    usage: r.usage,
    sequence: r.state === "APPROVED" ? r.sequence : null,
    contentHash: r.state === "APPROVED" ? r.content_hash : null,
    revisionOf: r.revision_of,
    retryOf: r.retry_of,
    canRegenerate:
      r.state === "VALIDATION_FAILED" &&
      !r.retry_of &&
      !r.has_regeneration &&
      !r.revision_of &&
      r.violations.length > 0 &&
      r.violations.every((v: any) => touchIds.includes(v.touchId)),
    reservedUsd: r.reserved_micro_usd / 1e6,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
async function expireJobs(packetId: string) {
  await pool.query(
    `UPDATE bsb_v2_sequence_jobs SET state='RECOVERY_REQUIRED',error='The worker stopped reporting progress. No automatic paid retry was made; inspect this job before starting again.',updated_at=now()
    WHERE packet_id=$1 AND state IN ('QUEUED','WRITING','VALIDATING') AND updated_at < now()-interval '180 seconds'`,
    [packetId],
  );
}
export async function listSequenceJobs(packetId: string) {
  await expireJobs(packetId);
  const { rows } = await pool.query(
    "SELECT j.*, EXISTS(SELECT 1 FROM bsb_v2_sequence_jobs child WHERE child.retry_of=j.id) AS has_regeneration FROM bsb_v2_sequence_jobs j WHERE packet_id=$1 ORDER BY created_at DESC LIMIT 40",
    [packetId],
  );
  return rows.map(publicJob);
}
export async function getSequenceJob(id: string) {
  const { rows } = await pool.query(
    "SELECT * FROM bsb_v2_sequence_jobs WHERE id=$1",
    [id],
  );
  if (!rows[0])
    throw new AssessmentError("NOT_FOUND", "Sequence job not found.", 404);
  await expireJobs(rows[0].packet_id);
  const latest = (
    await pool.query(
      "SELECT j.*, EXISTS(SELECT 1 FROM bsb_v2_sequence_jobs child WHERE child.retry_of=j.id) AS has_regeneration FROM bsb_v2_sequence_jobs j WHERE id=$1",
      [id],
    )
  ).rows[0];
  return publicJob(latest);
}
async function reserve(client: any, amount: number, rootId: string | null) {
  const c = liveConfiguration();
  if (!c.enabled)
    throw new AssessmentError(
      "NOT_CONFIGURED",
      "Configure OpenAI assessment before generating sequences.",
      503,
    );
  const prior = rootId
    ? (
        await client.query(
          "SELECT COALESCE(SUM(reserved_micro_usd),0)::bigint AS total FROM bsb_v2_sequence_jobs WHERE root_id=$1",
          [rootId],
        )
      ).rows[0].total
    : 0;
  if (Number(prior) + amount > c.jobLimitMicroUsd)
    throw new AssessmentError(
      "BUDGET_EXHAUSTED",
      "This sequence and its regeneration would exceed BSB_AI_MAX_JOB_USD. No paid call was started.",
      429,
    );
  const { rows } =
    await client.query(`SELECT COALESCE(SUM(reserved_micro_usd),0)::bigint AS total FROM (
    SELECT reserved_micro_usd FROM bsb_v2_assessment_runs WHERE started_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR state IN ('RUNNING','OUTCOME_UNKNOWN')
    UNION ALL SELECT reserved_micro_usd FROM bsb_v2_sequence_jobs WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' OR state IN ('QUEUED','WRITING','VALIDATING','RECOVERY_REQUIRED')) charges`);
  if (Number(rows[0].total) + amount > c.dailyLimitMicroUsd)
    throw new AssessmentError(
      "BUDGET_EXHAUSTED",
      "The shared daily AI budget is exhausted. No paid call was started.",
      429,
    );
}

export async function createSequenceJob(
  packetId: string,
  input: unknown,
  retryOf?: string,
) {
  const parsed = sequenceRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new AssessmentError(
      "INVALID_SEQUENCE_INPUT",
      "Check sequence settings.",
      400,
      parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    );
  const request = parsed.data;
  const inputHash = digest({ packetId, request, retryOf: retryOf ?? null });
  const c = await pool.connect();
  let id = "";
  let edits = request.edits;
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(724019)");
    const existing = (
      await c.query("SELECT * FROM bsb_v2_sequence_jobs WHERE action_key=$1", [
        request.idempotencyKey,
      ])
    ).rows[0];
    if (existing) {
      if (existing.input_hash !== inputHash)
        throw new AssessmentError(
          "IDEMPOTENCY_CONFLICT",
          "This action key belongs to different input. Reload before changing settings.",
          409,
        );
      await c.query("COMMIT");
      return publicJob(existing);
    }
    const row = (
      await c.query("SELECT * FROM bsb_v2_packets WHERE id=$1 FOR UPDATE", [
        packetId,
      ])
    ).rows[0];
    if (!row) throw new AssessmentError("NOT_FOUND", "Packet not found.", 404);
    const settings = validateSettings(request.settings);
    let authority = planSequence(row, settings);
    let parent: any;
    if (request.editOf || retryOf) {
      parent = (
        await c.query(
          "SELECT * FROM bsb_v2_sequence_jobs WHERE id=$1 AND packet_id=$2",
          [request.editOf ?? retryOf, packetId],
        )
      ).rows[0];
      if (!parent || digest(authority) !== parent.authority_hash)
        throw new AssessmentError(
          "STALE_AUTHORITY",
          "The source sequence's assessment, evidence, settings or catalog changed. Start a new sequence with current approval.",
          409,
        );
      if (request.editOf && parent.state !== "APPROVED")
        throw new AssessmentError(
          "INVALID_REVISION",
          "Only an approved sequence can be edited.",
          409,
        );
      if (
        retryOf &&
        (!publicJob(parent).canRegenerate ||
          (
            await c.query(
              "SELECT id FROM bsb_v2_sequence_jobs WHERE retry_of=$1",
              [retryOf],
            )
          ).rows.length)
      )
        throw new AssessmentError(
          "REGENERATION_LIMIT",
          "One explicit regeneration is allowed after a readable validation failure.",
          409,
        );
      authority = parent.authority;
    }
    const active = (
      await c.query(
        "SELECT * FROM bsb_v2_sequence_jobs WHERE packet_id=$1 AND state IN ('QUEUED','WRITING','VALIDATING','RECOVERY_REQUIRED') LIMIT 1",
        [packetId],
      )
    ).rows[0];
    if (active)
      throw new AssessmentError(
        "JOB_EXISTS",
        active.state === "RECOVERY_REQUIRED"
          ? "A previous paid outcome is uncertain. Inspect it before another generation."
          : "A sequence is already running for this packet. Reload its status.",
        409,
      );
    // Preflight the request before any budget reservation. Edits are not approved here.
    sequenceModelRequest(
      request.editOf ? "VALIDATING" : "WRITING",
      authority,
      retryOf ? parent.safe_touches : edits,
      retryOf ? touchIds.filter((t) => !parent.safe_touches.some((p: DraftTouch) => p.touchId === t)) : undefined,
      retryOf ? parent.violations : undefined,
    );
    const amount = RESERVATION_MICRO_USD * (request.editOf ? 1 : 2);
    await reserve(c, amount, retryOf ? parent.root_id : null);
    id = randomUUID();
    await c.query(
      `INSERT INTO bsb_v2_sequence_jobs(id,packet_id,action_key,input_hash,state,authority,authority_hash,revision_of,retry_of,root_id,reserved_micro_usd)
      VALUES($1,$2,$3,$4,'QUEUED',$5::jsonb,$6,$7,$8,$9,$10)`,
      [
        id,
        packetId,
        request.idempotencyKey,
        inputHash,
        JSON.stringify(authority),
        digest(authority),
        request.editOf ?? null,
        retryOf ?? null,
        retryOf ? parent.root_id : id,
        amount,
      ],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  // Detached from the HTTP response: browser disconnects do not cancel the job.
  void runSequenceJob(id, edits).catch(() => {});
  return getSequenceJob(id);
}

async function stillCurrent(id: string, targetState?: string) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const job = (
      await c.query("SELECT * FROM bsb_v2_sequence_jobs WHERE id=$1", [id])
    ).rows[0];
    if (!job || !ACTIVE.includes(job.state))
      throw new AssessmentError(
        "JOB_STOPPED",
        "The job is no longer running.",
        409,
      );
    const row = (
      await c.query("SELECT * FROM bsb_v2_packets WHERE id=$1 FOR UPDATE", [
        job.packet_id,
      ])
    ).rows[0];
    if (
      digest(planSequence(row, job.authority.settings)) !== job.authority_hash
    )
      throw new AssessmentError(
        "STALE_AUTHORITY",
        "Approved evidence, review or product catalog changed during generation. No sequence was saved.",
        409,
      );
    const state = targetState ?? job.state;
    const changed = await c.query(
      "UPDATE bsb_v2_sequence_jobs SET state=$2,updated_at=now() WHERE id=$1 AND state IN ('QUEUED','WRITING','VALIDATING') RETURNING *",
      [id, state],
    );
    if (!changed.rowCount)
      throw new AssessmentError(
        "JOB_STOPPED",
        "The job was canceled or stopped.",
        409,
      );
    await c.query("COMMIT");
    return changed.rows[0];
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function runSequenceJob(
  id: string,
  edits?: DraftTouch[],
  provider = callAssessmentModel,
) {
  const claimed = await pool.query(
    "UPDATE bsb_v2_sequence_jobs SET state='WRITING',updated_at=now() WHERE id=$1 AND state='QUEUED' RETURNING *",
    [id],
  );
  if (!claimed.rowCount) return;
  const job = claimed.rows[0],
    authority = job.authority as SequenceAuthority;
  const heartbeat = setInterval(() => {
    void pool
      .query(
        "UPDATE bsb_v2_sequence_jobs SET updated_at=now() WHERE id=$1 AND state IN ('WRITING','VALIDATING')",
        [id],
      )
      .catch(() => {});
  }, LEASE_MS / 6);
  heartbeat.unref();
  try {
    await stillCurrent(id);
    let touches: DraftTouch[];
    let repairIds: TouchId[] | undefined;
    let preserved: DraftTouch[] | undefined;
    let feedback: Violation[] | undefined;
    if (job.retry_of) {
      const parent = (
        await pool.query("SELECT * FROM bsb_v2_sequence_jobs WHERE id=$1", [
          job.retry_of,
        ])
      ).rows[0];
      preserved = parent.safe_touches;
      feedback = parent.violations;
      repairIds = touchIds.filter(
        (t) => !preserved!.some((p) => p.touchId === t),
      );
    }
    let value: unknown;
    if (job.revision_of) {
      if (!edits)
        throw new AssessmentError(
          "OUTCOME_UNKNOWN",
          "The edited draft was interrupted before validation; the original approved sequence is unchanged.",
        );
      value = { touches: edits };
    } else {
      const response = await provider(
        sequenceModelRequest("WRITING", authority, preserved, repairIds, feedback),
      );
      value = response.value;
      await recordUsage(id, "WRITING", response.usage);
    }
    const checked = checkDraft(value, authority);
    touches = checked.touches;
    if (
      preserved?.some((p) => {
        const regenerated = touches.find((t) => t.touchId === p.touchId);
        return !regenerated || digest(p) !== digest(regenerated);
      })
    )
      throw new AssessmentError(
        "REGENERATION_SCOPE",
        "The writer changed or omitted a preserved touch during targeted regeneration. No sequence was saved.",
      );
    await stillCurrent(id, "VALIDATING");
    const review = await provider(
      sequenceModelRequest("VALIDATING", authority, touches),
    );
    await recordUsage(id, "VALIDATING", review.usage);
    const violations = [
      ...checked.violations,
      ...checkSemantic(review.value, touches, authority),
    ];
    await stillCurrent(id);
    if (violations.length) {
      const unsafe = new Set(violations.map((v) => v.touchId));
      await pool.query(
        `UPDATE bsb_v2_sequence_jobs SET state='VALIDATION_FAILED', violations=$2::jsonb,safe_touches=$3::jsonb,error='Validation rejected the draft. No approved sequence was saved.',updated_at=now()
        WHERE id=$1 AND state='VALIDATING'`,
        [
          id,
          JSON.stringify(violations),
          JSON.stringify(touches.filter((t) => !unsafe.has(t.touchId))),
        ],
      );
      return;
    }
    const sequence = renderSequence(touches, authority);
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const row = (
        await c.query("SELECT * FROM bsb_v2_packets WHERE id=$1 FOR UPDATE", [
          job.packet_id,
        ])
      ).rows[0];
      if (digest(planSequence(row, authority.settings)) !== job.authority_hash)
        throw new AssessmentError(
          "STALE_AUTHORITY",
          "Authority changed before save. No sequence was saved.",
          409,
        );
      const updated = await c.query(
        `UPDATE bsb_v2_sequence_jobs SET state='APPROVED',sequence=$2::jsonb,content_hash=$3,validation_record=$4::jsonb,updated_at=now()
        WHERE id=$1 AND state='VALIDATING' RETURNING id`,
        [
          id,
          JSON.stringify(sequence),
          digest(sequence),
          JSON.stringify({
            authorityHash: job.authority_hash,
            voiceVersion: VOICE_VERSION,
            validatedAt: new Date().toISOString(),
            checks: ["deterministic", "independent-semantic"],
            model: review.usage.model,
          }),
        ],
      );
      if (!updated.rowCount)
        throw new AssessmentError(
          "JOB_STOPPED",
          "Cancellation or recovery won the save race. No sequence was saved.",
          409,
        );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    const error =
      e instanceof AssessmentError
        ? e
        : new AssessmentError(
            "OUTCOME_UNKNOWN",
            "The sequence worker stopped unexpectedly. No automatic paid retry was made.",
          );
    await pool.query(
      "UPDATE bsb_v2_sequence_jobs SET state=$2,error=state || ': ' || $3,violations=$4::jsonb,updated_at=now() WHERE id=$1 AND state IN ('QUEUED','WRITING','VALIDATING')",
      [
        id,
        error.code === "OUTCOME_UNKNOWN"
          ? "RECOVERY_REQUIRED"
          : "PROVIDER_FAILED",
        error.message,
        JSON.stringify(
          error.issues.map((i) => ({
            touchId: "sequence",
            ruleId: error.code,
            message: `${i.path}: ${i.message}`,
            rejectedSpan: "",
            evidenceIds: [],
            capabilityId: null,
            nextAction:
              "Correct the reported structure before starting a new generation.",
          })),
        ),
      ],
    );
  } finally {
    clearInterval(heartbeat);
  }
}
async function recordUsage(id: string, stage: string, usage: unknown) {
  await pool.query(
    "UPDATE bsb_v2_sequence_jobs SET usage=usage || $2::jsonb,updated_at=now() WHERE id=$1",
    [id, JSON.stringify([{ ...(usage as object), stage }])],
  );
}
export async function cancelSequenceJob(id: string) {
  await pool.query(
    "UPDATE bsb_v2_sequence_jobs SET state='CANCELED',error='Canceled. Charges already incurred cannot be reversed.',updated_at=now() WHERE id=$1 AND state IN ('QUEUED','WRITING','VALIDATING')",
    [id],
  );
  return getSequenceJob(id); // If approval won, return APPROVED; never claim cancellation.
}
