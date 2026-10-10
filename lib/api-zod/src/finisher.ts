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
// Require both visits for new finishing requests, without invalidating saved history.
export const finishRequestSchema = finishInputSchema.superRefine((input, ctx) => {
  for (const key of ["trip1", "trip2"] as const) {
    if (!input[key].length) ctx.addIssue({
      code: "custom", path: [key],
      message: `Add at least one availability window for ${key === "trip1" ? "Trip 1" : "Trip 2"}. Every sequence requires two trips.`,
    });
  }
});
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
  "TRIP_1_DATES",
  "TRIP_2_DATES",
  "TRIP_1_AVAILABILITY",
  "TRIP_2_AVAILABILITY",
  "LOCATION",
  "TIMEZONE",
] as const;

/** Parse structure only. Message wording never goes through an AI writer. */
export function messageTitle(title: string): string {
  const match = title.match(
    /^LinkedIn\s*(?:Connection\s+Request\b|Message\s*([12])\b|([123])\b)/i,
  );
  if (!match) return title;
  if (match[1]) return `LinkedIn Message ${match[1]}`;
  return match[2] && match[2] !== "1"
    ? `LinkedIn Message ${Number(match[2]) - 1}`
    : "LinkedIn Connection Request";
}
const headingPattern =
  /^(?:(?:Email|Message|Touch)\s*\d+\b|LinkedIn\s*(?:Connection\s+Request\b|Message\s*\d+\b|\d+\b))/i;
export function parseSequence(source: string): FinishMessage[] {
  source = normalizeFirstName(source);
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const messages: FinishMessage[] = [];
  const cleanHeading = (line: string) =>
    line
      .replace(/^\s*#{1,6}\s*/, "")
      .replace(/^\s*\d+[.)]\s+/, "")
      .replace(/\*\*/g, "")
      .trim();
  const hasHeadings = lines.some((line) =>
    headingPattern.test(cleanHeading(line)),
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
    if (headingPattern.test(clean)) {
      flush();
      current = {
        id: `message-${messages.length + 1}`,
        title: messageTitle(clean),
        subject: "",
        body: "",
        resourceNote: "",
        selectedAssetIds: [],
      };
    } else if (current && /^Subject\s*:/i.test(clean)) {
      if (!isConnectionRequest(current))
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
          normalizeFirstName(
            `${isConnectionRequest(m) ? "" : m.subject}\n${m.body}`,
          ).match(
            /\{\{[^{}\n]+\}\}|\[(?:TRIP[^\]\n]*|VISIT[^\]\n]*|DATES?[^\]\n]*|TIMES?[^\]\n]*|LOCATION|FIRST[_ ]?NAME)\]/gi,
          ) ?? [],
      ),
    ),
  ];
}
export function customerText(messages: FinishMessage[]): string {
  return messages
    .map((m) =>
      messagePlainText(
        m,
        `${messageTitle(m.title)}\n${m.subject && !isConnectionRequest(m) ? `Subject: ${m.subject}\n\n` : ""}${m.body}`,
      ),
    )
    .join("\n\n---\n\n");
}

/** Names are merge fields for the sending tool, not unfinished scheduling. */
export function blockingPlaceholders(messages: FinishMessage[]): string[] {
  return unresolvedPlaceholders(messages).filter(
    (token) =>
      !/^(?:firstname|lastname|fullname)$/i.test(
        token.replace(/[{}\[\]\s_-]/g, ""),
      ),
  );
}

export const BRAND_LINKS: Record<string, string> = {
  cosmx:
    "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/",
  cellscape:
    "https://brukerspatialbiology.com/products/cellscape-precise-spatial-proteomics/cellscape-psp-overview/",
  geomx:
    "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-dsp-overview/",
  "bruker spatial biology": "https://brukerspatialbiology.com/",
};

/** Preserve supplied links and URLs; link every otherwise unlinked brand mention.
 * Applied at display/export time so saved drafts and resource matching stay intact.
 */
