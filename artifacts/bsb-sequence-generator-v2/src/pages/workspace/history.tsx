import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { finishApi } from "./finish-sequence";
type Entry = {
  id: string;
  company: string;
  updatedAt: string;
  messageCount: number;
  legacy: boolean;
};
type Account = {
  id: string;
  name: string;
  research: unknown;
  createdAt: string;
};
function ResearchValue({ value }: { value: unknown }) {
  if (value == null) return null;
  if (typeof value !== "object")
    return <p className="whitespace-pre-wrap break-words">{String(value)}</p>;
  if (Array.isArray(value))
    return (
      <ul className="space-y-2 pl-4 list-disc">
        {value.map((item, i) => (
          <li key={i}>
            <ResearchValue value={item} />
          </li>
        ))}
      </ul>
    );
  return (
    <dl className="space-y-3">
      {Object.entries(value)
        .filter(([, v]) => v != null)
        .map(([key, v]) => (
          <div key={key}>
            <dt className="font-medium capitalize">
              {key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")}
            </dt>
            <dd className="pl-3 text-muted-foreground">
              <ResearchValue value={v} />
            </dd>
          </div>
        ))}
    </dl>
  );
}
export default function History() {
  const cache = useQueryClient(),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState("");
  const history = useQuery({
    queryKey: ["finished-history"],
    queryFn: () => finishApi<Entry[]>("finished"),
  });
  const accounts = useQuery({
    queryKey: ["saved-accounts"],
    queryFn: () => finishApi<Account[]>("saved-accounts"),
  });
  async function remove(item: Entry) {
    if (
      !window.confirm(
        `Delete the saved sequence for ${item.company}? The account and Knowledge Base resources will remain.`,
      )
    )
      return;
    setDeleting(item.id);
    setError("");
    try {
      await finishApi(`finished/${encodeURIComponent(item.id)}`, "DELETE");
      await cache.invalidateQueries({ queryKey: ["finished-history"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting("");
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">History</h1>
        <p className="text-muted-foreground mt-2">
          Reopen, edit, copy, or delete saved sequences.
        </p>
      </div>
      <Input
        aria-label="Search history"
        placeholder="Search by company…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {(error || history.isError) && (
        <p role="alert" className="text-destructive">
          {error || history.error?.message}{" "}
          <button onClick={() => void history.refetch()} className="underline">
            Reload history
          </button>
        </p>
      )}
      {history.isLoading ? (
        <p role="status">Loading history…</p>
      ) : (
        <div className="space-y-3">
          {(history.data ?? [])
            .filter((x) =>
              x.company.toLowerCase().includes(search.toLowerCase()),
            )
            .map((item) => (
              <article
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5"
              >
                <div>
                  <Link
                    className="font-semibold underline"
                    href={`/workspace/finished/${encodeURIComponent(item.id)}`}
                  >
                    {item.company}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {item.messageCount} messages ·{" "}
                    {new Date(item.updatedAt).toLocaleString()}
                    {item.legacy ? " · Earlier workflow" : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={!!deleting}
                  onClick={() => void remove(item)}
                >
                  {deleting === item.id ? "Deleting…" : "Delete"}
                </Button>
              </article>
            ))}
          {history.isSuccess && !history.data.length && (
            <p className="rounded-xl border border-dashed p-8 text-muted-foreground">
              No saved sequences yet. Finish a sequence and choose Save to
              History.
            </p>
          )}
        </div>
      )}
      <details className="rounded-xl border p-5">
        <summary className="font-medium cursor-pointer">
          Previously saved accounts ({accounts.data?.length ?? 0})
        </summary>
        <p className="my-3 text-sm text-muted-foreground">
          Your earlier research is preserved here for reference.
        </p>
        {accounts.isError && (
          <p role="alert">
            Accounts could not be loaded.{" "}
            <button
              className="underline"
              onClick={() => void accounts.refetch()}
            >
              Try again
            </button>
          </p>
        )}
        {accounts.data?.map((a) => (
          <details key={a.id} className="border-t py-3">
            <summary className="cursor-pointer">{a.name}</summary>
            <div className="mt-3 text-sm max-h-96 overflow-auto">
              <ResearchValue value={a.research} />
            </div>
          </details>
        ))}
      </details>
    </div>
  );
}
