import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const bsbV2PacketsTable = pgTable(
  "bsb_v2_packets",
  {
    id: text("id").primaryKey(),
    // Retained for existing databases; new records use the shared workspace ID.
    // This field is no longer used for authentication or read access.
    ownerId: text("owner_id").notNull(),
    inputHash: text("input_hash").notNull(),
    evidenceVersion: text("evidence_version").notNull(),
    stage: text("stage").notNull(),
    researchPacket: jsonb("research_packet").notNull(),
    normalizedEvidence: jsonb("normalized_evidence").notNull(),
    validation: jsonb("validation").notNull(),
    assessment: jsonb("assessment"),
    review: jsonb("review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("bsb_v2_owner_input_hash_idx").on(table.ownerId, table.inputHash),
  ],
);

export type BsbV2Packet = typeof bsbV2PacketsTable.$inferSelect;
