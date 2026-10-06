import { resourceUrl } from "@workspace/api-zod/sequence-format";
import type { RenderedTouch, SequenceAsset, SequenceAuthority } from "@workspace/api-zod";
import { AssessmentError } from "./live-assessment";
import { hashPacket } from "./bsb-v2";
import { capabilities } from "./sequence-catalog";

type Client = { query: (sql: string, values?: any[]) => Promise<any> };
const columns = `id, revision, file_name AS "fileName", display_name AS "displayName", instrument,
  file_kind AS "fileKind", file_type AS "fileType", source_url AS "sourceUrl", research_area AS "researchArea", asset_type AS "assetType", description, keywords`;

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
      if (a.sourceUrl === undefined) delete comparable.sourceUrl;
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
const featureConcepts = [
  { name: "whole transcriptome", pattern: /\b(whole transcriptom\w*|transcriptome atlas)\b/ },
  { name: "protein profiling", pattern: /\b(protein (?:profiling|targets|expression)|proteom\w*)\b/ },
  { name: "post-translational modifications", pattern: /\b(post translational|ptm|phosphorylat\w*)\b/ },
  { name: "spatial analysis", pattern: /\b(pathway analysis|differential expression|normalization|informatics|segmentation|cell neighborhoods?)\b/ },
];
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

// A named assay is not a general platform resource just because its summary
// mentions RNA, regions or analysis. Use its actual subject to limit matching.
function resourceFits(asset: SequenceAsset, capabilityId: string, evidence: string): boolean {
  const title = normalized(asset.displayName + " " + asset.fileName);
  const url = (asset.sourceUrl ?? "").toLowerCase();
  const namedPlatform = url.match(/\/(geomx|cosmx|cellscape)[-/]/)?.[1];
  if (namedPlatform && namedPlatform !== asset.instrument.toLowerCase()) return false;
  if (/\b(dpa|discovery proteome atlas)\b/.test(title) &&
      !(asset.fileKind === "link" ? ["geomx-protein-profiling"] : ["geomx-protein-profiling", "geomx-ptm"]).includes(capabilityId)) return false;
  if (/\b(tcr|t cell receptor)\b/.test(title) && !/\b(tcr|t cell receptor|clonotyp\w*)\b/i.test(evidence)) return false;
  return true;
}

