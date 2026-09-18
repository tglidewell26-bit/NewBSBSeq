import { createHash, randomUUID } from "node:crypto";
import { SubmitResearchPacketBody } from "@workspace/api-zod";

export type Evidence = {
  evidenceState: string;
  assessmentType: string;
  claim: string;
  sourceUrl: string | null;
  basisFacts: string[];
  basisSourceUrls: string[];
  inference: string | null;
  evidenceId: string;
  provenanceType: string;
  confirmed?: boolean;
  sourceLabel?: string;
};

export type LocatedEvidence = Evidence & {
  locations: string[];
  supportStatus: "SUPPORTED" | "UNSUPPORTED" | "SUPPORT_NOT_VERIFIED" | "NOT_APPLICABLE";
  supportIssues: string[];
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export const hashPacket = (packet: unknown) =>
  createHash("sha256").update(stableJson(packet)).digest("hex");

const exactKeys = (value: unknown, allowed: string[], path: string, issues: Array<{ path: string; message: string }>) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push({ path: path ? `${path}.${key}` : key, message: "Unknown property is not allowed by the frozen contract." });
  }
};

export function validateFrozenRequest(body: unknown) {
  const issues: Array<{ path: string; message: string }> = [];
  exactKeys(body, ["researchPacket"], "", issues);
  const packet = (body as any)?.researchPacket;
  exactKeys(packet, ["schemaVersion", "brief", "qualificationEvidence"], "researchPacket", issues);
  const evidence = packet?.qualificationEvidence;
  exactKeys(evidence, ["schemaVersion", "purpose", "generationStatus", "categories", "instrumentDiscriminatingEvidence"], "researchPacket.qualificationEvidence", issues);
  exactKeys(evidence?.categories, ["scientificNeeds", "workflows", "samples", "technologies", "translationalStage", "negativeOrContradictoryEvidence", "materialUnknowns", "buyingReadinessSignals"], "researchPacket.qualificationEvidence.categories", issues);
  exactKeys(evidence?.instrumentDiscriminatingEvidence, ["cellScapeRelevant", "cosMxRelevant", "geoMxRelevant"], "researchPacket.qualificationEvidence.instrumentDiscriminatingEvidence", issues);
  const evidenceKeys = ["evidenceState", "assessmentType", "claim", "sourceUrl", "basisFacts", "basisSourceUrls", "inference", "evidenceId", "provenanceType", "confirmed", "sourceLabel"];
  for (const [groupName, group] of [["categories", evidence?.categories], ["instrumentDiscriminatingEvidence", evidence?.instrumentDiscriminatingEvidence]] as const) {
    if (!group || typeof group !== "object") continue;
    for (const [bucket, items] of Object.entries(group)) {
      if (!Array.isArray(items)) continue;
      items.forEach((item, index) => exactKeys(item, evidenceKeys, `researchPacket.qualificationEvidence.${groupName}.${bucket}[${index}]`, issues));
    }
  }
  const parsed = SubmitResearchPacketBody.safeParse(body);
  if (!parsed.success) issues.push(...parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  return { success: issues.length === 0, issues, data: parsed.success && issues.length === 0 ? parsed.data : undefined };
}

export function normalizeEvidence(packet: any) {
  const buckets: Array<[string, Evidence[]]> = [];
  for (const [name, items] of Object.entries(packet.qualificationEvidence.categories)) {
    buckets.push([`qualificationEvidence.categories.${name}`, items as Evidence[]]);
  }
  for (const [name, items] of Object.entries(packet.qualificationEvidence.instrumentDiscriminatingEvidence)) {
    buckets.push([`qualificationEvidence.instrumentDiscriminatingEvidence.${name}`, items as Evidence[]]);
  }

  const byId = new Map<string, { item: Evidence; locations: string[] }>();
  const errors: Array<{ path: string; message: string }> = [];
  for (const [bucket, items] of buckets) {
    items.forEach((item, index) => {
      const location = `${bucket}[${index}]`;
      const existing = byId.get(item.evidenceId);
      if (!existing) byId.set(item.evidenceId, { item, locations: [location] });
      else if (stableJson(existing.item) === stableJson(item)) existing.locations.push(location);
      else errors.push({ path: `${location}.evidenceId`, message: `Evidence ID ${item.evidenceId} conflicts with substantive content at ${existing.locations.join(", ")}` });
    });
  }

  const normalized: LocatedEvidence[] = [...byId.values()].map(({ item, locations }) => {
    const issues: string[] = [];
    const affirmative = ["CONFIRMED", "SUPPORTED", "EXPLICIT"].includes(item.evidenceState);
    const publicUnverifiedMessage = "Public source evidence is SUPPORT_NOT_VERIFIED until independently account-confirmed.";
    if (item.provenanceType === "CONFIRMED_ACCOUNT") {
      if (item.evidenceState !== "CONFIRMED" || item.confirmed !== true || !item.sourceLabel || item.sourceUrl !== null || item.basisSourceUrls.length || item.inference !== null) {
        issues.push("Confirmed account evidence requires CONFIRMED state, confirmed true, sourceLabel, null sourceUrl, no public basis URLs, and no inference.");
      }
    } else if (item.provenanceType === "PUBLIC_SOURCE" && affirmative) {
      // Public claims are retained for traceability but are never independently
      // confirmed evidence. Account confirmation is the only support authority.
      issues.push(publicUnverifiedMessage);
      const validHttp = (value: string) => {
        try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
      };
      if (!item.sourceUrl || item.basisFacts.length === 0 || item.basisSourceUrls.length === 0) {
        issues.push("Affirmative public evidence requires supplied context and HTTP(S) URLs.");
      }
      if (item.sourceUrl && !validHttp(item.sourceUrl) || item.basisSourceUrls.some((url) => !validHttp(url))) {
        issues.push("Public source URLs must use HTTP(S).");
      }
      const claimNumbers = item.claim.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
      const basis = item.basisFacts.join(" ");
      const unsupportedNumbers = claimNumbers.filter((number) => !basis.includes(number));
      if (unsupportedNumbers.length) issues.push(`Claim contains unsupported numeric detail: ${unsupportedNumbers.join(", ")}.`);
      if (hasUnsubstantiatedInstrumentClaim(item)) {
        issues.push("Instrument-discriminating claim language is not supported by the supplied basis facts.");
      }
    }
    if (item.evidenceState === "INFERRED" && (!item.inference || item.basisFacts.length === 0)) {
      issues.push("Inferred evidence requires an inference and supplied basis facts.");
    }
    const supportStatus: LocatedEvidence["supportStatus"] =
      ["UNKNOWN", "CONTRADICTED", "ABSENT"].includes(item.evidenceState)
        ? "NOT_APPLICABLE"
        : item.evidenceState === "INFERRED"
          ? issues.length ? "UNSUPPORTED" : "NOT_APPLICABLE"
          : item.provenanceType === "PUBLIC_SOURCE"
            ? issues.length === 1 && issues[0] === publicUnverifiedMessage
              ? "SUPPORT_NOT_VERIFIED"
              : "UNSUPPORTED"
            : issues.length ? "UNSUPPORTED" : "SUPPORTED";
    return {
      ...item,
      locations,
      supportStatus,
      supportIssues: issues,
    };
  });
  return { normalized, errors };
}

type Instrument = "CellScape" | "CosMx" | "GeoMx";
const rules: Record<Instrument, Array<{ id: string; terms: RegExp }>> = {
  CellScape: [
    { id: "CELL-MULTIPLEX-TISSUE-PROTEIN", terms: /\b(multiplex|imaging mass|cyclic immunofluorescence|tissue protein)\b/i },
    { id: "CELL-PROPRIETARY-ANTIBODY-BIOLOGY", terms: /\b(proprietary antibody|antibody panel).*\b(tissue|spatial|protein)\b/i },
  ],
  CosMx: [
    { id: "COSMX-SINGLE-CELL-SPATIAL-RNA", terms: /\b(single[- ]cell spatial|spatial rna|rare[- ]cell|single[- ]cell multiomics)\b/i },
    { id: "COSMX-CONFIRMED-ACTIVE-USE", terms: /\b(cosmx).*\b(use|installed|active)\b/i },
  ],
  GeoMx: [
    { id: "GEOMX-TRANSLATIONAL-TISSUE-COHORT", terms: /\b(pathology|translational|tissue cohort|ffpe|biobank|regional biomarker)\b/i },
  ],
};

function hasUnsubstantiatedInstrumentClaim(item: Evidence) {
  const basis = item.basisFacts.join(" ");
  return (Object.keys(rules) as Instrument[]).some((instrument) =>
    rules[instrument].some((rule) => rule.terms.test(item.claim) && !rule.terms.test(basis)));
}

export interface AssessmentProvider {
  assess(evidence: LocatedEvidence[], evidenceVersion: string, options?: { demoMode?: boolean }): unknown;
}

const ruleText = (item: LocatedEvidence) => `${item.claim} ${item.basisFacts.join(" ")}`;

const hasNegation = (text: string) =>
  /\b(?:no|not|never|without|does not|doesn't|isn't|aren't|lack|lacks|lacking)\b[^.!?]{0,80}\b(?:cellscape|cosmx|geomx|multiplex|tissue protein|antibody panel|single[- ]cell spatial|spatial rna|ffpe|tissue cohort|biobank|regional biomarker)\b/i.test(text) ||
  /\b(?:cellscape|cosmx|geomx|multiplex|tissue protein|antibody panel|single[- ]cell spatial|spatial rna|ffpe|tissue cohort|biobank|regional biomarker)\b[^.!?]{0,50}\b(?:is not|isn't|are not|aren't|was not|were not|never|not active|not used|not installed|unsupported|unavailable)\b/i.test(text);

export class DeterministicFakeProvider implements AssessmentProvider {
  assess(evidence: LocatedEvidence[], evidenceVersion: string, options: { demoMode?: boolean } = {}) {
    if (!options.demoMode) {
      return {
        id: randomUUID(), provider: "DETERMINISTIC_FAKE", mock: true, evidenceVersion,
        semanticReviewNeeded: true, approvable: false, demoMode: false,
        validatedRealAssessment: false,
        instruments: (Object.keys(rules) as Instrument[]).map((instrument) => ({
          instrument, fit: "INSUFFICIENT_EVIDENCE",
          recommendation: "Semantic scientific review required; deterministic fake provider cannot produce an approvable assessment.",
          evidenceIds: [], ruleIds: [], alternatives: (Object.keys(rules) as Instrument[]).filter((item) => item !== instrument),
          currentUse: "Unknown", accountStatus: "Unknown", readiness: "Unknown",
        })),
        limitations: ["NON-APPROVABLE SEMANTIC-REVIEW-NEEDED RESULT: deterministic fake provider is not a real semantic assessor."],
      };
    }
    // Demo matching may use retained public material, but it remains explicitly
    // unverified and cannot become a validated real assessment.
    const demoEligible = evidence.filter((item) =>
      ["SUPPORTED", "SUPPORT_NOT_VERIFIED"].includes(item.supportStatus) &&
      item.evidenceState !== "INFERRED" &&
      !hasNegation(ruleText(item)));
    const contradictionFor = (instrument: Instrument) => evidence.some((item) => {
      if (item.evidenceState !== "CONTRADICTED") return false;
      const text = ruleText(item);
      return new RegExp(instrument, "i").test(text) || rules[instrument].some((rule) => rule.terms.test(text));
    });
    const scored = (Object.keys(rules) as Instrument[]).map((instrument) => {
      const matchedRules = rules[instrument].filter((rule) =>
        demoEligible.some((item) => rule.terms.test(ruleText(item))));
      const ids = demoEligible
        .filter((item) => matchedRules.some((rule) => rule.terms.test(ruleText(item))))
        .map((item) => item.evidenceId);
      const fit = contradictionFor(instrument) ? "INSUFFICIENT_EVIDENCE" : matchedRules.length ? (matchedRules.length > 1 ? "STRONG_FIT" : "POTENTIAL_FIT") : "INSUFFICIENT_EVIDENCE";
      const confirmedAccount = evidence.filter((item) =>
        item.supportStatus === "SUPPORTED" &&
        item.provenanceType === "CONFIRMED_ACCOUNT" &&
        item.evidenceState === "CONFIRMED");
      const use = confirmedAccount.find((item) =>
        new RegExp(instrument, "i").test(item.claim) &&
        /\b(use|installed|active|historical)\b/i.test(item.claim) &&
        !hasNegation(item.claim));
      const account = confirmedAccount[0];
      const readiness = confirmedAccount.find((item) =>
        /\b(budget|timeline|procurement|evaluation|purchase)\b/i.test(item.claim));
      return {
        instrument, fit,
        recommendation: matchedRules.length ? "Synthetic demonstration rubric match only; not a validated real-company recommendation." : "Insufficient demonstration evidence for this instrument.",
        evidenceIds: ids, ruleIds: matchedRules.map((rule) => rule.id),
        alternatives: (Object.keys(rules) as Instrument[]).filter((item) => item !== instrument),
        currentUse: use ? `Evidence cited: ${use.evidenceId}` : "Unknown",
        accountStatus: account ? `Confirmed account context: ${account.sourceLabel}` : "Unknown",
        readiness: readiness ? `Evidence cited: ${readiness.evidenceId}` : "Unknown",
      };
    });
    const selected = scored.filter((item) => item.fit !== "INSUFFICIENT_EVIDENCE").slice(0, 2);
    return {
      id: randomUUID(), provider: "DETERMINISTIC_FAKE", mock: true, evidenceVersion,
      instruments: selected.length ? selected : [scored[0]],
      limitations: [
        "SYNTHETIC DEMO ONLY: keyword-to-rubric matching is not real-company semantic reasoning.",
        "Unknown real packets require secure human review; live provider, model ID, and spend cap remain unset.",
      ],
      semanticReviewNeeded: true, approvable: true, demoMode: true,
      validatedRealAssessment: false,
    };
  }
}