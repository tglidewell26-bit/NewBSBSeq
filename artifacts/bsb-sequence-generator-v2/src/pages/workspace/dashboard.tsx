import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { 
  useGetResearchPacket, 
  useAssessCompany,
  useGetAssessmentConfig,
  useReviewAssessment,
  getGetResearchPacketQueryKey,
  PacketRecord,
  NormalizedEvidence,
  InstrumentAssessment
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  ArrowLeft,
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  Loader2,
  FileJson,
  FlaskConical,
  Beaker,
  ShieldCheck,
  ShieldAlert,
  Search,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function PacketDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const packetId = params.id as string;
  
  const { data: packet, isLoading, error } = useGetResearchPacket(packetId, {
    query: {
      enabled: !!packetId,
      queryKey: getGetResearchPacketQueryKey(packetId),
      refetchInterval: 5000
    }
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
        <p>Loading packet details...</p>
      </div>
    );
  }

  if (error || !packet) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <h3 className="text-xl font-bold text-foreground">Failed to load packet</h3>
        <p className="text-muted-foreground mt-2">Could not retrieve packet {packetId}</p>
        <Button variant="outline" className="mt-6" onClick={() => setLocation("/workspace")}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center gap-4 border-b border-border pb-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/workspace")} className="shrink-0 rounded-full">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-foreground truncate">
              Research Packet
            </h1>
            <StageBadge stage={packet.stage} />
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            ID: {packet.id} &bull; Created: {format(new Date(packet.createdAt), "MMM d, yyyy HH:mm:ss")}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <AssessmentActions packet={packet} />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-12 p-0 shrink-0 space-x-6">
            <TabsTrigger value="overview" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full bg-transparent px-2 shadow-none">
              Overview & Brief
            </TabsTrigger>
            <TabsTrigger value="evidence" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full bg-transparent px-2 shadow-none">
              Validated Evidence
            </TabsTrigger>
            <TabsTrigger value="assessment" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full bg-transparent px-2 shadow-none" disabled={!packet.assessment}>
              Instrument Assessment
            </TabsTrigger>
            <TabsTrigger value="raw" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full bg-transparent px-2 shadow-none">
              Raw Payload
            </TabsTrigger>
          </TabsList>
          
          <div className="flex-1 overflow-hidden mt-4">
            <TabsContent value="overview" className="h-full m-0 data-[state=active]:flex flex-col gap-6 overflow-auto pb-6">
              <OverviewTab packet={packet} />
            </TabsContent>
            
            <TabsContent value="evidence" className="h-full m-0 data-[state=active]:flex flex-col overflow-hidden">
              <EvidenceTab packet={packet} />
            </TabsContent>
            
            <TabsContent value="assessment" className="h-full m-0 data-[state=active]:flex flex-col overflow-hidden">
              {packet.assessment && <AssessmentTab packet={packet} />}
            </TabsContent>
            
            <TabsContent value="raw" className="h-full m-0 data-[state=active]:block overflow-hidden">
              <div className="bg-muted/30 border border-border rounded-md h-full overflow-auto">
                <pre className="p-4 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
                  {JSON.stringify(packet.researchPacket, null, 2)}
                </pre>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const getStageColor = () => {
    switch (stage) {
      case "VALIDATED": return "bg-blue-100 text-blue-800 border-blue-200";
      case "NEEDS_REVIEW": return "bg-amber-100 text-amber-800 border-amber-200";
      case "ASSESSED": return "bg-purple-100 text-purple-800 border-purple-200";
      case "APPROVED": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "REJECTED": return "bg-rose-100 text-rose-800 border-rose-200";
      default: return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  return (
    <span className={`px-2.5 py-0.5 text-xs font-bold font-mono tracking-wider rounded-sm border shadow-sm ${getStageColor()}`}>
      {stage.replace('_', ' ')}
    </span>
  );
}

function OverviewTab({ packet }: { packet: PacketRecord }) {
  const v = packet.validation;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
      <div className="md:col-span-2 flex flex-col gap-6">
        <div className="bg-card border border-border rounded-md shadow-sm p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Research Brief</h3>
          {/* Treat brief as display-only, untrusted text */}
          <p className="text-foreground whitespace-pre-wrap font-serif leading-relaxed">
            {packet.researchPacket.brief}
          </p>
        </div>
        
        {packet.review && (
          <div className={`border rounded-md p-6 ${packet.review.decision === 'APPROVE' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20' : 'bg-rose-50 border-rose-200 dark:bg-rose-950/20'}`}>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              {packet.review.decision === 'APPROVE' ? (
                <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Approved for Target Phase</>
              ) : (
                <><XCircle className="w-5 h-5 text-rose-600" /> Assessment Rejected</>
              )}
            </h3>
            <p className="text-sm font-mono mt-1 opacity-80">
              Reviewed on: {format(new Date(packet.review.createdAt), "MMM d, yyyy HH:mm")}
            </p>
            {packet.review.approvedInstruments && packet.review.approvedInstruments.length > 0 && (
              <div className="mt-4 pt-4 border-t border-current/10">
                <p className="text-sm font-semibold mb-2">Approved Instruments:</p>
                <div className="flex gap-2">
                  {packet.review.approvedInstruments.map(i => (
                    <Badge key={i} variant="outline" className="bg-background/50 border-current/20">{i}</Badge>
                  ))}
                </div>
              </div>
            )}
            {packet.review.note && (
              <div className="mt-4 border-t border-current/10 pt-4">
                <p className="text-sm font-semibold">Review note</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{packet.review.note}</p>
              </div>
            )}
            {packet.review.demoMode && (
              <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-2 text-xs font-bold text-amber-900">
                SYNTHETIC DEMONSTRATION REVIEW — not a validated real-company assessment.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div className="bg-card border border-border rounded-md shadow-sm p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Validation Results</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Structural Integrity</span>
              {v.structurallyValid ? 
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : 
                <XCircle className="w-5 h-5 text-destructive" />
              }
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Evidence Support Status</span>
              {v.supportValid ? 
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : 
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              }
            </div>

            <Separator />
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 p-3 rounded-sm text-center">
                <div className="text-2xl font-bold font-mono text-foreground">{packet.normalizedEvidence.length}</div>
                <div className="text-xs text-muted-foreground uppercase mt-1">Claims</div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-sm text-center border border-amber-200 dark:border-amber-900/50">
                <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-500">{v.warnings.length}</div>
                <div className="text-xs text-amber-700/70 dark:text-amber-500/70 uppercase mt-1">Warnings</div>
              </div>
            </div>
          </div>
        </div>

        {v.warnings.length > 0 && (
          <div className="bg-card border border-amber-200 dark:border-amber-900/50 rounded-md shadow-sm p-0 overflow-hidden flex flex-col max-h-[300px]">
            <div className="bg-amber-50 dark:bg-amber-950/30 p-3 border-b border-amber-200 dark:border-amber-900/50 shrink-0">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-500 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Validation Warnings
              </h3>
            </div>
            <ScrollArea className="flex-1 p-3">
              <ul className="space-y-3">
                {v.warnings.map((w, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-mono text-xs text-muted-foreground block mb-0.5">{w.path}</span>
                    <span className="text-foreground">{w.message}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}

function EvidenceTab({ packet }: { packet: PacketRecord }) {
  const [filter, setFilter] = useState<string>("all");
  
  const filtered = packet.normalizedEvidence.filter(e => {
    if (filter === "all") return true;
    if (filter === "supported") return e.supportStatus === "SUPPORTED";
    if (filter === "unsupported") return e.supportStatus === "UNSUPPORTED";
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")} className="rounded-full">All ({packet.normalizedEvidence.length})</Button>
        <Button variant={filter === "supported" ? "default" : "outline"} size="sm" onClick={() => setFilter("supported")} className="rounded-full">Supported ({packet.normalizedEvidence.filter(e => e.supportStatus === "SUPPORTED").length})</Button>
        <Button variant={filter === "unsupported" ? "default" : "outline"} size="sm" onClick={() => setFilter("unsupported")} className="rounded-full">Unsupported ({packet.normalizedEvidence.filter(e => e.supportStatus === "UNSUPPORTED").length})</Button>
      </div>

      <ScrollArea className="flex-1 pr-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-6">
          {filtered.map((e) => (
            <div key={e.evidenceId} className="bg-card border border-border rounded-md shadow-sm p-5 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono">{e.assessmentType}</Badge>
                  {e.supportStatus === "SUPPORTED" ? (
                    <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50"><CheckCircle2 className="w-3 h-3 mr-1"/> Supported</Badge>
                  ) : e.supportStatus === "UNSUPPORTED" ? (
                    <Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50"><XCircle className="w-3 h-3 mr-1"/> Unsupported</Badge>
                  ) : e.supportStatus === "SUPPORT_NOT_VERIFIED" ? (
                    <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50"><AlertTriangle className="w-3 h-3 mr-1"/> Support not verified</Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-600 border-slate-200 bg-slate-50">N/A</Badge>
                  )}
                </div>
                <span className="text-xs font-mono text-muted-foreground">{e.evidenceId}</span>
              </div>
              
              {packet.assessment?.evidenceReviews?.filter(review => review.evidenceId === e.evidenceId).map(review => (
                <div key={review.evidenceId} className="mb-3 rounded bg-muted/40 p-2 text-xs">
                  <strong>AI source review: {review.verdict}</strong><p>{review.reason}</p>
                  {review.quote && <blockquote className="mt-1 border-l-2 pl-2">{review.quote}</blockquote>}
                </div>
              ))}
              <p className="text-foreground font-medium text-sm mb-4">
                {e.claim}
              </p>
              
              <div className="mt-auto pt-4 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Source Basis</p>
                <ul className="list-disc pl-4 space-y-1 mb-3">
                  {e.basisFacts.map((f, i) => (
                    <li key={i} className="text-xs text-foreground/80">{f}</li>
                  ))}
                </ul>
                
                {e.supportIssues && e.supportIssues.length > 0 && (
                  <div className="mt-3 bg-rose-50 dark:bg-rose-950/20 p-2 rounded border border-rose-100 dark:border-rose-900/50">
                    <p className="text-xs font-semibold text-rose-800 dark:text-rose-400 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Support Issues</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {e.supportIssues.map((iss, i) => (
                        <li key={i} className="text-xs text-rose-700 dark:text-rose-300">{iss}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function AssessmentTab({ packet }: { packet: PacketRecord }) {
  const ass = packet.assessment!;

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-4">
      <div className="bg-accent/30 border border-accent-foreground/20 rounded-md p-4 mb-6 shrink-0 flex items-start gap-4">
        <ShieldAlert className="w-6 h-6 text-accent-foreground mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-accent-foreground uppercase tracking-wider">{ass.mock ? "Demonstration Assessment" : "AI Assessment — Review Required"}</h3>
          <p className="text-sm text-foreground/80 mt-1">
            {ass.mock ? "Synthetic demonstration only; not a real-company qualification."
              : `${ass.model}: scientific fit is separate from instrument use and commercial readiness. Supplied public excerpts were not independently retrieved.`}
          </p>
        </div>
      </div>

      {ass.selectionReason && <p className="mb-4 text-sm"><strong>Recommended: {ass.selectedInstruments?.join(", ") || "No instrument selected"}.</strong> {ass.selectionReason}</p>}
      {ass.usage && <p className="mb-4 text-xs text-muted-foreground">Estimated API cost: ${ass.usage.estimatedCostUsd.toFixed(4)} · {ass.usage.inputTokens} input / {ass.usage.outputTokens} output tokens</p>}
      {ass.limitations.length > 0 && <ul className="mb-4 list-disc pl-5 text-sm text-muted-foreground">{ass.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-6">
          {ass.instruments.map((inst, idx) => (
            <InstrumentCard key={idx} instrument={inst} />
          ))}
        </div>
    </div>
  );
}

function InstrumentCard({ instrument: i }: { instrument: InstrumentAssessment }) {
  const getFitColor = (fit: string) => {
    switch (fit) {
      case "STRONG_FIT": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "POTENTIAL_FIT": return "bg-blue-100 text-blue-800 border-blue-200";
      case "NOT_QUALIFIED": return "bg-rose-100 text-rose-800 border-rose-200";
      default: return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  return (
    <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          {i.instrument}
        </h3>
        <Badge className={`${getFitColor(i.fit)} shadow-none`}>{i.fit.replace('_', ' ')}</Badge>
      </div>
      
      <div className="p-5 flex-1 flex flex-col gap-6">
        <div>
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Recommendation</Label>
          <p className="text-sm text-foreground leading-relaxed">{i.recommendation}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Account Status</Label>
            <p className="text-sm text-foreground">{i.accountStatus}</p>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Readiness</Label>
            <p className="text-sm text-foreground">{i.readiness}</p>
          </div>
        </div>

        <Separator />

        <div>
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Current Use</Label>
          <p className="text-sm text-foreground">{i.currentUse}</p>
        </div>

        {i.alternatives.length > 0 && (
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Alternatives Considered</Label>
            <ul className="list-disc pl-4 space-y-1">
              {i.alternatives.map((alt, idx) => (
                <li key={idx} className="text-sm text-foreground">{alt}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto pt-4 flex gap-2">
          <Badge variant="outline" className="font-mono text-[10px] bg-background">
            {i.evidenceIds.length} Evidence Links
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px] bg-background">
            {i.ruleIds.length} Rules Applied
          </Badge>
        </div>
      </div>
    </div>
  );
}

function AssessmentActions({ packet }: { packet: PacketRecord }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: config } = useGetAssessmentConfig();
  const [demoConfirmed, setDemoConfirmed] = useState(false);
  const run = packet.assessmentRun;
  const assess = useAssessCompany({ mutation: {
    retry: false,
    onSuccess: () => toast({ title: "Assessment ready for review." }),
    onError: (error) => toast({ title: "Assessment did not complete", description: String(error.name) === "AbortError"
      ? "The browser stopped waiting. Reloading the saved status; the server may still be working."
      : error.message, variant: "destructive" }),
    onSettled: () => qc.invalidateQueries({ queryKey: getGetResearchPacketQueryKey(packet.id) }),
  } });
  const running = run?.state === "RUNNING";
  const uncertain = run?.state === "OUTCOME_UNKNOWN";
  const retryAllowed = run?.state === "FAILED" && run.attempt < 2;
  const canAssess = !packet.review && (!packet.assessment || (packet.assessment.mock && !packet.assessment.demoMode));
  if (running || uncertain) return <div className="max-w-md text-sm" role="status">
    <p>{running ? "Assessing company… Saved progress refreshes automatically." : "Assessment outcome uncertain. No additional paid call will be started."}</p>
    {run?.error && <p className="text-muted-foreground">{run.error.error}</p>}
  </div>;
  if (canAssess) return <div className="flex max-w-xl flex-col gap-2">
    {run?.error && <div role="alert" className="rounded border border-destructive/30 p-2 text-xs">
      <p>{run.error.error}</p>
      {run.error.issues?.map((issue, index) => <p key={index}>{issue.path}: {issue.message}</p>)}
    </div>}
    {!config?.enabled && <p className="text-xs text-muted-foreground">Live AI setup required: {config?.missing.join(", ") || "Checking configuration…"}</p>}
    <div className="flex flex-wrap items-center gap-3">
      {!run && !packet.assessment && <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Checkbox checked={demoConfirmed} onCheckedChange={value => setDemoConfirmed(value === true)} /> Synthetic demo only
      </label>}
      <Button disabled={assess.isPending || (!demoConfirmed && (!config?.enabled || (!!run && !retryAllowed)))}
        onClick={() => assess.mutate({ packetId: packet.id, data: {
          mode: demoConfirmed ? "DEMO_SYNTHETIC" : "REAL_INPUT", retry: retryAllowed,
        } })} className="gap-2">
        {assess.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {demoConfirmed ? "Run Synthetic Demo" : retryAllowed ? "Retry assessment (paid)" : "Assess company"}
      </Button>
    </div>
    {!demoConfirmed && config?.enabled && <p className="text-xs text-muted-foreground">One AI call · reserves ${config.reservationUsd.toFixed(2)} from the ${config.dailyLimitUsd.toFixed(2)} daily limit. No automatic retries.</p>}
  </div>;
  return packet.stage === "ASSESSED" ? <ReviewDialog packet={packet} /> : null;
}

function ReviewDialog({ packet }: { packet: PacketRecord }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [note, setNote] = useState("");
  const [approvedInstruments, setApprovedInstruments] = useState<string[]>(packet.assessment?.selectedInstruments ?? []);
  const [confirmSecond, setConfirmSecond] = useState(false);
  
  const { toast } = useToast();
  const qc = useQueryClient();
  const review = useReviewAssessment({
    mutation: {
      onSuccess: (data) => {
        qc.setQueryData(getGetResearchPacketQueryKey(packet.id), (old: any) => 
          old ? { ...old, stage: data.decision === "APPROVE" ? "APPROVED" : "REJECTED", review: data } : old
        );
        toast({ title: `Assessment ${data.decision.toLowerCase()} successfully.` });
        setOpen(false);
      },
      onError: (err) => {
        toast({ title: "Review failed", description: err.message, variant: "destructive" });
      }
    }
  });

  const availableInstruments = packet.assessment?.instruments
    .filter((i) => ["STRONG_FIT", "POTENTIAL_FIT"].includes(i.fit) && i.evidenceIds.length > 0 && (packet.assessment?.mock || packet.assessment?.selectedInstruments?.includes(i.instrument)))
    .map(i => i.instrument) || [];

  const handleToggleInst = (inst: string) => {
    setApprovedInstruments(prev => {
      if (prev.includes(inst)) return prev.filter(i => i !== inst);
      if (prev.length >= 2) return prev; // Max 2
      return [...prev, inst];
    });
  };

  const handleSubmit = () => {
    if (decision === "APPROVE" && approvedInstruments.length === 0) {
      toast({ title: "Validation Error", description: "You must select at least one instrument to approve.", variant: "destructive" });
      return;
    }
    review.mutate({
      packetId: packet.id,
      data: {
        assessmentId: packet.assessment!.id,
        evidenceVersion: packet.assessment!.evidenceVersion,
        decision,
        approvedInstruments: decision === "APPROVE" ? approvedInstruments as any[] : [],
        note,
        confirmSecond: decision === "APPROVE" && approvedInstruments.length > 1 ? confirmSecond : false,
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" className="gap-2 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => { setDecision("REJECT"); setOpen(true); }}>
        <XCircle className="w-4 h-4" /> Reject
      </Button>
      {packet.assessment?.approvable && (
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setDecision("APPROVE"); setOpen(true); }}>
          <CheckCircle2 className="w-4 h-4" /> {packet.assessment?.mock ? "Approve Demonstration" : "Approve Assessment"}
        </Button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-md shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className={`p-4 border-b ${decision === 'APPROVE' ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
              <h2 className={`text-lg font-semibold flex items-center gap-2 ${decision === 'APPROVE' ? 'text-emerald-800' : 'text-rose-800'}`}>
                {decision === 'APPROVE' ? <><CheckCircle2 className="w-5 h-5"/> Approve Assessment</> : <><XCircle className="w-5 h-5"/> Reject Assessment</>}
              </h2>
            </div>
            
            <div className="p-6 flex flex-col gap-6">
              {decision === "APPROVE" && (
                <div>
                  <Label className="text-sm font-semibold mb-3 block">Select Approved Instruments (Max 2)</Label>
                  <div className="space-y-3">
                    {availableInstruments.map(inst => (
                      <div key={inst} className="flex items-center space-x-3">
                        <Checkbox 
                          id={`inst-${inst}`} 
                          checked={approvedInstruments.includes(inst)}
                          onCheckedChange={() => handleToggleInst(inst)}
                          disabled={!approvedInstruments.includes(inst) && approvedInstruments.length >= 2}
                        />
                        <Label htmlFor={`inst-${inst}`} className="text-sm font-medium leading-none cursor-pointer">
                          {inst}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {approvedInstruments.length}/2 selected
                  </p>
                  {approvedInstruments.length > 1 && (
                    <label className="mt-4 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <Checkbox checked={confirmSecond} onCheckedChange={(value) => setConfirmSecond(value === true)} />
                      I explicitly confirm the second recommended instrument.
                    </label>
                  )}
                </div>
              )}
              
              <div>
                <Label htmlFor="review-note" className="text-sm font-semibold mb-2 block">Review Note (Optional)</Label>
                <Textarea 
                  id="review-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add context to your decision..."
                  className="resize-none"
                  rows={4}
                />
              </div>
            </div>
            
            <div className="p-4 border-t border-border bg-muted/20 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleSubmit} 
                disabled={review.isPending}
                className={decision === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white'}
              >
                {review.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirm {decision === 'APPROVE' ? 'Approval' : 'Rejection'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
