import { describe, expect, it } from "vitest";
import { touchIds } from "@workspace/api-zod";
import { hashPacket } from "../src/lib/bsb-v2";
import { checkDraft, checkSemantic, partitionSequenceFindings, planSequence, renderSequence, sequenceModelRequest } from "../src/lib/sequences";
import { attachSequenceAssets, emailResourceLink } from "../src/lib/sequence-assets";
import { EARLI_WRITER_REFERENCE } from "../src/lib/sequence-writer-reference";
import { sequenceFixture, settings } from "./sequence-fixture";

describe("sequence-level brief", () => {
  it("shares scoped biology while keeping another team's methods out", () => {
    const { row } = sequenceFixture();
    const base = row.research_packet.qualificationEvidence.categories.workflows[1];
    base.claim = "[Therapeutics] The lab integrates single-cell spatial RNA and tissue morphology.";
    base.basisFacts = [base.claim];
    row.assessment.evidenceReviews.find(e => e.evidenceId === base.evidenceId)!.quote = base.claim;
    for (const [evidenceId, claim] of [
      ["oncology", "The company develops cancer therapies."],
      ["other-team", "[Diagnostics] The team studies human FFPE biopsies."],
    ]) {
      row.research_packet.qualificationEvidence.categories.workflows.push({ ...base, evidenceId, claim, basisFacts: [claim], assessmentType: "PROGRAM" });
      row.assessment.evidenceReviews.push({ evidenceId, verdict: "ENTAILED", quote: claim, reason: "Directly stated." });
    }
    const version = hashPacket(row.research_packet);
    row.evidence_version = row.assessment.evidenceVersion = row.review.evidenceVersion = version;
    const authority = planSequence(row, settings);
    for (const p of authority.plan) {
      expect(p.evidenceIds).toContain("oncology");
      expect(p.evidenceIds).toContain("public-research");
      expect(p.evidenceIds).not.toContain("other-team");
    }
    expect(authority.evidence.some(e => e.evidenceId === "other-team")).toBe(false);
    for (const stage of ["WRITING", "VALIDATING"] as const) {
      const input = JSON.parse(sequenceModelRequest(stage, authority).input);
      expect(input.assignments[0].availableCapabilityIds).toContain("cosmx-multiomics");
      expect(input.availableCapabilities.every((c: any) => c.instrument === "CosMx")).toBe(true);
    }
  });

  it("supplies all nine reference touches only to the writer, never as factual authority", () => {
    const { authority, touches } = sequenceFixture();
    const original = JSON.stringify(authority);
    const writer = sequenceModelRequest("WRITING", authority);
    const input = JSON.parse(writer.input);
    expect(input.referenceExample.touches.map((t: any) => t.touchId)).toEqual([...touchIds]);
    expect(input.referenceExample.touches).toEqual(EARLI_WRITER_REFERENCE.touches);
    expect(JSON.stringify(input.evidence)).not.toContain("Earli");
    expect(writer.instructions).toContain("NOT evidence or product authority");
    expect(JSON.parse(sequenceModelRequest("VALIDATING", authority, touches).input).referenceExample).toBeUndefined();
    expect(JSON.stringify(authority)).toBe(original);
    expect(Buffer.byteLength(JSON.stringify(writer))).toBeLessThan(64000);
  });

  it("keeps style advisory and unsupported claims blocking, even in the same touch", () => {
    const { authority, touches, review } = sequenceFixture();
    const findings = checkSemantic({ reviews: review.reviews.map((r, i) => ({
      ...r, violations: i ? [] : [
        { ruleId: "VOICE", rejectedSpan: touches[0].middle, message: "Repeated opening", nextAction: "Consider a different opening" },
        { ruleId: "UNSUPPORTED_COMPANY", rejectedSpan: touches[0].middle, message: "Invented finding", nextAction: "Remove the finding" },
      ],
    })) }, touches, authority);
    const split = partitionSequenceFindings(findings);
    expect(split.suggestions).toHaveLength(1);
    expect(split.violations.map(v => v.ruleId)).toEqual(["UNSUPPORTED_COMPANY"]);
    expect(partitionSequenceFindings(split.suggestions).violations).toEqual([]);
  });

  it("runs the complete reference through deterministic checks and retains every travel block", () => {
    const { authority } = sequenceFixture();
    // Synthetic authority for structural testing, not verification of Earli facts.
    authority.evidence = [{ evidenceId: "example", claim: "Example presentation in 2026; earlier historical role.", provenanceType: "PUBLIC_SOURCE" }];
    authority.plan.forEach(p => { p.evidenceIds = ["example"]; });
    authority.settings = {
      ...settings, meetingMode: "IN_PERSON",
      trip1: [{ date: "2026-11-02", start: "10:00", end: "16:00" }, { date: "2026-11-03", start: "10:00", end: "13:00" }],
      trip2: [{ date: "2026-11-16", start: "10:00", end: "16:00" }, { date: "2026-11-17", start: "10:00", end: "13:00" }],
    };
    const checked = checkDraft({ touches: EARLI_WRITER_REFERENCE.touches }, authority);
    expect(checked.violations).toEqual([]);
    const rendered = renderSequence(checked.touches, authority);
    for (const touch of rendered.filter(t => t.touchId !== "liConnect")) {
      expect(touch.body).toContain("10 AM–4 PM");
      expect(touch.body).toContain("10 AM–1 PM");
      expect(touch.body).toContain(touchIds.indexOf(touch.touchId) < 5 ? "November 2, 2026" : "November 16, 2026");
    }
  });

  it.each(["Unknown tissue access", "Mouse xenografts", "Human FFPE availability is unknown"])("declines a human-specific resource for %s", claim => {
    const { authority } = sequenceFixture();
    authority.evidence.forEach(e => { e.claim = claim; });
    const matched = attachSequenceAssets(authority, [{
      id: "human-brochure", revision: 1, instrument: "CosMx",
      fileName: "human-ffpe.pdf", researchArea: "Unknown",
      displayName: "Human FFPE assay brochure", assetType: "Panels and Brochures",
      description: "Single-cell spatial RNA in human FFPE tissue.", keywords: ["single-cell RNA"],
    }]);
    expect(matched.assets).toEqual([]);
    expect(emailResourceLink(matched, "email1")).toContain("[CosMx overview]");
    expect(emailResourceLink(matched, "email1")).not.toContain("whole-transcriptome-panel");
  });
});
