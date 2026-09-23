# Knowledge base: upload, define, review, save

The asset library provides AI metadata suggestions, human review, and relevant resource selection for **new outreach sequences**. Saved metadata is user reviewed, not independent verification of instrument specifications or company evidence. Instrument assessment still uses the approved company-evidence rubric, and product claims still use the curated capability catalog. The original sequencer and its assets are unchanged.

## User workflow

1. Open Workspace → Knowledge Base and choose PDFs or PNG/JPEG/WebP images. Select up to 10 files, 25 MB each, 50 MB total.
2. Selecting files starts AI analysis automatically, one file at a time. Watch each file’s status, or pause after the current file. File-specific failures let the queue continue; configuration or provider failures pause it without retrying. Resume untouched files with **Analyze remaining files**, or enter metadata manually. Keep the page open; this is a browser queue, not a background import service.
3. Review the display name, instrument, asset type, research area, description, five distinct keywords, and classification reasoning. Descriptions require at least three sentences. Unknown is allowed; Panels and Brochures use no research area.
4. Save the reviewed file. Unsaved files remain in the current page only; finish saving before navigating away.
5. Browse Instrument → Asset type → Research area, search/filter, download, copy filenames, edit, or delete. Editing preserves file bytes, filename, MIME type, and size. Stale edits return a conflict rather than overwrite newer metadata.

## AI operation

- Reuses the existing `BSB_LIVE_ASSESSMENT`, `OPENAI_API_KEY`, `BSB_ASSESSMENT_MODEL=gpt-5.6-terra` configuration. No new secret is needed.
- Sends the selected file to OpenAI using Responses PDF/image inputs, `store:false`, no tools, and a strict metadata schema. File text and filenames are treated as untrusted content.
- No app dollar spending cap, daily balance, or reservation is applied. The old budget-based token preflight has been removed; each file goes directly to one generation request. Upload-size limits, provider context limits, and the 8,000-output-token limit still apply. Recorded cost estimates remain visible after analysis.
- One generation per file bytes + filename + model + prompt version. Duplicate requests return a cached draft or an in-progress/error response, never an extra generation. This is not an automatic re-suggest/regenerate feature.
- Files previously blocked by the old token preflight can now be analyzed. Uncertain outcomes are not automatically repeated. Manual metadata remains available; no fabricated fallback metadata.
- Analysis history is independent of saved files. Deleting a saved file does not erase its recorded analysis usage.
- AI suggestions never create or edit a saved asset by themselves. Only Save does that.

## Persistence and deployment

Startup adds `revision integer NOT NULL DEFAULT 1` to existing knowledge assets and creates `bsb_v2_asset_analysis_runs`, adding its nullable `usage` column if needed. No file migration or data replacement is required. The existing base64 file storage remains compatible. Library list/edit responses select metadata only.

API additions: `GET /api/bsb-v2/assets/analysis/config`, `POST /api/bsb-v2/assets/analyze` (new file or saved `assetId`), and `PATCH /api/bsb-v2/assets/:assetId` (metadata plus current `revision`).

## Verification

Verified in a disposable database using synthetic files and a fake provider: metadata-only AI drafts, cached results, duplicate concurrent requests, legacy preflight recovery, interrupted calls, invalid output, removal of spending caps, invalid file input, metadata editing, stale revision conflicts, duplicate keywords, and byte-for-byte downloads after editing. No live paid calls were made.

The user confirmed the published upload/AI-review/save flow works. Retrieval validation adds deterministic matching, wrong-instrument and broad-label exclusion, sample/species conflicts, negation, duplicate suppression, immutable resource snapshots, stale-resource blocking, unrelated-upload stability, and exported attachment checklists. The full suite passes (174 tests), along with shared/API/frontend type checks and both production builds. Retrieval tests use a fake provider; no paid calls were made. Browser acceptance of the automatic upload queue and no-cap display remains a deployment check because the browser cannot reach the local preview.

## Sequence retrieval

- Retrieval requires the exact approved instrument, a workflow concept in the evidence assigned to that message, and a compatible assigned capability. A research-area label, display name, or filename alone never qualifies a file.
- Matching currently covers tissue protein imaging, antibody assays, single-cell spatial RNA, RNA/protein integration, and regional tissue profiling. Explicit negation and conflicting FFPE/fresh-frozen or human/mouse context decline the match. This deliberately favors precision; missing matches do not block generation.
- At most one attachment per eligible email and three distinct files per sequence. Only Emails 1, 2, 3, and 5 receive candidates; LinkedIn, the second-trip opener, and the neutral close stay clear. Ties are deterministic. There is no additional AI call.
- The job stores a snapshot of selected metadata and its revision. Selected-file edits/deletions invalidate running jobs and revision attempts. Other library changes do not change a running job's selection. Existing saved sequences are not backfilled; generate a new sequence to use retrieval.
- Writer and reviewer receive only controlled matched-topic labels and resource IDs, not filenames, descriptions, or file bytes. Uploaded descriptions cannot introduce instructions, new company facts, or product specifications into the prompts.
- Each message displays its suggested attachment, matching company evidence IDs, reason, and download link. Download links enforce the selected revision. Changed/deleted files display an availability warning.
- Copy body/sequence copies message text only. The text export includes a clearly separated **Attachment checklist — not email copy** with frozen filenames and revisions. The sender downloads, reviews, and attaches files in the email tool; the app does not send emails or claim attachments were sent.
- Historical text exports retain their original resource checklist. The current availability check and versioned download protect against silently substituting a changed resource.

After publishing: open an approved packet, generate a **new** sequence, inspect Suggested attachment and the Evidence and message plan, download the selected file, and verify the text export's separate attachment checklist. An empty match is valid when the saved library lacks an instrument/workflow match.

## No app spending cap

The budget implementation and its remaining-balance UI have been deleted. Old
`BSB_AI_DAILY_BUDGET_USD` and `BSB_AI_MAX_JOB_USD` settings are ignored. No
replacement $100 cap has been added. Provider billing and provider-imposed limits
still apply. The shared workspace remains accessible without login.

Existing assets, analyzed metadata, and usage history are preserved. Old reservation
amounts have no effect on new requests. The database retains legacy columns for
compatibility, with zero written for new runs. No daily reset is needed.

Regression tests cover ten successful analyses with both former caps set to zero
and a $100 uncertain historical reservation, plus assessment and sequence generation
with obsolete budget settings. Duplicate-call protection, explicit retries,
file limits, and human metadata review remain. Tests use a fake provider and
disposable database; no live API credits were used.
