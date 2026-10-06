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
  allowedSourceAttributions,
  rankResearchEvidence,
  researchCapability,
} from "../src/lib/sequences";

import { emailCapabilities } from "../src/lib/sequence-catalog";
import { settings, sequenceFixture } from "./sequence-fixture";
describe("sequence authority and fixed copy", () => {
  it("prioritizes biology and source diversity over multiple facts from one closed role", () => {
    const samples = { evidenceId: "a", claim: "Closed role: mouse tissue processing", assessmentType: "WORKFLOW", sourceUrl: "https://example.org/jobs/1" };
    const rna = { ...samples, evidenceId: "b", claim: "Closed role: RNA extraction" };
    const program = { evidenceId: "c", claim: "Develops immune cytokine payloads", assessmentType: "CAPABILITY", sourceUrl: "https://example.org/science" };
    expect(rankResearchEvidence([samples, rna, program], new Set())[0]).toBe(program);
    expect(rankResearchEvidence([samples, rna, program], new Set(["https://example.org/jobs/1"]))[0]).toBe(program);
  });

  it("does not force segmentation or mouse custom panels for unrelated methods", () => {
    const used = new Map([["cosmx-rna", 20], ["cosmx-neighborhoods", 20], ["cosmx-informatics", 20]]);
    expect(researchCapability("CosMx", "ELISA and multicolor FACS in mouse xenografts", used)?.id).not.toMatch(/segmentation|targeted|multiomics/);
    expect(researchCapability("CosMx", "Human custom targeted panel", used)?.id).toBe("cosmx-targeted-panels");
  });

  it("blocks repeated job introductions and lost historical context, including LinkedIn", () => {
    const { authority, touches } = sequenceFixture();
    authority.evidence[0].claim = "Closed historical role describes RNA extraction.";
    touches[0].middle = "I saw your job posting for a Scientist, which made me think about RNA.";
    expect(checkDraft({ touches }, authority).violations.some(v => v.ruleId === "SOURCE_ATTRIBUTION" && v.message.includes("historical"))).toBe(true);
    touches[0].middle = "I saw your earlier job posting for a Scientist, which made me think about RNA.";
    touches[1].middle = touches[0].middle;
    expect(checkDraft({ touches }, authority).violations.some(v => v.touchId === "email2" && v.message.includes("already introduced"))).toBe(true);
    touches[3].middle = "I saw your job posting for a Scientist.";
    expect(checkDraft({ touches }, authority).violations.some(v => v.touchId === "liMsg1" && v.message.includes("historical"))).toBe(true);
    for (const stage of ["WRITING", "VALIDATING"] as const) {
      const req = sequenceModelRequest(stage, authority, touches);
      const assignments = JSON.parse(req.input).assignments;
      expect(assignments[1].sourceAttribution[0]).toMatchObject({ alreadyIntroduced: true, historical: true, allowedWording: [] });
      expect(req.instructions).toContain("without assay-specific support");
    }
  });
  it("carries the real source title across same-URL dossier facts without importing extra facts", () => {
    const fact = { evidenceId: "fact", claim: "[Synthetic Unit] RNA extraction", sourceUrl: "https://example.org/jobs/1" };
    const source = { evidenceId: "source", claim: "Job posting: Research Associate (Synthetic Unit; posted 2026-09-01) — RT-qPCR", sourceUrl: fact.sourceUrl };
    expect(allowedSourceAttributions(fact, [source])[0]).toContain("Research Associate");
    expect(allowedSourceAttributions(fact, [{ ...source, sourceUrl: "https://example.org/jobs/2" }])[0]).not.toContain("Research Associate");
    const publication = { evidenceId: "pub", claim: "Publication/presentation: Synthetic cell states (Synthetic Unit; AACR; 2026) — RNA-seq", sourceUrl: "https://example.org/abstract" };
    expect(allowedSourceAttributions(publication).join(" ")).toContain("at AACR");
    expect(allowedSourceAttributions(publication).join(" ")).not.toContain("at Synthetic Unit");
  });

  it.each(["The listed work spans mouse tissues.", "The reported RNA extraction raises a question.", "Your documented methods include FACS."])("rejects vague provenance: %s", middle => {
    const { authority, touches } = sequenceFixture();
    touches[0].middle = middle;
    expect(checkDraft({ touches }, authority).violations.some(v => v.ruleId === "SOURCE_ATTRIBUTION")).toBe(true);
  });

  it("uses species-neutral RNA claims and supplies research-scope rules to both models", () => {
    const { authority, touches } = sequenceFixture();
    const cap = authority.capabilities.find(c => c.id === "cosmx-rna")!;
    expect(cap.claim).not.toMatch(/19,000|human|whole-transcriptome/);
    expect(cap.claim).toContain("single-cell");
    for (const stage of ["WRITING", "VALIDATING"] as const) {
      const request = sequenceModelRequest(stage, authority, touches);
      expect(request.instructions).toContain("never borrow human context from another unit");
      expect(request.instructions).toContain("Never combine separate sources");
      expect(request.instructions).toContain("not as eliminating assumptions");
      expect(request.instructions).toContain("individual cells, cell states and cellular neighborhoods");
    }
  });
  it("provides only the approved source wording when metadata supports it", () => {
    expect(allowedSourceAttributions({ evidenceId: "j", claim: "Job posting: Senior Scientist (Therapeutics; posted 2026-09-01) — RNA-seq", sourceUrl: "https://example.com/jobs/1" }))
      .toEqual(["I saw your job posting for a Senior Scientist, which made me think..."]);
    expect(allowedSourceAttributions({ evidenceId: "p", claim: "Publication/presentation: Spatial Tumor States (AACR; 2026) — Methods/platforms named: RNA-seq", sourceUrl: "https://doi.org/example" }))
      .toEqual([
        "I read in your publication “Spatial Tumor States” that...",
        "I read about your recent poster/presentation at AACR...",
      ]);
    expect(allowedSourceAttributions({ evidenceId: "n", claim: "Program update", sourceUrl: "https://example.com/news/program" }))
      .toEqual(["I read on your news page that..."]);
    expect(allowedSourceAttributions({ evidenceId: "s", claim: "Program update", sourceUrl: "https://linkedin.com/posts/example" }))
      .toEqual(["I read your recent post on LinkedIn..."]);
    expect(allowedSourceAttributions({ evidenceId: "u", claim: "Unattributed account fact", sourceUrl: null }))
      .toEqual([]);
  });

  it("rejects invented source labels but permits the approved flexible wording", () => {
    const { authority, touches } = sequenceFixture();
    touches[0].middle = "The Therapeutics posting suggests your group is expanding its RNA work.";
    expect(checkDraft({ touches }, authority).violations.some(v => v.ruleId === "SOURCE_ATTRIBUTION")).toBe(true);
    touches[0].middle = "I saw your recent job posting for a Senior Scientist, which made me think your RNA work may be expanding.";
    expect(checkDraft({ touches }, authority).violations.some(v => v.ruleId === "SOURCE_ATTRIBUTION")).toBe(false);
    touches[0].middle = "I read on your website that your group studies tumor biology.";
    expect(checkDraft({ touches }, authority).violations.some(v => v.ruleId === "SOURCE_ATTRIBUTION")).toBe(false);
  });

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
    touches[5].middle =
      "Tim can revisit the spatial biology angle around that work.";
    const request = sequenceModelRequest("VALIDATING", authority, touches);
    const close = JSON.parse(request.input).touches[5];
    expect(close).not.toHaveProperty("applicationCopy");
    expect(close).not.toHaveProperty("body");
    expect(request.input).not.toContain("Sorry I missed you last time.");
    expect(request.input).not.toContain("2099-05-06");
    expect(close.middle).toBe(touches[5].middle);
    expect(renderSequence(touches, authority)[5].body).toContain(
      "Sorry I missed you last time.",
    );
    expect(checkDraft({ touches }, authority).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ touchId: "email4", ruleId: "SENDER_VOICE" }),
      ]),
    );
    touches[5].middle = "Sorry I missed you last time.";
    expect(checkDraft({ touches }, authority).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ touchId: "email4", ruleId: "FIXED_COPY" }),
      ]),
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
  it("keeps connection closings and sequence commentary in the fixed template", () => {
    const { authority, touches } = sequenceFixture();
    touches[2].middle = "Interested in CX-2051. Glad to connect.";
    expect(checkDraft({ touches }, authority).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "FORBIDDEN_CLAIM_OR_VOICE" }),
      ]),
    );
    touches[2].middle = "Interested in CX-2051.";
    touches[8].middle = "One last research angle is image analysis.";
    expect(checkDraft({ touches }, authority).violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "FORBIDDEN_CLAIM_OR_VOICE" }),
      ]),
    );
    const instructions = sequenceModelRequest(
      "WRITING",
      authority,
    ).instructions;
    expect(instructions).toContain("The app supplies the greeting");
    const connection = renderSequence(touches, authority).find(t => t.touchId === "liConnect")!;
    expect(connection.body).toContain("I’m with Bruker Spatial Biology");
    expect(connection.body).toContain("discuss how spatial biology could help your research");
    expect(connection.body).not.toContain("CX-2051");
    expect(instructions).toContain("Avoid comments about sequence order");
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
  it("keeps later touches grounded when only one research fact is available", () => {
    const { authority } = sequenceFixture();
    const substantive = authority.plan.filter(p => p.touchId !== "liConnect");
    expect(new Set(substantive.map(p => p.capabilityId)).size).toBeLessThan(8);
    expect(substantive.every(p => p.capabilityId)).toBe(true);
    expect(authority.plan.every(p => p.evidenceIds.includes("public-research"))).toBe(true);
    expect(authority.evidence).toHaveLength(1);
    const emails = authority.plan.filter(p => p.touchId.startsWith("email"));
    expect(emails.every(p => !["cosmx-segmentation", "cosmx-targeted-panels", "cosmx-multiomics"].includes(p.capabilityId!))).toBe(true);
    expect(authority.plan.find(p => p.touchId === "liMsg1")?.capabilityId).toBe(emails[0].capabilityId);
    expect(authority.plan.find(p => p.touchId === "liMsg2")?.capabilityId).toBe(emails[3].capabilityId);
  });
  it.each(["GeoMx", "CosMx", "CellScape"])("provides six distinct email features for %s", instrument => {
    const options = emailCapabilities(instrument, "Drug development");
    expect(options).toHaveLength(6);
    expect(new Set(options.map(c => c.id)).size).toBe(6);
    expect(options.every(c => c.instrument === instrument)).toBe(true);
  });
  it("substitutes specialist features only when the company context supports them", () => {
    expect(emailCapabilities("GeoMx", "HBV and HDV liver programs").map(c => c.id)).not.toContain("geomx-tma");
    expect(emailCapabilities("GeoMx", "Tissue microarrays of paired biopsies").map(c => c.id)).toContain("geomx-tma");
    expect(emailCapabilities("GeoMx", "Tissue microarrays of paired biopsies")).toHaveLength(6);
  });
  it("reserves fresh research for all six emails while LinkedIn reuses context", () => {
    const { row } = sequenceFixture();
    for (const [evidenceId, claim] of [
      ["second-topic", "The company reported a second research topic."],
      ["connection-topic", "The company reported a third research topic."],
      ["fourth-topic", "A fourth distinct program."],
      ["fifth-topic", "A fifth distinct program."],
      ["sixth-topic", "A sixth distinct program."],
    ]) {
      const item = {
        ...row.research_packet.qualificationEvidence.categories.workflows[1],
        evidenceId,
        assessmentType: "PROGRAM" as const,
        claim,
        basisFacts: [claim],
      };
      row.research_packet.qualificationEvidence.categories.workflows.push(item);
      row.assessment.evidenceReviews.push({
        evidenceId,
        verdict: "ENTAILED",
        quote: claim,
        reason: "Directly stated.",
      });
    }
    const version = hashPacket(row.research_packet);
    row.evidence_version = version;
    row.assessment.evidenceVersion = version;
    row.review.evidenceVersion = version;
    const authority = planSequence(row, settings);
    const emails = authority.plan.filter(p => p.touchId.startsWith("email"));
    expect(emails.map(p => p.evidenceIds[0]).sort()).toEqual([
      "public-research", "second-topic", "connection-topic", "fourth-topic", "fifth-topic", "sixth-topic",
    ].sort());
    expect(authority.plan.find(p => p.touchId === "liMsg1")?.evidenceIds).toEqual(emails[0].evidenceIds);
    expect(authority.plan.find(p => p.touchId === "liMsg2")?.evidenceIds).toEqual(emails[3].evidenceIds);
  });
  it("keeps proposed applications conditional without forcing workflow screening", () => {
    const { authority } = sequenceFixture();
    const instructions = sequenceModelRequest(
      "WRITING",
      authority,
    ).instructions;
    expect(instructions).toContain("do not call it “your workflow”");
    expect(instructions).toContain(
      "keep proposed applications conditional",
    );
    expect(instructions).not.toContain("First ask whether");
  });
  it("uses reviewed research beyond the instrument fit references", () => {
    const { row } = sequenceFixture();
    const item = {
      ...row.research_packet.qualificationEvidence.categories.workflows[1],
      evidenceId: "additional-research",
      assessmentType: "PROGRAM" as const,
      claim: "The company is developing an oncology research program.",
      basisFacts: ["The company is developing an oncology research program."],
    };
    row.research_packet.qualificationEvidence.categories.workflows.push(item);
    row.assessment.evidenceReviews.push({
      evidenceId: item.evidenceId,
      verdict: "ENTAILED",
      quote: item.claim,
      reason: "Directly stated.",
    });
    const version = hashPacket(row.research_packet);
    row.evidence_version = version;
    row.assessment.evidenceVersion = version;
    row.review.evidenceVersion = version;
    const authority = planSequence(row, settings);
    expect(new Set(authority.plan.slice(0, 2).flatMap(p => p.evidenceIds))).toEqual(new Set(["public-research", "additional-research"]));
    expect(authority.plan[3].evidenceIds.length).toBeGreaterThan(0);
    expect(
      authority.evidence.some((e) => e.evidenceId === item.evidenceId),
    ).toBe(true);
  });
  it("allows genuine questions but rejects scheduling and unwanted sales language", () => {
    const { authority, touches } = sequenceFixture();
    for (const middle of [
      "Have you heard of spatial biology?",
      "Is this of interest to you?",
      "From your published description, my understanding is that you integrate RNA with tissue morphology. Am I understanding that correctly?",
    ]) {
      touches[0].middle = middle;
      expect(checkDraft({ touches }, authority).violations).toEqual([]);
    }
    for (const middle of [
      "Does it make sense to connect?",
      "Let’s partner.",
      "Do you have 15 min to chat?",
      "When can we meet?",
    ]) {
      touches[0].middle = middle;
      expect(
        checkDraft({ touches }, authority).violations.length,
      ).toBeGreaterThan(0);
    }
  });
  it("keeps evidence checks active for claims phrased as requests for correction", () => {
    const { authority, touches } = sequenceFixture();
    touches[0].middle =
      "My understanding is that you studied 999 patients. Did I get that right?";
    expect(
      checkDraft({ touches }, authority).violations.some(
        (v) => v.ruleId === "UNSUPPORTED_NUMBER",
      ),
    ).toBe(true);
    for (const stage of ["WRITING", "VALIDATING"] as const) {
      const request = sequenceModelRequest(stage, authority, touches);
      const input = JSON.parse(request.input);
      expect(request.instructions).toContain(
        "briefly paraphrase the prospect’s published description",
      );
      expect(request.instructions).toContain(
        "Factual presuppositions in questions require the same support as statements",
      );
      expect(request.instructions).toContain(
        "Prioritize different supported research facts across emails",
      );
      expect(request.instructions).toContain("Never say \"the Therapeutics posting\"");
      expect(input.assignments[0].sourceAttribution).toBeDefined();
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
  it("briefs Email 1 with a question and concrete instrument comparison", () => {
    const { authority } = sequenceFixture();
    const first = authority.plan[0];
    expect(first.purpose).toContain("direct question");
    expect(first.purpose).toContain("compare relevant samples or tissue regions");
    const request = sequenceModelRequest("WRITING", authority);
    expect(request.instructions).toContain("Email 1 should name the assigned instrument");
    expect(request.instructions).toContain("do not imply the prospect already has them");
    const review = sequenceModelRequest("VALIDATING", authority);
    expect(review.instructions).toContain("no concrete measurement or relevant comparison");
  });
  it("renders fixed role introductions and meeting requests without signatures", () => {
    const { touches, authority } = sequenceFixture();
    expect(checkDraft({ touches }, authority).violations).toEqual([]);
    const rendered = renderSequence(touches, authority);
    expect(rendered[0].body).toMatch(
      /^Hello \{\{first_name\}\},\n\nI'm Tim Glidewell, your Spatial Regional Account Manager/,
    );
    expect(
      rendered
        .filter((t) => t.touchId.startsWith("email"))
        .every(
          (t) => !/Best regards|\]\([^)]*\) \|/.test(t.body),
        ),
    ).toBe(true);
    expect(
      rendered
        .filter((t) => t.touchId !== "liConnect")
        .every((t) => (t.body.match(/\?/g) ?? []).length === 1),
    ).toBe(true);
    authority.settings = { ...settings, mode: "INDIVIDUAL", firstName: "Alex" };
    expect(renderSequence(touches, authority)[0].body).toMatch(/^Hello Alex,/);
  });
  it("excludes competitor research hooks and rejects names introduced by the writer", () => {
    const { row, touches, authority } = sequenceFixture();
    const competitorEvidence = {
      ...row.research_packet.qualificationEvidence.categories.workflows[1],
      evidenceId: "xenium-workflow",
      claim: "The company reported Xenium analysis of patient biopsies.",
      basisFacts: ["The company reported Xenium analysis of patient biopsies."],
    };
    row.research_packet.qualificationEvidence.categories.workflows.push(competitorEvidence);
    row.assessment.evidenceReviews.push({ evidenceId: "xenium-workflow", verdict: "ENTAILED", quote: competitorEvidence.claim, reason: "Directly stated." });
    const version = hashPacket(row.research_packet);
    row.evidence_version = version;
    row.assessment.evidenceVersion = version;
    row.review.evidenceVersion = version;
    expect(planSequence(row, settings).evidence.some(e => e.evidenceId === "xenium-workflow")).toBe(false);
    for (const name of ["Xenium", "CODEX", "Akoya", "10x", "Lunaphore", "COMET", "Miltenyi", "Maxima", "MIBI", "CellDive", "Vizgen", "MERSCOPE"]) {
      touches[1].middle = `I read about ${name}.`;
      expect(checkDraft({ touches }, authority).violations).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "COMPETITOR_MENTION" })]));
    }
  });
  it("adds Bruker context to NanoString references and scopes CellScape re-interrogation", () => {
    const { touches, authority } = sequenceFixture();
    touches[3].middle = "I read that CytomX reported NanoString analysis of paired tumor biopsies.";
    expect(renderSequence(touches, authority)[3].body).toContain("NanoString analysis of paired tumor biopsies. Did you know that NanoString is now part of Bruker Spatial Biology?");
    authority.plan[4].capabilityId = "cell-expand-panels";
    touches[4].middle = "CellScape can add markers to previously analyzed samples.";
    expect(checkDraft({ touches }, authority).violations).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "PLATFORM_SCOPE" })]));
    touches[4].middle = "CellScape can re-interrogate a slide previously analyzed on CellScape with compatible markers.";
    expect(checkDraft({ touches }, authority).violations.some(v => v.ruleId === "PLATFORM_SCOPE")).toBe(false);
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
    authority.settings = validateSettings({
      ...settings,
      meetingMode: "IN_PERSON",
      trip1: [{ date: "2099-04-06", start: "09:00", end: "12:00" }],
      trip2: [{ date: "2099-05-06", start: "10:00", end: "14:00" }],
    });
    const rendered = renderSequence(touches, authority);
    expect(rendered.map((t) => t.touchId)).toEqual([
      "email1",
      "email2",
      "liConnect",
      "liMsg1",
      "email3",
      "email4",
      "email5",
      "liMsg2",
      "email6",
    ]);
    for (const t of rendered) {
      if (t.touchId === "liConnect") {
        expect(t.body).not.toContain("2099");
      } else {
        const second = ["email4", "email5", "liMsg2", "email6"].includes(
          t.touchId,
        );
        expect(t.body).toContain(second ? "May 6, 2099" : "April 6, 2099");
        expect(t.body).not.toContain(second ? "April 6, 2099" : "May 6, 2099");
      }
      expect(t.body.includes("Sorry I missed you last time.")).toBe(
        t.touchId === "email4",
      );
    }
    authority.settings = settings;
    expect(
      renderSequence(touches, authority).every(
        (t) => !t.body.includes("Sorry I missed"),
      ),
    ).toBe(true);
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
    for (const p of authority.plan)
      p.evidenceIds = [authority.evidence[0].evidenceId];
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
    expect(review.input).not.toContain(
      "Would you be available for a short virtual meeting?",
    );
    const { assignments } = JSON.parse(write.input);
    for (const assignment of assignments) {
      const plan = authority.plan.find(
        (p) => p.touchId === assignment.touchId,
      )!;
      expect(assignment.evidenceIds).toEqual(plan.evidenceIds);
      expect(assignment.capability).toEqual(
        authority.capabilities.find((c) => c.id === plan.capabilityId) ?? null,
      );
    }
    expect(JSON.parse(review.input).assignments).toEqual(assignments);
  });
});



