import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, bsbV2PacketsTable } from "@workspace/db";
import { AssessCompanyBody, ReviewAssessmentBody } from "@workspace/api-zod";
import { DeterministicFakeProvider, hashPacket, normalizeEvidence, validateFrozenRequest } from "../lib/bsb-v2";

const safeRecord = (row: any) => ({
  id: row.id, stage: row.stage, inputHash: row.inputHash,
  researchPacket: row.researchPacket, normalizedEvidence: row.normalizedEvidence,
  validation: row.validation, assessment: row.assessment ?? undefined,
  review: row.review ?? undefined, createdAt: row.createdAt.toISOString(),
});

const router: IRouter = Router();
const provider = new DeterministicFakeProvider();

router.get("/bsb-v2/packets", async (_req, res): Promise<void> => {
  const rows = await db.select().from(bsbV2PacketsTable)
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
  const existing = await db.select().from(bsbV2PacketsTable).where(eq(bsbV2PacketsTable.inputHash, inputHash)).limit(1);
  if (existing[0]) { res.status(201).json(safeRecord(existing[0])); return; }

  const { normalized, errors } = normalizeEvidence(packet);
  const warnings = normalized.flatMap((item) => item.supportIssues.map((message) => ({ path: item.locations.join(", "), message })));
  if (errors.length) { res.status(400).json({ error: "Conflicting evidence IDs", issues: errors }); return; }
  const validation = { structurallyValid: true, supportValid: warnings.length === 0, errors: [], warnings };
  const id = crypto.randomUUID();
  const [created] = await db.insert(bsbV2PacketsTable).values({
    // Keep the existing NOT NULL column/index without migrating saved records.
    id, ownerId: "shared-workspace", inputHash, evidenceVersion: inputHash,
    stage: warnings.length ? "NEEDS_REVIEW" : "VALIDATED",
    researchPacket: packet, normalizedEvidence: normalized, validation,
  }).onConflictDoNothing({ target: [bsbV2PacketsTable.ownerId, bsbV2PacketsTable.inputHash] }).returning();
  // A concurrent identical request may have inserted after our initial lookup.
  // Return its intact record; never overwrite an assessment or review on retry.
  const saved = created ?? (await db.select().from(bsbV2PacketsTable).where(eq(bsbV2PacketsTable.inputHash, inputHash)).limit(1))[0];
  res.status(201).json(safeRecord(saved));
});

router.get("/bsb-v2/packets/:packetId", async (req, res): Promise<void> => {
  const packetId = String(req.params.packetId);
  const [row] = await db.select().from(bsbV2PacketsTable).where(eq(bsbV2PacketsTable.id, packetId)).limit(1);
  if (!row) { res.status(404).json({ error: "Packet not found" }); return; }
  res.json(safeRecord(row));
});

router.post("/bsb-v2/packets/:packetId/assess", async (req, res): Promise<void> => {
  const body = AssessCompanyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid assessment request", issues: body.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
    return;
  }
  const packetId = String(req.params.packetId);
  const [row] = await db.select().from(bsbV2PacketsTable).where(eq(bsbV2PacketsTable.id, packetId)).limit(1);
  if (!row) { res.status(404).json({ error: "Packet not found" }); return; }
  if (row.assessment || row.stage === "APPROVED" || row.stage === "REJECTED") {
    res.status(409).json({ error: "Assessment superseded", issues: [{ path: "assessment", message: "A current assessment or review already exists." }] });
    return;
  }
  const normalized = row.normalizedEvidence as any[];
  const demoMode = body.data.mode === "DEMO_SYNTHETIC";
  const assessment = provider.assess(normalized, row.evidenceVersion, { demoMode });
  const updated = await db.update(bsbV2PacketsTable).set({ assessment, review: null, stage: "ASSESSED" })
    .where(and(
      eq(bsbV2PacketsTable.id, packetId),
      eq(bsbV2PacketsTable.evidenceVersion, row.evidenceVersion),
      eq(bsbV2PacketsTable.stage, row.stage),
      isNull(bsbV2PacketsTable.assessment),
    )).returning();
  if (!updated[0]) {
    res.status(409).json({ error: "Assessment superseded", issues: [{ path: "evidenceVersion", message: "Concurrent assessment won; reassess the current packet." }] });
    return;
  }
  res.json(assessment);
});

