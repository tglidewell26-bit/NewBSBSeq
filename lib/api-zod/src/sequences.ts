import { z } from "zod/v4";
import { instruments } from "./live-assessment";

export const touchIds = [
  "email1",
  "email2",
  "liConnect",
  "liMsg1",
  "email3",
  "email4",
  "email5",
  "liMsg2",
  "email6",
] as const;
export type TouchId = (typeof touchIds)[number];
export const slotSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict();
export const outreachSchema = z
  .object({
    mode: z.enum(["GENERAL", "INDIVIDUAL"]),
    firstName: z.string().trim().max(60),
    meetingMode: z.enum(["IN_PERSON", "VIRTUAL"]),
    timezone: z.string().min(1).max(80),
    trip1: z.array(slotSchema).max(31),
    trip2: z.array(slotSchema).max(31),
    allowAccountFacts: z.boolean(),
  })
  .strict();
export const draftTouchSchema = z
  .object({
    touchId: z.enum(touchIds),
    subject: z.string().max(120),
    middle: z.string().min(1).max(2500),
  })
  .strict();
export const draftSchema = z
  .object({ touches: z.array(draftTouchSchema).length(touchIds.length) })
  .strict();
export const sequenceRequestSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    settings: outreachSchema,
    editOf: z.string().uuid().optional(),
    edits: z.array(draftTouchSchema).length(touchIds.length).optional(),
  })
  .strict()
  .refine((x) => !!x.editOf === !!x.edits, {
    message:
      "An edit requires both the original sequence and all nine revised touches.",
  });
export const semanticSchema = z
  .object({
    reviews: z
      .array(
        z
          .object({
            touchId: z.enum(touchIds),
            violations: z
              .array(
                z
                  .object({
                    ruleId: z.enum([
                      "UNSUPPORTED_COMPANY",
                      "UNSUPPORTED_PRODUCT",
                      "UNSUPPORTED_BRIDGE",
                      "MISATTRIBUTION",
                      "GUARANTEED_OUTCOME",
                      "VOICE",
                    ]),
                    rejectedSpan: z.string().min(1).max(500),
                    message: z.string().min(1).max(700),
                    nextAction: z.string().min(1).max(500),
                  })
                  .strict(),
              )
              .max(8),
          })
          .strict(),
      )
      .length(touchIds.length),
  })
  .strict();
export type OutreachSettings = z.infer<typeof outreachSchema>;
export const savedTripSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    timezone: z.string().min(1).max(80),
    slots: z.array(slotSchema).min(1).max(31),
  })
  .strict();
export type SavedTrip = z.infer<typeof savedTripSchema> & { createdAt: string };
export type DraftTouch = z.infer<typeof draftTouchSchema>;
export type SequenceRequest = z.infer<typeof sequenceRequestSchema>;
export type Capability = {
  id: string;
  instrument: (typeof instruments)[number];
  claim: string;
  limitation: string;
  sourceUrl: string;
  sourceSection: string;
  reviewedAt: string;
};
export type TouchPlan = {
  touchId: TouchId;
  purpose: string;
  instrument: (typeof instruments)[number] | null;
  evidenceIds: string[];
  capabilityId: string | null;
  assetIds: string[];
  assetMatches?: Array<{ assetId: string; kind: "attachment" | "image"; evidenceIds: string[]; topics: string[]; reason: string }>;
};
export type SequenceAsset = {
  id: string; revision: number; fileName: string; displayName: string;
  fileKind?: "document" | "image"; fileType?: string;
  instrument: string; researchArea: string | null; assetType: string;
  description: string; keywords: string[];
};
export type SequenceAuthority = {
  evidenceVersion: string;
  assessmentId: string;
  reviewId: string;
  catalogVersion: string;
  planVersion: string;
  evidence: Array<{
    evidenceId: string;
    claim: string;
    provenanceType: string;
    sourceUrl?: string | null;
  }>;
  capabilities: Capability[];
  assets?: SequenceAsset[];
  instruments: string[];
  plan: TouchPlan[];
  settings: OutreachSettings;
};
export type Violation = {
  touchId: TouchId | "sequence";
  ruleId: string;
  message: string;
  rejectedSpan: string;
  evidenceIds: string[];
  capabilityId: string | null;
  nextAction: string;
};
export type RenderedTouch = DraftTouch & { body: string };
export type SequenceState =
  | "QUEUED"
  | "WRITING"
  | "VALIDATING"
  | "APPROVED"
  | "VALIDATION_FAILED"
  | "PROVIDER_FAILED"
  | "RECOVERY_REQUIRED"
  | "CANCELED";
export type SequenceJob = {
  id: string;
  packetId: string;
  state: SequenceState;
  authority: SequenceAuthority;
  violations: Violation[];
  error: string | null;
  usage: Array<{
    stage: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    model: string;
  }>;
  sequence: RenderedTouch[] | null;
  contentHash: string | null;
  revisionOf: string | null;
  retryOf: string | null;
  canRegenerate: boolean;
  createdAt: string;
};

export const draftJsonSchema = z.toJSONSchema(draftSchema);
export const semanticJsonSchema = z.toJSONSchema(semanticSchema);
