import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db, bsbV2PacketsTable } from "@workspace/db";
import { createBsbV2Router } from "./bsb-v2";
import { DeterministicFakeProvider } from "../lib/bsb-v2";

const ownerPrefix = "synthetic-http-owner-";
let server: Server;
let baseUrl = "";
let providerCalls = 0;

class CountingProvider extends DeterministicFakeProvider {
  override assess(...args: Parameters<DeterministicFakeProvider["assess"]>) {
    providerCalls += 1;
    return super.assess(...args);
  }
}

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
  owner: string | null,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> => {
  const headers = new Headers(init.headers);
  if (owner) headers.set("x-test-user", owner);
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body: any = await response.json();
  return { status: response.status, body };
};

const submit = async (owner: string, value: ReturnType<typeof packet>) =>
  request("/api/bsb-v2/packets", owner, {
    method: "POST",
    body: JSON.stringify({ researchPacket: value }),
  });

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", createBsbV2Router({
    userIdFor: (req) => req.header("x-test-user") ?? null,
    provider: new CountingProvider(),
  }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await db.delete(bsbV2PacketsTable).where(like(bsbV2PacketsTable.ownerId, `${ownerPrefix}%`));
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
});

describe("BSB V2 real HTTP and database acceptance with simulated test identities", () => {
  it("rejects unauthenticated and malformed intake without invoking the provider", async () => {
    const before = providerCalls;
    expect((await request("/api/bsb-v2/packets", null)).status).toBe(401);
    const malformed = await request("/api/bsb-v2/packets", `${ownerPrefix}malformed`, {
      method: "POST",
      body: JSON.stringify({ researchPacket: { schemaVersion: "wrong" } }),
    });
    expect(malformed.status).toBe(400);
    expect(providerCalls).toBe(before);
  });

  it("persists immutable input, returns the same record on duplicate submit, and isolates reads", async () => {
    const owner = `${ownerPrefix}${randomUUID()}`;
    const other = `${ownerPrefix}${randomUUID()}`;
    const untrusted = packet(`Synthetic <script>window.evil=true</script> ${randomUUID()}`);
    const first = await submit(owner, untrusted);
    const duplicate = await submit(owner, untrusted);
    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.id).toBe(first.body.id);
    expect(duplicate.body.researchPacket).toEqual(untrusted);

    const reload = await request(`/api/bsb-v2/packets/${first.body.id}`, owner);
    expect(reload.body.researchPacket.brief).toContain("<script>");
    expect((await request(`/api/bsb-v2/packets/${first.body.id}`, other)).status).toBe(404);
  });

  it("protects cross-account assess and review operations", async () => {
    const owner = `${ownerPrefix}${randomUUID()}`;
    const other = `${ownerPrefix}${randomUUID()}`;
    const created = await submit(owner, packet(`Cross-owner synthetic ${randomUUID()}`));
    const id = created.body.id;
    expect((await request(`/api/bsb-v2/packets/${id}/assess`, other, {
      method: "POST",
      body: JSON.stringify({ mode: "DEMO_SYNTHETIC" }),
    })).status).toBe(404);
    expect((await request(`/api/bsb-v2/packets/${id}/reviews`, other, {
      method: "POST",
      body: JSON.stringify({
        assessmentId: "nonexistent",
        evidenceVersion: created.body.inputHash,
        decision: "REJECT",
        approvedInstruments: [],
        note: "",
        confirmSecond: false,
      }),
    })).status).toBe(404);
  });

  it("returns one intact record for concurrent identical submissions", async () => {
    const owner = `${ownerPrefix}${randomUUID()}`;
    const value = packet(`Concurrent intake ${randomUUID()}`);
    const results = await Promise.all(Array.from({ length: 8 }, () => submit(owner, value)));
    expect(results.map((result) => result.status)).toEqual(Array(8).fill(201));
    expect(new Set(results.map((result) => result.body.id)).size).toBe(1);
    expect(results.every((result) => JSON.stringify(result.body.researchPacket) === JSON.stringify(results[0].body.researchPacket))).toBe(true);
    const rows = await db.select().from(bsbV2PacketsTable).where(eq(bsbV2PacketsTable.ownerId, owner));
    expect(rows).toHaveLength(1);
  });

  it("rejects negative fit, duplicate selections and an assessment from another evidence version", async () => {
    const owner = `${ownerPrefix}${randomUUID()}`;
    const created = await submit(owner, packet(`Review integrity ${randomUUID()}`));
    const assessed = await request(`/api/bsb-v2/packets/${created.body.id}/assess`, owner, {
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
        .where(and(eq(bsbV2PacketsTable.id, created.body.id), eq(bsbV2PacketsTable.ownerId, owner)));
      expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, owner,
        { method: "POST", body: JSON.stringify(review) })).status).toBe(409);
    }
    await db.update(bsbV2PacketsTable).set({ assessment: assessed.body, stage: "ASSESSED", review: null })
      .where(and(eq(bsbV2PacketsTable.id, created.body.id), eq(bsbV2PacketsTable.ownerId, owner)));
    expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, owner, {
      method: "POST", body: JSON.stringify({ ...review, approvedInstruments: [instrument, instrument] }),
    })).status).toBe(409);
  });

  it("persists a demonstration review note across HTTP reload and rejects concurrent reuse", async () => {
    const owner = `${ownerPrefix}${randomUUID()}`;
    const created = await submit(owner, packet(`Review-note synthetic ${randomUUID()}`));
    const assessed = await request(`/api/bsb-v2/packets/${created.body.id}/assess`, owner, {
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
      request(`/api/bsb-v2/packets/${created.body.id}/reviews`, owner, {
        method: "POST",
        body: JSON.stringify(reviewBody),
      }),
      request(`/api/bsb-v2/packets/${created.body.id}/reviews`, owner, {
        method: "POST",
        body: JSON.stringify(reviewBody),
      }),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    const reloaded = await request(`/api/bsb-v2/packets/${created.body.id}`, owner);
    expect(reloaded.body.review.note).toBe("Synthetic persisted acceptance note.");
    expect(reloaded.body.review.demoMode).toBe(true);
    expect(reloaded.body.review.validatedRealAssessment).toBe(false);
  });

  it("allows only one concurrent assessment to persist", async () => {
    const owner = `${ownerPrefix}${randomUUID()}`;
    const created = await submit(owner, packet(`Concurrent-assessment synthetic ${randomUUID()}`));
    const assess = () => request(`/api/bsb-v2/packets/${created.body.id}/assess`, owner, {
      method: "POST",
      body: JSON.stringify({ mode: "DEMO_SYNTHETIC" }),
    });
    const [one, two] = await Promise.all([assess(), assess()]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    const rows = await db.select().from(bsbV2PacketsTable).where(and(
      eq(bsbV2PacketsTable.id, created.body.id),
      eq(bsbV2PacketsTable.ownerId, owner),
    ));
    expect(rows).toHaveLength(1);
    expect(rows[0].stage).toBe("ASSESSED");
    expect(rows[0].assessment).toBeTruthy();
  });

  it("rejects stale, false, excluded, or instrument-mismatched citations and requires second confirmation", async () => {
    const owner = `${ownerPrefix}${randomUUID()}`;
    const created = await submit(owner, packet(`Citation synthetic ${randomUUID()}`));
    const assessed = await request(`/api/bsb-v2/packets/${created.body.id}/assess`, owner, {
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
    expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, owner, {
      method: "POST",
      body: JSON.stringify({ ...baseReview, assessmentId: "stale-assessment" }),
    })).status).toBe(409);
    expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, owner, {
      method: "POST",
      body: JSON.stringify({ ...baseReview, approvedInstruments: ["GeoMx"] }),
    })).status).toBe(409);
    expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, owner, {
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
      .where(and(eq(bsbV2PacketsTable.id, created.body.id), eq(bsbV2PacketsTable.ownerId, owner)));
    expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, owner, {
      method: "POST",
      body: JSON.stringify({ ...baseReview, assessmentId: falseAssessment.id }),
    })).status).toBe(409);

    const overstated = await submit(owner, packet(`Overstated synthetic ${randomUUID()}`, [
      evidence({ basisFacts: ["Synthetic lab studies tissue samples."] }),
    ]));
    expect(overstated.body.normalizedEvidence[0].supportStatus).toBe("UNSUPPORTED");
    const overstatedAssessment = await request(`/api/bsb-v2/packets/${overstated.body.id}/assess`, owner, {
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
      }).where(and(eq(bsbV2PacketsTable.id, created.body.id), eq(bsbV2PacketsTable.ownerId, owner)));
      expect((await request(`/api/bsb-v2/packets/${created.body.id}/reviews`, owner, {
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
    const twoCreated = await submit(owner, packet(`Two-instrument synthetic ${randomUUID()}`, twoItems));
    const twoAssessed = await request(`/api/bsb-v2/packets/${twoCreated.body.id}/assess`, owner, {
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
    expect((await request(`/api/bsb-v2/packets/${twoCreated.body.id}/reviews`, owner, {
      method: "POST",
      body: JSON.stringify(twoReview),
    })).status).toBe(409);
    expect((await request(`/api/bsb-v2/packets/${twoCreated.body.id}/reviews`, owner, {
      method: "POST",
      body: JSON.stringify({ ...twoReview, confirmSecond: true }),
    })).status).toBe(200);
  });
});
