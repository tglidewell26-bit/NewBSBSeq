import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { assessmentRunsTable, db, bsbV2PacketsTable, knowledgeAssetsTable } from "@workspace/db";
import express from "express";
import legacyRouter from "./bsb-v2";
import knowledgeRouter from "./knowledge-assets";
const app = express().use(express.json()).use("/api", legacyRouter).use("/api", knowledgeRouter);
import { DeterministicFakeProvider } from "../lib/bsb-v2";
import { initializeAssessmentRuns } from "../lib/assessment-runs";
import { initializeKnowledgeAssets } from "../lib/knowledge-assets";

const createdIds = new Set<string>();
const assetIds = new Set<string>();
let server: Server;
let baseUrl = "";
const assessSpy = vi.spyOn(DeterministicFakeProvider.prototype, "assess");

const evidence = (overrides: Record<string, unknown> = {}) => ({
  evidenceState: "SUPPORTED",
  assessmentType: "WORKFLOW",
  claim: "Synthetic lab performs multiplex tissue protein imaging.",
  sourceUrl: "https://example.org/synthetic",
  basisFacts: ["Synthetic lab performs multiplex tissue protein imaging."],
  basisSourceUrls: ["https://example.org/synthetic"],
  inference: null,
  evidenceId: "synthetic-evidence-1",
  provenanceType: "PUBLIC_SOURCE",
  ...overrides,
});

const packet = (brief: string, items = [evidence()]) => ({
  schemaVersion: "bsb-company-research-v1",
  brief,
  qualificationEvidence: {
    schemaVersion: "1.0",
    purpose: "EVIDENCE_ONLY_NO_INSTRUMENT_SELECTION",
    generationStatus: "COMPLETE",
    categories: {
      scientificNeeds: items,
      workflows: [],
      samples: [],
      technologies: [],
      translationalStage: [],
      negativeOrContradictoryEvidence: [],
      materialUnknowns: [],
      buyingReadinessSignals: [],
    },
    instrumentDiscriminatingEvidence: {
      cellScapeRelevant: [],
      cosMxRelevant: [],
      geoMxRelevant: [],
    },
  },
});

