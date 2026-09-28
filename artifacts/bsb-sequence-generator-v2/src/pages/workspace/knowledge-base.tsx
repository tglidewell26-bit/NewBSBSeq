import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Link, FileText, Image, LibraryBig, Loader2, Pencil, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

import { runAnalysisQueue } from "./asset-analysis-queue";

const instruments = ["GeoMx", "CosMx", "CellScape", "Unknown"];
const areas = ["Neuroscience", "Cancer", "Infectious disease", "Genetic disorders", "Aging", "Kidney disease", "Cardiology", "Unknown"];
const types = ["Publications", "Tech notes", "Images", "Panels and Brochures", "Webinars", "Other resources"];
type Metadata = { sourceUrl?: string | null; displayName: string; instrument: string; researchArea: string | null; assetType: string; description: string; keywords: string[]; classificationReasoning: string };
type Asset = Metadata & { id: string; revision: number; fileName: string; fileSize: number; fileKind: "document" | "image" | "link" };
type Draft = Omit<Metadata, "keywords"> & { key: string; isLink?: boolean; keywords: string; asset?: Asset; file?: File; data?: string; analysis?: "queued" | "analyzing" | "ready" | "failed"; analysisError?: string; estimatedCostUsd?: number };
type Analysis = { metadata: Metadata; usage: { estimatedCostUsd: number } };
const bytes = (size: number) => size < 1024 * 1024 ? `${Math.round(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const assetKey = ["knowledge-assets"] as const;
const endpoint = "/api/bsb-v2/assets";
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error([body?.error, ...(body?.issues ?? [])].filter(Boolean).join(" ") || "The knowledge-base request failed."), { code: body?.errorType });
  return body;
}
async function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}
const fileKind = (name: string) => /\.pdf$/i.test(name) ? "document" : "image";
function uploadDraft(file: File, data: string): Draft {
  return { key: crypto.randomUUID(), file, data, analysis: "queued", displayName: file.name.replace(/\.[^.]+$/, ""), instrument: "Unknown",
    researchArea: "Unknown", assetType: fileKind(file.name) === "image" ? "Images" : "Publications", description: "", keywords: "", classificationReasoning: "" };
}

export default function KnowledgeBase() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [instrumentFilter, setInstrumentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reading, setReading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const queue = useRef({ running: false, stop: false });
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; queue.current.stop = true; }; }, []);
  const draft = drafts[0];
  const library = useQuery({ queryKey: assetKey, queryFn: () => api<Asset[]>(endpoint) });
  const assets = library.data ?? [];
  const config = useQuery({ queryKey: ["asset-analysis-config"], queryFn: () => api<{ enabled: boolean }>(`${endpoint}/analysis/config`) });
  const updateDraft = (value: Draft) => setDrafts(items => items.map(item => item.key === value.key ? value : item));
  const finishDraft = (key: string) => setDrafts(items => items.filter(item => item.key !== key));
  const save = useMutation({
    mutationFn: (value: Draft) => {
      const metadata = { sourceUrl: value.sourceUrl || null, displayName: value.displayName, instrument: value.instrument,
        researchArea: value.assetType === "Panels and Brochures" ? null : value.researchArea,
        assetType: value.assetType, description: value.description, keywords: value.keywords.split(",").map(x => x.trim()).filter(Boolean), classificationReasoning: value.classificationReasoning };
      return value.asset ? api<Asset>(`${endpoint}/${value.asset.id}`, json("PATCH", { ...metadata, revision: value.asset.revision }))
        : api<Asset>(endpoint, json("POST", { ...metadata, fileName: value.isLink ? value.displayName || "Web resource" : value.file!.name, fileDataBase64: value.data ?? "", fileKind: value.isLink ? "link" : fileKind(value.file!.name) }));
    },
    onSuccess: (_, value) => { queryClient.invalidateQueries({ queryKey: assetKey }); finishDraft(value.key); toast({ title: value.asset ? "Asset updated." : "Asset saved to the knowledge base." }); },
    onError: error => toast({ title: "Asset was not saved", description: error.message, variant: "destructive" }),
  });
  const analyzeBatch = async (items: Draft[]) => {
    items = items.filter(item => !item.isLink && item.asset?.fileKind !== "link");
    if (queue.current.running || !items.length) return;
    queue.current = { running: true, stop: false };
    setPauseRequested(false); setAnalyzing(true);
    const patch = (key: string, value: Partial<Draft>) => {
      if (mounted.current) setDrafts(current => current.map(item => item.key === key ? { ...item, ...value } : item));
    };
    try {
      await runAnalysisQueue(items, {
        stopped: () => queue.current.stop || !mounted.current,
        analyze: async value => {
          patch(value.key, { analysis: "analyzing", analysisError: undefined });
          const result = await api<Analysis>(`${endpoint}/analyze`, json("POST", value.asset ? { assetId: value.asset.id } : { fileName: value.file!.name, fileDataBase64: value.data }));
          patch(value.key, { ...result.metadata, keywords: result.metadata.keywords.join(", "), analysis: "ready", estimatedCostUsd: result.usage.estimatedCostUsd });
        },
        failed: (value, error) => patch(value.key, { analysis: "failed", analysisError: error.message }),
      });
    } finally {
      queue.current.running = false;
      if (mounted.current) { setAnalyzing(false); setPauseRequested(false); }
    }
  };
  const remove = useMutation({
    mutationFn: (id: string) => api(`${endpoint}/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: assetKey }); toast({ title: "Asset deleted." }); },
    onError: error => toast({ title: "Asset was not deleted", description: error.message, variant: "destructive" }),
  });
  const busy = save.isPending || analyzing || reading;
  const filtered = useMemo(() => assets.filter(asset => (!query.trim() || [asset.fileName, asset.displayName, asset.description, ...asset.keywords].join(" ").toLowerCase().includes(query.trim().toLowerCase())) && (!instrumentFilter || asset.instrument === instrumentFilter) && (!typeFilter || asset.assetType === typeFilter) && (!areaFilter || asset.researchArea === areaFilter)), [assets, query, instrumentFilter, typeFilter, areaFilter]);
  const selectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []); event.target.value = "";
    if (!files.length) return;
    if (files.length > 10 || files.some(file => file.size > 25 * 1024 * 1024 || file.size === 0) || files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) {
      toast({ title: "Upload limit exceeded", description: "Choose up to 10 files, up to 25 MB each and 50 MB combined. Empty files cannot be uploaded.", variant: "destructive" }); return;
    }
    setReading(true);
    try {
      const uploads = await Promise.all(files.map(async file => uploadDraft(file, await readFile(file))));
      if (!mounted.current) return;
      setDrafts(uploads);
      const analysisConfig = config.data ?? (await config.refetch()).data;
      if (mounted.current && analysisConfig?.enabled) await analyzeBatch(uploads);
    }
    catch (error) { toast({ title: "File could not be read", description: (error as Error).message, variant: "destructive" }); }
    finally { setReading(false); }
  };
  const edit = (asset: Asset) => {
    save.reset();
    setDrafts([{ ...asset, isLink: asset.fileKind === "link", key: asset.id, asset, keywords: asset.keywords.join(", ") }]);
    document.getElementById("asset-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const assetCard = (asset: Asset) => <article key={asset.id} className="rounded-lg border bg-background p-4">
    <div className="flex items-start gap-2">
      {asset.fileKind === "image" ? <Image className="mt-1 h-4 w-4 shrink-0 text-primary" /> : <FileText className="mt-1 h-4 w-4 shrink-0 text-primary" />}
      <div className="min-w-0"><h4 className="break-words font-medium">{asset.displayName}</h4><p className="break-all text-xs text-muted-foreground">{asset.fileKind === "link" ? asset.sourceUrl : `${asset.fileName} · ${bytes(asset.fileSize)}`}</p></div>
    </div>
    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{asset.description}</p>
    <div className="mt-3 flex flex-wrap gap-1">{asset.keywords.map(keyword => <span key={keyword} className="rounded bg-muted px-2 py-1 text-xs">{keyword}</span>)}</div>
    <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Classification reasoning</summary><p className="mt-2 whitespace-pre-wrap">{asset.classificationReasoning}</p></details>
    <div className="mt-3 flex flex-wrap gap-1">
      <a className="inline-flex h-8 items-center rounded-md border px-2 text-xs hover:bg-muted" href={asset.fileKind === "link" ? asset.sourceUrl ?? undefined : `${endpoint}/${asset.id}/download`} target={asset.fileKind === "link" ? "_blank" : undefined} rel="noopener noreferrer"><Download className="mr-1 h-3.5 w-3.5" />{asset.fileKind === "link" ? "Open resource" : "Download"}</a>
      <Button variant="ghost" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(asset.fileName); toast({ title: "Filename copied." }); } catch { toast({ title: "Clipboard unavailable", description: asset.fileName }); } }}><Copy className="mr-1 h-3.5 w-3.5" />Copy name</Button>
      <Button variant="ghost" size="sm" disabled={!!draft || busy || remove.isPending} onClick={() => edit(asset)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
      <Button variant="ghost" size="sm" className="text-destructive" disabled={remove.isPending || !!draft || busy} onClick={() => { if (window.confirm(`Delete ${asset.displayName} and its original file? This cannot be undone.`)) remove.mutate(asset.id); }}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
    </div>
  </article>;

  return <div className="space-y-6 pb-10">
    <section><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Knowledge base</p><h1 className="mt-2 text-3xl font-bold">Bruker asset library</h1><p className="mt-2 max-w-3xl text-muted-foreground">Save reference files or resource links for outreach. GeoMx and CosMx sequences include a resource in every email and target images in at least four. CellScape keeps optional resource suggestions.</p></section>
    <div className="grid items-start gap-6 xl:grid-cols-[.85fr_1.15fr]">
      <Card id="asset-editor" className="min-w-0"><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" />{draft?.asset ? "Edit saved asset" : "Knowledge base upload"}</CardTitle><CardDescription>Upload PDFs or images, or add a webinar, publication or other HTTPS link with a summary and keywords. Uploaded files can be analyzed automatically; links use the details you enter.</CardDescription></CardHeader><CardContent>
        <div className="mb-4 space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
          <p>No app spending cap.</p>
          <p className="text-xs text-muted-foreground">{config.data?.enabled ? "Selecting files sends them to OpenAI for paid analysis, one at a time. Existing results are reused. No automatic retries." : config.isLoading ? "Checking AI setup…" : "AI analysis is unavailable. You can enter and save metadata manually."}</p>
        </div>
        {!!draft && !draft.asset && !draft.isLink && <div className="mb-4 space-y-2 rounded-md border p-3" aria-live="polite">
          <p className="text-sm font-medium">{analyzing ? "Analyzing uploads…" : drafts.some(item => item.analysis === "queued") ? "Analysis queue paused" : "Batch ready for review"}</p>
          <ul className="max-h-44 space-y-1 overflow-y-auto text-xs">{drafts.map(item => <li key={item.key} className="break-words">{item.file?.name} — {item.analysis === "ready" ? "Ready for review" : item.analysis === "failed" ? "Needs attention" : item.analysis === "analyzing" ? "Analyzing…" : "Queued"}{item.analysisError && <p className="text-destructive">{item.analysisError}</p>}</li>)}</ul>
          {analyzing ? <Button size="sm" variant="outline" disabled={pauseRequested} onClick={() => { queue.current.stop = true; setPauseRequested(true); }}>{pauseRequested ? "Pausing after current file…" : "Pause after current file"}</Button>
            : drafts.some(item => item.analysis === "queued") && <Button size="sm" variant="outline" disabled={busy || !config.data?.enabled} onClick={() => void analyzeBatch(drafts.filter(item => item.analysis === "queued"))}>Analyze remaining files</Button>}
          <p className="text-xs text-muted-foreground">Keep this page open until you save your files. Nothing is saved automatically.</p>
        </div>}
        {!draft && <Button className="mb-3" variant="outline" disabled={busy} onClick={() => setDrafts([{ key: crypto.randomUUID(), isLink: true, sourceUrl: "", displayName: "", instrument: "GeoMx", researchArea: "Unknown", assetType: "Webinars", description: "", keywords: "", classificationReasoning: "User-reviewed web resource." }])}><Link className="mr-2 h-4 w-4" />Add link</Button>}
        {!draft ? <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center hover:bg-muted/50">
          {reading ? <Loader2 className="mb-3 h-7 w-7 animate-spin" /> : <Upload className="mb-3 h-7 w-7 text-muted-foreground" />}<span className="font-medium">Choose files</span><span className="mt-1 text-sm text-muted-foreground">Up to 10 files / 50 MB combined</span>
          <input className="sr-only" type="file" multiple disabled={busy} accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={selectFiles} />
        </label> : <div className="space-y-4" key={draft.key}>
          <div className="rounded-md border bg-muted/30 p-3"><p className="break-all font-medium">{draft.asset?.fileName ?? draft.file?.name}</p><p className="text-sm text-muted-foreground">{draft.isLink ? "Web resource" : bytes(draft.asset?.fileSize ?? draft.file?.size ?? 0)}{drafts.length > 1 && ` · ${drafts.length} files awaiting review`}</p></div>
          {!draft.isLink && <div className="space-y-2 rounded-md border p-3">
            <Button variant="outline" disabled={busy || !config.data?.enabled} onClick={() => void analyzeBatch([draft])}>{analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{analyzing ? "Reading file…" : draft.analysis === "ready" ? "Reload AI suggestions" : "Analyze this file"}</Button>
            {draft.analysisError && <p role="alert" className="text-sm text-destructive">{draft.analysisError}</p>}
            {draft.estimatedCostUsd !== undefined && <p className="text-xs text-muted-foreground">Estimated analysis cost: ${draft.estimatedCostUsd.toFixed(4)}. Reloading suggestions reuses this result without another AI call.</p>}

          </div>}
          <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
            <MetadataEditor draft={draft} change={updateDraft} />
            <p className="text-xs text-muted-foreground">Review every field against the original resource. Saving records your reviewed metadata; it does not verify scientific claims.</p>
            {save.isError && save.variables?.key === draft.key && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
            <div className="flex flex-wrap gap-2"><Button onClick={() => save.mutate(draft)}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{draft.asset ? "Save changes" : "Save to knowledge base"}</Button><Button variant="outline" onClick={() => { finishDraft(draft.key); save.reset(); }}>{draft.asset ? "Cancel" : "Discard resource"}</Button></div>
          </fieldset>
        </div>}
      </CardContent></Card>
      <Card className="min-w-0"><CardHeader><CardTitle className="flex items-center gap-2"><LibraryBig className="h-5 w-5 text-primary" />Saved files ({assets.length})</CardTitle><CardDescription>Expand an instrument, asset type, and research area to browse your files.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search saved files" className="pl-9" placeholder="Search name, description, or keyword…" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div className="grid gap-2 sm:grid-cols-2"><Filter value={instrumentFilter} set={setInstrumentFilter} label="All instruments" options={instruments} /><Filter value={typeFilter} set={setTypeFilter} label="All asset types" options={types} /><Filter value={areaFilter} set={setAreaFilter} label="All research areas" options={areas} /><Button variant="ghost" onClick={() => { setQuery(""); setInstrumentFilter(""); setTypeFilter(""); setAreaFilter(""); }}>Clear filters</Button></div>
        {library.isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{library.error.message}</p><Button variant="outline" onClick={() => library.refetch()}>Reload library</Button></div>
          : library.isLoading ? <Loader2 aria-label="Loading library" className="h-5 w-5 animate-spin" />
          : filtered.length === 0 ? <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{assets.length ? "No files match these filters." : "Your library is empty. Upload a file to get started."}</p>
          : <div className="space-y-3" key={`${query}|${instrumentFilter}|${typeFilter}|${areaFilter}`}>{instruments.map(instrument => {
            const group = filtered.filter(asset => asset.instrument === instrument);
            return group.length > 0 && <Folder key={instrument} name={instrument} count={group.length} open>
              {types.map(type => {
                const typed = group.filter(asset => asset.assetType === type);
                return typed.length > 0 && <Folder key={type} name={type} count={typed.length} open={!!query || !!typeFilter || !!areaFilter}>
                  {type === "Panels and Brochures" ? typed.map(assetCard) : areas.map(area => {
                    const scoped = typed.filter(asset => asset.researchArea === area);
                    return scoped.length > 0 && <Folder key={area} name={area} count={scoped.length} open={!!query || !!areaFilter}>{scoped.map(assetCard)}</Folder>;
                  })}
                </Folder>;
              })}
            </Folder>;
          })}</div>}
      </CardContent></Card>
    </div>
  </div>;
}

function MetadataEditor({ draft, change }: { draft: Draft; change: (value: Draft) => void }) {
  return <>
    {draft.isLink && <Field label="Resource URL (HTTPS)"><Input type="url" value={draft.sourceUrl ?? ""} onChange={e => change({ ...draft, sourceUrl: e.target.value })} placeholder="https://…" /></Field>}
    <Field label="Display name"><Input maxLength={160} value={draft.displayName} onChange={e => change({ ...draft, displayName: e.target.value })} /></Field>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Instrument"><Select value={draft.instrument} options={instruments} set={instrument => change({ ...draft, instrument })} /></Field>
      <Field label="Asset type"><Select value={draft.assetType} options={types} set={assetType => change({ ...draft, assetType, researchArea: assetType === "Panels and Brochures" ? null : draft.researchArea || "Unknown" })} /></Field>
      {draft.assetType !== "Panels and Brochures" && <Field label="Research area"><Select value={draft.researchArea ?? "Unknown"} options={areas} set={researchArea => change({ ...draft, researchArea })} /></Field>}
    </div>
    <Field label="Description (at least three complete sentences)"><Textarea rows={6} maxLength={6000} value={draft.description} onChange={e => change({ ...draft, description: e.target.value })} /></Field>
    <Field label="Five distinct keywords (comma-separated)"><Input value={draft.keywords} onChange={e => change({ ...draft, keywords: e.target.value })} placeholder="Five terms supported by this resource" /></Field>
    <Field label="Classification reasoning"><Textarea rows={3} maxLength={3000} value={draft.classificationReasoning} onChange={e => change({ ...draft, classificationReasoning: e.target.value })} /></Field>
  </>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-1 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
function Select({ value, set, options }: { value: string; set: (value: string) => void; options: string[] }) { return <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={e => set(e.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select>; }
function Filter({ value, set, label, options }: { value: string; set: (value: string) => void; label: string; options: string[] }) { return <select aria-label={label} className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm" value={value} onChange={e => set(e.target.value)}><option value="">{label}</option>{options.map(option => <option key={option}>{option}</option>)}</select>; }
function Folder({ name, count, open = false, children }: { name: string; count: number; open?: boolean; children: ReactNode }) { return <details open={open} className="rounded-md border bg-muted/20 p-3"><summary className="cursor-pointer text-sm font-medium">{name} <span className="text-muted-foreground">({count})</span></summary><div className="mt-3 space-y-3">{children}</div></details>; }
