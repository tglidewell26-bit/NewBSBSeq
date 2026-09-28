# Knowledge base and outreach resources

The library stores reviewed reference files and HTTPS resource links. Resource summaries inform outreach; they do not establish new company facts or replace the approved product capability catalog.

## Add and manage resources

- Upload PDFs or PNG/JPEG/WebP images: up to 10 files, 25 MB each and 50 MB combined. Existing automatic file analysis and manual metadata entry remain available.
- Choose **Add link** for a webinar, publication, tech note or other online resource. Enter its HTTPS URL, title, instrument, category, research area, a summary of at least three sentences and five distinct keywords. Links use the entered metadata; the app does not fetch the site or analyze a video.
- Use **Unknown** research area for general product/feature resources; use the actual research area for disease-specific examples. A title or instrument name alone does not establish relevance.
- Save each item. Unsaved drafts remain in the current browser page only.
- Existing search, filters, edit and delete work for files and links. Links have **Open resource**; files have **Download**. Editing a URL increments the resource revision just like editing other metadata.

## Platform rules

GeoMx and CosMx:

- Every email receives a body resource hyperlink. A relevant saved link is preferred; otherwise the renderer uses the assigned capability's reviewed source URL. The default six-feature sets include at least two assay/workflow-specific destinations beyond the instrument overview link.
- Target images in at least four emails. Relevant images may be suggested in all six. Selection prefers unused resources, then permits relevant reuse to avoid exhausting the library early.
- Each email can suggest one document, one image and one saved link. The resource coverage summary shows image shortfalls so the library can be expanded. Unrelated resources and fabricated files are never used to fill a quota.

CellScape:

- Retains optional suggestions, existing relevance matching and no repeated library file within a sequence.
- No mandatory images or catalog-link fallback. A relevant saved link can be used optionally.

Resources must match the assigned instrument and research or proposed feature. Disease-specific publications still need a company-evidence match. General product links, guides and images can illustrate a proposed capability without asserting that the company already uses that workflow. Feature-based final suggestions consider the actual written middle. Explicit negation and conflicting species/sample metadata still exclude matches.

## Copy, export and connection wording

- Resource titles become hyperlinks in the email body before the meeting request. Rich clipboard HTML preserves clickable anchors; plain text includes the URL. The model never invents a URL.
- Images and files remain suggestions. Download and add them in the email client; copying an email does not attach files. Exports separate the suggested-file checklist from email copy.
- LinkedIn connection wording is fixed and transparent: “I’m with Bruker Spatial Biology. I’d like to connect and discuss how spatial biology could help your research.” The app adds the greeting, with no research hook implying collaboration.
- Previously saved sequences are not rewritten. Generate a new sequence after deployment.

## Persistence

Startup adds the nullable `source_url` column to `bsb_v2_knowledge_assets`. File rows keep their existing bytes and metadata. Link rows use `file_kind=link`, `file_type=text/uri-list`, empty file data, and the validated HTTPS URL in `source_url`.

The existing create and revision-checked edit endpoints accept `sourceUrl`. URL resources reject file analysis and file downloads; the UI opens the URL directly. Selected resource metadata and URLs are pinned with the sequence, and changes invalidate in-progress or revised jobs. Older snapshots without `sourceUrl` remain compatible with file rows.

No new model calls, automatic webpage fetching, spending caps or retry loops are introduced. File analysis still uses the existing model configuration, paid-call notice and cache.

## Validation for this change

Focused tests cover platform-specific reuse, six email resources, image coverage with matching metadata, CellScape behavior, fixed connection wording, HTTPS URL validation, rich/plain hyperlink copying, source URL revision checks and legacy snapshots. A full database/UI deployment check and live model generation remain post-sync checks.
