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

## Feature-to-biological-value guidance (reviewed September 30, 2026)

The existing capability catalog now includes `biologicalValue` and, where helpful,
`biologySources`. These travel with the pinned capability to both existing model
stages. They explain general biology, never establish facts about a prospect.
The writing pattern is: feature → uncertainty it helps resolve → relevant research
question. Keep this to a short explanation, not a specification list or lecture.

### GeoMx: six complementary reasons to investigate a tissue

1. Morphology-guided regions preserve compartment differences that whole-section
   averaging can dilute. Molecular counts are regional, not individual-cell profiles.
2. Same-section RNA and protein compare complementary layers in matched tissue
   context and avoid differences between adjacent sections. RNA does not reliably
   predict protein abundance; this is not a direct translation-rate measurement.
3. Whole-transcriptome coverage supports discovering expression programs outside
   a small preselected marker list.
4. Broad protein profiling tests protein-level patterns directly instead of assuming
   a transcriptional change produces a corresponding protein change.
5. PTMs add signaling-state clues that total protein abundance may miss.
6. Regional differential-expression and pathway analysis help prioritize hypotheses
   while retaining where the signal occurred. Enrichment does not establish function.

Resources now follow these topics: platform overview, multiomics, RNA assays,
DPA, a pathway/multiomics webinar, and Data Center. DPA remains an assay within
GeoMx rather than the resource offered throughout the sequence.

### CosMx: cell identity, state and position

Single-cell RNA separates cell populations and states that pooled measurements
can mix. Same-cell RNA/protein associates transcriptional state with protein
phenotype. Segmentation supports correct assignment of transcripts to cells.
Panel choice and customization connect identity markers with project-specific
questions. Neighborhood analysis asks whether immune populations are within a
lesion or restricted to its border, and which populations are nearby. Informatics
connects these observations for exploration. Subcellular localization can be
selected for research about nuclear/cytoplasmic or other intracellular distribution:
location can change even when a whole-cell abundance is similar.

Do not describe proximity as proven communication, an exhaustion-associated
signature as a functional exhaustion assay, or an exclusion pattern as proof of
why recruitment failed. Fixed tissue localization is not a live measurement of
RNA transport, translation, or signaling.

### CellScape: protein phenotype in tissue context

Multiplex protein imaging combines identity, state and location. Custom panels
connect a protein of interest to its expressing cell population. Dynamic range
helps retain dim and bright markers together. Adding markers to the same
CellScape slide revisits emerging questions while conserving material. Assay kits
provide a starting point for panel development; automation supports consistent
processing. Large-area imaging can reveal patchy organization and rare populations.
These explanations do not change CellScape's optional resource rules.

Protein abundance, PTMs and localization can all inform cell responses; never
claim that proteins cannot show how cells are reacting. Assay scope still comes
from the existing reviewed claims and brochures, not from unrelated study methods.
182 nm/pixel remains digital sampling, not an optical-resolution claim.

### Research and product sources

- [RNA/protein correlation in human cancer, primary study](https://www.nature.com/articles/s41467-021-25872-1)
- [High-plex spatial molecular imaging, primary study](https://www.nature.com/articles/s41587-022-01483-z)
- [RNA/protein subcellular localization dynamics, primary study](https://www.nature.com/articles/s41592-023-02101-9). This uses other methods; it supports the biological rationale, not an assertion that CosMx performs those methods.
- [GeoMx overview](https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-dsp-overview/)
- [GeoMx same-section multiomics](https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/spatial-multiomics-enabled-with-geomx-dsp/)
- [GeoMx RNA assays](https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-rna-assays/)
- [GeoMx Data Center](https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-data-center/)
- [RNA, protein and PTM pathway webinar](https://go.brukerspatialbiology.com/CrossPlatformInterplay_REG.html). Registration resource; do not promise an on-demand recording.
- [CellScape knowledge base](https://brukerspatialbiology.com/support/knowledgebase/cellscape-psp-kb/)
- [CellScape HDR poster](https://brukerspatialbiology.com/wp-content/uploads/2024/05/aacr2024_hdr.pdf)

### Resource selection correction

Saved links are not repeated by URL within the selection pass. Named DPA links
are limited to the protein feature; DPA documents/images can also support the PTM
feature. A TCR-specific resource requires TCR research context, rather than matching
any transcriptome or analysis email. Clearly mismatched instrument URL paths are
excluded even if their saved instrument label is wrong. General relevant images
and documents can still be reused for GeoMx/CosMx.

The reviewed Assembly sequence contained a saved resource titled “GeoMx Discovery
Proteome Atlas Product Page” whose URL pointed to the CellScape overview. Correct
that entry in the knowledge base. This code excludes it from new GeoMx suggestions;
it does not rewrite saved knowledge-base rows or historical sequences. After
merging and syncing, generate a new sequence to apply these changes.
