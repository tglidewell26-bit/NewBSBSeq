import type { Capability } from "@workspace/api-zod";
export const CATALOG_VERSION = "bsb-capabilities-2026-09-20-v1";
// Reviewed qualitative claims only. Numeric panels and legacy proof assets are not imported.
export const capabilities: Capability[] = [
  {
    id: "cell-tissue-protein",
    instrument: "CellScape",
    claim:
      "Our CellScape platform measures protein markers in tissue at single-cell and subcellular resolution.",
    limitation:
      "FFPE or fresh frozen tissue; compatible, validated antibody assays are required. No therapeutic efficacy or guaranteed biological outcome claims.",
    sourceUrl:
      "https://brukerspatialbiology.com/support/knowledgebase/cellscape-psp-kb/",
    sourceSection:
      "What is the CellScape Precise Spatial Proteomics (PSP) System?",
    reviewedAt: "2026-09-20",
  },
  {
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
    id: "cosmx-rna",
    instrument: "CosMx",
    claim:
      "Our CosMx whole-transcriptome assays measure RNA with single-cell and subcellular spatial resolution in intact tissue.",
    limitation:
      "Compatible FFPE and fresh frozen samples; assay and species requirements apply. RNA is not a direct measurement of protein activity or a validated diagnostic result.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/cosmx-rna-assays/whole-transcriptome-panel/",
    sourceSection: "Whole Transcriptome assays overview",
    reviewedAt: "2026-09-20",
  },
  {
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
    id: "geomx-roi",
    instrument: "GeoMx",
    claim:
      "Our GeoMx platform uses morphology markers to select tissue regions and profile distinct biological compartments.",
    limitation:
      "Region and compartment profiling, not a guarantee of single-cell resolution. Requires compatible tissue and morphology markers.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-morphology-markers/",
    sourceSection: "What are morphology markers?",
    reviewedAt: "2026-09-20",
  },
  {
    id: "geomx-multiomics",
    instrument: "GeoMx",
    claim:
      "Our GeoMx spatial multiomics workflow profiles RNA and protein from selected regions of the same FFPE tissue section.",
    limitation:
      "Use compatible RNA/protein assays and the spatial multiomics workflow. Do not claim transcripts prove translation, protein activity, or therapeutic response.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/spatial-multiomics-enabled-with-geomx-dsp/",
    sourceSection: "Same-slide spatial multiomics / How it works",
    reviewedAt: "2026-09-20",
  },
];
