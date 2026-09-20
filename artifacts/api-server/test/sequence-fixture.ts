import { touchIds, type OutreachSettings } from "@workspace/api-zod";
import { assessmentFixture } from "./assessment-fixture";
import { validateModelAssessment } from "../src/lib/live-assessment";
import { hashPacket } from "../src/lib/bsb-v2";
import { planSequence } from "../src/lib/sequences";
export const settings: OutreachSettings = {
  mode: "GENERAL",
  firstName: "",
  meetingMode: "VIRTUAL",
  timezone: "America/Los_Angeles",
  trip1: [],
  trip2: [],
  allowAccountFacts: false,
};
export function sequenceFixture() {
  const f = assessmentFixture();
  const version = hashPacket(f.packet);
  const assessment = validateModelAssessment(f.model, f.evidence, version);
  const row = {
    stage: "APPROVED",
    assessment,
    research_packet: f.packet,
    evidence_version: version,
    review: {
      id: "review-synthetic",
      decision: "APPROVE",
      approvedInstruments: ["CosMx"],
      evidenceVersion: version,
      demoMode: false,
    },
  };
  const authority = planSequence(row, settings);
  const touches = touchIds.map((touchId) => ({
    touchId,
    subject: touchId.startsWith("email") ? "Tissue research" : "",
    middle:
      touchId === "liConnect"
        ? "Your work integrating tissue morphology and RNA stood out."
        : "Your integration of single-cell spatial RNA and tissue morphology stood out. I thought this would be relevant to your research model training.",
  }));
  const review = {
    reviews: touchIds.map((touchId) => ({ touchId, violations: [] })),
  };
  return { row, authority, touches, review };
}
