import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { assertApprovedPacket } from "./sequences";
import { convertDossier } from "./account-dossier";
import { normalizeEvidence } from "./bsb-v2";
import { hashPacket } from "./bsb-v2";
import { buyerUnitOptions, loadGraph, validateGraph, validateAnswer, questionRequest, walkTree, treeAssessment, validateTreeAssessment, scopedEvidence, editedPrefix, withHumanEvidence, parseTreeEdit, type Graph, type TreeNode } from "./instrument-tree";
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
  it.each(["Yes", "No", "Unknown"])("allows correcting %s without a model call for that node", async label => {
    const trace = await walkTree(graph(), evidence(), "Neuro Imaging Group", async () => unknown());
    const prefix = editedPrefix(trace, parseTreeEdit({ assessmentId: "a", nodeId: "q", label, reason: "User verified this in a synthetic meeting." }));
    const all = withHumanEvidence(evidence(), prefix, trace.buyerUnit);
    const provider = vi.fn();
    const revised = await walkTree(trace.graph, all, trace.buyerUnit, provider, undefined, prefix);
    expect(provider).not.toHaveBeenCalled();
    expect(trace.path[0].label).toBe("Unknown");
    expect(revised.path[0].label).toBe(label);
    expect(revised.path[0].humanOverride?.originalAnswer.label).toBe("Unknown");
    const a = treeAssessment(revised, all, "v");
    expect(validateTreeAssessment(a, evidence(), "v").selectedInstruments).toEqual(a.selectedInstruments);
    expect(all.filter(e => e.sourceLabel?.startsWith("User correction"))).toHaveLength(label === "Unknown" ? 0 : 1);
  });
  it("reruns only the suffix, preserves earlier steps, and discards obsolete downstream answers", async () => {
    const g = graph();
    g.nodes[0].answers!.forEach(a => { a.next = "q2"; });
    g.nodes.push({ ...question(), id: "q2" });
    const original = await walkTree(g, evidence(), "Neuro Imaging Group", async () => unknown());
    const prefix = editedPrefix(original, { assessmentId: "a", nodeId: "q", label: "Yes", reason: "Synthetic confirmation" });
    const provider = vi.fn(async () => yes());
    const revised = await walkTree(g, withHumanEvidence(evidence(), prefix, original.buyerUnit), original.buyerUnit, provider, undefined, prefix);
    expect(provider.mock.calls).toHaveLength(1);
    expect(revised.path.map(s => s.label)).toEqual(["Yes", "Yes"]);
    const laterPrefix = editedPrefix(revised, { assessmentId: "b", nodeId: "q2", label: "No", reason: "Synthetic correction" });
    expect(laterPrefix[0]).toEqual(revised.path[0]);
    expect(laterPrefix[1].humanOverride?.originalAnswer.label).toBe("Yes");
    const earlierAgain = editedPrefix(revised, { assessmentId: "b", nodeId: "q", label: "Unknown", reason: "Evidence withdrawn" });
    expect(withHumanEvidence(withHumanEvidence(evidence(), laterPrefix, original.buyerUnit), earlierAgain, original.buyerUnit).some(e => e.evidenceId.startsWith("human:"))).toBe(false);
  });
  it("rejects invalid edits, whitespace reasons, off-path nodes, and tampered human evidence", async () => {
    for (const reason of ["", "   ", "x".repeat(4001)]) expect(() => parseTreeEdit({ assessmentId: "a", nodeId: "q", label: "Yes", reason })).toThrow();
    const trace = await walkTree(graph(), evidence(), "Neuro Imaging Group", async () => unknown());
    expect(() => editedPrefix(trace, { assessmentId: "a", nodeId: "yes", label: "Yes", reason: "test" })).toThrow();
    expect(() => editedPrefix(trace, { assessmentId: "a", nodeId: "q", label: "Maybe", reason: "test" })).toThrow();
    const prefix = editedPrefix(trace, { assessmentId: "a", nodeId: "q", label: "Yes", reason: "test" });
    const all = withHumanEvidence(evidence(), prefix, trace.buyerUnit);
    const revised = await walkTree(trace.graph, all, trace.buyerUnit, vi.fn(), undefined, prefix);
    const a = treeAssessment(revised, all, "v");
    a.decisionTrace.path[0].humanOverride!.reason = "modified";
    expect(() => validateTreeAssessment(a, evidence(), "v")).toThrow();
  });
  it("retains human-source attribution through approval and outreach validation", async () => {
    const packet = convertDossier(structuredClone(sample)).researchPacket;
    const version = hashPacket(packet);
    const original = await walkTree(graph(), evidence(), "Neuro Imaging Group", async () => unknown());
    const prefix = editedPrefix(original, { assessmentId: "a", nodeId: "q", label: "Yes", reason: "Synthetic account confirmed its protein imaging workflow." });
    const all = withHumanEvidence(evidence(), prefix, original.buyerUnit);
    const revised = await walkTree(original.graph, all, original.buyerUnit, vi.fn(), undefined, prefix);
    const a = treeAssessment(revised, all, version);
    const row = { stage: "APPROVED", research_packet: packet, evidence_version: version, assessment: a,
      review: { decision: "APPROVE", evidenceVersion: version, approvedInstruments: ["CellScape"] } };
    const authorized = assertApprovedPacket(row);
    expect(authorized.find(e => e.evidenceId.startsWith("human:"))?.sourceLabel).toContain("User correction");
    expect(() => assertApprovedPacket({ ...row, stage: "ASSESSED", review: null })).toThrow();
  });
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
    expect(assessment.instruments.find(item => item.instrument === "CellScape")?.fit).toBe("POTENTIAL_FIT");
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
  it("explains buyer units, suggests the strongest starting point and hides administrative-only units", () => {
    const all = evidence();
    const protein = all.find(e => e.claim.includes("Protein signal"))!;
    all.push(
      { ...protein, evidenceId: "trans-sample", claim: "[Translational Group] Sample type: FFPE tumor tissue", locations: ["qualificationEvidence.categories.samples[99]"] },
      { ...protein, evidenceId: "trans-rna", claim: "[Translational Group] RNA signal: RNA profiling", locations: ["qualificationEvidence.categories.workflows[99]"] },
      { ...protein, evidenceId: "trans-imaging", claim: "[Translational Group] Infrastructure: pathology imaging", locations: ["qualificationEvidence.categories.technologies[99]"] },
      { ...protein, evidenceId: "cmc-focus", claim: "[Chemistry, Manufacturing and Controls] Research focus: plasmid process development", locations: ["qualificationEvidence.categories.scientificNeeds[99]"] },
    );
    const options = buyerUnitOptions(all);
    expect(options.map(option => option.name)).toEqual(["Neuro Imaging Group", "Translational Group"]);
    expect(options.find(option => option.recommended)?.name).toBe("Translational Group");
    expect(options.find(option => option.name === "Translational Group")?.description).toContain("Samples: FFPE tumor tissue");
    expect(options.find(option => option.recommended)?.recommendationReason).toContain("tissue or tumor samples");
  });
  it("sends only the current question and bounds request size", () => {
    const request = questionRequest(question(), evidence(), "Neuro Imaging Group");
    const input = JSON.parse(request.input);
    expect(input.allowedAnswers).toEqual(["Yes", "No", "Unknown"]);
    expect(input).not.toHaveProperty("next");
    const citation = (request.text.format.schema.properties as any).citations.items.properties;
    expect(citation.evidenceId.enum).toContain(yes().evidenceIds[0]);
    expect(citation.quote.enum).toContain(yes().citations[0].quote);
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
  it("identifies whether a saved assessment has a tree or evidence version mismatch", async () => {
    const trace = await walkTree(graph(), evidence(), "Neuro Imaging Group", async () => unknown());
    const a = treeAssessment(trace, evidence(), "v");
    expect(() => validateTreeAssessment(a, evidence(), "new-version")).toThrow("research packet changed");
    a.decisionTrace.treeHash = "tampered";
    expect(() => validateTreeAssessment(a, evidence(), "v")).toThrow("tree snapshot");
  });
  it("identifies a missing saved path before approval", async () => {
    const trace = await walkTree(graph(), evidence(), "Neuro Imaging Group", async () => yes());
    const a = treeAssessment(trace, evidence(), "v");
    a.decisionTrace.path = undefined as any;
    expect(() => validateTreeAssessment(a, evidence(), "v")).toThrow("saved decision path is missing");
  });
});
