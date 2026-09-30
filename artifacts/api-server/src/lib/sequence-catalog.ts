import type { Capability } from "@workspace/api-zod";
export const CATALOG_VERSION = "bsb-capabilities-2026-09-30-v7";
// Reviewed outreach claims. Specs retain their assay and measurement scope.
export const capabilities: Capability[] = [
  {
    biologicalValue: "Multiplex protein imaging combines cell identity, state markers and location. It can distinguish immune cells within a lesion from those at its margin and compare nuclear, cytoplasmic or membrane localization when markers and imaging support that distinction. Marker patterns suggest states, not proof of functional exhaustion.",
    id: "cell-tissue-protein",
    instrument: "CellScape",
    claim: "CellScape measures tissue protein markers at single-cell and subcellular resolution, with 182 nm/pixel digital sampling.",
    limitation: "182 nm/pixel is digital sampling, not optical resolution. Compatible validated antibody assays are required.",
    sourceUrl:
      "https://brukerspatialbiology.com/support/knowledgebase/cellscape-psp-kb/",
    sourceSection: "CellScape Brochure_for email, pages 3 and 10",
    reviewedAt: "2026-09-27",
  },
  {
    biologicalValue: "A compatible custom antibody panel lets researchers examine project-specific proteins together with markers identifying the cells that express them, rather than interpreting each stain in isolation.",
    id: "cell-antibodies",
    instrument: "CellScape",
    claim:
      "Our CellScape platform supports custom antibody panels using directly conjugated antibodies compatible with EpicIF.",
    limitation:
      "Antibodies require compatibility and assay validation. Do not imply that any unvalidated antibody works, or that assay validation proves drug efficacy.",
    sourceUrl:
      "https://brukerspatialbiology.com/support/knowledgebase/cellscape-assays-and-applications/",
    sourceSection:
      "Can I use my own antibodies? / How do I validate my own antibodies?",
    reviewedAt: "2026-09-20",
  },
  {
    biologicalValue: "Single-cell expression separates cell types and states that a pooled measurement can mix together, while preserved positions show where those states occur. Broad RNA coverage supports discovery beyond a small marker list.",
    biologySources: ["https://www.nature.com/articles/s41587-022-01483-z"],
    id: "cosmx-rna",
    instrument: "CosMx",
    claim: "CosMx whole-transcriptome imaging measures approximately 19,000 RNA targets at single-cell and subcellular resolution in intact human tissue.",
    limitation: "The 19,000-target specification is for the human Whole Transcriptome panel, not every CosMx panel or species.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/cosmx-rna-assays/whole-transcriptome-panel/",
    sourceSection: "CosMx Spatial Molecular Imager Brochure, SEP 2025 MK5188, pages 3 and 6",
    reviewedAt: "2026-09-27",
  },
  {
    biologicalValue: "RNA and protein in the same cells connect transcriptional state with measured protein phenotype without assuming RNA predicts protein abundance or matching different cells across sections.",
    biologySources: ["https://www.nature.com/articles/s41467-021-25872-1"],
    id: "cosmx-multiomics",
    instrument: "CosMx",
    claim:
      "Our CosMx same-cell multiomics workflow measures RNA and protein in the same FFPE tissue section.",
    limitation:
      "Requires compatible RNA and protein assays and the same-cell multiomics workflow. Do not imply universal protein coverage or proven clinical outcomes.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/cosmx-same-cell-multiomics/",
    sourceSection: "CosMx Same-Cell Multiomics with RNA and Protein",
    reviewedAt: "2026-09-20",
  },
  {
    biologicalValue: "Separate molecular signals from selected tissue compartments instead of averaging them together; a localized inflammatory or stromal pattern may be diluted in a whole-section measurement. GeoMx molecular profiles represent selected regions, not individual-cell transcriptomes.",
    id: "geomx-roi",
    instrument: "GeoMx",
    claim: "GeoMx uses morphology-guided regions of interest to compare biologically distinct tissue structures and compartments through whole-transcriptome RNA and 1,200+ protein profiling. Compatible Discovery Proteome Atlas and Whole Transcriptome Atlas assays support same-slide RNA and protein measurements.",
    limitation: "Suitable sections, morphology markers and compatible assays are needed. Same-slide RNA/protein requires the supported assay workflow. A proposed pre/post comparison does not establish that the company has paired samples.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-dsp-overview/",
    sourceSection: "GeoMx Digital Spatial Profiler Brochure, APR 2026 MK0981, pages 4-6 and 8",
    reviewedAt: "2026-09-27",
  },
  {
    biologicalValue: "RNA abundance does not reliably predict protein abundance because translation and turnover also regulate proteins. Measuring both in the same section connects transcriptional programs with protein abundance in matched tissue context and avoids differences introduced by comparing adjacent sections. This does not directly measure translation rates.",
    biologySources: ["https://www.nature.com/articles/s41467-021-25872-1"],
    id: "geomx-multiomics",
    instrument: "GeoMx",
    claim: "Compatible GeoMx Discovery Proteome Atlas and Whole Transcriptome Atlas assays can measure RNA and protein in selected regions on the same tissue section.",
    limitation: "Same-slide claims require the compatible assay workflow; do not transfer this capability to all assays or species.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/spatial-multiomics-enabled-with-geomx-dsp/",
    sourceSection: "GeoMx Digital Spatial Profiler Brochure, APR 2026 MK0981, pages 4 and 6",
    reviewedAt: "2026-09-27",
  },
  {
    biologicalValue: "Measuring dim and bright signals together helps retain low-expression markers alongside abundant cell-identity markers; saturation or lost dim signals can obscure phenotypic differences.",
    id: "cell-dynamic-range",
    instrument: "CellScape",
    claim:
      "CellScape HDR imaging distinguishes low and high protein expression.",
    limitation: "Antibody specificity and signal quality require validation.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cellscape-precise-spatial-proteomics/cellscape-psp-overview/",
    sourceSection: "Quantitative performance",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Adding compatible markers to the same CellScape slide can investigate a newly suggested cell state in the original tissue context while conserving limited material.",
    id: "cell-expand-panels",
    instrument: "CellScape",
    claim: "CellScape can revisit a slide previously analyzed on CellScape and add compatible markers in later staining and imaging cycles.",
    limitation: "Only describe re-interrogating the same CellScape slide, not adding markers to a sample analyzed on another platform. Sample condition and compatible antibody protocols matter.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cellscape-precise-spatial-proteomics/cellscape-psp-overview/",
    sourceSection: "Expandable Assays",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Larger sampled areas can capture patchy immune organization or rare populations that a small field might miss; sampling still determines representativeness.",
    id: "cell-imaging-area",
    instrument: "CellScape",
    claim: "CellScape supports large tissue imaging areas and an optional FalconFAST mode with a 3.3 mm² field of view.",
    limitation: "Field of view is not total slide imaging area. Resolution and acquisition setup differ by mode; do not guarantee a fixed experiment-time reduction.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cellscape-precise-spatial-proteomics/cellscape-psp-overview/",
    sourceSection: "CellScape Brochure_for email, pages 6 and 12",
    reviewedAt: "2026-09-27",
  },
  {
    biologicalValue: "Prevalidated marker combinations provide a starting point for identifying cell populations and states together, reducing initial panel-development work without removing sample-specific validation.",
    id: "cell-assay-kits",
    instrument: "CellScape",
    claim: "CellScape offers prevalidated antibody assay kits.",
    limitation: "Check marker, species and sample compatibility.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cellscape-precise-spatial-proteomics/cellscape-psp-overview/",
    sourceSection: "Streamlined assay development",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Aligning imaging cycles helps associate markers measured in different rounds with the same cells; misalignment could create misleading coexpression patterns.",
    id: "cell-cycle-alignment",
    instrument: "CellScape",
    claim: "CellScape automatically aligns images across staining cycles.",
    limitation: "Image quality and assay validation still matter.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cellscape-precise-spatial-proteomics/cellscape-psp-overview/",
    sourceSection: "How it works",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Cell-level protein measurements and positions support comparing phenotypes and neighborhoods rather than relying on a representative image alone.",
    id: "cell-analysis-output",
    instrument: "CellScape",
    claim: "CellScape exports OME-TIFF images for downstream analysis.",
    limitation: "Check compatibility with the intended analysis software.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cellscape-precise-spatial-proteomics/cellscape-psp-overview/",
    sourceSection: "Engineered for flexible spatial proteomics",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Assigning transcripts to appropriate cell boundaries helps distinguish a cell\u2019s expression from its neighbor\u2019s, especially in dense tissue. Reliable assignment matters for rare-cell identities and apparent mixed cell states.",
    biologySources: ["https://www.nature.com/articles/s41587-022-01483-z"],
    id: "cosmx-segmentation",
    instrument: "CosMx",
    claim:
      "CosMx segmentation defines cell boundaries and assigns transcripts to cells.",
    limitation: "Dense tissue still requires segmentation quality review.",
    sourceUrl:
      "https://go.brukerspatialbiology.com/CosMxSegmentation_web.html",
    sourceSection: "Accurate Cell Segmentation",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Choosing coverage around the biological question can include cell-identity and state markers together; compatible custom targets can extend an experiment to project-specific questions.",
    id: "cosmx-targeted-panels",
    instrument: "CosMx",
    claim: "CosMx offers whole-transcriptome and targeted RNA panels, including a human 6,000-target Discovery panel and custom RNA add-on options.",
    limitation: "Panel coverage and custom target design depend on assay and species.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/cosmx-rna-assays/human-6k-discovery-panel/",
    sourceSection: "CosMx Spatial Molecular Imager Brochure, SEP 2025 MK5188, page 6",
    reviewedAt: "2026-09-27",
  },
  {
    biologicalValue: "A whole-cell total hides molecular location. Mapping measured RNA within cells can reveal nuclear versus cytoplasmic enrichment or localized distributions relevant to RNA handling and local biology. Fixed-tissue localization does not directly measure transport, translation or real-time signaling.",
    biologySources: ["https://www.nature.com/articles/s41592-023-02101-9"],
    id: "cosmx-subcellular",
    instrument: "CosMx",
    claim: "CosMx localizes measured molecules within cells.",
    limitation: "Compatible assays and samples are required.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/",
    sourceSection: "Subcellular Analysis",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Exploring cell identity, state and location together helps identify which populations account for an expression pattern and where to investigate it, rather than treating the tissue as one average.",
    id: "cosmx-informatics",
    instrument: "CosMx",
    claim: "CosMx integrates with AtoMx for spatial data exploration.",
    limitation: "Analysis requires quality control and suitable workflows.",
    sourceUrl:
      "https://go.brukerspatialbiology.com/CosMxdataanalysis_web.html",
    sourceSection: "Integrated Spatial Informatics Platform",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Preserving molecular coordinates links an RNA signal to cells and tissue architecture so expression can be interpreted in its original neighborhood.",
    id: "cosmx-imaging-readout",
    instrument: "CosMx",
    claim:
      "CosMx uses cyclic fluorescent hybridization and imaging to measure RNA.",
    limitation: "Requires compatible assays and sample preparation.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/",
    sourceSection: "From sample to spatial insights",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Adaptable analysis supports study-specific cell annotations and spatial questions rather than forcing every tissue into one reference; analytical choices require validation.",
    id: "cosmx-analysis-pipelines",
    instrument: "CosMx",
    claim: "CosMx data analysis through AtoMx supports open-source pipelines.",
    limitation: "Confirm pipeline suitability and validate analysis choices.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/",
    sourceSection: "Integrated Spatial Informatics Platform",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Broad RNA coverage lets researchers examine unexpected expression programs and generate hypotheses beyond a small preselected marker list while retaining the tissue region that produced the signal.",
    id: "geomx-transcriptome",
    instrument: "GeoMx",
    claim: "GeoMx Whole Transcriptome Atlas profiles 18,000+ genes in selected regions of human or mouse tissue.",
    limitation: "Use the species-specific assay; sample compatibility and study design matter.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-rna-assays/",
    sourceSection: "GeoMx Digital Spatial Profiler Brochure, APR 2026 MK0981, page 8",
    reviewedAt: "2026-09-27",
  },
  {
    biologicalValue: "Comparing bands along a tissue boundary can reveal a spatial gradient that whole-region averages hide, such as whether an immune-associated pattern changes with distance from a lesion.",
    id: "geomx-contour",
    instrument: "GeoMx",
    claim: "GeoMx contour profiling examines regions along tissue boundaries.",
    limitation:
      "Requires appropriate morphology markers and regional sampling.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-dsp-overview/",
    sourceSection: "Contour",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Profiling comparable compartments across multiple tissue cores supports cohort comparisons rather than relying on one illustrative specimen; cores may not capture all heterogeneity.",
    id: "geomx-tma",
    instrument: "GeoMx",
    claim: "GeoMx can profile tissue microarrays.",
    limitation: "Sample quality, assays and sampling design matter.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-dsp-overview/",
    sourceSection: "Scalability",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Compatible custom targets can connect a project-specific question to broader spatial measurements when standard panels omit a target. Do not imply a particular viral or proprietary target is already validated.",
    id: "geomx-custom-targets",
    instrument: "GeoMx",
    claim:
      "GeoMx supports custom target additions through probe and antibody barcoding services.",
    limitation: "Confirm assay compatibility and service requirements.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-dsp-overview/",
    sourceSection: "Customization",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Direct protein measurements complement RNA: transcript changes may not produce corresponding protein changes. Broad regional protein profiling can compare immune, stromal and signaling-associated programs without assuming RNA is a proxy for protein abundance.",
    biologySources: ["https://www.nature.com/articles/s41467-021-25872-1"],
    id: "geomx-protein-profiling",
    instrument: "GeoMx",
    claim: "GeoMx Discovery Proteome Atlas profiles 1,200+ protein targets, with content covering 120+ biological processes.",
    limitation: "Panel species and sample compatibility must be confirmed. Expression alone does not prove a drug works.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-protein-assays/discovery-proteome-atlas/",
    sourceSection: "GeoMx Digital Spatial Profiler Brochure, APR 2026 MK0981, page 6",
    reviewedAt: "2026-09-27",
  },
  {
    biologicalValue: "Compatible automated preparation helps make tissue processing more consistent across samples, supporting interpretable cohort comparisons without promising elimination of batch effects.",
    id: "geomx-histology",
    instrument: "GeoMx",
    claim:
      "GeoMx workflows support automated staining on compatible histology systems.",
    limitation:
      "Requires supported staining instruments and validated protocols.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-dsp-overview/",
    sourceSection: "Scalability",
    reviewedAt: "2026-09-24",
  },
  {
    biologicalValue: "Protein abundance alone can miss changes in signaling state. Measured modifications such as phosphorylation provide additional pathway-activity clues even when total protein abundance is similar; their interpretation depends on the specific target and context.",
    "id": "geomx-ptm",
    "instrument": "GeoMx",
    "claim": "GeoMx Discovery Proteome Atlas includes 130+ post-translational modification targets to examine pathway activity in selected tissue regions.",
    "limitation": "Measured PTMs can inform pathway activity; they do not establish target engagement or therapeutic efficacy by themselves.",
    "sourceUrl": "https://go.brukerspatialbiology.com/CrossPlatformInterplay_REG.html",
    "sourceSection": "GeoMx Digital Spatial Profiler Brochure, APR 2026 MK0981, page 6",
    "reviewedAt": "2026-09-27"
  },
  {
    biologicalValue: "Relating coordinated expression changes to pathways helps prioritize biological hypotheses from many measured targets. Regional comparisons retain where those patterns occur; pathway enrichment is not a direct functional assay.",
    "id": "geomx-analysis",
    "instrument": "GeoMx",
    "claim": "GeoMx analysis tools support data QC, normalization, differential expression, and pathway analysis linked to the selected tissue regions.",
    "limitation": "Analysis needs quality control and appropriate experimental design.",
    "sourceUrl": "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-data-center/",
    "sourceSection": "GeoMx Digital Spatial Profiler Brochure, APR 2026 MK0981, page 10",
    "reviewedAt": "2026-09-27"
  },
  {
    biologicalValue: "Cell positions distinguish immune cells inside a lesion from cells restricted to its boundary and connect cell states with nearby populations. Ligand/receptor expression plus proximity can prioritize communication hypotheses; exhaustion-associated programs and exclusion patterns do not alone establish functional exhaustion or why recruitment failed.",
    biologySources: ["https://www.nature.com/articles/s41587-022-01483-z"],
    "id": "cosmx-neighborhoods",
    "instrument": "CosMx",
    "claim": "CosMx and AtoMx support cell typing, nearest-neighbor, cell-proximity, and spatial-network analyses to study tissue cellular neighborhoods.",
    "limitation": "Spatial proximity and expression do not prove physical interaction or causality.",
    "sourceUrl": "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/",
    "sourceSection": "CosMx Spatial Molecular Imager Brochure, SEP 2025 MK5188, pages 5 and 7",
    "reviewedAt": "2026-09-27"
  },
  {
    biologicalValue: "Automated repeated staining and imaging supports consistent acquisition of multiple markers from the same specimens and reduces manual handling; it does not guarantee absence of batch effects.",
    "id": "cell-automation",
    "instrument": "CellScape",
    "claim": "CellScape automates iterative staining, imaging, and signal removal with a 4-sample holder.",
    "limitation": "Throughput depends on panel, imaging area, sample and acquisition settings.",
    "sourceUrl": "https://brukerspatialbiology.com/products/cellscape-precise-spatial-proteomics/cellscape-psp-overview/",
    "sourceSection": "CellScape Brochure_for email, page 8",
    "reviewedAt": "2026-09-27"
  },
];

