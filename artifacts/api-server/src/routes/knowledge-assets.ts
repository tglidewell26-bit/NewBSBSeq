import { Router } from "express";
import { asc, desc, eq, ilike, or } from "drizzle-orm";
import { db, knowledgeAssetsTable } from "@workspace/db";
import { assetId, assetInstruments, assetResearchAreas, assetTypes, fileInfo, storagePaths, validateAsset } from "../lib/knowledge-assets";

const router = Router();
const record = (row: any) => ({
  id: row.id, fileName: row.fileName, displayName: row.displayName, fileType: row.fileType,
  fileSize: row.fileSize, fileKind: row.fileKind, instrument: row.instrument, researchArea: row.researchArea,
  assetType: row.assetType, description: row.description, keywords: row.keywords, storagePath: row.storagePath,
  classificationReasoning: row.classificationReasoning, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

router.get("/bsb-v2/assets", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const rows = q ? await db.select().from(knowledgeAssetsTable).where(or(
    ilike(knowledgeAssetsTable.displayName, `%${q}%`), ilike(knowledgeAssetsTable.description, `%${q}%`), ilike(knowledgeAssetsTable.fileName, `%${q}%`),
  )).orderBy(asc(knowledgeAssetsTable.instrument), asc(knowledgeAssetsTable.assetType), desc(knowledgeAssetsTable.createdAt))
    : await db.select().from(knowledgeAssetsTable).orderBy(asc(knowledgeAssetsTable.instrument), asc(knowledgeAssetsTable.assetType), desc(knowledgeAssetsTable.createdAt));
  res.json(rows.map(record));
});

router.post("/bsb-v2/assets", async (req, res) => {
  const body = req.body ?? {};
  const input = { fileName: String(body.fileName ?? ""), displayName: String(body.displayName ?? ""), fileDataBase64: String(body.fileDataBase64 ?? ""), fileKind: String(body.fileKind ?? ""), instrument: String(body.instrument ?? ""), researchArea: body.researchArea === null ? null : String(body.researchArea ?? ""), assetType: String(body.assetType ?? ""), description: String(body.description ?? ""), keywords: body.keywords, classificationReasoning: String(body.classificationReasoning ?? "") };
  const errors = validateAsset(input);
  let file;
  try { file = fileInfo(input.fileName, input.fileDataBase64); } catch (error) { errors.push(error instanceof Error ? error.message : "File could not be read."); }
  if (file && file.fileKind !== input.fileKind) errors.push("File kind must match the uploaded file.");
  if (errors.length) { res.status(400).json({ error: "Asset metadata is invalid", issues: errors }); return; }
  const [saved] = await db.insert(knowledgeAssetsTable).values({
    id: assetId(), fileName: input.fileName.trim(), displayName: input.displayName.trim(), fileType: file!.fileType, fileSize: file!.data.length,
    fileKind: input.fileKind, instrument: input.instrument, researchArea: input.assetType === "Panels and Brochures" ? null : input.researchArea,
    assetType: input.assetType, description: input.description.trim(), keywords: input.keywords as string[], storagePath: storagePaths[input.fileKind as "document" | "image"], classificationReasoning: input.classificationReasoning.trim(), fileData: file!.data.toString("base64"),
  }).returning();
  res.status(201).json(record(saved));
});

router.get("/bsb-v2/assets/:assetId/download", async (req, res) => {
  const [asset] = await db.select().from(knowledgeAssetsTable).where(eq(knowledgeAssetsTable.id, String(req.params.assetId))).limit(1);
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
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
