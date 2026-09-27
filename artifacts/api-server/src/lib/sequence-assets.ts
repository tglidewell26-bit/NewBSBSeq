import type { RenderedTouch, SequenceAsset, SequenceAuthority } from "@workspace/api-zod";
import { AssessmentError } from "./live-assessment";
import { hashPacket } from "./bsb-v2";
import { capabilities } from "./sequence-catalog";

type Client = { query: (sql: string, values?: any[]) => Promise<any> };
const columns = `id, revision, file_name AS "fileName", display_name AS "displayName", instrument,
  file_kind AS "fileKind", file_type AS "fileType", research_area AS "researchArea", asset_type AS "assetType", description, keywords`;

export async function loadSequenceAssets(client: Client, pinned?: SequenceAsset[]): Promise<SequenceAsset[]> {
  if (pinned) {
    if (!pinned.length) return [];
    // Hold selected rows while checking/saving, so an edit/delete cannot race
    // the authority check. Unrelated library changes do not invalidate a run.
    const { rows } = await client.query(`SELECT ${columns} FROM bsb_v2_knowledge_assets WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE`, [pinned.map(a => a.id)]);
    if (rows.length !== pinned.length || pinned.some(a => !rows.some((b: SequenceAsset) => {
      if (b.id !== a.id) return false;
      // Older saved sequences predate fileKind/fileType in their pinned
      // snapshots; compare the fields present at generation time.
      const comparable = { ...b };
      if (a.fileKind === undefined) delete comparable.fileKind;
      if (a.fileType === undefined) delete comparable.fileType;
      return hashPacket(a) === hashPacket(comparable);
    })))
      throw new AssessmentError("STALE_ASSET", "A selected knowledge-base file was edited or deleted. Generate a new sequence using the current library.", 409);
    return pinned;
  }
  return (await client.query(`SELECT ${columns} FROM bsb_v2_knowledge_assets WHERE instrument IN ('GeoMx','CosMx','CellScape') ORDER BY id`)).rows;
}

const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
// Narrow workflow concepts qualify a match; broad disease/marketing words never do.
const concepts = [
  { name: "tissue protein imaging", pattern: /\b(ihc|immunohistochem\w*|immunofluorescen\w*|cycif|codex|multiplex (?:protein|imaging)|protein (?:markers|imaging)|tissue protein)\b/, caps: capabilities.filter(c => c.instrument === "CellScape").map(c => c.id) },
  { name: "antibody assays", pattern: /\b(antibod(?:y|ies)|adcs?|bispecific\w*|antibody drug conjugate)\b/, caps: capabilities.filter(c => c.instrument === "CellScape").map(c => c.id) },
  { name: "single-cell spatial RNA", pattern: /\b(scrna seq|single cell (?:spatial )?(?:rna|transcriptom\w*)|spatial transcriptom\w*|xenium|rna in situ)\b/, caps: capabilities.filter(c => c.instrument === "CosMx" && c.id !== "cosmx-multiomics").map(c => c.id) },
  { name: "RNA and protein integration", pattern: /\b(multiomics?|rna and protein|rna protein|protein and rna)\b/, caps: ["cosmx-multiomics", "geomx-multiomics"] },
  { name: "regional tissue profiling", pattern: /\b(regions? of interest|roi|regional (?:profiling|analysis)|tissue compartments?|morphology|pathology|pathologist\w*|histopatholog\w*|biobanks?|archived tissue|tissue cohorts?)\b/, caps: capabilities.filter(c => c.instrument === "GeoMx").map(c => c.id) },
] as const;
// A specific product resource can be useful even when the company evidence is
// exhausted. Do not promote general marketing material on this basis.
const capabilityResources: Record<string, { name: string; pattern: RegExp }> = {
  "cell-assay-kits": { name: "prevalidated CellScape assay kits", pattern: /\b(vistaplex|prevalidated (?:antibody )?(?:assay )?(?:kits?|panels?)|multiplexing assay kits?)\b/i },
};
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
  const selectedByTouch = new Map<string, Pick<SequenceAuthority["plan"][number], "assetIds" | "assetMatches">>();
  // Reserve a kit-specific resource for the kit email before broader earlier
  // matches can consume it. Output still follows the normal nine-touch order.
  const ordered = [...authority.plan].sort((a, b) => Number(b.capabilityId === "cell-assay-kits") - Number(a.capabilityId === "cell-assay-kits"));
  for (const p of ordered) {
    const empty = { ...p, assetIds: [] as string[], assetMatches: [] as NonNullable<typeof p.assetMatches> };
    // Keep source suggestions optional and available to all six emails.
    if (!p.touchId.startsWith("email") || !p.capabilityId) { selectedByTouch.set(p.touchId, empty); continue; }
    const evidence = authority.evidence.filter(e => p.evidenceIds.includes(e.evidenceId));
    const candidates = library.filter(a => a.instrument === p.instrument && !used.has(a.id)).flatMap(asset => {
      const rawContent = [asset.description, ...asset.keywords].join("\n");
      const content = normalized(rawContent);
      const company = normalized(evidence.map(e => e.claim).join(" "));
      if (conflicts(company, content)) return [];
      const matches: Array<{ topic: string; ids: string[] }> = concepts.filter(c => (c.caps as readonly string[]).includes(p.capabilityId!) && positiveConcept(rawContent, c.pattern))
        .map(c => ({ topic: c.name, ids: evidence.filter(e => positiveConcept(e.claim, c.pattern)).map(e => e.evidenceId) }))
        .filter(m => m.ids.length);
      const broad = /^(?:cancer|oncology|spatial|biology|research|tissue|rna|protein|morphology|imaging|single cell rna)$/;
      for (const keyword of asset.keywords) {
        const term = normalized(keyword).trim();
        if (term.length < 4 || broad.test(term)) continue;
        const pattern = new RegExp(`\\b${term}\\b`);
        if (!positiveConcept(asset.description, pattern)) continue;
        const ids = evidence.filter(e => positiveConcept(e.claim, pattern)).map(e => e.evidenceId);
        if (ids.length && !matches.some(m => m.topic === term)) matches.push({ topic: term, ids });
      }
      const capabilityResource = capabilityResources[p.capabilityId!];
      if (capabilityResource?.pattern.test(rawContent))
        matches.push({ topic: capabilityResource.name, ids: evidence.map(e => e.evidenceId) });
      if (!matches.length) return [];
      const bonus = contexts.filter(term => content.includes(term) && company.includes(term)).length;
      const image = asset.fileKind === "image" || (!asset.fileKind && /\.(png|jpe?g|webp)$/i.test(asset.fileName));
      return [{ asset, kind: image ? "image" as const : "attachment" as const, matches, score: matches.length * 10 + bonus + (matches.some(m => m.topic === capabilityResource?.name) ? 20 : 0) }];
    }).sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));
    // A single relevant document and image may be suggested for an email. The
    // same library file is never repeated elsewhere in the sequence.
    const selected = (["attachment", "image"] as const).flatMap(kind => candidates.find(c => c.kind === kind) ?? []);
    selected.forEach(match => { used.add(match.asset.id); assets.push(match.asset); });
    selectedByTouch.set(p.touchId, { assetIds: selected.map(m => m.asset.id), assetMatches: selected.map(match => {
      const topics = match.matches.map(m => m.topic);
      return { assetId: match.asset.id, kind: match.kind, evidenceIds: [...new Set(match.matches.flatMap(m => m.ids))], topics,
        reason: `${match.asset.instrument} resource matching ${match.matches.some(m => m.ids.length) ? "documented" : "the assigned"} ${topics.join(" and ")} and this message's assigned capability. Metadata was reviewed when saved; this is a relevance match, not independent scientific verification.` };
    }) });
  }
  const plan = authority.plan.map(p => ({ ...p, ...selectedByTouch.get(p.touchId) }));
  return { ...authority, plan, assets };
}

