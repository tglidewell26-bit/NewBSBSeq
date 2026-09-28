import { resourceUrl } from "@workspace/api-zod/sequence-format";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

export const assetInstruments = ["GeoMx", "CosMx", "CellScape", "Unknown"] as const;
export const assetResearchAreas = ["Neuroscience", "Cancer", "Infectious disease", "Genetic disorders", "Aging", "Kidney disease", "Cardiology", "Unknown"] as const;
export const assetTypes = ["Publications", "Tech notes", "Images", "Panels and Brochures", "Webinars", "Other resources"] as const;
export const assetFileKinds = ["document", "image", "link"] as const;
export const storagePaths = { document: "uploads/assets/original/", image: "uploads/assets/images/", link: "" } as const;
const maxBytes = 25 * 1024 * 1024;

export type AssetInput = {
  sourceUrl?: string | null;
  fileName: string; displayName: string; fileDataBase64: string; fileKind: string;
  instrument: string; researchArea: string | null; assetType: string; description: string;
  keywords: unknown; classificationReasoning: string;
};

function sentenceCount(text: string) { return (text.match(/[.!?](?=\s|$)/g) ?? []).length; }
export function validateAsset(input: AssetInput): string[] {
  const errors: string[] = [];
  if (input.fileKind === "link" && !resourceUrl(input.sourceUrl)) errors.push("Enter a valid HTTPS resource URL without credentials.");
  if (input.fileKind !== "link" && input.sourceUrl) errors.push("Only link resources can have a resource URL.");
  if (!input.fileName.trim() || input.fileName.length > 255) errors.push("A valid file name is required.");
  if (!input.displayName.trim() || input.displayName.length > 160) errors.push("A display name is required.");
  if (!assetFileKinds.includes(input.fileKind as any)) errors.push("File kind is invalid.");
  if (!assetInstruments.includes(input.instrument as any)) errors.push("Instrument is invalid.");
  if (!assetTypes.includes(input.assetType as any)) errors.push("Asset type is invalid.");
  if (input.assetType === "Panels and Brochures" && input.researchArea !== null) errors.push("Panels and Brochures must use a blank research area.");
  if (input.assetType !== "Panels and Brochures" && !assetResearchAreas.includes(input.researchArea as any)) errors.push("Select a research area, or use Unknown.");
  if (!input.description.trim() || input.description.length > 6000 || sentenceCount(input.description.trim()) < 3) errors.push("Description must contain at least three complete sentences and at most 6,000 characters.");
  if (!Array.isArray(input.keywords) || input.keywords.length !== 5 || input.keywords.some(x => typeof x !== "string" || !x.trim() || x.length > 100) || new Set(input.keywords.map(x => String(x).trim().toLowerCase())).size !== 5) errors.push("Exactly five distinct keywords (up to 100 characters each) are required.");
  if (!input.classificationReasoning.trim() || input.classificationReasoning.length > 3000) errors.push("Classification reasoning is required (up to 3,000 characters).");
  return errors;
}
export function fileInfo(fileName: string, base64: string) {
  if (!fileName.trim() || fileName.length > 255) throw new Error("A valid file name is required.");
  if (base64.length > Math.ceil(maxBytes / 3) * 4 || base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error("File data is invalid or exceeds 25 MB.");
  let data: Buffer;
  try { data = Buffer.from(base64, "base64"); } catch { throw new Error("File data is invalid."); }
  if (!data.length || data.length > maxBytes) throw new Error("Files must be between 1 byte and 25 MB.");
  const pdf = data.subarray(0, 5).toString() === "%PDF-";
  const png = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
  const webp = data.length >= 12 && data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP";
  const extension = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (pdf && extension === ".pdf") return { data, fileKind: "document", fileType: "application/pdf" };
  if (png && extension === ".png") return { data, fileKind: "image", fileType: "image/png" };
  if (jpg && [".jpg", ".jpeg"].includes(extension ?? "")) return { data, fileKind: "image", fileType: "image/jpeg" };
  if (webp && extension === ".webp") return { data, fileKind: "image", fileType: "image/webp" };
  throw new Error("Only valid PDF, PNG, JPG, JPEG, and WebP files are supported.");
}
export async function initializeKnowledgeAssets() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bsb_v2_knowledge_assets (
    id text PRIMARY KEY, file_name text NOT NULL, display_name text NOT NULL,
    file_type text NOT NULL, file_size integer NOT NULL, file_kind text NOT NULL,
    instrument text NOT NULL, research_area text, asset_type text NOT NULL,
    description text NOT NULL, keywords jsonb NOT NULL, storage_path text NOT NULL,
    classification_reasoning text NOT NULL, file_data text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE bsb_v2_knowledge_assets ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
    ALTER TABLE bsb_v2_knowledge_assets ADD COLUMN IF NOT EXISTS source_url text;`);
}
export const assetId = () => randomUUID();
