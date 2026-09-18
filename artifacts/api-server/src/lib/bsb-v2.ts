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
  supportStatus: "SUPPORTED" | "UNSUPPORTED" | "NOT_APPLICABLE";
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
    if (item.provenanceType === "CONFIRMED_ACCOUNT") {
      if (item.evidenceState !== "CONFIRMED" || item.confirmed !== true || !item.sourceLabel || item.sourceUrl !== null || item.basisSourceUrls.length || item.inference !== null) {
        issues.push("Confirmed account evidence requires CONFIRMED state, confirmed true, sourceLabel, null sourceUrl, no public basis URLs, and no inference.");
      }
    } else if (item.provenanceType === "PUBLIC_SOURCE" && affirmative) {
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
    }
    if (item.evidenceState === "INFERRED" && (!item.inference || item.basisFacts.length === 0)) {
      issues.push("Inferred evidence requires an inference and supplied basis facts.");
    }
    return {
      ...item,
      locations,
      supportStatus: ["UNKNOWN", "CONTRADICTED", "ABSENT"].includes(item.evidenceState)
        ? "NOT_APPLICABLE"
        : issues.length ? "UNSUPPORTED" : "SUPPORTED",
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

export interface AssessmentProvider {
  assess(evidence: LocatedEvidence[], evidenceVersion: string): unknown;
}

export class DeterministicFakeProvider implements AssessmentProvider {
  assess(evidence: LocatedEvidence[], evidenceVersion: string) {
    const supported = evidence.filter((item) => item.supportStatus === "SUPPORTED");
    const conflict = evidence.some((item) => item.evidenceState === "CONTRADICTED");
    const scored = (Object.keys(rules) as Instrument[]).map((instrument) => {
      const matchedRules = rules[instrument].filter((rule) => supported.some((item) => rule.terms.test(`${item.claim} ${item.basisFacts.join(" ")}`)));
      const ids = supported.filter((item) => matchedRules.some((rule) => rule.terms.test(`${item.claim} ${item.basisFacts.join(" ")}`))).map((item) => item.evidenceId);
      const fit = conflict ? "INSUFFICIENT_EVIDENCE" : matchedRules.length ? (matchedRules.length > 1 ? "STRONG_FIT" : "POTENTIAL_FIT") : "INSUFFICIENT_EVIDENCE";
      const use = supported.find((item) => new RegExp(instrument, "i").test(item.claim) && /\b(use|installed|active|historical)\b/i.test(item.claim));
      const account = supported.find((item) => item.provenanceType === "CONFIRMED_ACCOUNT");
      const readiness = supported.find((item) => /\b(budget|timeline|procurement|evaluation|purchase)\b/i.test(item.claim));
      return {
        instrument, fit,
        recommendation: matchedRules.length ? `Mock rubric match only; human scientific review required.` : "Insufficient supported evidence for this instrument.",
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
        "MOCK RESULT: keyword-to-rubric matching is not real-company semantic reasoning.",
        "Unknown real packets require secure human review; live provider, model ID, and spend cap remain unset.",
      ],
    };
  }
}