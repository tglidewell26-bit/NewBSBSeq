import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { convertDossier } from "./account-dossier";
import { normalizeEvidence } from "./bsb-v2";
import { loadGraph, validateGraph, validateAnswer, questionRequest, walkTree, treeAssessment, validateTreeAssessment, scopedEvidence, type Graph, type TreeNode } from "./instrument-tree";
const sample = JSON.parse(readFileSync(new URL("../../../../samples/account-dossier-synthetic.json", import.meta.url), "utf8"));
const evidence = () => normalizeEvidence(convertDossier(structuredClone(sample)).researchPacket).normalized;
const question = (): TreeNode => ({ id: "q", type: "question", text: "Does the unit perform protein imaging?", answers: [{ label: "Yes", next: "yes" }, { label: "No", next: "no" }, { label: "Unknown", next: "unknown" }] });
const graph = (): Graph => ({ schema: "bsb-instrument-graph-v1", start: "q", nodes: [question(), ...["yes", "no", "unknown"].map(id => ({ id, type: "outcome" as const, text: id, instrument: id === "yes" ? "CellScape" : id === "no" ? "No fit" : "Keep researching" }))] });
const unknown = () => ({ label: "Unknown", evidenceIds: [], citations: [], reasoning: "No evidence establishes an answer." });
const yes = () => {
  const e = evidence().find(e => e.claim.includes("Protein signal"))!;
  return { label: "Yes", evidenceIds: [e.evidenceId], citations: [{ evidenceId: e.evidenceId, quote: e.basisFacts[0] }], reasoning: "The synthetic posting explicitly names multiplex IF." };
};
describe("instrument tree", () => {
  it("validates the exported graph and follows Unknown to discovery", async () => {
    const provider = vi.fn(async () => unknown());
    const result = await walkTree(loadGraph(), [], "Whole organization", provider);
    expect(result.outcome.instrument).toBe("Keep researching");
    expect(provider).toHaveBeenCalledTimes(result.path.length);
    expect(result.path.every(s => s.label === "Unknown")).toBe(true);
    expect(treeAssessment(result, [], "v").approvable).toBe(false);
  });
  it.each(["cycle", "missing", "duplicate", "noUnknown", "duplicateAnswer"])("rejects malformed graph %s before calling the model", async kind => {
    const g = graph();
    if (kind === "cycle") g.nodes[0].answers![0].next = "q";
    if (kind === "missing") g.nodes[0].answers![0].next = "missing";
    if (kind === "duplicate") g.nodes.push({ ...g.nodes[0] });
    if (kind === "noUnknown") g.nodes[0].answers!.pop();
    if (kind === "duplicateAnswer") g.nodes[0].answers!.push({ ...g.nodes[0].answers![0] });
    const provider = vi.fn();
    await expect(walkTree(g, evidence(), "Neuro Imaging Group", provider)).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
  });
  it("rejects outcomes selecting all three instruments", () => {
    const g = graph(); g.nodes[1].instrument = "CellScape or CosMx or GeoMx";
    expect(() => validateGraph(g)).toThrow("more than two");
  });
  it("allows converging branches", () => {
    const g = graph(); g.nodes[0].answers![1].next = "yes";
    expect(validateGraph(g)).toBe(g);
  });
  it("follows next in code, checkpoints citations, and replays the saved graph", async () => {
    const checkpoint = vi.fn(async () => {});
    const trace = await walkTree(graph(), evidence(), "Neuro Imaging Group", async () => yes(), checkpoint);
    expect(trace.path[0].next).toBe("yes");
    expect(checkpoint).toHaveBeenCalledTimes(1);
    const assessment = treeAssessment(trace, evidence(), "v");
    expect(assessment.selectedInstruments).toEqual(["CellScape"]);
    expect(validateTreeAssessment(assessment, evidence(), "v").approvable).toBe(true);
    assessment.decisionTrace.path[0].next = "no";
    expect(() => validateTreeAssessment(assessment, evidence(), "v")).toThrow();
  });
  it("rejects model-chosen next, arbitrary labels, invented IDs, quotes and unsupported citations", () => {
    for (const change of [{ next: "no" }, { label: "Maybe" }, { evidenceIds: ["invented"] }, { citations: [{ evidenceId: yes().evidenceIds[0], quote: "invented quote" }] }, { evidenceIds: [], citations: [] }])
      expect(() => validateAnswer({ ...yes(), ...change }, question(), evidence())).toThrow();
    const unsupported = evidence().map(e => ({ ...e, supportStatus: "UNSUPPORTED" as const }));
    expect(() => validateAnswer(yes(), question(), unsupported)).toThrow();
    expect(() => validateAnswer({ ...yes(), label: "Unknown" }, question(), evidence())).toThrow();
    expect(() => validateAnswer({ ...unknown(), label: "No" }, question(), evidence())).toThrow();
  });
  it("rejects inferred facts and metadata as supporting authority", () => {
    const item = evidence().find(e => e.evidenceState === "INFERRED" && e.basisFacts.length)!;
    expect(() => validateAnswer({ ...yes(), evidenceIds: [item.evidenceId], citations: [{ evidenceId: item.evidenceId, quote: item.basisFacts[0] }] }, question(), evidence())).toThrow();
    const e = evidence().find(e => e.claim.includes("Protein signal"))!;
    expect(() => validateAnswer({ ...yes(), citations: [{ evidenceId: e.evidenceId, quote: "Source metadata:" }] }, question(), evidence())).toThrow();
  });
  it("requires a buyer unit and excludes other departments", () => {
    const all = evidence();
    const other = { ...all.find(e => e.claim.includes("Protein signal"))!, evidenceId: "other", claim: "[Other Lab] Protein signal: imaging" };
    all.push(other);
    expect(() => scopedEvidence(all)).toThrow("Choose one buyer unit");
    expect(() => scopedEvidence(all, "invented")).toThrow();
    const scoped = scopedEvidence(all, "Neuro Imaging Group");
    expect(scoped.evidence.some(e => e.evidenceId === "other")).toBe(false);
    expect(scoped.evidence.some(e => e.claim.startsWith("Job posting"))).toBe(true);
    expect(() => validateAnswer({ ...yes(), evidenceIds: ["other"], citations: [{ evidenceId: "other", quote: other.basisFacts[0] }] }, question(), scoped.evidence)).toThrow();
  });
  it("sends only the current question and bounds request size", () => {
    const input = JSON.parse(questionRequest(question(), evidence(), "Neuro Imaging Group").input);
    expect(input.allowedAnswers).toEqual(["Yes", "No", "Unknown"]);
    expect(input).not.toHaveProperty("next");
    expect(() => questionRequest(question(), Array(81).fill(evidence()[0]), "Unit")).toThrow();
    expect(() => questionRequest(question(), [{ ...evidence()[0], claim: "x".repeat(64000) }], "Unit")).toThrow();
  });
  it.each(["CosMx or GeoMx", "GeoMx or CellScape", "CosMx or CellScape", "No fit", "Other", "Keep researching"])("preserves %s without direct scoring", async instrument => {
    const g = graph(); g.nodes[1].instrument = instrument;
    const trace = await walkTree(g, evidence(), "Neuro Imaging Group", async () => yes());
    const a = treeAssessment(trace, evidence(), "v");
    expect(a.decisionTrace.outcome.instrument).toBe(instrument);
    expect(a.selectedInstruments.length).toBe(instrument.includes(" or ") ? 2 : 0);
    expect(validateTreeAssessment(a, evidence(), "v").selectedInstruments).toEqual(a.selectedInstruments);
  });
  it("rejects changed recommendations and stale evidence", async () => {
    const trace = await walkTree(graph(), evidence(), "Neuro Imaging Group", async () => yes());
    const a = treeAssessment(trace, evidence(), "v");
    expect(() => validateTreeAssessment(a, evidence(), "new-version")).toThrow();
    a.selectedInstruments = ["GeoMx"];
    expect(() => validateTreeAssessment(a, evidence(), "v")).toThrow();
  });
});
