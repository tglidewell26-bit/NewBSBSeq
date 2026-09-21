import { describe, it, expect } from "vitest";
import { touchIds, type OutreachSettings } from "@workspace/api-zod";
import { assessmentFixture } from "./assessment-fixture";
import { validateModelAssessment } from "../src/lib/live-assessment";
import { hashPacket, normalizeEvidence } from "../src/lib/bsb-v2";
import {
  validateSettings,
  planSequence,
  checkDraft,
  checkSemantic,
  renderSequence,
  sequenceModelRequest,
} from "../src/lib/sequences";

import { settings, sequenceFixture } from "./sequence-fixture";
describe("sequence authority and fixed copy", () => {
  it.each([
    "Tim’s perspective on fit would be valuable.",
    "Tim's guidance would help determine the next step.",
    "Tim could advise your team.",
    "Please contact Tim about the workflow.",
    "Tim Glidewell recommends this approach.",
  ])("blocks third-person sender language: %s", (middle) => {
    const { authority, touches } = sequenceFixture();
    touches[0].middle = middle;
    expect(
      checkDraft({ touches }, authority).violations.some(
        (v) => v.ruleId === "SENDER_VOICE",
      ),
    ).toBe(true);
  });
  it("allows first-person suggestions and does not mistake a TIM-3 marker for the sender", () => {
    const { authority, touches } = sequenceFixture();
    touches[0].middle =
      "I thought this could be relevant to your tissue research.";
    expect(checkDraft({ touches }, authority).violations).toEqual([]);
    touches[0].middle = "TIM-3 is the marker discussed in this research.";
    expect(
      checkDraft({ touches }, authority).violations.some(
        (v) => v.ruleId === "SENDER_VOICE",
      ),
    ).toBe(false);
  });
  it("requires explicit permission when only account-confirmed outreach evidence is available", () => {
    const { row } = sequenceFixture();
    row.assessment.instruments[1].evidenceIds = ["account-workflow"];
    expect(() => planSequence(row, settings)).toThrow(/explicitly allow/);
    expect(
      planSequence(row, { ...settings, allowAccountFacts: true }).evidence[0]
        .provenanceType,
    ).toBe("CONFIRMED_ACCOUNT");
  });
  it("keeps two separately supported instruments in their assigned touches", () => {
    const f = assessmentFixture();
    const protein = {
      ...f.packet.qualificationEvidence.categories.workflows[1],
      evidenceId: "protein",
      claim:
        "The lab develops antibody-drug conjugates and characterizes tissue protein targets in patient biopsies.",
      basisFacts: [
        "The lab develops antibody-drug conjugates and characterizes tissue protein targets in patient biopsies.",
      ],
    };
    f.packet.qualificationEvidence.categories.workflows.push(protein);
    f.model.evidenceReviews.push({
      evidenceId: "protein",
      verdict: "ENTAILED",
      quote: protein.claim,
      reason: "The excerpt supports tissue protein characterization.",
    });
    f.model.instruments[0] = {
      ...f.model.instruments[0],
      fit: "STRONG_FIT",
      evidenceIds: ["protein"],
      ruleIds: ["CELL-ANTIBODY-BIOLOGY"],
      recommendation: "Separate tissue protein characterization need.",
    };
    f.model.selectedInstruments = ["CosMx", "CellScape"];
    f.model.selectionReason =
      "Separate spatial RNA and tissue protein needs support both instruments.";
    const version = hashPacket(f.packet);
    const { row } = sequenceFixture();
    row.research_packet = f.packet;
    row.evidence_version = version;
    row.assessment = validateModelAssessment(
      f.model,
      normalizeEvidence(f.packet).normalized,
      version,
    );
    row.review.evidenceVersion = version;
    row.review.approvedInstruments = ["CosMx", "CellScape"];
    const a = planSequence(row, settings);
    expect(a.plan.map((p) => p.instrument)).toEqual([
      "CosMx",
      "CosMx",
      "CosMx",
      "CosMx",
      "CellScape",
      "CellScape",
      "CosMx",
      null,
    ]);
    expect(a.plan[4].evidenceIds).toEqual(["protein"]);
    expect(
      a.capabilities.find((c) => c.id === a.plan[4].capabilityId)?.instrument,
    ).toBe("CellScape");
  });
  it("plans exactly eight touches from approved, permitted evidence", () => {
    const { authority, row } = sequenceFixture();
    expect(authority.plan.map((p) => p.touchId)).toEqual(touchIds);
    expect(authority.evidence.map((e) => e.evidenceId)).toEqual([
      "public-research",
    ]);
    expect(authority.plan.every((p) => p.assetIds.length === 0)).toBe(true);
    expect(
      planSequence(row, { ...settings, allowAccountFacts: true }).evidence.some(
        (e) => e.provenanceType === "CONFIRMED_ACCOUNT",
      ),
    ).toBe(true);
  });
  it("blocks unapproved, mock, and stale assessments", () => {
    for (const change of [
      (r: any) => (r.stage = "ASSESSED"),
      (r: any) => (r.assessment.mock = true),
      (r: any) => (r.research_packet.brief += " changed"),
      (r: any) => (r.review.approvedInstruments = ["GeoMx"]),
    ]) {
      const { row } = sequenceFixture();
      change(row);
      expect(() => planSequence(row, settings)).toThrow();
    }
  });
  it("renders names, questions, signoffs and links without model control", () => {
    const { touches, authority } = sequenceFixture();
    expect(checkDraft({ touches }, authority).violations).toEqual([]);
    const rendered = renderSequence(touches, authority);
    expect(rendered[0].body).toMatch(
      /^Hello \{\{first_name\}\},\n\nMy name is Tim Glidewell/,
    );
    expect(
      rendered
        .filter((t) => t.touchId.startsWith("email"))
        .every((t) => t.body.endsWith("Best regards,\nTim Glidewell")),
    ).toBe(true);
    expect(
      rendered
        .filter((t) => t.touchId !== "liConnect")
        .every((t) => (t.body.match(/\?/g) ?? []).length === 1),
    ).toBe(true);
    authority.settings = { ...settings, mode: "INDIVIDUAL", firstName: "Alex" };
    expect(renderSequence(touches, authority)[0].body).toMatch(/^Hello Alex,/);
  });
  it.each([7, 31])(
    "keeps LinkedIn connection copy short with %i travel days",
    (count) => {
      const { touches, authority } = sequenceFixture();
      authority.settings = validateSettings({
        ...settings,
        meetingMode: "IN_PERSON",
        trip1: Array.from({ length: count }, (_, i) => ({
          date: `2099-10-${String(i + 1).padStart(2, "0")}`,
          start: "10:00",
          end: "16:00",
        })),
      });
      const rendered = renderSequence(touches, authority);
      const connection = rendered.find((t) => t.touchId === "liConnect")!;
      expect(connection.body.length).toBeLessThanOrEqual(300);
      expect(connection.body).not.toContain("2099");
      expect(rendered[0].body).toContain(`October ${count}, 2099`);
      expect(checkDraft({ touches }, authority).violations).toEqual([]);
      expect(() =>
        sequenceModelRequest("VALIDATING", authority, touches),
      ).not.toThrow();
    },
  );
  it("uses second-trip missed-you language only in email5", () => {
    const { touches, authority } = sequenceFixture();
    authority.settings = validateSettings({
      ...settings,
      meetingMode: "IN_PERSON",
      trip1: [{ date: "2099-04-06", start: "09:00", end: "12:00" }],
      trip2: [{ date: "2099-05-06", start: "10:00", end: "14:00" }],
    });
    const rendered = renderSequence(touches, authority);
    expect(rendered[6].body).not.toContain("Sorry I missed");
    expect(rendered[6].body).toContain("April 6, 2099");
    expect(rendered[7].body).toContain("Sorry I missed you last time.");
    expect(rendered[7].body).toContain("May 6, 2099");
    expect(rendered[7].body).not.toContain("April 6, 2099");
    expect(rendered[0].body).toContain("America/Los_Angeles");
  });
  it.each([
    { timezone: "No/SuchZone" },
    { mode: "INDIVIDUAL", firstName: "" },
    { mode: "GENERAL", firstName: "Alex" },
    { meetingMode: "IN_PERSON", trip1: [] },
    {
      meetingMode: "IN_PERSON",
      trip1: [{ date: "2099-02-30", start: "09:00", end: "10:00" }],
    },
    {
      meetingMode: "IN_PERSON",
      trip1: [{ date: "2000-01-01", start: "09:00", end: "10:00" }],
    },
    {
      meetingMode: "IN_PERSON",
      trip1: [{ date: "2099-01-01", start: "11:00", end: "10:00" }],
    },
    {
      meetingMode: "IN_PERSON",
      trip1: [
        { date: "2099-01-01", start: "09:00", end: "11:00" },
        { date: "2099-01-01", start: "10:00", end: "12:00" },
      ],
    },
  ])("rejects invalid meeting settings before calling a model: %j", (changes) =>
    expect(() => validateSettings({ ...settings, ...changes })).toThrow(),
  );
  it.each([
    "GeoMx has 99 proteins.",
    "CosMx guarantees cures.",
    "When can we meet?",
    "Read https://example.org.",
    "Hello {{first_name}}!",
    "This is cutting-edge.",
  ])("blocks unsafe/locked writer output: %s", (middle) => {
    const { touches, authority } = sequenceFixture();
    touches[0].middle = middle;
    expect(
      checkDraft({ touches }, authority).violations.length,
    ).toBeGreaterThan(0);
  });
  it("rejects incorrect order and unreadable outputs", () => {
    const { touches, authority } = sequenceFixture();
    touches.reverse();
    expect(
      checkDraft({ touches }, authority).violations.some(
        (v) => v.ruleId === "TOUCH_ORDER",
      ),
    ).toBe(true);
    expect(() => checkDraft({ touches: [] }, authority)).toThrow();
  });
  it("requires independent review coverage and an exact rejected span", () => {
    const { touches, authority, review } = sequenceFixture();
    expect(checkSemantic(review, touches, authority)).toEqual([]);
    expect(() =>
      checkSemantic({ approved: true }, touches, authority),
    ).toThrow();
    review.reviews[7] = review.reviews[0];
    expect(() => checkSemantic(review, touches, authority)).toThrow();
    const r = sequenceFixture().review as any;
    r.reviews[0].violations = [
      {
        ruleId: "UNSUPPORTED_COMPANY",
        rejectedSpan: "not in copy",
        message: "Bad",
        nextAction: "Remove",
      },
    ];
    expect(() => checkSemantic(r, touches, authority)).toThrow();
  });
  it("gives the writer only scoped authority and sends strict JSON schemas", () => {
    const { authority, touches } = sequenceFixture();
    const write = sequenceModelRequest("WRITING", authority);
    expect(write.text.format.strict).toBe(true);
    expect(write.input).not.toContain("account-workflow");
    const review = sequenceModelRequest("VALIDATING", authority, touches);
    expect(review.input).toContain(
      "Would you be available for a short virtual meeting?",
    );
  });
});