export function emailCapabilities(instrument: string, research: string) {
  const defaults: Record<string, string[]> = {
    GeoMx: ["geomx-roi", "geomx-multiomics", "geomx-transcriptome", "geomx-protein-profiling", "geomx-ptm", "geomx-analysis"],
    CosMx: ["cosmx-rna", "cosmx-multiomics", "cosmx-segmentation", "cosmx-targeted-panels", "cosmx-neighborhoods", "cosmx-informatics"],
    CellScape: ["cell-tissue-protein", "cell-antibodies", "cell-dynamic-range", "cell-expand-panels", "cell-assay-kits", "cell-automation"],
  };
  const contextual: Array<[string, RegExp]> = [
    ["geomx-contour", /invasive margin|tissue boundar|distance.gradient/i],
    ["geomx-tma", /tissue microarray|\bTMA[s]?\b/i],
    ["geomx-custom-targets", /custom (?:rna |protein )?(?:panel|target)|viral (?:rna|target)/i],
    ["geomx-histology", /automated (?:histology|staining)|BOND RX|Ventana/i],
    ["cell-imaging-area", /whole.slide|large tissue|throughput/i],
    ["cosmx-subcellular", /subcellular|nuclear|cytoplasm|localization|localisation/i],
    ["cosmx-analysis-pipelines", /custom (?:analysis|pipeline)|R scripts/i],
  ];
  const relevant = contextual.filter(([, pattern]) => pattern.test(research))
    .map(([id]) => id).filter(id => capabilities.some(c => c.id === id && c.instrument === instrument));
  const ids = defaults[instrument] ?? [];
  // Keep the introduction; substitute relevant specialist features for later defaults.
  return [...new Set([ids[0], ...relevant, ...ids.slice(1)])].slice(0, 6)
    .map(id => capabilities.find(c => c.id === id)!);
}
