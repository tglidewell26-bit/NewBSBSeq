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
  it.each([
    "TIM is implicated in this pathway.",
    "TIM can serve as a marker.",
    "TIM's expression is discussed in the research.",
    "TIM’s expression is discussed in the research.",
  ])(
    "does not classify a TIM biomarker reference as sender voice: %s",
    (middle) => {
      const { authority, touches } = sequenceFixture();
      touches[0].middle = middle;
      expect(
        checkDraft({ touches }, authority).violations.some(
          (v) => v.ruleId === "SENDER_VOICE",
        ),
      ).toBe(false);
    },
  );
  it("reviews generated copy without sending fixed trip copy to the model", () => {
    const { authority, touches } = sequenceFixture();
    authority.settings = validateSettings({
      ...settings,
      meetingMode: "IN_PERSON",
      trip1: [{ date: "2099-04-06", start: "09:00", end: "12:00" }],
      trip2: [{ date: "2099-05-06", start: "10:00", end: "14:00" }],
    });
    touches[5].middle = "Tim can revisit the spatial biology angle around that work.";
    const request = sequenceModelRequest("VALIDATING", authority, touches);
    const close = JSON.parse(request.input).touches[5];
    expect(close).not.toHaveProperty("applicationCopy");
    expect(close).not.toHaveProperty("body");
    expect(request.input).not.toContain("Sorry I missed you last time.");
    expect(request.input).not.toContain("2099-05-06");
    expect(close.middle).toBe(touches[5].middle);
    expect(renderSequence(touches, authority)[5].body).toContain("Sorry I missed you last time.");
    expect(checkDraft({ touches }, authority).violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ touchId: "email4", ruleId: "SENDER_VOICE" })]),
    );
    touches[5].middle = "Sorry I missed you last time.";
    expect(checkDraft({ touches }, authority).violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ touchId: "email4", ruleId: "FIXED_COPY" })]),
    );
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
      "CosMx",
      "CosMx",
      "CellScape",
      "CosMx",
    ]);
    expect(a.plan[4].evidenceIds).toEqual(["protein"]);
    expect(
      a.capabilities.find((c) => c.id === a.plan[4].capabilityId)?.instrument,
    ).toBe("CellScape");
  });
  it("plans exactly nine touches from approved, permitted evidence", () => {
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
  it("assigns distinct features and uses grounded questions when research runs out", () => {
    const { authority } = sequenceFixture();
    const substantive = authority.plan.filter(p => p.touchId !== "liConnect");
    expect(new Set(substantive.map(p => p.capabilityId)).size).toBe(8);
    expect(substantive.every(p => p.capabilityId)).toBe(true);
    expect(substantive.slice(1).every(p => p.purpose.includes("No unused research facts remain"))).toBe(true);
    const writer = sequenceModelRequest("WRITING", authority).instructions;
    expect(writer).toContain("Scientific".toLowerCase());
    expect(writer).toContain("Questions about research or interest are allowed");
    expect(sequenceModelRequest("VALIDATING", authority, []).instructions).toContain("repeated research hooks");
  });
  it("uses reviewed research beyond the instrument fit references", () => {
    const { row } = sequenceFixture();
    const item = { ...row.research_packet.qualificationEvidence.categories.workflows[1],
      evidenceId: "additional-research", assessmentType: "PROGRAM" as const,
      claim: "The company is developing an oncology research program.",
      basisFacts: ["The company is developing an oncology research program."],
    };
    row.research_packet.qualificationEvidence.categories.workflows.push(item);
    row.assessment.evidenceReviews.push({ evidenceId: item.evidenceId, verdict: "ENTAILED", quote: item.claim, reason: "Directly stated." });
    const version = hashPacket(row.research_packet);
    row.evidence_version = version;
    row.assessment.evidenceVersion = version;
    row.review.evidenceVersion = version;
    const authority = planSequence(row, settings);
    expect(authority.plan[0].evidenceIds).toEqual(["public-research"]);
    expect(authority.plan[1].evidenceIds).toEqual(["additional-research"]);
    expect(authority.evidence.some(e => e.evidenceId === item.evidenceId)).toBe(true);
  });
  it("allows genuine questions but rejects scheduling and unwanted sales language", () => {
    const { authority, touches } = sequenceFixture();
    for (const middle of ["Have you heard of spatial biology?", "Is this of interest to you?", "From your published description, my understanding is that you integrate RNA with tissue morphology. Am I understanding that correctly?"]) {
      touches[0].middle = middle;
      expect(checkDraft({ touches }, authority).violations).toEqual([]);
    }
    for (const middle of ["Does it make sense to connect?", "Let’s partner.", "Do you have 15 min to chat?", "When can we meet?"]) {
      touches[0].middle = middle;
      expect(checkDraft({ touches }, authority).violations.length).toBeGreaterThan(0);
    }
  });
  it("keeps evidence checks active for claims phrased as requests for correction", () => {
    const { authority, touches } = sequenceFixture();
    touches[0].middle = "My understanding is that you studied 999 patients. Did I get that right?";
    expect(checkDraft({ touches }, authority).violations.some(v => v.ruleId === "UNSUPPORTED_NUMBER")).toBe(true);
    for (const stage of ["WRITING", "VALIDATING"] as const) {
      const request = sequenceModelRequest(stage, authority, touches);
      expect(request.instructions).toContain("briefly explain your understanding");
      expect(request.instructions).toContain("Asking for confirmation does not make a speculative mechanism, regulatory milestone, or outcome acceptable");
      expect(request.instructions).toContain("Judge questions by the same evidence standard as statements");
    }
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
  it("renders role introductions and meeting requests without names or signatures", () => {
    const { touches, authority } = sequenceFixture();
    expect(checkDraft({ touches }, authority).violations).toEqual([]);
    const rendered = renderSequence(touches, authority);
    expect(rendered[0].body).toMatch(
      /^Hello \{\{first_name\}\},\n\nI’m your Spatial Regional Account Manager/,
    );
    expect(
      rendered
        .filter((t) => t.touchId.startsWith("email"))
        .every((t) => !/Tim Glidewell|Best regards|\]\([^)]*\) \|/.test(t.body)),
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
  it("starts the second trip at email4 and keeps all later touches on that trip", () => {
    const { touches, authority } = sequenceFixture();
    authority.settings = validateSettings({ ...settings, meetingMode: "IN_PERSON",
      trip1: [{ date: "2099-04-06", start: "09:00", end: "12:00" }],
      trip2: [{ date: "2099-05-06", start: "10:00", end: "14:00" }],
    });
    const rendered = renderSequence(touches, authority);
    expect(rendered.map(t => t.touchId)).toEqual(["email1", "email2", "liConnect", "liMsg1", "email3", "email4", "email5", "liMsg2", "email6"]);
    for (const t of rendered) {
      if (t.touchId === "liConnect") {
        expect(t.body).not.toContain("2099");
      } else {
        const second = ["email4", "email5", "liMsg2", "email6"].includes(t.touchId);
        expect(t.body).toContain(second ? "May 6, 2099" : "April 6, 2099");
        expect(t.body).not.toContain(second ? "April 6, 2099" : "May 6, 2099");
      }
      expect(t.body.includes("Sorry I missed you last time.")).toBe(t.touchId === "email4");
    }
    authority.settings = settings;
    expect(renderSequence(touches, authority).every(t => !t.body.includes("Sorry I missed"))).toBe(true);
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
  it("sends a large shared evidence claim once rather than once per touch", () => {
    const { authority } = sequenceFixture();
    const claim = "Shared evidence " + "x".repeat(8000);
    authority.evidence = [{ ...authority.evidence[0], claim }];
    for (const p of authority.plan) p.evidenceIds = [authority.evidence[0].evidenceId];
    const request = sequenceModelRequest("WRITING", authority);
    expect(request.input.split(claim)).toHaveLength(2);
    expect(JSON.parse(request.input).evidence).toEqual(authority.evidence);
  });
  it("gives the writer only scoped authority and sends strict JSON schemas", () => {
    const { authority, touches } = sequenceFixture();
    const write = sequenceModelRequest("WRITING", authority);
    expect(write.text.format.strict).toBe(true);
    expect(write.input).not.toContain("account-workflow");
    const review = sequenceModelRequest("VALIDATING", authority, touches);
    expect(review.input).not.toContain("Would you be available for a short virtual meeting?");
    const { assignments } = JSON.parse(write.input);
    for (const assignment of assignments) {
      const plan = authority.plan.find((p) => p.touchId === assignment.touchId)!;
      expect(assignment.evidenceIds).toEqual(plan.evidenceIds);
      expect(assignment.capability).toEqual(authority.capabilities.find((c) => c.id === plan.capabilityId) ?? null);
    }
    expect(JSON.parse(review.input).assignments).toEqual(assignments);
  });
});
