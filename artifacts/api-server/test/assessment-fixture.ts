import type { ModelAssessment } from "@workspace/api-zod";
import { normalizeEvidence } from "../src/lib/bsb-v2";

// Entirely synthetic: no customer names, counts or private account details.
export function assessmentFixture() {
  const account = {
    evidenceId: "account-workflow", evidenceState: "CONFIRMED", assessmentType: "WORKFLOW",
    claim: "Synthetic Spatial Lab actively uses CosMx for tissue RNA assays.",
    provenanceType: "CONFIRMED_ACCOUNT", confirmed: true, sourceLabel: "Synthetic account confirmation",
    sourceUrl: null, basisSourceUrls: [], basisFacts: [], inference: null,
  };
  const publicItem = {
    evidenceId: "public-research", evidenceState: "SUPPORTED", assessmentType: "WORKFLOW",
    claim: "The lab integrates single-cell spatial RNA and tissue morphology for research model training.",
    provenanceType: "PUBLIC_SOURCE", sourceUrl: "https://example.org/research",
    basisSourceUrls: ["https://example.org/research"],
    basisFacts: ["The lab integrates single-cell spatial RNA and tissue morphology for research model training."], inference: null,
  };
  const packet = { schemaVersion: "bsb-company-research-v1", brief: "Synthetic Spatial Lab research overview.",
    qualificationEvidence: { schemaVersion: "1.0", purpose: "EVIDENCE_ONLY_NO_INSTRUMENT_SELECTION", generationStatus: "COMPLETE",
      categories: { scientificNeeds: [], workflows: [account, publicItem], samples: [], technologies: [], translationalStage: [],
        negativeOrContradictoryEvidence: [], materialUnknowns: [], buyingReadinessSignals: [] },
      instrumentDiscriminatingEvidence: { cellScapeRelevant: [], cosMxRelevant: [], geoMxRelevant: [] } } };
  const unknown = () => ({ value: "UNKNOWN" as const, evidenceIds: [] });
  const model: ModelAssessment = {
    evidenceReviews: [account, publicItem].map(e => ({ evidenceId: e.evidenceId, verdict: "ENTAILED", quote: e.claim, reason: "The supplied source supports this claim." })),
    instruments: ["CellScape", "CosMx", "GeoMx"].map((name: any) => ({ instrument: name,
      fit: name === "CosMx" ? "STRONG_FIT" : "INSUFFICIENT_EVIDENCE",
      recommendation: name === "CosMx" ? "Support the existing tissue RNA workflow and research model training." : "No separate instrument-specific workflow supplied.",
      evidenceIds: name === "CosMx" ? [account.evidenceId, publicItem.evidenceId] : [],
      ruleIds: name === "CosMx" ? ["COSMX-ACTIVE-WORKFLOW", "COSMX-SINGLE-CELL-RNA"] : [],
      currentUse: name === "CosMx" ? { value: "ACTIVE", evidenceIds: [account.evidenceId] } : unknown(),
      accountStatus: name === "CosMx" ? { value: "INSTALLED_BASE", evidenceIds: [account.evidenceId] } : unknown(),
      readiness: unknown(),
    })),
    selectedInstruments: ["CosMx"], selectionReason: "The active tissue RNA workflow makes CosMx the dominant fit; separate protein or regional cohort needs are not established.",
    limitations: ["No current buying project or budget was supplied."],
  };
  return { packet, evidence: normalizeEvidence(packet).normalized, model };
}

export function providerResponse(value: unknown, overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ id: "synthetic-response", status: "completed", model: "gpt-5.6-terra",
    usage: { input_tokens: 1200, output_tokens: 600 },
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }], ...overrides }),
  { status: 200, headers: { "Content-Type": "application/json" } });
}