router.post("/bsb-v2/packets/:packetId/reviews", async (req, res): Promise<void> => {
  const body = ReviewAssessmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid review", issues: body.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }); return; }
  const packetId = String(req.params.packetId);
  const [row] = await db.select().from(bsbV2PacketsTable).where(eq(bsbV2PacketsTable.id, packetId)).limit(1);
  if (!row || !row.assessment) { res.status(404).json({ error: "Assessment not found" }); return; }
  const assessment = row.assessment as any;
  const currentEvidence = row.normalizedEvidence as any[];
  const eligibleStatuses = assessment.demoMode === true
    ? new Set(["SUPPORTED", "SUPPORT_NOT_VERIFIED"])
    : new Set(["SUPPORTED"]);
  const allowed = new Set(assessment.instruments.filter((item: any) =>
    ["STRONG_FIT", "POTENTIAL_FIT"].includes(item.fit) &&
    item.evidenceIds.length &&
    item.evidenceIds.every((id: string) =>
      currentEvidence.some((e: any) =>
        e.evidenceId === id &&
        eligibleStatuses.has(e.supportStatus) &&
        e.evidenceState !== "INFERRED" &&
        !hasExcludedCitation(e)))).map((item: any) => item.instrument));
  if (body.data.assessmentId !== assessment.id || body.data.evidenceVersion !== row.evidenceVersion || assessment.evidenceVersion !== row.evidenceVersion) {
    res.status(409).json({ error: "Stale approval", issues: [{ path: "evidenceVersion", message: "Evidence or assessment changed; reassess before review." }] }); return;
  }
  if (body.data.decision === "APPROVE" && (assessment.approvable !== true || body.data.approvedInstruments.length === 0 || body.data.approvedInstruments.some((item) => !allowed.has(item)))) {
    res.status(409).json({ error: "Unsupported decision", issues: [{ path: "approvedInstruments", message: "Approval cannot authorize unsupported instruments." }] }); return;
  }
  if (new Set(body.data.approvedInstruments).size !== body.data.approvedInstruments.length) {
    res.status(409).json({ error: "Duplicate instruments", issues: [{ path: "approvedInstruments", message: "Select each instrument only once." }] });
    return;
  }
  if (body.data.decision === "REJECT" && body.data.approvedInstruments.length > 0) {
    res.status(409).json({ error: "Invalid rejection", issues: [{ path: "approvedInstruments", message: "A rejection cannot approve instruments." }] });
    return;
  }
  if (body.data.decision === "APPROVE" && body.data.approvedInstruments.length > 1 && !body.data.confirmSecond) {
    res.status(409).json({ error: "Second instrument confirmation required", issues: [{ path: "confirmSecond", message: "Explicitly confirm the second instrument." }] });
    return;
  }
  const review = {
    id: crypto.randomUUID(),
    decision: body.data.decision,
    approvedInstruments: body.data.approvedInstruments,
    evidenceVersion: row.evidenceVersion,
    note: body.data.note,
    demoMode: assessment.demoMode === true,
    validatedRealAssessment: assessment.validatedRealAssessment === true,
    createdAt: new Date().toISOString(),
  };
  const updated = await db.update(bsbV2PacketsTable).set({ review, stage: body.data.decision === "APPROVE" ? "APPROVED" : "REJECTED" })
    .where(and(
      eq(bsbV2PacketsTable.id, packetId),
      eq(bsbV2PacketsTable.stage, "ASSESSED"),
      eq(bsbV2PacketsTable.evidenceVersion, row.evidenceVersion),
      sql`${bsbV2PacketsTable.assessment}->>'id' = ${body.data.assessmentId}`,
    )).returning();
  if (!updated[0]) {
    res.status(409).json({ error: "Review superseded", issues: [{ path: "assessmentId", message: "Assessment changed or was already reviewed." }] });
    return;
  }
  res.json(review);
});

const hasExcludedCitation = (evidence: any) =>
  ["UNKNOWN", "CONTRADICTED", "ABSENT"].includes(evidence.evidenceState);

export default router;