it("retains editorial approvals on repair while checking factual support everywhere", () => {
  const { authority, touches } = sequenceFixture();
  const review = { reviews: touches.map(t => ({ touchId: t.touchId, violations: [
    { ruleId: "VOICE", rejectedSpan: t.middle, message: "Editorial objection", nextAction: "Rephrase" },
    { ruleId: "UNSUPPORTED_PRODUCT", rejectedSpan: t.middle, message: "Unsupported claim", nextAction: "Correct claim" },
  ] })) };
  const repaired = checkSemantic(review, touches, authority, ["liMsg2"]);
  expect(repaired.filter(v => v.ruleId === "VOICE").map(v => v.touchId)).toEqual(["liMsg2"]);
  expect(repaired.filter(v => v.ruleId === "UNSUPPORTED_PRODUCT")).toHaveLength(9);
  expect(checkSemantic(review, touches, authority)).toHaveLength(18);
  const request = sequenceModelRequest("VALIDATING", authority, touches, ["liMsg2"]);
  expect(JSON.parse(request.input).repairIds).toEqual(["liMsg2"]);
  expect(request.instructions).toContain("Retain editorial approval for unchanged touches");
  for (const stage of ["WRITING", "VALIDATING"] as const) {
    const instructions = sequenceModelRequest(stage, authority, touches).instructions;
    expect(instructions).not.toContain("targets images in at least four emails");
    expect(instructions).toContain("Do not require image mentions");
  }
});
