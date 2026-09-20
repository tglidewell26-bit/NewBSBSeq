import { describe, expect, it, vi } from "vitest";
import { modelGenerationSchema, type ModelAssessment } from "@workspace/api-zod";
import { normalizeEvidence } from "../src/lib/bsb-v2";
import { AssessmentError, buildAssessmentRequest, callAssessmentModel, validateModelAssessment } from "../src/lib/live-assessment";
import { providerResponse } from "./assessment-fixture";

// Synthetic public-only prospect: separate protein, spatial RNA and cohort
// workflows. No customer data or assertion of Bruker instrument ownership.
function prospect() {
  const facts = [
    ["protein", "Synthetic Oncology develops antibody-drug conjugates and characterizes tissue protein targets in patient tumor biopsies."],
    ["rna", "Synthetic Oncology reports single-cell spatial RNA analysis of tumor biopsies using Xenium."],
    ["cohort", "Synthetic Oncology studies regional biomarkers in pathology-led tissue cohorts."],
  ].map(([evidenceId, claim]) => ({ evidenceId, claim, evidenceState: "SUPPORTED", assessmentType: "WORKFLOW",
    provenanceType: "PUBLIC_SOURCE", sourceUrl: `https://example.org/${evidenceId}`,
    basisSourceUrls: [`https://example.org/${evidenceId}`], basisFacts: [claim], inference: null }));
  const unknown = { evidenceId: "unknown-commercial", claim: "Ownership, budget and buying timeline are unknown.",
    evidenceState: "UNKNOWN", assessmentType: "QUESTION", provenanceType: "PUBLIC_SOURCE",
    sourceUrl: null, basisSourceUrls: [], basisFacts: [], inference: null };
  const evidence = normalizeEvidence({ qualificationEvidence: {
    categories: { workflows: facts, materialUnknowns: [unknown] }, instrumentDiscriminatingEvidence: {},
  } }).normalized;
  const status = () => ({ value: "UNKNOWN" as const, evidenceIds: [] as string[] });
  const model: ModelAssessment = {
    evidenceReviews: [
      ...facts.map(e => ({ evidenceId: e.evidenceId, verdict: "ENTAILED" as const, quote: e.claim, reason: "Directly stated in supplied source." })),
      { evidenceId: unknown.evidenceId, verdict: "UNKNOWN", quote: "", reason: "No evidence of a purchase or installed instrument." },
    ],
    instruments: [
      { instrument: "CellScape", fit: "STRONG_FIT", recommendation: "Tissue protein characterization supports the antibody-drug conjugate program.", evidenceIds: ["protein"], ruleIds: ["CELL-ANTIBODY-BIOLOGY"], currentUse: status(), accountStatus: status(), readiness: status() },
      { instrument: "CosMx", fit: "POTENTIAL_FIT", recommendation: "Published single-cell spatial RNA analysis establishes a related workflow, without evidence of a replacement project.", evidenceIds: ["rna"], ruleIds: ["COSMX-SINGLE-CELL-RNA"], currentUse: status(), accountStatus: status(), readiness: status() },
      { instrument: "GeoMx", fit: "POTENTIAL_FIT", recommendation: "The pathology-led cohort supports a regional biomarker discussion.", evidenceIds: ["cohort"], ruleIds: ["GEOMX-TISSUE-COHORT"], currentUse: status(), accountStatus: status(), readiness: status() },
    ],
    selectedInstruments: ["CellScape"], selectionReason: "The dominant antibody program favors tissue protein characterization; RNA and cohort workflows are separate alternatives.",
    limitations: [unknown.claim],
  };
  return { evidence, model };
}

