import type { Capability } from "@workspace/api-zod";
export const CATALOG_VERSION = "bsb-capabilities-2026-09-24-v2";
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
  {
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
    id: "cell-expand-panels",
    instrument: "CellScape",
    claim: "CellScape can add markers to previously analyzed samples.",
    limitation: "Sample condition and compatible antibody protocols matter.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cellscape-precise-spatial-proteomics/cellscape-psp-overview/",
    sourceSection: "Expandable Assays",
    reviewedAt: "2026-09-24",
  },
  {
    id: "cell-imaging-area",
    instrument: "CellScape",
    claim: "CellScape supports large tissue imaging areas.",
    limitation: "Usable coverage depends on sample and imaging setup.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cellscape-precise-spatial-proteomics/cellscape-psp-overview/",
    sourceSection: "Engineered for flexible spatial proteomics",
    reviewedAt: "2026-09-24",
  },
  {
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
    id: "cosmx-segmentation",
    instrument: "CosMx",
    claim:
      "CosMx segmentation defines cell boundaries and assigns transcripts to cells.",
    limitation: "Dense tissue still requires segmentation quality review.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/",
    sourceSection: "Accurate Cell Segmentation",
    reviewedAt: "2026-09-24",
  },
  {
    id: "cosmx-targeted-panels",
    instrument: "CosMx",
    claim:
      "CosMx offers targeted RNA panels alongside whole-transcriptome assays.",
    limitation: "Confirm assay, species and sample compatibility.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/",
    sourceSection: "Panels & Assays",
    reviewedAt: "2026-09-24",
  },
  {
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
    id: "cosmx-informatics",
    instrument: "CosMx",
    claim: "CosMx integrates with AtoMx for spatial data exploration.",
    limitation: "Analysis requires quality control and suitable workflows.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/cosmx-spatial-molecular-imager/",
    sourceSection: "Integrated Spatial Informatics Platform",
    reviewedAt: "2026-09-24",
  },
  {
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
    id: "geomx-transcriptome",
    instrument: "GeoMx",
    claim:
      "GeoMx offers whole-transcriptome profiling of selected tissue areas.",
    limitation: "Compatible assays and samples required; regional resolution.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-dsp-overview/",
    sourceSection:
      "Profile the Whole Transcriptome and 1200+ Proteins from Intact Tissue",
    reviewedAt: "2026-09-24",
  },
  {
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
    id: "geomx-protein-profiling",
    instrument: "GeoMx",
    claim: "GeoMx offers multiplex protein profiling of tissue regions.",
    limitation: "Compatible protein assays and samples are required.",
    sourceUrl:
      "https://brukerspatialbiology.com/products/geomx-digital-spatial-profiler/geomx-dsp-overview/",
    sourceSection:
      "Profile the Whole Transcriptome and 1200+ Proteins from Intact Tissue",
    reviewedAt: "2026-09-24",
  },
  {
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
];
