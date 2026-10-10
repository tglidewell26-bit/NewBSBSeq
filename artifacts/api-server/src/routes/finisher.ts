import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import {
  saveFinishedSchema,
  finishRequestSchema,
  type Resource,
  type SavedFinish,
  type FinishMessage,
} from "@workspace/api-zod/finisher";
import { finishText, suggestResources, validateTrips } from "../lib/finisher";
import { AssessmentError } from "../lib/live-assessment";
import { initializeKnowledgeAssets } from "../lib/knowledge-assets";
import { initializeAssetAnalysisRuns } from "../lib/asset-analysis";
import {
  initializeSavedTrips,
  listSavedTrips,
  saveTrip,
} from "../lib/saved-trips";

export async function initializeFinisher() {
  await initializeKnowledgeAssets();
  await initializeAssetAnalysisRuns();
  await initializeSavedTrips();
  await pool.query(`CREATE TABLE IF NOT EXISTS bsb_finished_sequences (
    id text PRIMARY KEY, payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
}
const router = Router();
const wrap =
  (fn: (req: any, res: any) => Promise<void>) => async (req: any, res: any) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof AssessmentError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      const known =
        e instanceof Error &&
        (e.name === "ZodError" ||
          /Choose|availability|visit date|Paste up|time zone/.test(e.message));
      res.status(known ? 400 : 500).json({
        error: known
          ? (e as Error).message
          : "The request could not be completed. Your existing saved data has not been removed.",
      });
    }
  };
async function resources(): Promise<Resource[]> {
  const { rows } =
    await pool.query(`SELECT id, display_name AS "displayName", file_name AS "fileName", file_kind AS "fileKind", instrument,
    description, keywords, asset_type AS "assetType", source_url AS "sourceUrl" FROM bsb_v2_knowledge_assets ORDER BY display_name,id`);
  return rows;
}
const record = (r: any): SavedFinish => ({
  ...r.payload,
  id: r.id,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});
async function tableExists(name: string) {
  return Boolean(
    (await pool.query("SELECT to_regclass($1) AS name", [name])).rows[0]?.name,
  );
}
function legacyRecord(row: any): SavedFinish {
  const old = row.sequence?.length
    ? row.sequence
    : row.draft_touches?.length
      ? row.draft_touches
      : (row.safe_touches ?? []);
  const assets: Resource[] = (row.authority?.assets ?? []).map((a: any) => ({
    ...a,
    fileKind:
      a.fileKind ?? (/^image\//.test(a.fileType ?? "") ? "image" : "document"),
  }));
  const messages: FinishMessage[] = old.map((t: any, i: number) => ({
    id: `message-${i + 1}`,
    title: /^email\d+$/i.test(t.touchId ?? "")
      ? `Email ${t.touchId.replace(/email/i, "")}`
      : ((
          {
            liConnect: "LinkedIn 1",
            liMsg1: "LinkedIn 2",
            liMsg2: "LinkedIn 3",
          } as Record<string, string>
        )[t.touchId] ?? `Message ${i + 1}`),
    subject: t.subject ?? "",
    body: t.body ?? t.middle ?? "",
    resourceNote: "",
    selectedAssetIds:
      row.authority?.plan?.find((p: any) => p.touchId === t.touchId)
        ?.assetIds ?? [],
  }));
  const settings = row.authority?.settings ?? {};
  const source = messages
    .map(
      (m) =>
        `${m.title}\n${m.subject ? `Subject: ${m.subject}\n` : ""}${m.body}`,
    )
    .join("\n\n");
  return {
    id: `legacy-${row.id}`,
    legacy: true,
    input: {
      company: row.company ?? row.authority?.companyName ?? "Earlier sequence",
      source,
      timezone: settings.timezone ?? "America/Los_Angeles",
      location: "",
      trip1: settings.trip1 ?? [],
      trip2: settings.trip2 ?? [],
    },
    messages,
    resources: assets,
    suggestions: [],
    warnings: [
      `Earlier workflow: ${row.state}. Saved wording is shown for reference; saving creates a new editable copy.`,
    ],
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
async function oldSequences(id?: string) {
  if (!(await tableExists("bsb_v2_sequence_jobs"))) return [];
  const hasPackets = await tableExists("bsb_v2_packets");
  return (
    await pool.query(
      `SELECT j.* ${hasPackets ? ", COALESCE(p.research_packet->'company'->>'name', split_part(p.research_packet->>'brief', E'\\n', 1)) AS company" : ""} FROM bsb_v2_sequence_jobs j
    ${hasPackets ? "LEFT JOIN bsb_v2_packets p ON p.id=j.packet_id" : ""}
    WHERE ${id ? "j.id=$1 AND" : ""} (j.sequence IS NOT NULL OR jsonb_array_length(COALESCE(j.draft_touches,'[]'::jsonb))>0 OR jsonb_array_length(COALESCE(j.safe_touches,'[]'::jsonb))>0)
    ORDER BY j.created_at DESC`,
      id ? [id] : [],
    )
  ).rows.map(legacyRecord);
}
router.get(
  "/bsb-v2/trips",
  wrap(async (_req, res) => {
    res.json(await listSavedTrips());
  }),
);
router.post(
  "/bsb-v2/trips",
  wrap(async (req, res) => {
    res.status(201).json(await saveTrip(req.body));
  }),
);
router.post(
  "/bsb-v2/finish",
  wrap(async (req, res) => {
    let prepared;
    try {
      const parsed = finishRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") });
        return;
      }
      prepared = finishText(parsed.data);
    } catch (e) {
      res.status(400).json({
        error:
          e instanceof Error ? e.message : "Check your sequence and dates.",
      });
      return;
    }
    const assets = await resources();
    const match = await suggestResources(
      prepared.messages,
      prepared.input.source,
      assets,
    );
    // Suggestions are deliberately unselected until reviewed: no claim of attachment before selection.
    res.json({
      messages: prepared.messages,
      resources: assets,
      suggestions: match.suggestions,
      warnings: [...prepared.warnings, ...match.warnings],
    });
  }),
);
router.get(
  "/bsb-v2/finished",
  wrap(async (_req, res) => {
    const current = (
      await pool.query(
        "SELECT * FROM bsb_finished_sequences ORDER BY updated_at DESC",
      )
    ).rows.map(record);
    const all = [...current, ...(await oldSequences())].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    res.json(
      all.map((x) => ({
        id: x.id,
        company: x.input.company,
        updatedAt: x.updatedAt,
        messageCount: x.messages.length,
        legacy: Boolean(x.legacy),
      })),
    );
  }),
);
router.get(
  "/bsb-v2/finished/:id",
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const found = id.startsWith("legacy-")
      ? (await oldSequences(id.slice(7)))[0]
      : recordOrNull(
          (
            await pool.query(
              "SELECT * FROM bsb_finished_sequences WHERE id=$1",
              [id],
            )
          ).rows[0],
        );
    if (!found) {
      res.status(404).json({ error: "Sequence not found." });
      return;
    }
    res.json(found);
  }),
);
function recordOrNull(r: any) {
  return r ? record(r) : null;
}
async function save(req: any, res: any) {
  const parsed = saveFinishedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Check the company name and message contents before saving.",
    });
    return;
  }
  const { input, messages, expectedUpdatedAt } = parsed.data;
  validateTrips(input, new Date(), true);
  const assets = await resources();
  const ids = new Set(messages.flatMap((m) => m.selectedAssetIds));
  const missing = [...ids].filter((id) => !assets.some((a) => a.id === id));
  if (missing.length) {
    res.status(409).json({
      error:
        "A selected resource was removed from the Knowledge Base. Deselect it or choose another before saving.",
    });
    return;
  }
  const payload = {
    input,
    messages,
    resources: assets.filter((a) => ids.has(a.id)),
    suggestions: [],
    warnings: [],
  };
  if (req.params.id) {
    if (!expectedUpdatedAt) {
      res
        .status(409)
        .json({ error: "Reopen this sequence before updating it." });
      return;
    }
    const result = await pool.query(
      "UPDATE bsb_finished_sequences SET payload=$2::jsonb,updated_at=now() WHERE id=$1 AND date_trunc('milliseconds',updated_at)=$3::timestamptz RETURNING *",
      [req.params.id, JSON.stringify(payload), expectedUpdatedAt],
    );
    if (!result.rows.length) {
      res.status(409).json({
        error:
          "This sequence changed or was deleted. Reopen History to load the latest version.",
      });
      return;
    }
    res.json(record(result.rows[0]));
  } else {
    const result = await pool.query(
      "INSERT INTO bsb_finished_sequences(id,payload) VALUES($1,$2::jsonb) RETURNING *",
      [randomUUID(), JSON.stringify(payload)],
    );
    res.status(201).json(record(result.rows[0]));
  }
}
router.post("/bsb-v2/finished", wrap(save));
router.put("/bsb-v2/finished/:id", wrap(save));
router.delete(
  "/bsb-v2/finished/:id",
  wrap(async (req, res) => {
    const id = String(req.params.id);
    if (id.startsWith("legacy-")) {
      if (await tableExists("bsb_v2_sequence_jobs"))
        await pool.query(
          "DELETE FROM bsb_v2_sequence_jobs WHERE id=$1 AND state NOT IN ('QUEUED','WRITING','VALIDATING')",
          [id.slice(7)],
        );
    } else
      await pool.query("DELETE FROM bsb_finished_sequences WHERE id=$1", [id]);
    res.json({ deleted: true });
  }),
);
router.get(
  "/bsb-v2/saved-accounts",
  wrap(async (_req, res) => {
    if (!(await tableExists("bsb_v2_packets"))) {
      res.json([]);
      return;
    }
    const { rows } = await pool.query(
      "SELECT id,research_packet,created_at FROM bsb_v2_packets ORDER BY created_at DESC",
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        name:
          r.research_packet?.company?.name ??
          r.research_packet?.brief?.split("\n")[0] ??
          "Saved account",
        research: r.research_packet,
        createdAt: r.created_at,
      })),
    );
  }),
);
export default router;
