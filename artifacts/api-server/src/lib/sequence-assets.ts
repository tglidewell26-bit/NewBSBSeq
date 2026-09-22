import type { SequenceAsset, SequenceAuthority } from "@workspace/api-zod";
import { AssessmentError } from "./live-assessment";
import { hashPacket } from "./bsb-v2";

type Client = { query: (sql: string, values?: any[]) => Promise<any> };
const columns = `id, revision, file_name AS "fileName", display_name AS "displayName", instrument,
  research_area AS "researchArea", asset_type AS "assetType", description, keywords`;

export async function loadSequenceAssets(client: Client, pinned?: SequenceAsset[]): Promise<SequenceAsset[]> {
  if (pinned) {
    if (!pinned.length) return [];
    // Hold selected rows while checking/saving, so an edit/delete cannot race
    // the authority check. Unrelated library changes do not invalidate a run.
    const { rows } = await client.query(`SELECT ${columns} FROM bsb_v2_knowledge_assets WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE`, [pinned.map(a => a.id)]);
    if (rows.length !== pinned.length || pinned.some(a => !rows.some((b: SequenceAsset) => b.id === a.id && hashPacket(a) === hashPacket(b))))
      throw new AssessmentError("STALE_ASSET", "A selected knowledge-base file was edited or deleted. Generate a new sequence using the current library.", 409);
    return pinned;
  }
  return (await client.query(`SELECT ${columns} FROM bsb_v2_knowledge_assets WHERE instrument IN ('GeoMx','CosMx','CellScape') ORDER BY id`)).rows;
}

const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
// Narrow workflow concepts qualify a match; broad disease/marketing words never do.
const concepts = [
  { name: "tissue protein imaging", pattern: /\b(ihc|immunohistochem\w*|immunofluorescen\w*|cycif|codex|multiplex (?:protein|imaging)|protein (?:markers|imaging)|tissue protein)\b/, caps: ["cell-tissue-protein", "cell-antibodies"] },
  { name: "antibody assays", pattern: /\b(antibod(?:y|ies)|adcs?|bispecific\w*|antibody drug conjugate)\b/, caps: ["cell-antibodies", "cell-tissue-protein"] },
  { name: "single-cell spatial RNA", pattern: /\b(scrna seq|single cell (?:spatial )?(?:rna|transcriptom\w*)|spatial transcriptom\w*|xenium|rna in situ)\b/, caps: ["cosmx-rna"] },
  { name: "RNA and protein integration", pattern: /\b(multiomics?|rna and protein|rna protein|protein and rna)\b/, caps: ["cosmx-multiomics", "geomx-multiomics"] },
  { name: "regional tissue profiling", pattern: /\b(regions? of interest|roi|regional (?:profiling|analysis)|tissue compartments?|morphology|pathology|pathologist\w*|histopatholog\w*|biobanks?|archived tissue|tissue cohorts?)\b/, caps: ["geomx-roi", "geomx-multiomics"] },
] as const;
const contexts = ["ffpe", "fresh frozen", "colorectal", "melanoma", "kidney", "brain", "lung", "breast", "epcam", "tumor microenvironment"];
const negative = /\b(no|not|never|without|unknown|unconfirmed|unsupported|doesn t)\b/;
function positiveConcept(text: string, pattern: RegExp): boolean {
  const clauses = text.split(/[.!?;\n]+/).map(normalized);
  return !clauses.some(c => pattern.test(c) && negative.test(c)) && clauses.some(c => pattern.test(c));
}
function conflicts(company: string, asset: string): boolean {
  // Missing sample context is not evidence of compatibility. Explicitly
  // different sample/species context is enough to decline an attachment.
  return [["ffpe", "fresh frozen"], ["human", "mouse"]].some(pair => {
    const c = pair.filter(t => new RegExp(`\\b${t}\\b`).test(company));
    const a = pair.filter(t => new RegExp(`\\b${t}\\b`).test(asset));
    return c.length === 1 && a.length === 1 && c[0] !== a[0];
  });
}

export function attachSequenceAssets(authority: SequenceAuthority, library: SequenceAsset[]): SequenceAuthority {
  const used = new Set<string>();
  const assets: SequenceAsset[] = [];
  const plan = authority.plan.map(p => {
    const empty = { ...p, assetIds: [] as string[], assetMatches: [] as NonNullable<typeof p.assetMatches> };
    // Keep LinkedIn, the second-trip opener, and the neutral close uncluttered.
    if (!["email1", "email2", "email3", "email5"].includes(p.touchId) || !p.capabilityId || used.size >= 3) return empty;
    const evidence = authority.evidence.filter(e => p.evidenceIds.includes(e.evidenceId));
    const candidates = library.filter(a => a.instrument === p.instrument && !used.has(a.id)).flatMap(asset => {
      const rawContent = [asset.description, ...asset.keywords].join("\n");
      const content = normalized(rawContent);
      const company = normalized(evidence.map(e => e.claim).join(" "));
      if (conflicts(company, content)) return [];
      const matches = concepts.filter(c => (c.caps as readonly string[]).includes(p.capabilityId!) && positiveConcept(rawContent, c.pattern))
        .map(c => ({ topic: c.name, ids: evidence.filter(e => positiveConcept(e.claim, c.pattern)).map(e => e.evidenceId) }))
        .filter(m => m.ids.length);
      if (!matches.length) return [];
      const bonus = contexts.filter(term => content.includes(term) && company.includes(term)).length;
      return [{ asset, matches, score: matches.length * 10 + bonus }];
    }).sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));
    const match = candidates[0];
    if (!match) return empty;
    used.add(match.asset.id); assets.push(match.asset);
    const topics = match.matches.map(m => m.topic);
    return { ...p, assetIds: [match.asset.id], assetMatches: [{ assetId: match.asset.id,
      evidenceIds: [...new Set(match.matches.flatMap(m => m.ids))], topics,
      reason: `${match.asset.instrument} resource matching documented ${topics.join(" and ")} and this message's assigned capability. Metadata was reviewed when saved; this is a relevance match, not independent scientific verification.`,
    }] };
  });
  return { ...authority, plan, assets };
}

export function attachmentNotes(authority: SequenceAuthority, touchId: string): string {
  const plan = authority.plan.find(p => p.touchId === touchId);
  const assets = (authority.assets ?? []).filter(a => plan?.assetIds.includes(a.id));
  if (!assets.length) return "";
  return "\n\n[Attachment checklist — not email copy]\n" + assets.map(a => {
    const match = plan?.assetMatches?.find(m => m.assetId === a.id);
    return `${a.fileName.replace(/[\r\n]/g, " ")} (reviewed revision ${a.revision})\n${match?.reason ?? "Selected reference resource."}\nDownload and attach this file before sending; copying text does not attach it.`;
  }).join("\n\n");
}
