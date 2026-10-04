import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const assessmentRunsTable = pgTable("bsb_v2_assessment_runs", {
  id: text("id").primaryKey(),
  packetId: text("packet_id").notNull(),
  evidenceVersion: text("evidence_version").notNull(),
  attempt: integer("attempt").notNull(),
  state: text("state").notNull(),
  reservedMicroUsd: integer("reserved_micro_usd").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  error: jsonb("error"),
  usage: jsonb("usage"),
  progress: jsonb("progress"),
  revision: jsonb("revision"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, table => [uniqueIndex("bsb_v2_run_attempt_idx").on(table.packetId, table.attempt)]);
