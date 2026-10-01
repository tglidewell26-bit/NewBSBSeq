import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getListResearchPacketsQueryKey,
  useListResearchPackets,
  useSubmitResearchPacket,
  type ResearchPacket,
} from "@workspace/api-client-react";
import { AlertTriangle, ArrowRight, FileJson, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Accepts plain JSON, ```json fenced blocks, or JSON with short prose around it (common in ChatGPT replies). */
function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  try { return JSON.parse(trimmed); } catch { /* try other shapes */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch { /* try other shapes */ } }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new SyntaxError("No JSON object found.");
}

const isDossier = (value: any) =>
  !!value && typeof value === "object" && !("qualificationEvidence" in value) &&
  ("buyer_units" in value || "schema_version" in value);

export default function PacketList() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [parseError, setParseError] = useState("");
  const [packetToDelete, setPacketToDelete] = useState<string | null>(null);
  const { data: packets = [], isLoading } = useListResearchPackets({
    query: { queryKey: getListResearchPacketsQueryKey() },
  });
  const submit = useSubmitResearchPacket({
    mutation: {
      onSuccess: (packet) => {
        queryClient.invalidateQueries({ queryKey: getListResearchPacketsQueryKey() });
        navigate(`/workspace/packet/${packet.id}`);
      },
      onError: (error) => toast({ title: "Packet validation failed", description: error.message, variant: "destructive" }),
    },
  });
  const remove = useMutation({
    mutationFn: async (packetId: string) => {
      const response = await fetch(`/api/bsb-v2/packets/${packetId}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Packet could not be deleted.");
      return packetId;
    },
    onSuccess: (packetId) => {
      queryClient.setQueryData(getListResearchPacketsQueryKey(), (current: typeof packets) =>
        current.filter((packet) => packet.id !== packetId),
      );
      setPacketToDelete(null);
      toast({ title: "Packet deleted." });
    },
    onError: (error) => toast({ title: "Packet was not deleted", description: error.message, variant: "destructive" }),
  });

  const preview = useMemo(() => {
    try {
      const value = extractJsonObject(raw) as any;
      if (isDossier(value)) {
        const name = value.organization?.official_name || value.input?.organization_name || "Organization name missing";
        const units = Array.isArray(value.buyer_units) ? value.buyer_units.map((unit: any) => unit?.unit_name).filter(Boolean) : [];
        return {
          schemaVersion: `Account research dossier (${value.schema_version || "version not stated"})`,
          brief: `${name}${units.length ? `\nBuyer units: ${units.join("; ")}` : "\nBuyer units: none listed"}\nIt will be converted to a research packet on submit.`,
        };
      }
      return { brief: typeof value?.brief === "string" ? value.brief : "Brief missing", schemaVersion: typeof value?.schemaVersion === "string" ? value.schemaVersion : "Missing or invalid" };
    } catch {
      return null;
    }
  }, [raw]);

  const processRaw = () => {
    setParseError("");
    let researchPacket: ResearchPacket;
    try {
      researchPacket = extractJsonObject(raw) as ResearchPacket;
    } catch {
      setParseError("No valid JSON object found. Paste the research packet or the ChatGPT account dossier (code fences are fine).");
      return;
    }
    // Dossiers are sent as-is; the server converts them into a research packet.
    submit.mutate({ data: { researchPacket } });
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setRaw(text);
    setParseError("");
  };

  return (
    <div className="space-y-8 pb-10">
      <section>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Research packet intake</p>
        <h1 className="mt-2 text-3xl font-bold">Phase 1 evidence review</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">Paste or upload a research packet, or the account research dossier from the ChatGPT research project. Dossiers are converted into a research packet automatically; anything the converter had to adjust is listed as a review warning.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Raw JSON</h2>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Upload JSON</Button>
          </div>
          <Textarea value={raw} onChange={(event) => setRaw(event.target.value)} className="min-h-72 font-mono text-xs" placeholder={'{"schema_version":"bsb-account-dossier-v1", ...}  or  {"schemaVersion":"bsb-company-research-v1", ...}'} />
          {parseError && <p className="mt-3 flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{parseError}</p>}
          <div className="mt-4 flex justify-end">
            <Button onClick={processRaw} disabled={!raw.trim() || submit.isPending}>
              {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileJson className="mr-2 h-4 w-4" />}
              Validate packet
            </Button>
          </div>
        </div>
        <aside className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Brief preview</h2>
          {preview ? (
            <div className="mt-4 space-y-4">
              <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Schema</p><p className="mt-1 font-mono text-sm">{preview.schemaVersion || "Missing"}</p></div>
              <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Brief</p><p className="mt-1 whitespace-pre-wrap text-sm">{preview.brief}</p></div>
            </div>
          ) : <p className="mt-4 text-sm text-muted-foreground">A safe text-only preview appears after valid JSON is entered.</p>}
        </aside>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Your packets</h2><span className="font-mono text-xs text-muted-foreground">{packets.length} records</span></div>
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : packets.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No packets yet. Submit a synthetic packet above.</div>
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {packets.map((packet) => (
              <div key={packet.id} className="flex items-center gap-2 p-2 transition-colors hover:bg-muted/50">
                <button type="button" onClick={() => navigate(`/workspace/packet/${packet.id}`)} className="flex min-w-0 flex-1 items-center gap-4 rounded p-2 text-left">
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{packet.brief}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{packet.id}</p></div>
                  <span className="rounded border px-2 py-1 font-mono text-[10px] font-bold">{packet.stage}</span><ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Delete packet ${packet.id}`} onClick={() => setPacketToDelete(packet.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
      <AlertDialog open={packetToDelete !== null} onOpenChange={(open) => !open && setPacketToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this packet?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the packet, its assessment history, and its saved sequences. It cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={remove.isPending} onClick={(event) => { event.preventDefault(); if (packetToDelete) remove.mutate(packetToDelete); }}>
              {remove.isPending ? "Deleting…" : "Delete packet"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
