import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PacketRecord } from "@workspace/api-client-react";
import type {
  DraftTouch,
  OutreachSettings,
  SequenceJob,
} from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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
export default function SequencePanel({ packet }: { packet: PacketRecord }) {
  const [settings, setSettings] = useState<OutreachSettings>(initial);
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
        reservationUsd: number;
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
      settings: edits && job ? job.authority.settings : settings,
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
    <fieldset className="rounded border p-3 space-y-2">
      <legend className="px-1 font-medium text-sm">{title}</legend>
      {settings[key].map((slot, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-end">
          {(["date", "start", "end"] as const).map((field) => (
            <label key={field} className="text-xs">
              {field}
              <Input
                aria-label={`${title} ${i + 1} ${field}`}
                type={field === "date" ? "date" : "time"}
                value={slot[field]}
                onChange={(e) =>
                  set(
                    key,
                    settings[key].map((s, n) =>
                      n === i ? { ...s, [field]: e.target.value } : s,
                    ),
                  )
                }
              />
            </label>
          ))}
          <Button
            variant="ghost"
            onClick={() =>
              set(
                key,
                settings[key].filter((_, n) => n !== i),
              )
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        disabled={settings[key].length >= 6}
        onClick={() =>
          set(key, [
            ...settings[key],
            { date: "", start: "09:00", end: "17:00" },
          ])
        }
      >
        Add availability
      </Button>
    </fieldset>
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
              Eight touches using your approved{" "}
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
                        if (e.target.value === "VIRTUAL") {
                          set("trip1", []);
                          set("trip2", []);
                        }
                      }}
                    >
                      <option value="VIRTUAL">Virtual</option>
                      <option value="IN_PERSON">In person</option>
                    </select>
                  </label>
                </div>
                {settings.meetingMode === "IN_PERSON" && (
                  <>
                    <label className="block text-sm max-w-sm">
                      Timezone
                      <Input
                        value={settings.timezone}
                        onChange={(e) => set("timezone", e.target.value)}
                        placeholder="America/Los_Angeles"
                      />
                    </label>
                    {slots("trip1", "First trip")}
                    {slots("trip2", "Second trip — optional")}
                    <p className="text-xs text-muted-foreground">
                      Email 5 introduces the second trip and “Sorry I missed you
                      last time.” Earlier touches use the first trip. Schedule
                      Email 5 after the first trip; this app does not send
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
                ? "One review call · reserves $0.35"
                : "Two OpenAI calls · reserves $0.70"}
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
              · reserved ${job.reservedUsd.toFixed(2)}
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
                Regenerate failed touches once (paid)
              </Button>
            )}
            {job.canRegenerate && (
              <p className="text-xs text-muted-foreground">
                Uses the same assignments and preserves validated touches. Two
                calls; another $0.70 reservation must fit your per-job and daily
                limits.
              </p>
            )}
          </div>
          {job.violations.map((v, i) => (
            <div
              role="alert"
              key={i}
              className="border border-destructive/40 rounded p-3 text-sm"
            >
              <strong>
                {v.touchId} · {v.ruleId}
              </strong>
              <p>{v.message}</p>
              <blockquote className="my-2 border-l-2 pl-2">
                {v.rejectedSpan}
              </blockquote>
              <p>{v.nextAction}</p>
            </div>
          ))}
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
                <p>{p.purpose}</p>
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
                      await navigator.clipboard.writeText(
                        job
                          .sequence!.map(
                            (t) =>
                              `${t.touchId}\n${t.subject ? `Subject: ${t.subject}\n\n` : ""}${t.body}`,
                          )
                          .join("\n\n---\n\n"),
                      );
                      setCopyStatus("Copied approved sequence.");
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
                  disabled={busy}
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
              {job.sequence.map((t, index) => (
                <article
                  key={t.touchId}
                  className="rounded border bg-card p-5 space-y-3"
                >
                  <h4 className="font-semibold">{t.touchId}</h4>
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
                        Scientific middle (fixed meeting copy is added
                        automatically)
                      </Label>
                      <Textarea
                        rows={6}
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
                        <p className="font-medium">Subject: {t.subject}</p>
                      )}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {t.body}
                      </p>
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
