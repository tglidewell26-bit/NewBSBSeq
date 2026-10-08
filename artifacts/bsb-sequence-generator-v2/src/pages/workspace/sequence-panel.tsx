import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sequenceBodyParts, sequenceBodyText, sequenceBodyHtml } from "@workspace/api-zod/sequence-format";
import type { PacketRecord } from "@workspace/api-client-react";
import type {
  DraftTouch,
  OutreachSettings,
  SequenceJob,
  SavedTrip,
  SequenceAuthority,
  RenderedTouch,
} from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import TripPicker from "./trip-picker";
import { restoreTripDraft, TRIP_DRAFT_KEY } from "./trip-utils";

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    `/api/bsb-v2${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      [
        data.error,
        ...(data.issues ?? []).map((i: any) => `${i.path}: ${i.message}`),
      ].join("\n"),
    );
  return data;
}
const initial: OutreachSettings = {
  mode: "GENERAL",
  firstName: "",
  meetingMode: "VIRTUAL",
  timezone: "America/Los_Angeles",
  trip1: [],
  trip2: [],
  allowAccountFacts: false,
};
const active = (j: SequenceJob) =>
  ["QUEUED", "WRITING", "VALIDATING"].includes(j.state);
async function copyMessage(body: string) {
  const text = sequenceBodyText(body);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([sequenceBodyHtml(body)], { type: "text/html" }),
      })]);
      return;
    } catch { /* Fall back to readable plain text when rich copy is unsupported. */ }
  }
  await navigator.clipboard.writeText(text);
}
export default function SequencePanel({ packet }: { packet: PacketRecord }) {
  const [settings, setSettings] = useState<OutreachSettings>(() => {
    try {
      return {
        ...initial,
        ...restoreTripDraft(localStorage.getItem(TRIP_DRAFT_KEY)),
        timezone: initial.timezone,
      };
    } catch {
      return initial;
    }
  });
  const [tripStorageError, setTripStorageError] = useState("");
  useEffect(() => {
    try {
      const { meetingMode, timezone, trip1, trip2 } = settings;
      localStorage.setItem(
        TRIP_DRAFT_KEY,
        JSON.stringify({ meetingMode, timezone, trip1, trip2 }),
      );
      setTripStorageError("");
    } catch {
      setTripStorageError(
        "This browser cannot remember your current trip selection. Use Save as new trip to keep it in the workspace.",
      );
    }
  }, [settings.meetingMode, settings.timezone, settings.trip1, settings.trip2]);
  const savedTrips = useQuery({
    queryKey: ["saved-trips"],
    queryFn: () => api<SavedTrip[]>("/trips"),
  });
  async function saveTrip(trip: Omit<SavedTrip, "createdAt">) {
    await api<SavedTrip>("/trips", trip);
    await savedTrips.refetch();
  }
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [edits, setEdits] = useState<DraftTouch[] | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const actionKey = useRef<string | null>(null);
  const jobs = useQuery({
    queryKey: ["sequences", packet.id],
    queryFn: () => api<SequenceJob[]>(`/packets/${packet.id}/sequences`),
    refetchInterval: 3000,
  });
  const config = useQuery({
    queryKey: ["sequence-config"],
    queryFn: () =>
      api<{
        enabled: boolean;
        missing: string[];
        model: string;
      }>("/sequence-config"),
  });
  const job = jobs.data?.find((j) => j.id === selected) ?? jobs.data?.[0];
  const busy = pending || !!jobs.data?.some(active);
  const allowed =
    packet.stage === "APPROVED" &&
    packet.assessment?.provider === "OPENAI" &&
    !packet.assessment.mock;
  async function action(path: string, body: unknown) {
    setPending(true);
    setError("");
    try {
      const result = await api<SequenceJob>(path, body);
      setSelected(result.id);
      setEdits(null);
      actionKey.current = null;
      await jobs.refetch();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Request interrupted. Reload saved job status before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  function generate() {
    actionKey.current ??= crypto.randomUUID();
    void action(`/packets/${packet.id}/sequences`, {
      idempotencyKey: actionKey.current,
      settings:
        edits && job
          ? job.authority.settings
          : settings.meetingMode === "VIRTUAL"
            ? { ...settings, trip1: [], trip2: [] }
            : settings,
      ...(edits && job ? { editOf: job.id, edits } : {}),
    });
  }
  function set<K extends keyof OutreachSettings>(
    key: K,
    value: OutreachSettings[K],
  ) {
    setSettings((s) => ({ ...s, [key]: value }));
  }
  const slots = (key: "trip1" | "trip2", title: string) => (
    <TripPicker
      title={title}
      slots={settings[key]}
      timezone={settings.timezone}
      savedTrips={savedTrips.data ?? []}
      loading={savedTrips.isLoading}
      disabled={busy}
      onChange={(value) => set(key, value)}
      onSave={saveTrip}
      onLoad={(trip) =>
        setSettings((s) => ({
          ...s,
          [key]: trip.slots.map((slot) => ({ ...slot })),
          timezone: initial.timezone,
        }))
      }
    />
  );
  return (
    <div className="h-full min-h-0 overflow-y-auto pr-2 space-y-5 pb-8">
      <div className="rounded border bg-card p-5 space-y-4">
        <h3 className="font-semibold text-lg">Create outreach sequence</h3>
        {!allowed ? (
          <p>
            Approve a real instrument assessment before generating outreach.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Nine touches using your approved{" "}
              {packet.review?.approvedInstruments?.join(" / ")} assessment.
              Review the content and dates before sending.
            </p>
            {!edits && (
              <fieldset disabled={busy} className="space-y-4">
                <div className="flex flex-wrap gap-4">
                  <label className="text-sm">
                    Recipient
                    <select
                      className="block border rounded p-2 bg-background"
                      value={settings.mode}
                      onChange={(e) => {
                        set("mode", e.target.value as any);
                        set("firstName", "");
                      }}
                    >
                      <option value="GENERAL">
                        General — first-name placeholder
                      </option>
                      <option value="INDIVIDUAL">Named person</option>
                    </select>
                  </label>
                  {settings.mode === "INDIVIDUAL" && (
                    <label className="text-sm">
                      First name
                      <Input
                        value={settings.firstName}
                        onChange={(e) => set("firstName", e.target.value)}
                        maxLength={60}
                      />
                    </label>
                  )}
                  <label className="text-sm">
                    Meeting
                    <select
                      className="block border rounded p-2 bg-background"
                      value={settings.meetingMode}
                      onChange={(e) => {
                        set("meetingMode", e.target.value as any);
                      }}
                    >
                      <option value="VIRTUAL">Virtual</option>
                      <option value="IN_PERSON">In person</option>
                    </select>
                  </label>
                </div>
                {settings.meetingMode === "IN_PERSON" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Your current selection is remembered in this browser.
                      Named trips are saved in the workspace and can be loaded
                      for either trip.
                    </p>
                    {tripStorageError && (
                      <p role="alert" className="text-sm text-destructive">
                        {tripStorageError}
                      </p>
                    )}
                    {savedTrips.error && (
                      <p role="alert" className="text-sm text-destructive">
                        Saved trips could not be loaded. You can still select
                        travel days manually.{" "}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => void savedTrips.refetch()}
                        >
                          Retry
                        </button>
                      </p>
                    )}
                    {slots("trip1", "First trip")}
                    {slots("trip2", "Second trip — optional")}
                    <p className="text-xs text-muted-foreground">
                      Email 4 introduces the second trip and “Sorry I missed you
                      last time.” Earlier touches use the first trip. Schedule
                      Email 4 after the first trip; this app does not send
                      messages.
                    </p>
                  </>
                )}
                <label className="flex gap-2 items-start text-sm">
                  <input
                    type="checkbox"
                    checked={settings.allowAccountFacts}
                    onChange={(e) => set("allowAccountFacts", e.target.checked)}
                  />{" "}
                  Allow my account-confirmed facts in customer-facing copy.
                  Public evidence is used by default.
                </label>
              </fieldset>
            )}
            {edits && (
              <p className="text-sm">
                Editing the scientific text creates a new revision for
                validation. The previously approved sequence remains intact;
                names and meeting blocks remain fixed.
              </p>
            )}
            {!config.data?.enabled && (
              <p className="text-sm text-amber-700">
                Sequence setup: {config.data?.missing.join(", ") ?? "Checking…"}
              </p>
            )}
            <Button disabled={busy || !config.data?.enabled} onClick={generate}>
              {pending
                ? "Submitting…"
                : edits
                  ? "Validate edited revision"
                  : "Generate sequence"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {edits
                ? "One paid review call"
                : "Two paid OpenAI calls"}
              . No automatic paid retries.
            </p>
          </>
        )}
        {(error || jobs.error || config.error) && (
          <p
            role="alert"
            className="whitespace-pre-wrap text-sm text-destructive"
          >
            {error || String(jobs.error || config.error)}
          </p>
        )}
      </div>
      {!!jobs.data?.length && (
        <label className="block text-sm">
          Saved jobs
          <select
            aria-label="Saved sequence jobs"
            className="block w-full border rounded p-2 bg-background"
            value={job?.id ?? ""}
            onChange={(e) => {
              setSelected(e.target.value);
              setEdits(null);
              setCopyStatus("");
            }}
          >
            {jobs.data.map((j) => (
              <option key={j.id} value={j.id}>
                {new Date(j.createdAt).toLocaleString()} —{" "}
                {j.state.replaceAll("_", " ")}
                {j.revisionOf
                  ? " · edited revision"
                  : j.retryOf
                    ? " · targeted regeneration"
                    : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {job && (
        <>
          <div role="status" className="rounded border p-4 space-y-2">
            <strong>{job.state.replaceAll("_", " ")}</strong>
            {active(job) && (
              <>
                <p className="text-sm">
                  Progress is saved on the server. You can refresh this page.
                </p>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => void action(`/sequences/${job.id}/cancel`, {})}
                >
                  Cancel generation
                </Button>
              </>
            )}
            {job.error && <p className="text-sm">{job.error}</p>}
            <p className="text-xs text-muted-foreground">
              {job.usage.length} completed model calls · estimated API cost $
              {job.usage.reduce((n, u) => n + u.estimatedCostUsd, 0).toFixed(4)}{" "}
            </p>
            {job.canRegenerate && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => {
                  actionKey.current ??= crypto.randomUUID();
                  void action(`/sequences/${job.id}/regenerate`, {
                    idempotencyKey: actionKey.current,
                  });
                }}
              >
                Repair flagged messages (paid)
              </Button>
            )}
            {job.canRegenerate && (
              <p className="text-xs text-muted-foreground">
                Only flagged messages are rewritten; other messages are preserved. Two
                paid calls. No app spending cap.
              </p>
            )}
          </div>
          {job.violations.map((v, i) => (
            <div
              role={v.ruleId === "VOICE" ? "note" : "alert"}
              key={i}
              className={v.ruleId === "VOICE" ? "border rounded p-3 text-sm" : "border border-destructive/40 rounded p-3 text-sm"}
            >
              <strong>
                {v.touchId} · {v.ruleId === "VOICE" ? "Optional style suggestion" : v.ruleId}
              </strong>
              <p>{v.message}</p>
              <blockquote className="my-2 border-l-2 pl-2">
                {v.rejectedSpan}
              </blockquote>
              <p>{v.nextAction}</p>
            </div>
          ))}
          {job.state === "VALIDATION_FAILED" && !!job.draftTouches?.length && (
            <details open className="rounded border p-4 space-y-3">
              <summary className="cursor-pointer font-medium">Draft for review — not approved for sending</summary>
              {job.draftTouches.length < 9 && <p className="text-sm">This older job retained only the messages that passed. Rejected passages are shown above.</p>}
              {job.draftTouches.map(touch => {
                const issues = job.violations.filter(v => v.touchId === touch.touchId);
                const spans = issues.map(v => v.rejectedSpan).filter(Boolean);
                const parts: { text: string; flagged: boolean }[] = [];
                let rest = touch.middle;
                while (rest) {
                  const matches = spans.map(span => ({ span, at: rest.indexOf(span) })).filter(m => m.at >= 0).sort((a, b) => a.at - b.at);
                  const match = matches[0];
                  if (!match) { parts.push({ text: rest, flagged: false }); break; }
                  if (match.at) parts.push({ text: rest.slice(0, match.at), flagged: false });
                  parts.push({ text: match.span, flagged: true });
                  rest = rest.slice(match.at + match.span.length);
                }
                return <article key={touch.touchId} className="border-t pt-3 text-sm">
                  <strong>{touch.touchId} · {issues.length ? "Needs correction" : "Preserved"}</strong>
                  <p>{touch.subject}</p>
                  <p className="whitespace-pre-wrap">{parts.map((part, i) => part.flagged ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>)}</p>
                </article>;
              })}
            </details>
          )}
          <details className="rounded border p-4">
            <summary className="cursor-pointer font-medium">
              Evidence and message plan
            </summary>
            <p className="text-xs mt-2 text-muted-foreground">
              {job.authority.catalogVersion} · {job.authority.planVersion}
            </p>
            {job.authority.plan.map((p) => (
              <div key={p.touchId} className="border-t mt-3 pt-3 text-sm">
                <strong>{p.touchId}</strong>
                <p>{p.purpose.replace("a direct question about how the prospect studies that biology", "a direct question asking whether a proposed measurement is relevant unless their current workflow is explicitly established")}</p>
                {job.authority.evidence
                  .filter((e) => p.evidenceIds.includes(e.evidenceId))
                  .map((e) => (
                    <p key={e.evidenceId} className="mt-1">
                      {e.claim}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({e.provenanceType})
                      </span>
                    </p>
                  ))}
                {job.authority.capabilities
                  .filter((c) => c.id === p.capabilityId)
                  .map((c) => (
                    <div key={c.id} className="mt-2">
                      <p>{c.claim}</p>
                      <p className="text-muted-foreground">{c.limitation}</p>
                      <a
                        className="underline"
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Product source
                      </a>
                    </div>
                  ))}
                <TouchAssets authority={job.authority} touchId={p.touchId} />
              </div>
            ))}
          </details>
          {job.state === "APPROVED" && job.sequence && (
            <>
              <div className="flex flex-wrap gap-3 items-center">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await copyMessage(
                        job
                          .sequence!.map(
                            (t) =>
                              `${t.touchId}\n${t.subject ? `Subject: ${t.subject}\n\n` : ""}${t.body}`,
                          )
                          .join("\n\n---\n\n"),
                      );
                      setCopyStatus("Copied approved sequence text. Download and attach any suggested files separately.");
                    } catch {
                      setCopyStatus(
                        "Clipboard unavailable. Use Download text.",
                      );
                    }
                  }}
                >
                  Copy approved sequence
                </Button>
                <a
                  className="text-sm underline"
                  href={`/api/bsb-v2/sequences/${job.id}/export`}
                >
                  Download text
                </a>
                <Button
                  variant="outline"
                  disabled={busy || job.sequence.length !== 9}
                  onClick={() => {
                    setEdits(
                      job.sequence!.map(({ touchId, subject, middle }) => ({
                        touchId,
                        subject,
                        middle,
                      })),
                    );
                    setError("");
                  }}
                >
                  Edit scientific copy
                </Button>
                {edits && (
                  <Button variant="ghost" onClick={() => setEdits(null)}>
                    Discard edits
                  </Button>
                )}
                <span className="text-xs" role="status">
                  {copyStatus}
                </span>
              </div>
              {job.sequence.length !== 9 && <p className="text-sm text-muted-foreground">Saved legacy sequence: copy and download remain available. Generate a new sequence to use the nine-step trip order.</p>}
              <ResourceCoverage authority={job.authority} sequence={job.sequence} />
              {job.sequence.map((t, index) => (
                <article
                  key={t.touchId}
                  className="rounded border bg-card p-5 space-y-3"
                >
                  <h4 className="font-semibold">{index + 1}. {t.touchId.startsWith("email") ? `Email ${t.touchId.slice(5)}` : t.touchId === "liConnect" ? "LinkedIn connection request" : `LinkedIn message ${t.touchId.slice(5)}`}</h4>
                  {edits ? (
                    <>
                      {t.touchId.startsWith("email") && (
                        <label className="block text-sm">
                          Subject
                          <Input
                            value={edits[index].subject}
                            onChange={(e) =>
                              setEdits(
                                edits.map((d, n) =>
                                  n === index
                                    ? { ...d, subject: e.target.value }
                                    : d,
                                ),
                              )
                            }
                          />
                        </label>
                      )}
                      <Label>
                        {t.touchId === "liConnect" ? "Connection request (fixed wording)" : "Scientific middle (meeting copy and resource links are added automatically)"}
                      </Label>
                      <Textarea
                        rows={6}
                        disabled={t.touchId === "liConnect"}
                        value={edits[index].middle}
                        onChange={(e) =>
                          setEdits(
                            edits.map((d, n) =>
                              n === index
                                ? { ...d, middle: e.target.value }
                                : d,
                            ),
                          )
                        }
                      />
                    </>
                  ) : (
                    <>
                      {t.subject && (
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">Subject: {t.subject}</p>
                          <Button variant="outline" size="sm" onClick={async () => {
                            try { await navigator.clipboard.writeText(t.subject); setCopyStatus("Copied subject."); }
                            catch { setCopyStatus("Clipboard unavailable. Select the subject to copy it."); }
                          }}>Copy subject</Button>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{sequenceBodyParts(t.body).map((part, i) => part.href
                        ? <a key={i} className="text-primary underline" href={part.href} target="_blank" rel="noreferrer">{part.text}</a>
                        : part.bold ? <strong key={i}>{part.text}</strong> : part.text)}</p>
                      <Button variant="outline" size="sm" onClick={async () => {
                        try { await copyMessage(t.body); setCopyStatus("Copied body and links. Suggested files must be attached separately."); }
                        catch { setCopyStatus("Clipboard unavailable. Select the body to copy it."); }
                      }}>Copy body</Button>
                      <TouchAssets authority={job.authority} touchId={t.touchId} suggestions={t.assetSuggestions} />
                    </>
                  )}
                </article>
              ))}
              {edits && (
                <Button disabled={busy} onClick={generate}>
                  Validate edited revision
                </Button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function TouchAssets({ authority, touchId, suggestions }: { authority: SequenceAuthority; touchId: string; suggestions?: NonNullable<RenderedTouch["assetSuggestions"]> }) {
  const plan = authority.plan.find(p => p.touchId === touchId);
  const assets = suggestions?.map(s => s.asset) ?? (authority.assets ?? []).filter(a => plan?.assetIds.includes(a.id));
  const current = useQuery({ queryKey: ["knowledge-assets"], queryFn: () => api<Array<{ id: string; revision: number }>>("/assets"), enabled: assets.length > 0 });
  if (!touchId.startsWith("email") || !assets.length) return null;
  return <div className="mt-3 space-y-3 rounded-md border bg-muted/20 p-3">
    <p className="text-sm font-medium">Optional library suggestions</p>
    {assets.map(asset => {
      const match = suggestions?.find(s => s.asset.id === asset.id)?.match ?? plan?.assetMatches?.find(m => m.assetId === asset.id);
      const available = current.data?.some(a => a.id === asset.id && a.revision === asset.revision);
      const image = match?.kind === "image" || asset.fileKind === "image" || /\.(png|jpe?g|webp)$/i.test(asset.fileName);
      return <div key={asset.id} className="space-y-1 text-sm">
        <p className="font-medium break-words">{asset.displayName}</p>
        <p className="text-xs text-muted-foreground break-all">{asset.fileKind === "link" ? "Linked resource" : image ? "Suggested email image" : "Suggested attachment"} · {asset.fileName} · reviewed revision {asset.revision}</p>
        {image && available && <img className="max-h-72 max-w-full rounded border bg-background object-contain" src={`/api/bsb-v2/assets/${asset.id}/preview?revision=${asset.revision}`} alt={asset.displayName} loading="lazy" />}
        <p>{match?.reason}</p>
        <p className="text-xs text-muted-foreground">Company evidence: {match?.evidenceIds.join(", ")}</p>
        {available ? <a className="inline-block underline text-primary" href={asset.fileKind === "link" ? asset.sourceUrl ?? undefined : `/api/bsb-v2/assets/${asset.id}/download?revision=${asset.revision}`} target={asset.fileKind === "link" ? "_blank" : undefined} rel="noopener noreferrer">{asset.fileKind === "link" ? "Open resource" : image ? "Download image" : "Download attachment"}</a>
          : <p role="status" className="text-xs text-muted-foreground">{current.isLoading ? "Checking file…" : current.isError ? "Could not check file availability. Reload before sending." : "This file was changed or deleted. Generate a new sequence to refresh its resource selection."}</p>}
      </div>;
    })}
    <p className="text-xs text-muted-foreground">Resource hyperlinks are included when copying the email. Images and attachments must be downloaded and added in your email tool.</p>
  </div>;
}

function ResourceCoverage({ authority, sequence }: { authority: SequenceAuthority; sequence: RenderedTouch[] }) {
  const emails = sequence.filter(t => t.touchId.startsWith("email") && authority.plan.some(p => p.touchId === t.touchId && ["GeoMx", "CosMx"].includes(p.instrument ?? "")));
  if (!emails.length) return null;
  const imageEmails = emails.filter(t => t.assetSuggestions?.some(s => s.match.kind === "image")).length;
  const target = Math.min(4, emails.length);
  const resourceEmails = emails.filter(t => t.assetSuggestions?.some(s => s.match.kind === "attachment" || s.match.kind === "link") || sequenceBodyParts(t.body).some(p => p.href && p.text !== "Bruker Spatial Biology" && p.text !== "GeoMx" && p.text !== "CosMx")).length;
  const linkedEmails = emails.filter(t => sequenceBodyParts(t.body).some(p => p.href && !/\/(?:geomx-dsp-overview|single-cell-imaging-overview)\/?$/.test(p.href) && p.href !== "https://brukerspatialbiology.com/" && p.text !== "GeoMx" && p.text !== "CosMx")).length;
  return <div className="rounded-md border bg-muted/20 p-3 text-sm" role="status">
    <p>GeoMx/CosMx resources: {resourceEmails}/{emails.length} emails · Additional body links: {linkedEmails}/{Math.min(2, emails.length)} minimum · Images: {imageEmails}/{target} target</p>
    {imageEmails < target && <p className="mt-1 text-muted-foreground">Add more images with descriptions and keywords matching these email topics, then generate a new sequence.</p>}
  </div>;
}
