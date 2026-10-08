import { z } from "zod";

export const slotSchema = z.object({
  date: z.string(),
  start: z.string(),
  end: z.string(),
});
export const finishInputSchema = z.object({
  company: z.string().trim().min(1).max(200),
  source: z.string().min(1).max(120000),
  timezone: z.string().max(100).default("America/Los_Angeles"),
  location: z.string().max(200).default(""),
  trip1: z.array(slotSchema).max(31).default([]),
  trip2: z.array(slotSchema).max(31).default([]),
});
export type FinishInput = z.infer<typeof finishInputSchema>;
export const messageSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(300),
  subject: z.string().max(1000),
  body: z.string().max(120000),
  resourceNote: z.string().max(6000),
  selectedAssetIds: z.array(z.string().max(100)).max(20),
});
export type FinishMessage = z.infer<typeof messageSchema>;
export type Resource = {
  id: string;
  displayName: string;
  fileName: string;
  fileKind: string;
  instrument: string;
  description: string;
  keywords: string[];
  assetType: string;
  sourceUrl?: string | null;
};
export type Suggestion = {
  messageId: string;
  assetId: string;
  reason: string;
  relevance: "direct" | "related" | "platform";
};
export type FinishResult = {
  messages: FinishMessage[];
  suggestions: Suggestion[];
  resources: Resource[];
  warnings: string[];
};
export const saveFinishedSchema = z.object({
  input: finishInputSchema,
  messages: z.array(messageSchema).min(1).max(30),
  expectedUpdatedAt: z.string().optional(),
});
export type SavedFinish = FinishResult & {
  id: string;
  input: FinishInput;
  createdAt: string;
  updatedAt: string;
  legacy?: boolean;
};
export const PLACEHOLDERS = [
  "TRIP_1_AVAILABILITY",
  "TRIP_2_AVAILABILITY",
  "LOCATION",
  "TIMEZONE",
] as const;

/** Parse structure only. Message wording never goes through an AI writer. */
export function parseSequence(source: string): FinishMessage[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const messages: FinishMessage[] = [];
  const cleanHeading = (line: string) =>
    line
      .replace(/^\s*#{1,6}\s*/, "")
      .replace(/^\s*\d+[.)]\s+/, "")
      .replace(/\*\*/g, "")
      .trim();
  const hasHeadings = lines.some((line) =>
    /^(?:Email|LinkedIn|Message|Touch)\s*\d+\b/i.test(cleanHeading(line)),
  );
  let current: FinishMessage | undefined = hasHeadings
    ? undefined
    : {
        id: "message-1",
        title: "Message 1",
        subject: "",
        body: "",
        resourceNote: "",
        selectedAssetIds: [],
      };
  let body: string[] = [];
  const flush = () => {
    if (!current) return;
    current.body = body.join("\n").replace(/^\n+|\n+$/g, "");
    messages.push(current);
    body = [];
  };
  for (const line of lines) {
    // Accept plain or Markdown headings, numbered lists, and Email 1 — Subject.
    if (/^\s*```/.test(line)) continue;
    const clean = cleanHeading(line);
    if (/^(?:Email|LinkedIn|Message|Touch)\s*\d+\b/i.test(clean)) {
      flush();
      current = {
        id: `message-${messages.length + 1}`,
        title: clean,
        subject: "",
        body: "",
        resourceNote: "",
        selectedAssetIds: [],
      };
    } else if (current && /^Subject\s*:/i.test(clean)) {
      current.subject = clean.replace(/^Subject\s*:\s*/i, "");
    } else if (
      current &&
      /^(?:Resource note|Resource purpose|Resource suggestion|Image suggestion|Attachment suggestion)\s*:/i.test(
        clean,
      )
    ) {
      current.resourceNote +=
        (current.resourceNote ? "\n" : "") + clean.replace(/^[^:]+:\s*/, "");
    } else if (current && !/^\s*(?:---+|___+)\s*$/.test(line)) body.push(line);
  }
  flush();
  // Without headings keep everything as a single editable message, not a guessed rewrite.
  return messages.length
    ? messages
    : [
        {
          id: "message-1",
          title: "Message 1",
          subject: "",
          body: source,
          resourceNote: "",
          selectedAssetIds: [],
        },
      ];
}
export function unresolvedPlaceholders(messages: FinishMessage[]): string[] {
  return [
    ...new Set(
      messages.flatMap(
        (m) =>
          `${m.subject}\n${m.body}`.match(
            /\{\{[^{}\n]+\}\}|\[(?:TRIP[^\]\n]*|VISIT[^\]\n]*|DATES?[^\]\n]*|TIMES?[^\]\n]*|LOCATION|FIRST[_ ]?NAME)\]/gi,
          ) ?? [],
      ),
    ),
  ];
}
export function customerText(messages: FinishMessage[]): string {
  return messages
    .map(
      (m) =>
        `${m.title}\n${m.subject ? `Subject: ${m.subject}\n\n` : ""}${m.body}`,
    )
    .join("\n\n---\n\n");
}
