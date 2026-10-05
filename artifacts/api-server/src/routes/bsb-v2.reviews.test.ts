import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import express from "express";

const mocks = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn() }));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema/bsb-v2"),
  db: mocks,
  pool: { query: vi.fn() },
}));
vi.mock("../lib/assessment-runs", () => ({
  failurePayload: (error: any) => ({ error: error.message, errorType: error.code, issues: error.issues }),
  getAssessmentRun: vi.fn(),
  runLiveAssessment: vi.fn(),
  treeBudget: () => 2,
}));

import router from "./bsb-v2";
import { convertDossier } from "../lib/account-dossier";
import { normalizeEvidence } from "../lib/bsb-v2";
import { treeAssessment, walkTree, type Graph } from "../lib/instrument-tree";

let row: any;
let server: Server;
let baseUrl: string;
beforeAll(async () => {
  const app = express().use(express.json()).use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(async () => {
  vi.clearAllMocks();
  const dossier = JSON.parse(readFileSync(new URL("../../../../samples/account-dossier-synthetic.json", import.meta.url), "utf8"));
  const evidence = normalizeEvidence(convertDossier(dossier).researchPacket).normalized;
  const item = evidence.find(e => e.claim.includes("Protein signal"))!;
  const graph: Graph = { schema: "bsb-instrument-graph-v1", start: "q", nodes: [
    { id: "q", type: "question", text: "Does the unit perform protein imaging?", answers: [
      { label: "Yes", next: "fit" }, { label: "No", next: "no" }, { label: "Unknown", next: "no" },
    ] },
    { id: "fit", type: "outcome", text: "Potential protein imaging fit", instrument: "CellScape" },
    { id: "no", type: "outcome", text: "Continue research", instrument: "Keep researching" },
  ] };
  const trace = await walkTree(graph, evidence, "Neuro Imaging Group", async () => ({
    label: "Yes", evidenceIds: [item.evidenceId], citations: [{ evidenceId: item.evidenceId, quote: item.basisFacts[0] }],
    reasoning: "The supplied synthetic evidence describes protein imaging.",
  }));
  row = { id: "synthetic-review", evidenceVersion: "v", stage: "ASSESSED", normalizedEvidence: evidence,
    assessment: treeAssessment(trace, evidence, "v") };
  mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [row] }) }) });
  mocks.update.mockReturnValue({ set: (value: any) => ({ where: () => ({ returning: async () => [{ ...row, ...value }] }) }) });
});

const approve = async () => {
  const response = await fetch(`${baseUrl}/api/bsb-v2/packets/${row.id}/reviews`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ assessmentId: row.assessment.id, evidenceVersion: "v", decision: "APPROVE",
      approvedInstruments: ["CellScape"], note: "", confirmSecond: false }),
  });
  return { status: response.status, body: await response.json() as any };
};

describe("approval recovery HTTP contract (mock database; no paid calls)", () => {
  it("approves a supported POTENTIAL_FIT tree assessment", async () => {
    expect(row.assessment.instruments.find((item: any) => item.instrument === "CellScape").fit).toBe("POTENTIAL_FIT");
    const result = await approve();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ decision: "APPROVE", approvedInstruments: ["CellScape"] });
  });
  it.each([
    ["tree hash", (a: any) => { a.decisionTrace.treeHash = "stale"; }, "tree snapshot"],
    ["evidence version", (a: any) => { a.evidenceVersion = "old"; }, "research packet changed"],
    ["missing path", (a: any) => { delete a.decisionTrace.path; }, "decision path is missing"],
  ] as const)("returns a specific stale %s 409 before eligibility checks", async (_name, alter, reason) => {
    alter(row.assessment);
    row.assessment.approvable = false;
    const result = await approve();
    expect(result.status).toBe(409);
    expect(result.body.errorType).toBe("INVALID_TREE");
    expect(result.body.error).toContain(reason);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});