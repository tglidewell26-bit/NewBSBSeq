import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListResearchPacketsQueryKey,
  useListResearchPackets,
  useSubmitResearchPacket,
  type ResearchPacket,
} from "@workspace/api-client-react";
import { AlertTriangle, ArrowRight, FileJson, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function PacketList() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [parseError, setParseError] = useState("");
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

  const preview = useMemo(() => {
    try {
      const value = JSON.parse(raw) as ResearchPacket;
      return { brief: typeof value?.brief === "string" ? value.brief : "Brief missing", schemaVersion: typeof value?.schemaVersion === "string" ? value.schemaVersion : "Missing or invalid" };
    } catch {
      return null;
    }
  }, [raw]);

  const processRaw = () => {
    setParseError("");
    let researchPacket: ResearchPacket;
    try {
      researchPacket = JSON.parse(raw) as ResearchPacket;
    } catch {
      setParseError("Enter valid JSON. The submitted body must be the researchPacket object itself.");
      return;
    }
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
        <p className="mt-2 max-w-3xl text-muted-foreground">Paste or upload the exact producer packet. Both paths submit the identical <span className="font-mono">researchPacket</span> object. No prose extraction, repairs, legacy markers, or sequence writing.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Raw JSON</h2>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Upload JSON</Button>
          </div>
          <Textarea value={raw} onChange={(event) => setRaw(event.target.value)} className="min-h-72 font-mono text-xs" placeholder={'{"schemaVersion":"bsb-company-research-v1", ...}'} />
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
              <button key={packet.id} type="button" onClick={() => navigate(`/workspace/packet/${packet.id}`)} className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50">
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{packet.brief}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{packet.id}</p></div>
                <span className="rounded border px-2 py-1 font-mono text-[10px] font-bold">{packet.stage}</span><ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
