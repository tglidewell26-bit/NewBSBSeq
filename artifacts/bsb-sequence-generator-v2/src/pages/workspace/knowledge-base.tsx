import { ChangeEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Image, LibraryBig, Loader2, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const instruments = ["GeoMx", "CosMx", "CellScape", "Unknown"];
const areas = ["Neuroscience", "Cancer", "Infectious disease", "Genetic disorders", "Aging", "Kidney disease", "Cardiology", "Unknown"];
const types = ["Publications", "Tech notes", "Images", "Panels and Brochures"];
type Asset = { id: string; fileName: string; displayName: string; fileType: string; fileSize: number; fileKind: "document" | "image"; instrument: string; researchArea: string | null; assetType: string; description: string; keywords: string[]; storagePath: string; classificationReasoning: string; };
type Draft = { file: File; data: string; displayName: string; instrument: string; researchArea: string; assetType: string; description: string; keywords: string; reasoning: string; };
const bytes = (size: number) => size < 1024 * 1024 ? `${Math.round(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const assetKey = ["knowledge-assets"] as const;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || body?.issues?.join(" ") || "The knowledge-base request failed.");
  return body;
}
async function readFile(file: File) {
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(new Error("The file could not be read.")); reader.readAsDataURL(file); });
  return data;
}

export default function KnowledgeBase() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [instrumentFilter, setInstrumentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const { data: assets = [], isLoading } = useQuery({ queryKey: assetKey, queryFn: () => api<Asset[]>("/api/bsb-v2/assets") });
  const save = useMutation({
    mutationFn: (value: Draft) => api<Asset>("/api/bsb-v2/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: value.file.name, displayName: value.displayName, fileDataBase64: value.data, fileKind: value.file.type.startsWith("image/") ? "image" : "document", instrument: value.instrument, researchArea: value.assetType === "Panels and Brochures" ? null : value.researchArea, assetType: value.assetType, description: value.description, keywords: value.keywords.split(",").map(x => x.trim()).filter(Boolean), classificationReasoning: value.reasoning }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: assetKey }); setDraft(null); toast({ title: "Asset saved to the knowledge base." }); },
    onError: error => toast({ title: "Asset was not saved", description: error.message, variant: "destructive" }),
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/api/bsb-v2/assets/${id}`, { method: "DELETE" }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: assetKey }); toast({ title: "Asset deleted." }); }, onError: error => toast({ title: "Asset was not deleted", description: error.message, variant: "destructive" }) });
  const filtered = useMemo(() => assets.filter(asset => (!query || [asset.fileName, asset.displayName, asset.description, ...asset.keywords].join(" ").toLowerCase().includes(query.toLowerCase())) && (!instrumentFilter || asset.instrument === instrumentFilter) && (!typeFilter || asset.assetType === typeFilter) && (!areaFilter || asset.researchArea === areaFilter)), [assets, query, instrumentFilter, typeFilter, areaFilter]);
  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast({ title: "File is too large", description: "The knowledge base accepts files up to 25 MB.", variant: "destructive" }); return; }
    try { const data = await readFile(file); setDraft({ file, data, displayName: file.name.replace(/\.[^.]+$/, ""), instrument: "Unknown", researchArea: file.type.startsWith("image/") ? "Unknown" : "Unknown", assetType: file.type.startsWith("image/") ? "Images" : "Publications", description: "", keywords: "", reasoning: "" }); }
    catch (error) { toast({ title: "File could not be read", description: error instanceof Error ? error.message : "Try the upload again.", variant: "destructive" }); }
  };
  return <div className="space-y-6 pb-10">
    <section><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Knowledge base</p><h1 className="mt-2 text-3xl font-bold">Bruker asset library</h1><p className="mt-2 max-w-3xl text-muted-foreground">Store approved PDFs and images once, with consistent metadata. Company research stays separate; this library will later supply only relevant, approved proof assets to the sequence planner.</p></section>
    <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" />Knowledge base upload</CardTitle><CardDescription>Upload a PDF, PNG, JPG, JPEG, or WebP (up to 25 MB), then review the required metadata before saving.</CardDescription></CardHeader><CardContent>
        {!draft ? <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center hover:bg-muted/50"><Upload className="mb-3 h-7 w-7 text-muted-foreground" /><span className="font-medium">Choose a file</span><span className="mt-1 text-sm text-muted-foreground">Original files are stored with their reviewed metadata.</span><input className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={selectFile} /></label> : <div className="space-y-4"><div className="rounded-md border bg-muted/30 p-3"><p className="font-medium">{draft.file.name}</p><p className="text-sm text-muted-foreground">{bytes(draft.file.size)} · {draft.file.type.startsWith("image/") ? "image" : "document"}</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Display name"><Input value={draft.displayName} onChange={e => setDraft({ ...draft, displayName: e.target.value })} /></Field><Field label="Instrument"><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.instrument} onChange={e => setDraft({ ...draft, instrument: e.target.value })}>{instruments.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Asset type"><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.assetType} onChange={e => setDraft({ ...draft, assetType: e.target.value, researchArea: e.target.value === "Panels and Brochures" ? "" : draft.researchArea || "Unknown" })}>{types.map(value => <option key={value}>{value}</option>)}</select></Field>{draft.assetType !== "Panels and Brochures" && <Field label="Research area"><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.researchArea} onChange={e => setDraft({ ...draft, researchArea: e.target.value })}>{areas.map(value => <option key={value}>{value}</option>)}</select></Field>}</div><Field label="Description (at least three complete sentences)"><Textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></Field><Field label="Five retrieval keywords (comma-separated)"><Input value={draft.keywords} onChange={e => setDraft({ ...draft, keywords: e.target.value })} placeholder="FFPE, antibody panel, oncology, ..." /></Field><Field label="Why this classification is correct"><Textarea value={draft.reasoning} onChange={e => setDraft({ ...draft, reasoning: e.target.value })} /></Field><div className="flex gap-3"><Button disabled={save.isPending} onClick={() => save.mutate(draft)}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{save.isPending ? "Saving…" : "Save to knowledge base"}</Button><Button variant="outline" disabled={save.isPending} onClick={() => setDraft(null)}>Discard</Button></div></div>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><LibraryBig className="h-5 w-5 text-primary" />Saved files ({assets.length})</CardTitle><CardDescription>Browse by instrument, asset type, and research area—the same hierarchy used in the original app.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-2 md:grid-cols-4"><div className="relative md:col-span-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search name, description, or keyword…" value={query} onChange={e => setQuery(e.target.value)} /></div><Filter value={instrumentFilter} set={setInstrumentFilter} label="All instruments" options={instruments} /><Filter value={typeFilter} set={setTypeFilter} label="All asset types" options={types} /><Filter value={areaFilter} set={setAreaFilter} label="All research areas" options={areas} /></div>{isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : filtered.length === 0 ? <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No assets match this view.</p> : <div className="space-y-3">{filtered.map(asset => <article key={asset.id} className="rounded-lg border p-4"><div className="flex gap-3"><div className="pt-0.5 text-primary">{asset.fileKind === "image" ? <Image className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start gap-2"><h3 className="font-medium">{asset.displayName}</h3><Badge>{asset.instrument}</Badge><Badge>{asset.assetType}</Badge>{asset.researchArea && <Badge>{asset.researchArea}</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{asset.fileName} · {bytes(asset.fileSize)}</p><p className="mt-3 text-sm text-muted-foreground">{asset.description}</p><div className="mt-3 flex flex-wrap gap-1">{asset.keywords.map(keyword => <span key={keyword} className="rounded bg-muted px-2 py-1 text-xs">{keyword}</span>)}</div><div className="mt-4 flex gap-2"><a className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted" href={`/api/bsb-v2/assets/${asset.id}/download`}><Download className="mr-1 h-3.5 w-3.5" />Download</a><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete ${asset.displayName}?`)) remove.mutate(asset.id); }}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button></div></div></div></article>)}</div>}</CardContent></Card>
    </div>
  </div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-sm"><Label>{label}</Label>{children}</label>; }
function Filter({ value, set, label, options }: { value: string; set: (value: string) => void; label: string; options: string[] }) { return <select aria-label={label} className="h-9 rounded-md border bg-background px-2 text-sm" value={value} onChange={e => set(e.target.value)}><option value="">{label}</option>{options.map(option => <option key={option}>{option}</option>)}</select>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded border px-2 py-0.5 text-[10px] font-mono font-semibold">{children}</span>; }
