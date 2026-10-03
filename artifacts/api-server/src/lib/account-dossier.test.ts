import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertDossier, isAccountDossier, validateDossierShape } from "./account-dossier";
import { hashPacket, normalizeEvidence, validateFrozenRequest } from "./bsb-v2";

const sample = () => JSON.parse(readFileSync(new URL("../../../../samples/account-dossier-synthetic.json", import.meta.url), "utf8"));

const allItems = (packet: any) => [
  ...Object.values(packet.qualificationEvidence.categories).flat(),
  ...Object.values(packet.qualificationEvidence.instrumentDiscriminatingEvidence).flat(),
] as any[];

describe("account dossier conversion", () => {
  it("detects dossiers and leaves frozen packets alone", () => {
    expect(isAccountDossier(sample())).toBe(true);
    expect(isAccountDossier({ schemaVersion: "bsb-company-research-v1", brief: "x", qualificationEvidence: {} })).toBe(false);
  });

  it("produces a packet that passes the frozen contract and normalizes without errors", () => {
    const { researchPacket } = convertDossier(sample());
    const parsed = validateFrozenRequest({ researchPacket });
    expect(parsed.issues).toEqual([]);
    expect(parsed.success).toBe(true);
    const { errors, normalized } = normalizeEvidence(researchPacket);
    expect(errors).toEqual([]);
    expect(normalized.length).toBeGreaterThan(5);
  });

  it("is deterministic so duplicate uploads dedupe", () => {
    expect(hashPacket(convertDossier(sample()).researchPacket)).toBe(hashPacket(convertDossier(sample()).researchPacket));
  });

  it("maps evidence tags and keeps buyer-unit labels", () => {
    const items = allItems(convertDossier(sample()).researchPacket);
    const protein = items.find((item) => item.claim.includes("Protein signal"));
    expect(protein.claim).toContain("[Neuro Imaging Group]");
    expect(protein.evidenceState).toBe("EXPLICIT");
    expect(protein.basisSourceUrls).toEqual(["https://example.org/careers/imaging-scientist"]);
    const inferred = items.find((item) => item.claim.includes("[Neuro Imaging Group] Sample type"));
    expect(inferred.evidenceState).toBe("INFERRED");
    expect(inferred.inference).toContain("Confidence: Medium");
    const unknown = items.find((item) => item.claim.includes("Computational team"));
    expect(unknown.evidenceState).toBe("UNKNOWN");
    expect(unknown.sourceUrl).toBeNull();
  });

  it("never fills instrument-discriminating evidence (the researcher does not pick instruments)", () => {
    const { researchPacket } = convertDossier(sample());
    expect(researchPacket.qualificationEvidence.instrumentDiscriminatingEvidence).toEqual({ cellScapeRelevant: [], cosMxRelevant: [], geoMxRelevant: [] });
  });

  it("turns open unknowns and unresolved checks into material unknowns", () => {
    const { researchPacket } = convertDossier(sample());
    const unknowns = researchPacket.qualificationEvidence.categories.materialUnknowns;
    expect(unknowns.some((item) => item.claim.startsWith("Does the group want transcript-level data"))).toBe(true);
    expect(unknowns.some((item) => item.claim.startsWith("Unresolved inference (no evidence found)"))).toBe(true);
  });

  it("tolerates common ChatGPT deviations without rejecting the dossier", () => {
    const dossier = sample();
    const unit = dossier.buyer_units[0];
    unit.measurement_signals.protein[0].tag = "stated";                // lowercase tag
    unit.measurement_signals.protein[0].source_url = "example.org/careers"; // not a full URL
    unit.research_focus = ["Microglia biology"];                       // plain string, not an evidence object
    unit.species = [{ value: "Mouse", evidence: "In vivo mouse studies.", source_url: "https://example.org/science" }]; // tag missing
    delete dossier.schema_version;
    expect(validateDossierShape(dossier)).toEqual([]);
    const { researchPacket, notes } = convertDossier(dossier);
    expect(validateFrozenRequest({ researchPacket }).success).toBe(true);
    expect(normalizeEvidence(researchPacket).errors).toEqual([]);
    expect(notes.map((note) => note.path)).toEqual(expect.arrayContaining([
      "buyer_units[0].measurement_signals.protein[0].source_url",
      "buyer_units[0].research_focus[0]",
      "buyer_units[0].species[0].tag",
    ]));
    const items = allItems(researchPacket);
    expect(items.find((item) => item.claim.includes("Protein signal")).sourceUrl).toBeNull();
    expect(items.find((item) => item.claim.includes("Research focus")).evidenceState).toBe("INFERRED");
  });

  it("accepts the research prompt's original 1.0 version", () => {
    const dossier = sample();
    dossier.schema_version = "1.0";
    expect(validateDossierShape(dossier)).toEqual([]);
    expect(validateFrozenRequest({ researchPacket: convertDossier(dossier).researchPacket }).success).toBe(true);
  });

  it("does not mistake source dates for unsupported scientific numbers", () => {
    const { normalized } = normalizeEvidence(convertDossier(sample()).researchPacket);
    const protein = normalized.find((item) => item.claim.includes("Protein signal"))!;
    expect(protein.supportStatus).toBe("SUPPORT_NOT_VERIFIED");
    expect(protein.supportIssues.some((issue) => issue.includes("unsupported numeric"))).toBe(false);
  });

  it("does not manufacture reasoning or promote untagged evidence", () => {
    const dossier = sample();
    delete dossier.buyer_units[0].sample_types[0].reasoning;
    delete dossier.buyer_units[0].measurement_signals.protein[0].tag;
    const { normalized } = normalizeEvidence(convertDossier(dossier).researchPacket);
    const inferred = normalized.find((item) => item.assessmentType === "SAMPLE_TYPE")!;
    expect(inferred.inference).toBeNull();
    expect(inferred.supportStatus).toBe("UNSUPPORTED");
    expect(normalized.find((item) => item.claim.includes("Protein signal"))!.evidenceState).toBe("UNKNOWN");
  });

  it("rejects dossiers that cannot be converted, with clear messages", () => {
    expect(validateDossierShape({ schema_version: "9.9", buyer_units: {} }).map((issue) => issue.path)).toEqual([
      "schema_version", "organization.official_name", "buyer_units",
    ]);
  });
});
