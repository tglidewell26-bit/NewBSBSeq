import { Router } from "express";
import { and, asc, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import { db, knowledgeAssetsTable } from "@workspace/db";
import { assetId, assetInstruments, assetResearchAreas, assetTypes, fileInfo, storagePaths, validateAsset } from "../lib/knowledge-assets";
import { dailyAiBudget } from "../lib/ai-budget";
import { analyzeAsset } from "../lib/asset-analysis";
import { AssessmentError, liveConfiguration } from "../lib/live-assessment";

const router = Router();
const { fileData: _fileData, ...metadataColumns } = getTableColumns(knowledgeAssetsTable);
const metadataInput = (body: Record<string, unknown>) => ({
  displayName: String(body.displayName ?? ""), instrument: String(body.instrument ?? ""),
  researchArea: body.researchArea === null ? null : String(body.researchArea ?? ""),
  assetType: String(body.assetType ?? ""), description: String(body.description ?? ""), keywords: body.keywords,
  classificationReasoning: String(body.classificationReasoning ?? ""),
});
const record = (row: any) => ({
  id: row.id, revision: row.revision, fileName: row.fileName, displayName: row.displayName, fileType: row.fileType,
  fileSize: row.fileSize, fileKind: row.fileKind, instrument: row.instrument, researchArea: row.researchArea,
  assetType: row.assetType, description: row.description, keywords: row.keywords, storagePath: row.storagePath,
  classificationReasoning: row.classificationReasoning, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

router.get("/bsb-v2/assets", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const rows = q ? await db.select(metadataColumns).from(knowledgeAssetsTable).where(or(
    ilike(knowledgeAssetsTable.displayName, `%${q}%`), ilike(knowledgeAssetsTable.description, `%${q}%`), ilike(knowledgeAssetsTable.fileName, `%${q}%`),
  )).orderBy(asc(knowledgeAssetsTable.instrument), asc(knowledgeAssetsTable.assetType), desc(knowledgeAssetsTable.createdAt))
    : await db.select(metadataColumns).from(knowledgeAssetsTable).orderBy(asc(knowledgeAssetsTable.instrument), asc(knowledgeAssetsTable.assetType), desc(knowledgeAssetsTable.createdAt));
  res.json(rows.map(record));
});

router.post("/bsb-v2/assets", async (req, res) => {
  const body = req.body ?? {};
  const input = { ...metadataInput(body), fileName: String(body.fileName ?? ""), fileDataBase64: String(body.fileDataBase64 ?? ""), fileKind: String(body.fileKind ?? "") };
  const errors = validateAsset(input);
  let file;
  try { file = fileInfo(input.fileName, input.fileDataBase64); } catch (error) { errors.push(error instanceof Error ? error.message : "File could not be read."); }
  if (file && file.fileKind !== input.fileKind) errors.push("File kind must match the uploaded file.");
  if (errors.length) { res.status(400).json({ error: "Asset metadata is invalid", issues: errors }); return; }
  const [saved] = await db.insert(knowledgeAssetsTable).values({
    id: assetId(), fileName: input.fileName.trim(), displayName: input.displayName.trim(), fileType: file!.fileType, fileSize: file!.data.length,
    fileKind: input.fileKind, instrument: input.instrument, researchArea: input.assetType === "Panels and Brochures" ? null : input.researchArea,
    assetType: input.assetType, description: input.description.trim(), keywords: input.keywords as string[], storagePath: storagePaths[input.fileKind as "document" | "image"], classificationReasoning: input.classificationReasoning.trim(), fileData: file!.data.toString("base64"),
  }).returning(metadataColumns);
  res.status(201).json(record(saved));
});

router.get("/bsb-v2/assets/analysis/config", async (_req, res) => {
  const config = liveConfiguration();
  const budget = await dailyAiBudget();
  res.json({ enabled: config.enabled, reservationUsd: config.reservationUsd, dailyLimitUsd: config.dailyLimitMicroUsd / 1e6,
    estimatedSpentUsd: budget.spentMicroUsd / 1e6, heldUsd: budget.heldMicroUsd / 1e6,
    remainingUsd: Math.max(0, config.dailyLimitMicroUsd - budget.totalMicroUsd) / 1e6 });
});

router.post("/bsb-v2/assets/analyze", async (req, res) => {
  try {
    let fileName = String(req.body?.fileName ?? "");
    let data = String(req.body?.fileDataBase64 ?? "");
    if (req.body?.assetId) {
      const [asset] = await db.select().from(knowledgeAssetsTable).where(eq(knowledgeAssetsTable.id, String(req.body.assetId))).limit(1);
      if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
      fileName = asset.fileName; data = asset.fileData;
    }
    res.json(await analyzeAsset(fileName, data));
  } catch (error) {
    if (!(error instanceof AssessmentError)) throw error;
    res.status(error.status).json({ error: error.message, errorType: error.code });
  }
});

router.patch("/bsb-v2/assets/:assetId", async (req, res) => {
  const id = String(req.params.assetId);
  const [asset] = await db.select(metadataColumns).from(knowledgeAssetsTable).where(eq(knowledgeAssetsTable.id, id)).limit(1);
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  const metadata = metadataInput(req.body ?? {});
  const errors = validateAsset({ ...metadata, fileName: asset.fileName, fileKind: asset.fileKind, fileDataBase64: "" });
  if (errors.length) { res.status(400).json({ error: "Asset metadata is invalid", issues: errors }); return; }
  if (!Number.isSafeInteger(req.body?.revision)) { res.status(400).json({ error: "The saved asset revision is required." }); return; }
  const [saved] = await db.update(knowledgeAssetsTable).set({ ...metadata, keywords: metadata.keywords as string[],
    revision: sql`${knowledgeAssetsTable.revision} + 1`,
  }).where(and(eq(knowledgeAssetsTable.id, id), eq(knowledgeAssetsTable.revision, req.body.revision))).returning(metadataColumns);
  if (!saved) { res.status(409).json({ error: "This asset changed in another window. Cancel and reopen it before saving." }); return; }
  res.json(record(saved));
});

router.get("/bsb-v2/assets/:assetId/download", async (req, res) => {
  const [asset] = await db.select().from(knowledgeAssetsTable).where(eq(knowledgeAssetsTable.id, String(req.params.assetId))).limit(1);
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  if (req.query.revision !== undefined && String(req.query.revision) !== String(asset.revision)) {
    res.status(409).json({ error: "This resource changed after the sequence was generated. Generate a new sequence to refresh its attachment selection." }); return;
  }
  res.setHeader("Content-Type", asset.fileType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(asset.fileName)}"`);
  res.send(Buffer.from(asset.fileData, "base64"));
});

router.delete("/bsb-v2/assets/:assetId", async (req, res) => {
  const deleted = await db.delete(knowledgeAssetsTable).where(eq(knowledgeAssetsTable.id, String(req.params.assetId))).returning({ id: knowledgeAssetsTable.id });
  if (!deleted[0]) { res.status(404).json({ error: "Asset not found" }); return; }
  res.json({ deleted: true });
});

router.get("/bsb-v2/assets/taxonomy/options", (_req, res) => res.json({ instruments: assetInstruments, researchAreas: assetResearchAreas, assetTypes }));
export default router;
