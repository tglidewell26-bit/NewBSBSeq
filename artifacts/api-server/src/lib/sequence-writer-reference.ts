import type { DraftTouch } from "@workspace/api-zod";

/**
 * User-approved Earli sequence, 2026-10-08. Only editable subjects/middles:
 * greetings, introductions, links, complete travel blocks and closes remain
 * deterministic renderer output. This example is NOT an evidence source.
 * Adapt the reasoning and voice, never transfer Earli facts to other accounts.
 */
export const EARLI_WRITER_REFERENCE: { guidance: string; touches: DraftTouch[] } = {
  guidance: "Style reference only. Lead with biology, explain the measurement, and ask a conditional question. Vary the biological question rather than forcing different features. Preserve historical context. Do not copy Earli, oncology, CosMx, human FFPE, AACR or methods into another account without current authority. Current user requirements and approved evidence override this example. The app retains the complete meeting schedule in every applicable touch.",
  touches: [
    {
      touchId: "email1",
      subject: "Spatial context for Earli’s immune therapies",
      middle: "I read on your website that Earli develops genetic switches intended to produce immune therapies selectively within tumors. That made me think about how immune activity might vary across different parts of a tumor.\n\nCosMx measures RNA in individual cells while preserving their locations in tissue. For a future study, that could help distinguish regions with immune-activation signatures from regions where those signatures are limited. Would that regional view be useful for your therapeutic programs?",
    },
    {
      touchId: "email2",
      subject: "Where immune cells sit within tumors",
      middle: "I read about your presentation at AACR 2026 on cancer-activated promoters and cytokine constructs in mouse tumor models. One question that came to mind was whether immune cells are distributed throughout a tumor or concentrated near its edges.\n\nCosMx can map cell populations and their RNA expression within tissue sections. With an assay selected for the model and markers, a spatial study could compare those locations alongside immune-cell states. Would that help answer any questions you’re considering for a follow-up study?",
    },
    {
      touchId: "liConnect", subject: "",
      middle: "I’m with Bruker Spatial Biology. I’d like to connect and discuss how spatial biology could help your research.",
    },
    {
      touchId: "liMsg1", subject: "",
      middle: "Would seeing where immune cells sit within a tumor add useful context to Earli’s immune-therapy studies? CosMx maps RNA expression in individual cells within tissue, connecting cell states with their locations.",
    },
    {
      touchId: "email3",
      subject: "Adding tissue context to immune phenotyping",
      middle: "I saw your earlier job posting for a Research Associate or Senior Research Associate, Therapeutics, which made me think about the multicolor FACS phenotyping described there.\n\nIf that remains part of your work, CosMx could provide a complementary view in tissue sections: where RNA-defined populations occur and which cells surround them. Would locating a population of interest within the tumor help you decide what to investigate next?",
    },
    {
      touchId: "email4", subject: "Cell number or cell state?",
      middle: "I read on your website that your Therapeutics team develops cytokine, T-cell-engager and multispecific payloads preclinically. For a future comparison, one useful question might be whether an immune-associated expression difference reflects more immune cells, a change in their state, or both.\n\nCosMx provides cell-level RNA measurements in tissue that can help separate those possibilities. Would that distinction be useful when comparing study conditions?",
    },
    {
      touchId: "email5", subject: "Comparing RNA and protein in the same cells",
      middle: "Another question for Earli’s immune-therapy work is how closely RNA-based cell states align with protein markers.\n\nIf human FFPE tissue studies are part of your plans, CosMx same-cell multiomics can measure RNA and protein in the same section. For markers covered by the selected assays, that allows a direct comparison within individual cells. Would that help characterize an immune population you’re interested in?",
    },
    {
      touchId: "liMsg2", subject: "",
      middle: "For a future Earli study, would it be useful to distinguish a change in immune-cell abundance from a change in those cells’ expression states? That’s one question we could discuss when considering a CosMx tissue experiment.",
    },
    {
      touchId: "email6", subject: "Starting with one spatial question",
      middle: "If spatial profiling is something you’re considering, we could start with one biological question and the tissue you expect to have available. That would let us discuss whether CosMx fits the study and which measurements would be useful.\n\nFor the analysis, AtoMx provides tools to explore CosMx images and expression data, with options to export data for further analysis. We could also discuss what your team would want to review—from a tissue map of a population of interest to expression differences between study groups.",
    },
  ],
};
