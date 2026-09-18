import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { db, bsbV2PacketsTable } from "@workspace/db";
import { ReviewAssessmentBody } from "@workspace/api-zod";
import { DeterministicFakeProvider, hashPacket, normalizeEvidence, validateFrozenRequest } from "../lib/bsb-v2";

const router: IRouter = Router();
const provider = new DeterministicFakeProvider();

const userIdFor = (req: any) => {
  const auth = getAuth(req);
  return auth?.sessionClaims?.userId || auth?.userId || null;
};
const safeRecord = (row: any) => ({
  id: row.id, stage: row.stage, inputHash: row.inputHash,
  researchPacket: row.researchPacket, normalizedEvidence: row.normalizedEvidence,
  validation: row.validation, assessment: row.assessment ?? undefined,
  review: row.review ?? undefined, createdAt: row.createdAt.toISOString(),
});

router.use("/bsb-v2", (req, res, next) => {
  const userId = userIdFor(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.locals.userId = userId;
  next();
});

router.get("/bsb-v2/packets", async (_req, res): Promise<void> => {
  const rows = await db.select().from(bsbV2PacketsTable)
    .where(eq(bsbV2PacketsTable.ownerId, res.locals.userId))
    .orderBy(desc(bsbV2PacketsTable.createdAt));
  res.json(rows.map((row) => ({ id: row.id, stage: row.stage, brief: (row.researchPacket as any).brief, createdAt: row.createdAt.toISOString() })));
});

router.post("/bsb-v2/packets", async (req, res): Promise<void> => {
  const parsed = validateFrozenRequest(req.body);
  if (!parsed.success || !parsed.data) {
    res.status(400).json({ error: "Packet structure is invalid", issues: parsed.issues });
    return;
  }
  const packet = structuredClone(parsed.data.researchPacket);
  const inputHash = hashPacket(packet);
  const existing = await db.select().from(bsbV2PacketsTable).where(and(eq(bsbV2PacketsTable.ownerId, res.locals.userId), eq(bsbV2PacketsTable.inputHash, inputHash))).limit(1);
  if (existing[0]) { res.status(201).json(safeRecord(existing[0])); return; }

  const { normalized, errors } = normalizeEvidence(packet);
  const warnings = normalized.flatMap((item) => item.supportIssues.map((message) => ({ path: item.locations.join(", "), message })));
  if (errors.length) { res.status(400).json({ error: "Conflicting evidence IDs", issues: errors }); return; }
  const validation = { structurallyValid: true, supportValid: warnings.length === 0, errors: [], warnings };
  const id = crypto.randomUUID();
  const [created] = await db.insert(bsbV2PacketsTable).values({
    id, ownerId: res.locals.userId, inputHash, evidenceVersion: inputHash,
    stage: warnings.length ? "NEEDS_REVIEW" : "VALIDATED",
    researchPacket: packet, normalizedEvidence: normalized, validation,
  }).returning();
  res.status(201).json(safeRecord(created));
});

router.get("/bsb-v2/packets/:packetId", async (req, res): Promise<void> => {
  const packetId = String(req.params.packetId);
  const [row] = await db.select().from(bsbV2PacketsTable).where(and(eq(bsbV2PacketsTable.id, packetId), eq(bsbV2PacketsTable.ownerId, res.locals.userId))).limit(1);
  if (!row) { res.status(404).json({ error: "Packet not found" }); return; }
  res.json(safeRecord(row));
});

router.post("/bsb-v2/packets/:packetId/assess", async (req, res): Promise<void> => {
  const packetId = String(req.params.packetId);
  const [row] = await db.select().from(bsbV2PacketsTable).where(and(eq(bsbV2PacketsTable.id, packetId), eq(bsbV2PacketsTable.ownerId, res.locals.userId))).limit(1);
  if (!row) { res.status(404).json({ error: "Packet not found" }); return; }
  const normalized = row.normalizedEvidence as any[];
  if (normalized.some((item) => item.evidenceState === "CONTRADICTED") || normalized.every((item) => item.supportStatus !== "SUPPORTED")) {
    res.status(409).json({ error: "Assessment blocked pending evidence review", issues: [{ path: "qualificationEvidence", message: "Conflicting evidence or no independently supported evidence remains." }] });
    return;
  }
  const assessment = provider.assess(normalized, row.evidenceVersion);
  await db.update(bsbV2PacketsTable).set({ assessment, review: null, stage: "ASSESSED" }).where(eq(bsbV2PacketsTable.id, packetId));
  res.json(assessment);
});

router.post("/bsb-v2/packets/:packetId/reviews", async (req, res): Promise<void> => {
  const body = ReviewAssessmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid review", issues: body.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }); return; }
  const packetId = String(req.params.packetId);
  const [row] = await db.select().from(bsbV2PacketsTable).where(and(eq(bsbV2PacketsTable.id, packetId), eq(bsbV2PacketsTable.ownerId, res.locals.userId))).limit(1);
  if (!row || !row.assessment) { res.status(404).json({ error: "Assessment not found" }); return; }
  const assessment = row.assessment as any;
  const allowed = new Set(assessment.instruments.filter((item: any) => item.fit !== "INSUFFICIENT_EVIDENCE" && item.evidenceIds.length).map((item: any) => item.instrument));
  if (body.data.assessmentId !== assessment.id || body.data.evidenceVersion !== row.evidenceVersion) {
    res.status(409).json({ error: "Stale approval", issues: [{ path: "evidenceVersion", message: "Evidence or assessment changed; reassess before review." }] }); return;
  }
  if (body.data.decision === "APPROVE" && (body.data.approvedInstruments.length === 0 || body.data.approvedInstruments.some((item) => !allowed.has(item)))) {
    res.status(409).json({ error: "Unsupported decision", issues: [{ path: "approvedInstruments", message: "Approval cannot authorize unsupported instruments." }] }); return;
  }
  const review = { id: crypto.randomUUID(), decision: body.data.decision, approvedInstruments: body.data.approvedInstruments, evidenceVersion: row.evidenceVersion, createdAt: new Date().toISOString() };
  await db.update(bsbV2PacketsTable).set({ review, stage: body.data.decision === "APPROVE" ? "APPROVED" : "REJECTED" }).where(eq(bsbV2PacketsTable.id, packetId));
  res.json(review);
});

export default router;