describe("public-only prospect output contract", () => {
  it("accepts supported alternatives while ownership and buying readiness stay unknown", async () => {
    const { evidence, model } = prospect();
    expect(modelGenerationSchema.safeParse(model).success).toBe(true);
    const provider = vi.fn(async () => providerResponse(model));
    const response = await callAssessmentModel(buildAssessmentRequest("Synthetic Oncology", evidence), provider);
    const result = validateModelAssessment(response.value, evidence, "v");
    expect(result.approvable).toBe(true);
    expect(result.selectedInstruments).toEqual(["CellScape"]);
    expect(result.instruments.every(i => i.currentUse === "UNKNOWN" && i.accountStatus === "UNKNOWN" && i.readiness === "UNKNOWN")).toBe(true);
    expect(evidence.slice(0, 3).every(e => e.supportStatus === "SUPPORT_NOT_VERIFIED")).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("reproduces all thirteen reported validation paths without accepting or repairing the answer", () => {
    const { evidence, model } = prospect();
    for (const item of model.instruments) {
      for (const key of ["currentUse", "accountStatus", "readiness"] as const) item[key].evidenceIds = ["unknown-commercial"];
      if (item.instrument !== "CellScape") { item.evidenceIds = []; item.ruleIds = []; }
    }
    const before = structuredClone(model);
    expect(modelGenerationSchema.safeParse(model).success).toBe(false);
    let error: AssessmentError | undefined;
    try { validateModelAssessment(model, evidence, "v"); } catch (e) { error = e as AssessmentError; }
    expect(error).toBeInstanceOf(AssessmentError);
    expect(error!.issues.map(i => i.path).sort()).toEqual([
      ...["CellScape", "CosMx", "GeoMx"].flatMap(i => ["currentUse", "accountStatus", "readiness"].map(k => `instruments.${i}.${k}`)),
      ...["CosMx", "GeoMx"].flatMap(i => ["evidenceIds", "ruleIds"].map(k => `instruments.${i}.${k}`)),
    ].sort());
    expect(model).toEqual(before);
  });

  it.each(["currentUse", "accountStatus", "readiness"] as const)("prevents UNKNOWN %s citations in the generation schema", key => {
    const { model } = prospect();
    model.instruments[0][key].evidenceIds = ["unknown-commercial"];
    expect(modelGenerationSchema.safeParse(model).success).toBe(false);
  });

  it.each(["STRONG_FIT", "POTENTIAL_FIT"] as const)("requires evidence and rules for an unselected %s", fit => {
    for (const key of ["evidenceIds", "ruleIds"] as const) {
      const { model } = prospect();
      model.instruments[1].fit = fit;
      model.instruments[1][key] = [];
      expect(modelGenerationSchema.safeParse(model).success).toBe(false);
    }
  });

  it("keeps grounding mandatory even when an answer satisfies the generation schema", () => {
    for (const id of ["unknown-commercial", "invented"]) {
      const { model, evidence } = prospect();
      model.instruments[1].evidenceIds = [id];
      expect(modelGenerationSchema.safeParse(model).success).toBe(true);
      expect(() => validateModelAssessment(model, evidence, "v")).toThrow(AssessmentError);
    }
  });

  it("sends the conditional array constraints to the provider, not just the local parser", () => {
    const request = buildAssessmentRequest("Synthetic", prospect().evidence);
    const schema = request.text.format.schema as any;
    expect(schema.type).toBe("object");
    expect(schema.anyOf).toBeUndefined();
    const branches = schema.properties.instruments.items.anyOf;
    const positive = branches.find((b: any) => b.properties.fit.enum?.includes("STRONG_FIT"));
    expect(positive.properties.evidenceIds.minItems).toBe(1);
    expect(positive.properties.ruleIds.minItems).toBe(1);
    for (const key of ["currentUse", "accountStatus", "readiness"]) {
      const dimension = positive.properties[key].anyOf;
      expect(dimension.find((d: any) => d.properties.value.const === "UNKNOWN").properties.evidenceIds.maxItems).toBe(0);
      expect(dimension.find((d: any) => d.properties.value.enum).properties.evidenceIds.minItems).toBe(1);
    }
    expect(request.instructions).toContain('UNKNOWN must be exactly {"value":"UNKNOWN","evidenceIds":[]}');
    expect(request.instructions).toContain("INCLUDING instruments you do not select");
  });
});
