import { z } from "zod/v4";

export const instruments = ["CellScape", "CosMx", "GeoMx"] as const;
export const rubric = {
  "CELL-MULTIPLEX-PROTEIN": { instrument: "CellScape", text: "Established multiplex tissue protein imaging: CODEX, CyCIF, multiplex IF or a supported equivalent workflow." },
  "CELL-ANTIBODY-BIOLOGY": { instrument: "CellScape", text: "Proprietary antibody, ADC, bispecific or companion-diagnostic biology with an explicit tissue protein characterization need. Antibody mentions alone are insufficient." },
  "COSMX-SINGLE-CELL-RNA": { instrument: "CosMx", text: "Single-cell RNA integration with spatial context, rare-cell resolution, or supported single-cell spatial multi-omics needs." },
  "COSMX-ACTIVE-WORKFLOW": { instrument: "CosMx", text: "Explicit active CosMx assay use establishes workflow fit and supports installed-base outreach. It does not imply budget, another instrument purchase, or clinically validated outcomes." },
  "GEOMX-TISSUE-COHORT": { instrument: "GeoMx", text: "Pathology-led translational cohorts, FFPE archives, biobanks, or regional tissue biomarker questions. FFPE alone is a compatibility signal, not a decisive instrument preference." },
} as const;

const text = z.string().max(2000);
const ids = z.array(z.string().min(1)).max(80);
const dimension = <T extends readonly [string, ...string[]]>(values: T) => z.object({
  value: z.enum(values), evidenceIds: ids,
}).strict();

export const modelAssessmentSchema = z.object({
  evidenceReviews: z.array(z.object({
    evidenceId: z.string().min(1),
    verdict: z.enum(["ENTAILED", "NOT_SUPPORTED", "CONFLICT", "UNKNOWN"]),
    quote: text,
    reason: text,
  }).strict()).max(80),
  instruments: z.array(z.object({
    instrument: z.enum(instruments),
    fit: z.enum(["STRONG_FIT", "POTENTIAL_FIT", "NOT_QUALIFIED", "INSUFFICIENT_EVIDENCE"]),
    recommendation: text,
    evidenceIds: ids,
    ruleIds: z.array(z.enum(Object.keys(rubric) as [keyof typeof rubric, ...Array<keyof typeof rubric>])).max(5),
    currentUse: dimension(["ACTIVE", "HISTORICAL", "UNKNOWN"]),
    accountStatus: dimension(["INSTALLED_BASE", "PROSPECT", "UNKNOWN"]),
    readiness: dimension(["BUDGET_CONFIRMED", "TIMELINE_CONFIRMED", "ACTIVE_EVALUATION", "UNKNOWN"]),
  }).strict()).length(3),
  selectedInstruments: z.array(z.enum(instruments)).max(2),
  selectionReason: text,
  limitations: z.array(text).max(12),
}).strict();

// Constrain generation, while retaining the existing persisted response shape
// and field-specific semantic errors in the server validator. Nested anyOf and
// array bounds are supported by Responses Structured Outputs.
const generationDimension = <T extends readonly [string, ...string[]]>(known: T) => z.union([
  z.object({ value: z.literal("UNKNOWN"), evidenceIds: ids.max(0) }).strict(),
  z.object({ value: z.enum(known), evidenceIds: ids.min(1) }).strict(),
]);
const generationInstrument = modelAssessmentSchema.shape.instruments.element.extend({
  currentUse: generationDimension(["ACTIVE", "HISTORICAL"]),
  accountStatus: generationDimension(["INSTALLED_BASE", "PROSPECT"]),
  readiness: generationDimension(["BUDGET_CONFIRMED", "TIMELINE_CONFIRMED", "ACTIVE_EVALUATION"]),
});
export const modelGenerationSchema = modelAssessmentSchema.extend({
  instruments: z.array(z.union([
    generationInstrument.extend({
      fit: z.enum(["STRONG_FIT", "POTENTIAL_FIT"]),
      evidenceIds: ids.min(1),
      ruleIds: generationInstrument.shape.ruleIds.min(1),
    }),
    generationInstrument.extend({ fit: z.literal("NOT_QUALIFIED"), evidenceIds: ids.min(1) }),
    generationInstrument.extend({ fit: z.literal("INSUFFICIENT_EVIDENCE") }),
  ])).length(3),
});

export const modelAssessmentJsonSchema = z.toJSONSchema(modelGenerationSchema);
export type ModelAssessment = z.infer<typeof modelAssessmentSchema>;
