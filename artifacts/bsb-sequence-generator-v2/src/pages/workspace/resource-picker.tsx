import { useState } from "react";
import type { Resource } from "@workspace/api-zod/finisher";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Older posters were saved as Publications or Other resources. Recognize explicit
// poster titles for browsing only; never rewrite their stored classification.
function documentType(asset: Resource) {
  return /\bposters?\b/i.test(`${asset.displayName} ${asset.fileName}`)
    ? "Posters"
    : asset.assetType || "Other resources";
}

export default function ResourcePicker({
  kind,
  title,
  assets,
  selectedIds,
  disabled,
  loading,
  failed,
  onSelect,
}: {
  kind: "image" | "document";
  title: string;
  assets: Resource[];
  selectedIds: string[];
  disabled: boolean;
  loading: boolean;
  failed: boolean;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [instrument, setInstrument] = useState("");
  const [type, setType] = useState("");
  const label = kind === "image" ? "images" : "documents";
  const pool = assets.filter((a) =>
    kind === "image" ? a.fileKind === "image" : a.fileKind !== "image",
  );
  const instruments = [
    ...new Set([
      "CosMx",
      "GeoMx",
      "CellScape",
      ...pool.map((a) => a.instrument || "Unknown"),
    ]),
  ].sort();
  const types = [
    ...new Set([
      "Publications",
      "Posters",
      "Tech notes",
      "Panels and Brochures",
      "Webinars",
      "Other resources",
      ...pool.map(documentType),
    ]),
  ].sort();
  const matches = pool
    .filter(
      (a) =>
        (!instrument || (a.instrument || "Unknown") === instrument) &&
        (!type || documentType(a) === type) &&
        (!query.trim() ||
          [
            a.displayName,
            a.fileName,
            a.description,
            a.instrument,
            a.assetType,
            ...a.keywords,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase())),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer font-medium">
        Browse Knowledge Base {label}
      </summary>
      <fieldset disabled={disabled} className="mt-3 space-y-3">
        <Input
          aria-label={`Search ${label} for ${title}`}
          placeholder="Search name, description, or keyword…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <label className="text-sm flex-1 min-w-40">
            Instrument
            <select
              aria-label={`${title} ${label} instrument`}
              className="block w-full rounded-md border bg-background p-2 mt-1"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
            >
              <option value="">All instruments</option>
              {instruments.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          {kind === "document" && (
            <label className="text-sm flex-1 min-w-40">
              Document type
              <select
                aria-label={`${title} document type`}
                className="block w-full rounded-md border bg-background p-2 mt-1"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">All document types</option>
                {types.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              setInstrument("");
              setType("");
            }}
          >
            Clear filters
          </Button>
        </div>
        {loading ? (
          <p role="status">Loading {label}…</p>
        ) : failed ? (
          <p role="alert">
            Knowledge Base unavailable. Use Try again above to reload.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {matches.length}{" "}
              {label === "images" ? "images" : "documents / links"} found
            </p>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {matches.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-md border p-3"
                >
                  {kind === "image" && (
                    <img
                      loading="lazy"
                      className="h-16 w-20 object-contain bg-muted rounded"
                      src={`/api/bsb-v2/assets/${encodeURIComponent(a.id)}/preview`}
                      alt={a.displayName}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">
                      {a.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.instrument || "Unknown"}
                      {kind === "document" &&
                        ` · ${documentType(a)}${a.fileKind === "link" ? " · Web link" : ""}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selectedIds.includes(a.id)}
                    aria-label={`Add ${a.displayName} to ${title}`}
                    onClick={() => onSelect(a.id)}
                  >
                    {selectedIds.includes(a.id) ? "Selected" : "Add"}
                  </Button>
                </div>
              ))}
              {!matches.length && (
                <p className="text-sm">
                  No matching {label}. Try another instrument, search, or clear
                  the filters.
                </p>
              )}
            </div>
          </>
        )}
      </fieldset>
    </details>
  );
}
