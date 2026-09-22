# Knowledge base: upload, define, review, save

This stage provides the asset library and AI metadata suggestions. Assets are **not yet retrieved by instrument assessment or sequence generation**. Saved metadata is user reviewed, not independent verification of instrument specifications or company evidence. The original sequencer and its assets are unchanged.

## User workflow

1. Open Workspace → Knowledge Base and choose PDFs or PNG/JPEG/WebP images. Select up to 10 files, 25 MB each, 50 MB total.
2. For each file, choose **Suggest metadata with AI**, or enter metadata manually. Selecting files alone does not call OpenAI.
3. Review the display name, instrument, asset type, research area, description, five distinct keywords, and classification reasoning. Descriptions require at least three sentences. Unknown is allowed; Panels and Brochures use no research area.
4. Save the reviewed file. Unsaved files remain in the current page only; finish saving before navigating away.
5. Browse Instrument → Asset type → Research area, search/filter, download, copy filenames, edit, or delete. Editing preserves file bytes, filename, MIME type, and size. Stale edits return a conflict rather than overwrite newer metadata.

## AI operation

- Reuses the existing `BSB_LIVE_ASSESSMENT`, `OPENAI_API_KEY`, `BSB_ASSESSMENT_MODEL=gpt-5.6-terra`, `BSB_AI_MAX_JOB_USD`, and `BSB_AI_DAILY_BUDGET_USD` configuration. No new secret is needed.
- Sends the selected file to OpenAI using Responses PDF/image inputs, `store:false`, no tools, and a strict metadata schema. File text and filenames are treated as untrusted content.
- Reserves $0.35 under the same database lock and daily budget as assessment and sequence generation. The token-count endpoint checks the actual multimodal request before generation; inputs over 90,000 tokens are rejected, with an 8,000-output-token limit.
- One generation per file bytes + filename + model + prompt version. Duplicate requests return a cached draft or an in-progress/error response, never an extra generation. This is not an automatic re-suggest/regenerate feature.
- Failed token checks can be repeated manually because generation never began. Provider generation failures retain the reservation; uncertain outcomes remain held across day boundaries. Manual metadata remains available. No automatic retries or fabricated fallback metadata.
- Analysis history is independent of saved files. Deleting a saved file does not erase its cost reservation.
- AI suggestions never create or edit a saved asset by themselves. Only Save does that.

## Persistence and deployment

Startup adds `revision integer NOT NULL DEFAULT 1` to existing knowledge assets and creates `bsb_v2_asset_analysis_runs`. No file migration or data replacement is required. The existing base64 file storage remains compatible. Library list/edit responses select metadata only.

API additions: `GET /api/bsb-v2/assets/analysis/config`, `POST /api/bsb-v2/assets/analyze` (new file or saved `assetId`), and `PATCH /api/bsb-v2/assets/:assetId` (metadata plus current `revision`).

## Verification

Verified in a disposable database using synthetic files and a fake provider: metadata-only AI drafts, cached results, duplicate concurrent requests, token preflight failures and limits, interrupted calls, invalid output, shared budget exhaustion, invalid file input, metadata editing, stale revision conflicts, duplicate keywords, and byte-for-byte downloads after editing. No live paid calls were made.

API/shared/frontend type checks and production builds pass. The full API regression suite passes (156 tests). Browser acceptance remains a deployment check: the browser environment could not reach the local preview. After publishing, try one PDF, review/save it, reopen Edit, and expand its library folders. A real provider call still needs validation in Replit with its configured credentials.

Official API references used for the file input and token preflight contract:
- https://developers.openai.com/api/docs/guides/file-inputs
- https://developers.openai.com/api/docs/guides/token-counting
- https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens/methods/count
