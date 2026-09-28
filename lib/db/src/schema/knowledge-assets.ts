import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const knowledgeAssetsTable = pgTable("bsb_v2_knowledge_assets", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull().default(1),
  fileName: text("file_name").notNull(),
  displayName: text("display_name").notNull(),
  sourceUrl: text("source_url"),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  fileKind: text("file_kind").notNull(),
  instrument: text("instrument").notNull(),
  researchArea: text("research_area"),
  assetType: text("asset_type").notNull(),
  description: text("description").notNull(),
  keywords: jsonb("keywords").notNull(),
  storagePath: text("storage_path").notNull(),
  classificationReasoning: text("classification_reasoning").notNull(),
  fileData: text("file_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