// Scan the current library after the actual email copy exists. The planner's
// earlier matches are hints for the writer; these saved suggestions use the
// completed text, the assigned capability, and the full current library.
export function suggestAssetsForWrittenSequence(authority: SequenceAuthority, sequence: RenderedTouch[], library: SequenceAsset[]): RenderedTouch[] {
  const available = attachSequenceAssets(authority, library);
  return sequence.map(t => {
    const p = available.plan.find(p => p.touchId === t.touchId);
    const middle = normalized(t.middle);
    const suggestions = (p?.assetMatches ?? [])
      .filter(match => {
        if (p?.capabilityId === "cell-assay-kits") return /\b(?:kit|panel|prevalidated|vistaplex)\b/.test(middle);
        return !!middle && !!p?.capabilityId;
      })
      .flatMap(match => {
        const asset = available.assets?.find(a => a.id === match.assetId);
        return asset ? [{ asset, match }] : [];
      });
    return { ...t, assetSuggestions: suggestions };
  });
}

export function attachmentNotes(authority: SequenceAuthority, touchId: string, written?: RenderedTouch): string {
  const plan = authority.plan.find(p => p.touchId === touchId);
  const assets = written?.assetSuggestions?.map(s => s.asset) ?? (authority.assets ?? []).filter(a => plan?.assetIds.includes(a.id));
  if (!assets.length) return "";
  return "\n\n[Suggested resources — not email copy]\n" + assets.map(a => {
    const match = written?.assetSuggestions?.find(s => s.asset.id === a.id)?.match ?? plan?.assetMatches?.find(m => m.assetId === a.id);
    const kind = match?.kind === "image" || a.fileKind === "image" || (!a.fileKind && /\.(png|jpe?g|webp)$/i.test(a.fileName)) ? "Suggested image" : "Suggested attachment";
    return `${kind}: ${a.fileName.replace(/[\r\n]/g, " ")} (reviewed revision ${a.revision})\n${match?.reason ?? "Selected reference resource."}\nReview this resource before use; copying text does not include it in the email.`;
  }).join("\n\n");
}