export function linkBrands(text: string): string {
  text = text.replace(
    /\b(Bruker Spatial Biology|CosMx|CellScape|GeoMx) \((https?:\/\/[^\s)]+)\)/gi,
    "[$1]($2)",
  );
  return text
    .split(/(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>]+)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part.replace(
            /\b(?:Bruker Spatial Biology|CosMx|CellScape|GeoMx)\b/gi,
            (name) => `[${name}](${BRAND_LINKS[name.toLowerCase()]})`,
          ),
    )
    .join("");
}
export const customerPlainText = (text: string) =>
  plainMessageText(linkBrands(text));

export const isLinkedIn = (message: Pick<FinishMessage, "title">) =>
  /^LinkedIn\s*(?:Connection\s+Request\b|Message\s*\d+\b|\d+\b)/i.test(
    message.title,
  );

export const isConnectionRequest = (message: Pick<FinishMessage, "title">) =>
  messageTitle(message.title) === "LinkedIn Connection Request";
export function normalizeFirstName(text: string): string {
  return text.replace(
    /\{\{\s*first[ _-]?name\s*\}\}|\{\s*first[ _-]?name\s*\}|\[\s*first[ _-]?name\s*\]/gi,
    "{{first_name}}",
  );
}
export function connectionText(text: string): string {
  return plainMessageText(
    text
      .replace(/\[([^\]\n]+)\]\([^\s)]+\)/g, "$1")
      .replace(/\(https?:\/\/[^\s)]+\)/gi, "")
      .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, ""),
  )
    .replace(/[ \t]+$/gm, "")
    .trim();
}
const messagePlainText = (m: Pick<FinishMessage, "title">, text: string) =>
  isConnectionRequest(m) ? connectionText(text) : customerPlainText(text);

/** Plain clipboard/download output never exposes formatting markers. */
export function plainMessageText(text: string): string {
  return normalizeFirstName(text)
    .replace(/\*\*/g, "")
    .replace(/^[ \t]*[•*-][ \t]+/gm, "- ")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");
}
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Deliberately small, escaped renderer: bold, safe links, paragraphs and lists.
 * User-supplied HTML is always displayed as text, never executed.
 */
export function messageHtml(
  message: Pick<FinishMessage, "title" | "body">,
): string {
  if (isConnectionRequest(message))
    return `<div style="white-space:pre-wrap">${escapeHtml(connectionText(message.body))}</div>`;
  const inline = (text: string) =>
    escapeHtml(linkBrands(normalizeFirstName(text)))
      .replace(
        /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" style="color:#0563c1;text-decoration:underline">$1</a>',
      )
      .replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>");
  const output: string[] = [];
  let paragraph: string[] = [],
    bullets: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length)
      output.push(`<p style="margin:0 0 12px">${paragraph.join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (bullets.length)
      output.push(
        `<ul style="list-style-type:disc;margin:0 0 12px;padding-left:24px">${bullets.join("")}</ul>`,
      );
    bullets = [];
  };
  for (const line of message.body.replace(/\r\n/g, "\n").split("\n")) {
    const bullet = line.match(/^[ \t]*[-*•][ \t]+(.*)$/);
    if (bullet) {
      flushParagraph();
      bullets.push(`<li>${inline(bullet[1])}</li>`);
    } else {
      flushList();
      if (!line.trim()) flushParagraph();
      else paragraph.push(inline(line));
    }
  }
  flushParagraph();
  flushList();
  return output.join("");
}

/** Same payload is used by preview and clipboard; private notes never enter it. */
export function customerClipboard(messages: FinishMessage[], bodyOnly = false) {
  return {
    text: bodyOnly
      ? messages[0]
        ? messagePlainText(messages[0], messages[0].body)
        : ""
      : customerText(messages),
    html: messages
      .map((m) =>
        messageHtml({
          ...m,
          body: bodyOnly
            ? m.body
            : `${messageTitle(m.title)}\n${m.subject && !isConnectionRequest(m) ? `Subject: ${m.subject}\n\n` : ""}${m.body}`,
        }),
      )
      .join("<hr>"),
  };
}
