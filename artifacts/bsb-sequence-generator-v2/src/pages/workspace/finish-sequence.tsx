import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Copy,
  Download,
  Sparkles,
  Save,
  FileText,
  Loader2,
} from "lucide-react";
import type { SavedTrip } from "@workspace/api-zod";
import {
  customerText,
  messageHtml,
  unresolvedPlaceholders,
  blockingPlaceholders,
  isLinkedIn,
  messageTitle,
  type FinishInput,
  type FinishMessage,
  type FinishResult,
  type Resource,
  type SavedFinish,
} from "@workspace/api-zod/finisher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import TripPicker from "./trip-picker";
import { copySequence } from "@/lib/sequence-clipboard";

export async function finishApi<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api/bsb-v2/${path}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(body?.error ?? "The request could not be completed.");
  return body;
}
const blank = (): FinishInput => ({
  company: "",
  source: "",
  location: "",
  timezone: "America/Los_Angeles",
  trip1: [],
  trip2: [],
});
export default function FinishSequence({ savedId }: { savedId?: string }) {
  const cache = useQueryClient();
  const [input, setInput] = useState<FinishInput>(blank);
  const [result, setResult] = useState<FinishResult>();
  const [saved, setSaved] = useState<SavedFinish>();
  const [finishedInput, setFinishedInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editingMessages, setEditingMessages] = useState<string[]>([]);
  const revision = useRef(0);
  const trips = useQuery({
    queryKey: ["finisher-trips"],
    queryFn: () => finishApi<SavedTrip[]>("trips"),
  });
  const library = useQuery({
    queryKey: ["knowledge-assets"],
    queryFn: () => finishApi<Resource[]>("assets"),
  });
  useEffect(() => {
    if (!savedId) return;
    if (
      dirtyRef.current &&
      !window.confirm(
        "Open this saved sequence and discard unsaved changes to the current draft?",
      )
    )
      return;
    const request = ++revision.current;
    setLoading(true);
    setError("");
    setStatus("");
    finishApi<SavedFinish>(`finished/${encodeURIComponent(savedId)}`)
      .then((value) => {
        if (request !== revision.current) return;
        setSaved(value);
        setInput(value.input);
        setResult(value);
        setFinishedInput(JSON.stringify(value.input));
        setDirty(false);
      })
      .catch((e) => {
        if (request === revision.current) setError(e.message);
      })
      .finally(() => {
        if (request === revision.current) setLoading(false);
      });
    return () => {
      revision.current++;
    };
  }, [savedId]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const update = (patch: Partial<FinishInput>) => {
    setInput((v) => ({ ...v, ...patch }));
    setDirty(true);
    setStatus("");
  };
  const edit = (id: string, patch: Partial<FinishMessage>) => {
    setResult((v) =>
      v
        ? {
            ...v,
            messages: v.messages.map((m) =>
              m.id === id ? { ...m, ...patch } : m,
            ),
          }
        : v,
    );
    setDirty(true);
    setStatus("");
  };
  const stale = Boolean(result && finishedInput !== JSON.stringify(input));
  const unresolved = result ? blockingPlaceholders(result.messages) : [];
  const recipientFields = result
    ? unresolvedPlaceholders(result.messages).filter(
        (p) => !unresolved.includes(p),
      )
    : [];
  const resources = [
    ...(library.data ?? []),
    ...(result?.resources ?? []).filter(
      (a) => !(library.data ?? []).some((b) => b.id === a.id),
    ),
  ];
  const missing = library.isSuccess
    ? (result?.messages ?? [])
        .flatMap((m) => m.selectedAssetIds)
        .filter((id) => !library.data.some((a) => a.id === id))
    : [];
  async function finish() {
    if (
      result &&
      dirty &&
      !window.confirm(
        "Finish again from the pasted sequence? This replaces the current message edits and resource selections.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const value = await finishApi<FinishResult>("finish", "POST", input);
      value.messages = value.messages.map((m) => ({
        ...m,
        selectedAssetIds: value.suggestions
          .filter((s) => s.messageId === m.id)
          .map((s) => s.assetId),
      }));
      setResult(value);
      setFinishedInput(JSON.stringify(input));
      setDirty(true);
      setStatus(
        "Sequence finished. Review the wording and suggested resources, then save.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!result || stale) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const existing = saved && !saved.legacy;
      const value = await finishApi<SavedFinish>(
        existing ? `finished/${saved.id}` : "finished",
        existing ? "PUT" : "POST",
        {
          input,
          messages: result.messages,
          expectedUpdatedAt: existing ? saved.updatedAt : undefined,
        },
      );
      setSaved(value);
      setDirty(false);
      setStatus("Saved to History.");
      void cache.invalidateQueries({ queryKey: ["finished-history"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(messages: FinishMessage[], bodyOnly = false) {
    try {
      const format = await copySequence(messages, bodyOnly);
      setStatus(
        `Copied ${format === "rich" ? "formatted" : "plain"} customer-facing text. Download selected files below to attach them.`,
      );
    } catch {
      setError(
        "Clipboard access is unavailable. Select the message text and copy it manually.",
      );
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([customerText(result.messages)], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${input.company.replace(/[^a-z0-9-]/gi, "-")}-sequence.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (loading) return <p role="status">Loading saved sequence…</p>;
  const locked = busy || loading;
  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap justify-between gap-4 items-start">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Finish your sequence
          </h1>
          <p className="text-muted-foreground mt-2">
            Your words. Your dates. The right supporting resources.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => {
            if (
              dirty &&
              !window.confirm(
                "Start a new sequence and discard unsaved changes?",
              )
            )
              return;
            setEditorKey((k) => k + 1);
            setInput(blank());
            setResult(undefined);
            setSaved(undefined);
            setDirty(false);
            setError("");
            setStatus("");
          }}
        >
          New sequence
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-4 text-destructive"
        >
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="rounded-lg bg-muted p-4">
          {status}
        </p>
      )}
      <fieldset
        disabled={locked}
        className="rounded-xl border bg-card p-6 space-y-5"
      >
        <legend className="px-2 text-lg font-semibold">
          1. Paste from ChatGPT
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Company
            <Input
              value={input.company}
              maxLength={200}
              onChange={(e) => update({ company: e.target.value })}
              placeholder="e.g. Earli"
            />
          </label>
          <label className="text-sm font-medium">
            Visit location{" "}
            <span className="text-muted-foreground">
              (if used in the sequence)
            </span>
            <Input
              value={input.location}
              maxLength={200}
              onChange={(e) => update({ location: e.target.value })}
              placeholder="e.g. South San Francisco"
            />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Sequence from ChatGPT
          <Textarea
            className="mt-2 min-h-64 font-mono text-sm"
            value={input.source}
            maxLength={120000}
            onChange={(e) => update({ source: e.target.value })}
            placeholder={
              "Instrument: CellScape\n\nEmail 1\nSubject: A question about your research\n\nHi {{FIRST_NAME}},\n...\nI'll be in {{LOCATION}} {{TRIP_1_DATES}}, and I have the following dates and times available:\n{{TRIP_1_AVAILABILITY}}\nWould any of those times work for a brief discussion?\n\nResource note: Help illustrate immune profiling; a related panel or instrument image is welcome."
            }
          />
        </label>
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">
            How ChatGPT should format the handoff
          </summary>
          <p className="mt-2">
            Use Email 1–6, LinkedIn Connection Request, LinkedIn Message 1, and
            LinkedIn Message 2 headings. Add Subject: only for emails. Use{" "}
            {"{{TRIP_1_DATES}}"} or {"{{TRIP_2_DATES}}"} in the visit sentence.
            Put {"{{TRIP_1_AVAILABILITY}}"} or
            {" {{TRIP_2_AVAILABILITY}}"} alone on the next line for a daily
            list, followed by your meeting question. Use {"{{LOCATION}}"} and
            {"{{TIMEZONE}}"} where needed. Put optional resource guidance on one
            line beginning Resource note: beneath each message. It stays out of
            copied emails. Keep the instrument recommendation above the
            messages. Any other placeholders remain visible for you to fill.
          </p>
        </details>
      </fieldset>
      <fieldset
        disabled={locked}
        className="rounded-xl border bg-card p-6 space-y-4"
      >
        <legend className="px-2 text-lg font-semibold">
          2. Set your availability
        </legend>
        <label className="block max-w-sm text-sm font-medium">
          Time zone
          <select
            className="block mt-1 rounded-md border p-2 bg-background w-full"
            value={input.timezone}
            onChange={(e) => update({ timezone: e.target.value })}
          >
            {[
              ...new Set([
                input.timezone,
                "America/Los_Angeles",
                "America/Denver",
                "America/Chicago",
                "America/New_York",
                "UTC",
              ]),
            ].map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
        <p className="text-sm text-muted-foreground">
          Only scheduling placeholders are replaced. Leave trips blank for
          messages that do not use them.
        </p>
        {(["trip1", "trip2"] as const).map((key, i) => (
          <details
            key={`${editorKey}-${saved?.id ?? "new"}-${key}`}
            open={i === 0}
            className="rounded-lg"
          >
            <summary className="cursor-pointer py-2 font-medium">
              {i === 0
                ? "First visit / meeting availability"
                : "Second visit (optional)"}
              {input[key].length ? ` · ${input[key].length} time windows` : ""}
            </summary>
            <TripPicker
              key={`${editorKey}-${saved?.id ?? "new"}-${key}`}
              title={i === 0 ? "First visit" : "Second visit"}
              slots={input[key]}
              timezone={input.timezone}
              savedTrips={trips.data ?? []}
              loading={trips.isLoading}
              disabled={locked}
              onChange={(slots) => update({ [key]: slots })}
              onLoad={(trip) =>
                update({ [key]: trip.slots, timezone: trip.timezone })
              }
              onSave={async (trip) => {
                await finishApi("trips", "POST", trip);
                await cache.invalidateQueries({ queryKey: ["finisher-trips"] });
              }}
            />
          </details>
        ))}
        {trips.isError && (
          <p role="alert" className="text-sm text-destructive">
            Saved trips could not be loaded. You can still enter dates.
          </p>
        )}
        <Button
          size="lg"
          disabled={locked || !input.company.trim() || !input.source.trim()}
          onClick={() => void finish()}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {busy ? "Working…" : "Finish sequence"}
        </Button>
      </fieldset>
      {result && (
        <section className="space-y-5">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <h2 className="text-2xl font-semibold">3. Review and save</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={locked || stale || !!unresolved.length}
                onClick={() => void copy(result.messages)}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy sequence
              </Button>
              <Button
                variant="outline"
                disabled={locked || stale || !!unresolved.length}
                onClick={download}
              >
                <Download className="mr-2 h-4 w-4" />
                Download text
              </Button>
              <Button
                disabled={locked || stale || !!missing.length}
                onClick={() => void save()}
              >
                <Save className="mr-2 h-4 w-4" />
                {saved && !saved.legacy ? "Save changes" : "Save to History"}
              </Button>
            </div>
          </div>
          {stale && (
            <p
              role="alert"
              className="rounded-lg bg-amber-50 text-amber-900 p-4"
            >
              The pasted text or availability changed. Click Finish sequence
              again to apply it before saving or copying.
            </p>
          )}
          {!!unresolved.length && (
            <p
              role="alert"
              className="rounded-lg bg-amber-50 text-amber-900 p-4"
            >
              Fill these placeholders in the messages before copying:{" "}
              {unresolved.join(", ")}. You can save an unfinished draft.
            </p>
          )}
          {!!recipientFields.length && (
            <p className="text-sm text-muted-foreground">
              Recipient fields ({recipientFields.join(", ")}) are kept for your
              sending tool. You can copy the sequence with these fields intact.
            </p>
          )}
          {!!missing.length && (
            <p role="alert">
              A previously selected resource is no longer in the Knowledge Base.
              Remove that selection or choose a replacement.
            </p>
          )}
          {result.warnings
            .filter((w) => !w.startsWith("Fill these placeholders"))
            .map((w, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                {w}
              </p>
            ))}
          {library.isError && (
            <p role="alert">
              The current Knowledge Base could not be loaded.{" "}
              <button
                className="underline"
                onClick={() => void library.refetch()}
              >
                Try again
              </button>
            </p>
          )}
          {result.messages.map((m) => (
            <article
              key={m.id}
              className="rounded-xl border bg-card p-6 space-y-4"
            >
              <div className="flex justify-between items-center gap-3">
                <h3 className="font-semibold text-lg">
                  {messageTitle(m.title)}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    locked || stale || !!blockingPlaceholders([m]).length
                  }
                  onClick={() => void copy([m], true)}
                >
                  Copy message
                </Button>
              </div>
              {!isLinkedIn(m) && (
                <label className="block text-sm">
                  Subject
                  <Input
                    disabled={locked}
                    value={m.subject}
                    onChange={(e) => edit(m.id, { subject: e.target.value })}
                  />
                </label>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() =>
                  setEditingMessages((ids) =>
                    ids.includes(m.id)
                      ? ids.filter((id) => id !== m.id)
                      : [...ids, m.id],
                  )
                }
              >
                {editingMessages.includes(m.id)
                  ? "Done editing"
                  : "Edit message"}
              </Button>
              {editingMessages.includes(m.id) && (
                <label className="block text-sm">
                  Message
                  <Textarea
                    aria-label="Message"
                    disabled={locked}
                    className="min-h-52 mt-1 leading-relaxed"
                    value={m.body}
                    onChange={(e) => edit(m.id, { body: e.target.value })}
                  />
                </label>
              )}
              {!editingMessages.includes(m.id) && (
                <div
                  aria-label={`${messageTitle(m.title)} formatted preview`}
                  className="rounded-md border p-4 text-sm leading-relaxed break-words"
                  dangerouslySetInnerHTML={{ __html: messageHtml(m) }}
                />
              )}
              {m.resourceNote && (
                <details className="text-sm text-muted-foreground">
                  <summary className="cursor-pointer">
                    Resource guidance from ChatGPT (not copied)
                  </summary>
                  <p className="mt-2">{m.resourceNote}</p>
                </details>
              )}
              <div className="border-t pt-4 space-y-3">
                <h4 className="font-medium">Images & attachments</h4>
                <p className="text-sm text-muted-foreground">
                  Suggestions can be direct matches, related resources, or a
                  platform introduction. Select what helps; download files to
                  attach them.
                </p>
                {[
                  ...new Set([
                    ...result.suggestions
                      .filter((s) => s.messageId === m.id)
                      .map((s) => s.assetId),
                    ...m.selectedAssetIds,
                  ]),
                ].map((id) => {
                  const asset = resources.find((a) => a.id === id);
                  if (!asset)
                    return (
                      <label key={id}>
                        <input
                          type="checkbox"
                          checked
                          onChange={() =>
                            edit(m.id, {
                              selectedAssetIds: m.selectedAssetIds.filter(
                                (x) => x !== id,
                              ),
                            })
                          }
                        />{" "}
                        Removed resource — deselect
                      </label>
                    );
                  const suggestion = result.suggestions.find(
                    (s) => s.messageId === m.id && s.assetId === id,
                  );
                  return (
                    <div
                      key={id}
                      className="rounded-lg border p-3 flex items-start gap-3"
                    >
                      <input
                        aria-label={`Use ${asset.displayName} for ${m.title}`}
                        disabled={locked}
                        className="mt-1"
                        type="checkbox"
                        checked={m.selectedAssetIds.includes(id)}
                        onChange={(e) =>
                          edit(m.id, {
                            selectedAssetIds: e.target.checked
                              ? [...m.selectedAssetIds, id]
                              : m.selectedAssetIds.filter((x) => x !== id),
                          })
                        }
                      />
                      {asset.fileKind === "image" ? (
                        <img
                          className="h-20 w-24 rounded object-contain bg-muted"
                          src={`/api/bsb-v2/assets/${encodeURIComponent(id)}/preview`}
                          alt={asset.displayName}
                        />
                      ) : (
                        <FileText className="h-5 w-5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{asset.displayName}</p>
                        {suggestion && (
                          <p className="text-sm text-muted-foreground">
                            {suggestion.relevance} · {suggestion.reason}
                          </p>
                        )}
                        <a
                          className="text-sm underline"
                          href={
                            asset.fileKind === "link"
                              ? (asset.sourceUrl ?? undefined)
                              : `/api/bsb-v2/assets/${encodeURIComponent(id)}/download`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {asset.fileKind === "link"
                            ? "Open resource"
                            : "Download file"}
                        </a>
                      </div>
                    </div>
                  );
                })}
                <label className="block text-sm">
                  Choose another resource
                  <select
                    aria-label={`Add resource to ${m.title}`}
                    disabled={locked}
                    className="block w-full rounded-md border bg-background p-2 mt-1"
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        edit(m.id, {
                          selectedAssetIds: [
                            ...new Set([...m.selectedAssetIds, e.target.value]),
                          ],
                        });
                    }}
                  >
                    <option value="">Browse the Knowledge Base…</option>
                    {(library.data ?? [])
                      .filter((a) => !m.selectedAssetIds.includes(a.id))
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName} · {a.instrument} · {a.fileKind}
                        </option>
                      ))}
                  </select>
                </label>
                {!resources.length && (
                  <Link
                    href="/workspace/knowledge"
                    className="text-sm underline"
                  >
                    Add your first resource in Knowledge Base
                  </Link>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
