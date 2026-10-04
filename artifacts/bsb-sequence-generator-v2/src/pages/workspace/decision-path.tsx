import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetResearchPacketQueryKey, type DecisionStep, type PacketRecord } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Step = DecisionStep & { humanOverride?: { reason: string; createdAt: string; originalAnswer: { label: string; reasoning: string; citations: { evidenceId: string; quote: string }[] } } };
type Node = { id: string; text: string; type: string; instrument?: string; answers?: { label: string; next: string }[] };

export default function DecisionPath({ path, buyerUnit, treeHash, outcome, packet, graph }: {
  path: Step[]; buyerUnit: string; treeHash: string; outcome?: string; packet?: PacketRecord; graph?: { [key: string]: unknown };
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Step | null>(null);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [baseAssessmentId, setBaseAssessmentId] = useState("");
  const [history, setHistory] = useState<{ id: string; state: string; revision: { originalAssessment: NonNullable<PacketRecord["assessment"]> } }[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const nodes = (graph?.nodes ?? []) as Node[];
  const node = nodes.find(n => n.id === selected?.nodeId);
  const nextId = editing ? node?.answers?.find(a => a.label === label)?.next : selected?.next;
  const next = nodes.find(n => n.id === nextId);
  const blocked = busy || packet?.stage === "ASSESSING" || ["RUNNING", "OUTCOME_UNKNOWN"].includes(packet?.assessmentRun?.state ?? "");
  const stale = !!selected && !!packet && baseAssessmentId !== packet.assessment?.id;
  const canEdit = !!packet?.assessment && !packet.assessment.mock && !!node?.answers && !blocked && !stale;
  const inspect = (step: Step) => { setSelected(step); setBaseAssessmentId(packet?.assessment?.id ?? ""); setLabel(step.label); setReason(""); setError(""); setEditing(false); };
  async function run() {
    if (!packet?.assessment || !selected || !reason.trim() || blocked || stale) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/bsb-v2/packets/${encodeURIComponent(packet.id)}/decision-override`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: baseAssessmentId, nodeId: selected.nodeId, label, reason: reason.trim() }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "The correction could not be completed.");
      setSelected(null); setHistory(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Request interrupted. Reload to check saved progress before trying again."); }
    finally { setBusy(false); await qc.invalidateQueries({ queryKey: getGetResearchPacketQueryKey(packet!.id) }); }
  }
  return <section className="mb-6 rounded border p-4">
    <h3 className="font-semibold">Decision path — {buyerUnit}</h3>
    <p className="mt-1 text-xs text-muted-foreground">Tree version: {treeHash.slice(0, 12)}. Click any answered question to inspect or change it.</p>
    <ol className="mt-4 space-y-2">
      {path.map((step, index) => <li key={step.nodeId}>
        <button type="button" onClick={() => inspect(step)} className="w-full rounded border p-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">
          <span className="font-medium">{index + 1}. {step.question}</span>
          <span className="mt-1 block text-sm font-semibold">{step.label}{step.humanOverride ? " · User correction" : ""}</span>
        </button>
      </li>)}
    </ol>
    {outcome ? <p className="mt-4 font-semibold">Outcome: {outcome}</p> : <p className="mt-4 text-sm">{path.length} completed questions saved. No final outcome yet.</p>}
    {packet && <div className="mt-3">
      <Button variant="outline" size="sm" onClick={async () => {
        if (history) { setHistory(null); return; }
        try {
          setHistoryError("");
          const response = await fetch(`/api/bsb-v2/packets/${encodeURIComponent(packet.id)}/assessment-history`, { credentials: "include" });
          if (!response.ok) throw new Error("Could not load decision history.");
          setHistory(await response.json());
        } catch (e) { setHistoryError(String(e)); }
      }}>{history ? "Hide history" : "View previous decisions"}</Button>
      {historyError && <p role="alert">{historyError}</p>}
      {history?.length === 0 && <p className="mt-2 text-sm">No branch corrections have been recorded.</p>}
      {history?.map(h => { const t = h.revision.originalAssessment.decisionTrace; return t && <details key={h.id} className="mt-3">
        <summary className="cursor-pointer text-sm">Previous result: {t.outcome.instrument} — correction {h.state.toLowerCase()}</summary>
        <DecisionPath path={t.path} buyerUnit={t.buyerUnit} treeHash={t.treeHash} graph={t.graph} outcome={t.outcome.text} />
      </details>; })}
    </div>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !busy) setSelected(null); }}>
      <DialogContent>
        <DialogTitle>{selected?.question}</DialogTitle>
        <DialogDescription>{buyerUnit} — {selected?.humanOverride ? "User-corrected answer" : "Model answer"}: {selected?.label}</DialogDescription>
        {selected && <>
          <div className="text-sm"><h4 className="font-semibold">Why this answer</h4><p className="whitespace-pre-wrap">{selected.reasoning}</p></div>
          {selected.lookFor && <div className="text-sm"><h4 className="font-semibold">Question guidance</h4><p>{selected.lookFor}</p></div>}
          <div className="text-sm"><h4 className="font-semibold">Supporting evidence</h4>
            {selected.citations.length ? selected.citations.map(c => {
              const evidence = packet?.normalizedEvidence.find(e => e.evidenceId === c.evidenceId);
              const url = evidence?.sourceUrl;
              return <blockquote key={c.evidenceId} className="mt-2 rounded bg-muted p-2"><p>{c.quote}</p>
                <p className="mt-1 text-xs">{evidence?.sourceLabel || c.evidenceId}</p>
                {url && /^https?:\/\//i.test(url) && <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open source</a>}
              </blockquote>;
            }) : <p>No supporting citations were supplied for this answer.</p>}
          </div>
          {selected.humanOverride && <details className="text-sm"><summary>Previous answer: {selected.humanOverride.originalAnswer.label}</summary>
            <p>{selected.humanOverride.originalAnswer.reasoning}</p>
            {selected.humanOverride.originalAnswer.citations.map(c => <blockquote key={c.evidenceId}>{c.quote}</blockquote>)}
            <p>Corrected {new Date(selected.humanOverride.createdAt).toLocaleString()}</p>
          </details>}
          {editing && <>
            <div><Label htmlFor="branch-answer">Answer</Label>
              <select id="branch-answer" className="mt-1 w-full rounded border bg-background p-2" value={label} disabled={busy} onChange={e => setLabel(e.target.value)}>
                {node?.answers?.map(a => <option key={a.label} value={a.label}>{a.label}</option>)}
              </select>
            </div>
            <div><Label htmlFor="branch-reason">Reason (required)</Label>
              <Textarea id="branch-reason" value={reason} maxLength={4000} disabled={busy} onChange={e => setReason(e.target.value)} placeholder="What did you find or confirm? Include a source or meeting detail when available." />
            </div>
            <p className="text-xs text-muted-foreground">Your answer is saved as a user correction, not original research. Earlier questions will not run again. Only subsequent questions may incur AI charges. A completed revision needs fresh approval; existing outreach is not rewritten.</p>
          </>}
          <div className="rounded bg-muted p-3 text-sm"><strong>{editing ? "New next branch" : "Next branch followed"}</strong><p>{next ? `${next.text}${next.instrument ? ` — ${next.instrument}` : ""}` : nextId}</p></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {stale && <p role="alert" className="text-sm text-destructive">The assessment changed while this popup was open. Close it and select the question again.</p>}
          {blocked && !busy && <p className="text-sm">An assessment is running or its outcome is uncertain. Editing is disabled until it is resolved.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>Cancel</Button>
            {editing ? <Button disabled={blocked || stale || !reason.trim()} onClick={() => void run()} className="bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500">{busy ? "Running…" : "Run"}</Button>
              : <Button disabled={!canEdit} onClick={() => setEditing(true)}>Change</Button>}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}