const request = async (
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> => {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body: any = await response.json();
  return { status: response.status, body };
};

const submit = async (value: ReturnType<typeof packet>) => {
  const result = await request("/api/bsb-v2/packets", {
    method: "POST",
    body: JSON.stringify({ researchPacket: value }),
  });
  if (result.status === 201) createdIds.add(result.body.id);
  return result;
};

beforeAll(async () => {
  await initializeAssessmentRuns();
  await initializeKnowledgeAssets();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (assetIds.size) await db.delete(knowledgeAssetsTable).where(inArray(knowledgeAssetsTable.id, [...assetIds]));
  if (createdIds.size) {
    await db.delete(assessmentRunsTable).where(inArray(assessmentRunsTable.packetId, [...createdIds]));
    await db.delete(bsbV2PacketsTable).where(inArray(bsbV2PacketsTable.id, [...createdIds]));
  }
  assessSpy.mockRestore();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
});

describe("BSB V2 shared workspace through the production Express app", () => {
  it("stores, edits without replacing the file, rejects stale edits, downloads, and deletes reviewed assets", async () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9eAAAAABJRU5ErkJggg==";
    const created = await request("/api/bsb-v2/assets", { method: "POST", body: JSON.stringify({
      fileName: "synthetic.png", displayName: "Synthetic test image", fileDataBase64: png, fileKind: "image",
      instrument: "CellScape", researchArea: "Cancer", assetType: "Images",
      description: "This is a synthetic image for route testing. It has no scientific meaning. It verifies knowledge-base storage only.",
      keywords: ["synthetic", "test image", "CellScape", "cancer", "storage"], classificationReasoning: "This test file is explicitly a PNG image.",
    }) });
    expect(created.status).toBe(201);
    assetIds.add(created.body.id);
    expect(created.body).not.toHaveProperty("fileData");
    const edited = await request(`/api/bsb-v2/assets/${created.body.id}`, { method: "PATCH", body: JSON.stringify({
      ...created.body, displayName: "Reviewed image", fileName: "do-not-replace.pdf", fileDataBase64: "not file data", fileKind: "document",
    }) });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ displayName: "Reviewed image", fileName: "synthetic.png", fileKind: "image", revision: 2 });
    const preview = await fetch(`${baseUrl}/api/bsb-v2/assets/${created.body.id}/preview?revision=2`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toContain("image/png");
    expect(preview.headers.get("content-disposition")).toBe("inline");
    expect(Buffer.from(await preview.arrayBuffer()).toString("base64")).toBe(png);
    const stalePreview = await fetch(`${baseUrl}/api/bsb-v2/assets/${created.body.id}/preview?revision=1`);
    expect(stalePreview.status).toBe(409);
    expect((await request(`/api/bsb-v2/assets/${created.body.id}/download?revision=1`)).status).toBe(409);
    expect((await request(`/api/bsb-v2/assets/${created.body.id}`, { method: "PATCH", body: JSON.stringify(created.body) })).status).toBe(409);
    expect((await request(`/api/bsb-v2/assets/${created.body.id}`, { method: "PATCH", body: JSON.stringify({ ...edited.body, keywords: ["same", "same", "same", "same", "same"] }) })).status).toBe(400);
    expect((await request("/api/bsb-v2/assets")).body.some((asset: any) => asset.id === created.body.id)).toBe(true);
    const download = await fetch(`${baseUrl}/api/bsb-v2/assets/${created.body.id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toContain("image/png");
    expect(Buffer.from(await download.arrayBuffer()).toString("base64")).toBe(png);
    const deleted = await request(`/api/bsb-v2/assets/${created.body.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    assetIds.delete(created.body.id);
  });

  it("rejects invalid files before AI analysis and reports unavailable configuration", async () => {
    const invalid = await request("/api/bsb-v2/assets/analyze", { method: "POST", body: JSON.stringify({ fileName: "test.pdf", fileDataBase64: "invalid" }) });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errorType).toBe("INVALID_FILE");
    expect((await request("/api/bsb-v2/assets/analysis/config")).body).toHaveProperty("enabled");
    expect((await request("/api/bsb-v2/assets/analysis/config")).body).not.toHaveProperty("remainingUsd");
  });

  it("opens without credentials and rejects malformed intake without invoking the provider", async () => {
    const before = assessSpy.mock.calls.length;
    expect((await request("/api/bsb-v2/packets")).status).toBe(200);
    const malformed = await request("/api/bsb-v2/packets", {
      method: "POST",
      body: JSON.stringify({ researchPacket: { schemaVersion: "wrong" } }),
    });
    expect(malformed.status).toBe(400);
    expect(assessSpy.mock.calls.length).toBe(before);
    expect(malformed.body.issues.some((issue: any) => issue.path.includes("schemaVersion"))).toBe(true);
  });

  it("persists immutable input and returns the same record on duplicate submit", async () => {
    const untrusted = packet(`Synthetic <script>window.evil=true</script> ${randomUUID()}`);
    const first = await submit(untrusted);
    const duplicate = await submit(untrusted);
    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.id).toBe(first.body.id);
    expect(duplicate.body.researchPacket).toEqual(untrusted);

    const reload = await request(`/api/bsb-v2/packets/${first.body.id}`);
    expect(reload.body.researchPacket.brief).toContain("<script>");
    expect(reload.status).toBe(200);
    expect((await request("/api/bsb-v2/packets")).body.some((row: any) => row.id === first.body.id)).toBe(true);
  });

  it("deletes a completed packet and its derived records, but protects active work", async () => {
    const completed = await submit(packet(`Delete completed ${randomUUID()}`));
    const id = completed.body.id;
    const deleted = await request(`/api/bsb-v2/packets/${id}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ deleted: true });
    createdIds.delete(id);
    expect((await request(`/api/bsb-v2/packets/${id}`)).status).toBe(404);
    expect((await request(`/api/bsb-v2/packets/${id}`, { method: "DELETE" })).status).toBe(404);

    const active = await submit(packet(`Delete active ${randomUUID()}`));
    await db.insert(assessmentRunsTable).values({
      id: randomUUID(), packetId: active.body.id, evidenceVersion: active.body.inputHash,
      attempt: 1, state: "RUNNING", reservedMicroUsd: 0, model: "test", promptVersion: "test",
    });
    const blocked = await request(`/api/bsb-v2/packets/${active.body.id}`, { method: "DELETE" });
    expect(blocked.status).toBe(409);
    expect((await request(`/api/bsb-v2/packets/${active.body.id}`)).status).toBe(200);
  });

  it("keeps previously owned packets, assessments and reviews accessible without a migration", async () => {
    const value = packet(`Previously saved synthetic ${randomUUID()}`);
    const created = await submit(value);
    const id = created.body.id;
    await db.update(bsbV2PacketsTable).set({ ownerId: `former-user-${randomUUID()}` })
      .where(eq(bsbV2PacketsTable.id, id));
    expect((await request("/api/bsb-v2/packets")).body.some((row: any) => row.id === id)).toBe(true);
    expect((await request(`/api/bsb-v2/packets/${id}`)).body.researchPacket).toEqual(value);
    const assessed = await request(`/api/bsb-v2/packets/${id}/assess`, {
      method: "POST", body: JSON.stringify({ mode: "DEMO_SYNTHETIC" }),
    });
    expect(assessed.status).toBe(200);
    const reviewed = await request(`/api/bsb-v2/packets/${id}/reviews`, {
      method: "POST", body: JSON.stringify({
        assessmentId: assessed.body.id, evidenceVersion: created.body.inputHash,
        decision: "APPROVE", approvedInstruments: [assessed.body.instruments[0].instrument],
        note: "Preserved existing record.", confirmSecond: false,
      }),
    });
    expect(reviewed.status).toBe(200);
    const duplicate = await submit(value);
    expect(duplicate.body.id).toBe(id);
    expect(duplicate.body.assessment).toEqual(assessed.body);
    expect(duplicate.body.review).toEqual(reviewed.body);
    expect((await request(`/api/bsb-v2/packets/${id}`)).body.review).toEqual(reviewed.body);
    expect((await request(`/api/bsb-v2/packets/${randomUUID()}`)).status).toBe(404);
  });

  it("returns one intact record for concurrent identical submissions", async () => {
    const value = packet(`Concurrent intake ${randomUUID()}`);
    const results = await Promise.all(Array.from({ length: 8 }, () => submit(value)));
    expect(results.map((result) => result.status)).toEqual(Array(8).fill(201));
    expect(new Set(results.map((result) => result.body.id)).size).toBe(1);
    expect(results.every((result) => JSON.stringify(result.body.researchPacket) === JSON.stringify(results[0].body.researchPacket))).toBe(true);
    const rows = await db.select().from(bsbV2PacketsTable).where(eq(bsbV2PacketsTable.inputHash, results[0].body.inputHash));
    expect(rows).toHaveLength(1);
  });

  it("rejects negative fit, duplicate selections and an assessment from another evidence version", async () => {
    const created = await submit(packet(`Review integrity ${randomUUID()}`));
    const assessed = await request(`/api/bsb-v2/packets/${created.body.id}/assess`, {
      method: "POST", body: JSON.stringify({ mode: "DEMO_SYNTHETIC" }),
    });
    const instrument = assessed.body.instruments[0].instrument;
    const review = {
      assessmentId: assessed.body.id, evidenceVersion: created.body.inputHash,
      decision: "APPROVE", approvedInstruments: [instrument], note: "Synthetic", confirmSecond: true,
    };
    for (const altered of [
      { ...assessed.body, instruments: [{ ...assessed.body.instruments[0], fit: "NOT_QUALIFIED" }] },
      { ...assessed.body, evidenceVersion: "different-evidence-version" },
    ]) {
      await db.update(bsbV2PacketsTable).set({ assessment: altered, stage: "ASSESSED", review: null })
        .where(eq(bsbV2PacketsTable.id, created.body.id));
      expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`,
        { method: "POST", body: JSON.stringify(review) })).status).toBe(409);
    }
    await db.update(bsbV2PacketsTable).set({ assessment: assessed.body, stage: "ASSESSED", review: null })
      .where(eq(bsbV2PacketsTable.id, created.body.id));
    expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, {
      method: "POST", body: JSON.stringify({ ...review, approvedInstruments: [instrument, instrument] }),
    })).status).toBe(409);
  });

  it("persists a demonstration review note across HTTP reload and rejects concurrent reuse", async () => {
    const created = await submit(packet(`Review-note synthetic ${randomUUID()}`));
    const assessed = await request(`/api/bsb-v2/packets/${created.body.id}/assess`, {
      method: "POST",
      body: JSON.stringify({ mode: "DEMO_SYNTHETIC" }),
    });
    expect(assessed.status).toBe(200);
    const instrument = assessed.body.instruments[0].instrument;
    const reviewBody = {
      assessmentId: assessed.body.id,
      evidenceVersion: assessed.body.evidenceVersion,
      decision: "APPROVE",
      approvedInstruments: [instrument],
      note: "Synthetic persisted acceptance note.",
      confirmSecond: false,
    };
    const [one, two] = await Promise.all([
      request(`/api/bsb-v2/packets/${created.body.id}/reviews`, {
        method: "POST",
        body: JSON.stringify(reviewBody),
      }),
      request(`/api/bsb-v2/packets/${created.body.id}/reviews`, {
        method: "POST",
        body: JSON.stringify(reviewBody),
      }),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    const reloaded = await request(`/api/bsb-v2/packets/${created.body.id}`);
    expect(reloaded.body.review.note).toBe("Synthetic persisted acceptance note.");
    expect(reloaded.body.review.demoMode).toBe(true);
    expect(reloaded.body.review.validatedRealAssessment).toBe(false);
  });

  it("allows only one concurrent assessment to persist", async () => {
    const created = await submit(packet(`Concurrent-assessment synthetic ${randomUUID()}`));
    const assess = () => request(`/api/bsb-v2/packets/${created.body.id}/assess`, {
      method: "POST",
      body: JSON.stringify({ mode: "DEMO_SYNTHETIC" }),
    });
    const [one, two] = await Promise.all([assess(), assess()]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    const rows = await db.select().from(bsbV2PacketsTable).where(eq(bsbV2PacketsTable.id, created.body.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].stage).toBe("ASSESSED");
    expect(rows[0].assessment).toBeTruthy();
  });

  it("rejects stale, false, excluded, or instrument-mismatched citations and requires second confirmation", async () => {
    const created = await submit(packet(`Citation synthetic ${randomUUID()}`));
    const assessed = await request(`/api/bsb-v2/packets/${created.body.id}/assess`, {
      method: "POST",
      body: JSON.stringify({ mode: "DEMO_SYNTHETIC" }),
    });
    const baseReview = {
      assessmentId: assessed.body.id,
      evidenceVersion: assessed.body.evidenceVersion,
      decision: "APPROVE",
      approvedInstruments: [assessed.body.instruments[0].instrument],
      note: "Synthetic",
      confirmSecond: false,
    };
    expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, {
      method: "POST",
      body: JSON.stringify({ ...baseReview, assessmentId: "stale-assessment" }),
    })).status).toBe(409);
    expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, {
      method: "POST",
      body: JSON.stringify({ ...baseReview, approvedInstruments: ["GeoMx"] }),
    })).status).toBe(409);
    expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, {
      method: "POST",
      body: JSON.stringify({
        ...baseReview,
        decision: "REJECT",
        approvedInstruments: [assessed.body.instruments[0].instrument],
      }),
    })).status).toBe(409);

    const falseAssessment = {
      ...assessed.body,
      id: randomUUID(),
      instruments: [{ ...assessed.body.instruments[0], evidenceIds: ["does-not-exist"] }],
    };
    await db.update(bsbV2PacketsTable)
      .set({ assessment: falseAssessment, stage: "ASSESSED" })
      .where(eq(bsbV2PacketsTable.id, created.body.id));
    expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, {
      method: "POST",
      body: JSON.stringify({ ...baseReview, assessmentId: falseAssessment.id }),
    })).status).toBe(409);

    const overstated = await submit(packet(`Overstated synthetic ${randomUUID()}`, [
      evidence({ basisFacts: ["Synthetic lab studies tissue samples."] }),
    ]));
    expect(overstated.body.normalizedEvidence[0].supportStatus).toBe("UNSUPPORTED");
    const overstatedAssessment = await request(`/api/bsb-v2/packets/${overstated.body.id}/assess`, {
      method: "POST",
      body: JSON.stringify({ mode: "DEMO_SYNTHETIC" }),
    });
    expect(overstatedAssessment.body.instruments[0].fit).toBe("INSUFFICIENT_EVIDENCE");

    for (const excludedState of ["UNKNOWN", "CONTRADICTED", "ABSENT", "INFERRED"]) {
      const excludedAssessment = {
        ...assessed.body,
        id: randomUUID(),
        instruments: [{ ...assessed.body.instruments[0], evidenceIds: ["synthetic-evidence-1"] }],
      };
      await db.update(bsbV2PacketsTable).set({
        assessment: excludedAssessment,
        stage: "ASSESSED",
        normalizedEvidence: [{
          ...created.body.normalizedEvidence[0],
          evidenceState: excludedState,
          supportStatus: excludedState === "INFERRED" ? "SUPPORT_NOT_VERIFIED" : "NOT_APPLICABLE",
        }],
      }).where(eq(bsbV2PacketsTable.id, created.body.id));
      expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, {
        method: "POST",
        body: JSON.stringify({ ...baseReview, assessmentId: excludedAssessment.id }),
      })).status).toBe(409);
    }

    const twoItems = [
      evidence(),
      evidence({
        evidenceId: "synthetic-evidence-2",
        claim: "Synthetic lab performs single-cell spatial RNA.",
        basisFacts: ["Synthetic lab performs single-cell spatial RNA."],
      }),
    ];
    const twoCreated = await submit(packet(`Two-instrument synthetic ${randomUUID()}`, twoItems));
    const twoAssessed = await request(`/api/bsb-v2/packets/${twoCreated.body.id}/assess`, {
      method: "POST",
      body: JSON.stringify({ mode: "DEMO_SYNTHETIC" }),
    });
    expect(twoAssessed.body.instruments).toHaveLength(2);
    const twoReview = {
      assessmentId: twoAssessed.body.id,
      evidenceVersion: twoAssessed.body.evidenceVersion,
      decision: "APPROVE",
      approvedInstruments: twoAssessed.body.instruments.map((item: any) => item.instrument),
      note: "Synthetic two-instrument demonstration.",
      confirmSecond: false,
    };
    expect((await request(`/api/bsb-v2/packets/${twoCreated.body.id}/reviews`, {
      method: "POST",
      body: JSON.stringify(twoReview),
    })).status).toBe(409);
    expect((await request(`/api/bsb-v2/packets/${twoCreated.body.id}/reviews`, {
      method: "POST",
      body: JSON.stringify({ ...twoReview, confirmSecond: true }),
    })).status).toBe(200);
  });
  it("accepts an account research dossier, converts it, and dedupes repeat uploads", async () => {
    const dossier = JSON.parse(readFileSync(new URL("../../../../samples/account-dossier-synthetic.json", import.meta.url), "utf8"));
    dossier.organization.official_name = `Synthetic Dossier Lab ${randomUUID()}`;
    const first = await request("/api/bsb-v2/packets", { method: "POST", body: JSON.stringify({ researchPacket: dossier }) });
    expect(first.status).toBe(201);
    createdIds.add(first.body.id);
    expect(first.body.researchPacket.schemaVersion).toBe("bsb-company-research-v1");
    expect(first.body.researchPacket.brief).toContain("Neuro Imaging Group");
    expect(first.body.normalizedEvidence.some((item: any) => item.claim.includes("[Neuro Imaging Group] Protein signal"))).toBe(true);
    // A bare dossier (not wrapped in researchPacket) is accepted too and dedupes to the same record.
    const again = await request("/api/bsb-v2/packets", { method: "POST", body: JSON.stringify(dossier) });
    expect(again.status).toBe(201);
    expect(again.body.id).toBe(first.body.id);
    const broken = await request("/api/bsb-v2/packets", { method: "POST", body: JSON.stringify({ researchPacket: { schema_version: "bsb-account-dossier-v1", buyer_units: [] } }) });
    expect(broken.status).toBe(400);
    expect(broken.body.issues[0].path).toBe("dossier.organization.official_name");
  });
});