export function attachSequenceAssets(authority: SequenceAuthority, library: SequenceAsset[], written?: RenderedTouch[]): SequenceAuthority {
  const used = new Map<string, number>();
  const usedLinks = new Set<string>();
  const assets: SequenceAsset[] = [];
  const selectedByTouch = new Map<string, Pick<SequenceAuthority["plan"][number], "assetIds" | "assetMatches">>();
  // Reserve a kit-specific resource for the kit email before broader earlier
  // matches can consume it. Output still follows the normal nine-touch order.
  const ordered = [...authority.plan].sort((a, b) => Number(b.capabilityId === "cell-assay-kits") - Number(a.capabilityId === "cell-assay-kits"));
  for (const p of ordered) {
    const empty = { ...p, assetIds: [] as string[], assetMatches: [] as NonNullable<typeof p.assetMatches> };
    // Keep source suggestions optional and available to all six emails.
    if (!p.touchId.startsWith("email") || !p.capabilityId) { selectedByTouch.set(p.touchId, empty); continue; }
    const richResources = p.instrument === "GeoMx" || p.instrument === "CosMx";
    const evidence = authority.evidence.filter(e => p.evidenceIds.includes(e.evidenceId));
    const feature = capabilities.find(c => c.id === p.capabilityId)?.claim ?? "";
    const discussion = written ? written.find(t => t.touchId === p.touchId)?.middle ?? "" : feature;
    const candidates = library.filter(a => a.instrument === p.instrument && (richResources || !used.has(a.id)) && (a.fileKind !== "link" || !!resourceUrl(a.sourceUrl))).flatMap(asset => {
      if (!resourceFits(asset, p.capabilityId!, evidence.map(e => e.claim).join(" "))) return [];
      if (asset.fileKind === "link" && usedLinks.has(resourceUrl(asset.sourceUrl)!)) return [];
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
      // Product guides and images can illustrate the proposed feature even
      // when the prospect has not already documented that workflow.
      const productResource = /brochure|panel/i.test(asset.assetType) || (richResources && asset.fileKind === "link" && (!asset.researchArea || asset.researchArea === "Unknown")) || asset.fileKind === "image" || /\.(png|jpe?g|webp)$/i.test(asset.fileName);
      if (productResource) {
        for (const concept of concepts) {
          if ((concept.caps as readonly string[]).includes(p.capabilityId!) &&
              positiveConcept(feature, concept.pattern) && positiveConcept(discussion, concept.pattern) &&
              positiveConcept(asset.description, concept.pattern) && !matches.some(m => m.topic === concept.name))
            matches.push({ topic: concept.name, ids: [] });
        }
        for (const keyword of asset.keywords) {
          const term = normalized(keyword).trim();
          if (term.length < 4 || broad.test(term)) continue;
          const pattern = new RegExp(`\\b${term}\\b`);
          if (positiveConcept(feature, pattern) && positiveConcept(discussion, pattern) &&
              positiveConcept(asset.description, pattern) && !matches.some(m => m.topic === term))
            matches.push({ topic: term, ids: [] });
        }
      }
      if (richResources && productResource) {
        for (const c of featureConcepts) {
          if (positiveConcept(feature, c.pattern) && positiveConcept(discussion, c.pattern) && positiveConcept(asset.description, c.pattern))
            matches.push({ topic: c.name, ids: [] });
        }
      }
      const capabilityResource = capabilityResources[p.capabilityId!];
      if (capabilityResource?.pattern.test(rawContent))
        matches.push({ topic: capabilityResource.name, ids: evidence.map(e => e.evidenceId) });
      if (!matches.length) return [];
      const bonus = contexts.filter(term => content.includes(term) && company.includes(term)).length;
      const image = asset.fileKind === "image" || (!asset.fileKind && /\.(png|jpe?g|webp)$/i.test(asset.fileName));
      return [{ asset, kind: asset.fileKind === "link" ? "link" as const : image ? "image" as const : "attachment" as const, matches, score: matches.length * 10 + bonus + (matches.some(m => m.topic === capabilityResource?.name) ? 20 : 0) - (used.get(asset.id) ?? 0) * 100 }];
    }).sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));
    // A single relevant document and image may be suggested for an email. The
    // GeoMx/CosMx may reuse relevant images/documents; body links are not repeated.
    // CellScape retains its existing no-repeat policy.
    const selected = (["attachment", "image", "link"] as const).flatMap(kind => candidates.find(c => c.kind === kind) ?? []);
    selected.forEach(match => { if (match.asset.fileKind === "link") usedLinks.add(resourceUrl(match.asset.sourceUrl)!); used.set(match.asset.id, (used.get(match.asset.id) ?? 0) + 1); if (!assets.some(a => a.id === match.asset.id)) assets.push(match.asset); });
    if (richResources && !selected.some(m => m.kind === "link")) {
      const fallback = resourceUrl(authority.capabilities.find(c => c.id === p.capabilityId)?.sourceUrl);
      if (fallback) usedLinks.add(fallback);
    }
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
  const available = attachSequenceAssets(authority, library, sequence);
  return sequence.map(t => {
    const p = available.plan.find(p => p.touchId === t.touchId);
    const middle = normalized(t.middle);
    // Keep link cards aligned with the URLs already rendered from pinned authority.
    const pinned = authority.plan.find(p => p.touchId === t.touchId);
    const matches = [...(p?.assetMatches ?? []).filter(m => m.kind !== "link"), ...(pinned?.assetMatches ?? []).filter(m => m.kind === "link")];
    const suggestions = matches
      .filter(match => {
        if (p?.capabilityId === "cell-assay-kits") return /\b(?:kit|panel|prevalidated|vistaplex)\b/.test(middle);
        return !!middle && !!p?.capabilityId;
      })
      .flatMap(match => {
        const asset = available.assets?.find(a => a.id === match.assetId) ?? authority.assets?.find(a => a.id === match.assetId);
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
    const kind = a.fileKind === "link" ? "Suggested link" : match?.kind === "image" || a.fileKind === "image" || (!a.fileKind && /\.(png|jpe?g|webp)$/i.test(a.fileName)) ? "Suggested image" : "Suggested attachment";
    return `${kind}: ${(a.sourceUrl ?? a.fileName).replace(/[\r\n]/g, " ")} (reviewed revision ${a.revision})\n${match?.reason ?? "Selected reference resource."}\nReview this resource before use; copying text does not include it in the email.`;
  }).join("\n\n");
}


// Links are selected from saved metadata or the reviewed capability catalog,
// never generated URLs. The renderer inserts this paragraph before logistics.
export function emailResourceLink(authority: SequenceAuthority, touchId: string): string {
  const plan = authority.plan.find(p => p.touchId === touchId);
  if (!touchId.startsWith("email") || !plan) return "";
  const link = authority.assets?.find(a => plan.assetIds.includes(a.id) && a.fileKind === "link" && resourceUrl(a.sourceUrl));
  const richResources = plan.instrument === "GeoMx" || plan.instrument === "CosMx";
  const capability = authority.capabilities.find(c => c.id === plan.capabilityId);
  const url = resourceUrl(link?.sourceUrl) ?? (richResources ? resourceUrl(capability?.sourceUrl) : null);
  if (!url) return "";
  const title = (link?.displayName ?? `${plan.instrument} ${plan.capabilityId?.replace(/^[^-]+-/, "").replace(/-/g, " ")} resource`).replace(/[\[\]\r\n<>]/g, " ").trim();
  const label = `[${title}](${url})`;
  const phrases: Record<string, string> = {
    email1: `For more detail: ${label}.`,
    email2: `You may find ${label} useful.`,
    email3: `For more detail: ${label}.`,
    email4: `For reference: ${label}.`,
    email5: `More information is available here: ${label}.`,
    email6: `I also wanted to share ${label}.`,
  };
  return phrases[touchId] ?? "";
}
