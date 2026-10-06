// Converts the ChatGPT "account research dossier" (see docs/account-dossier.md)
// into the frozen bsb-company-research-v1 packet so the existing validation,
// normalization, assessment, and review pipeline can use it unchanged.
//
// The conversion is deterministic: the same dossier always yields the same
// packet (and therefore the same input hash), so duplicate uploads dedupe.

type Issue = { path: string; message: string };

type EvidenceItem = {
  evidenceState: "EXPLICIT" | "INFERRED" | "UNKNOWN" | "CONTRADICTED";
  assessmentType: string;
  claim: string;
  sourceUrl: string | null;
  basisFacts: string[];
  basisSourceUrls: string[];
  inference: string | null;
  evidenceId: string;
  provenanceType: "PUBLIC_SOURCE";
};

type Categories = Record<
  | "scientificNeeds" | "workflows" | "samples" | "technologies" | "translationalStage"
  | "negativeOrContradictoryEvidence" | "materialUnknowns" | "buyingReadinessSignals",
  EvidenceItem[]
>;

export const DOSSIER_SCHEMA_VERSIONS = ["bsb-account-dossier-v1", "1.0"];

const isObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** True when the value looks like an account dossier rather than a frozen v1 packet. */
export function isAccountDossier(value: unknown): boolean {
  if (!isObject(value) || "qualificationEvidence" in value) return false;
  return "buyer_units" in value || "schema_version" in value || ("organization" in value && "must_be_right_facts" in value);
}

const text = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (isObject(value) && "value" in value) return text(value.value);
  return "";
};

const httpUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === null || value === undefined || value === "" ? [] : [value]);

const normalizeTag = (tag: unknown): "STATED" | "INFERRED" | "UNKNOWN" | null => {
  const t = typeof tag === "string" ? tag.trim().toLowerCase() : "";
  if (t === "stated" || t === "explicit" || t === "confirmed") return "STATED";
  if (t === "inferred" || t === "inference") return "INFERRED";
  if (t === "unknown") return "UNKNOWN";
  return null;
};

class Builder {
  categories: Categories = {
    scientificNeeds: [], workflows: [], samples: [], technologies: [], translationalStage: [],
    negativeOrContradictoryEvidence: [], materialUnknowns: [], buyingReadinessSignals: [],
  };
  notes: Issue[] = [];
  private counter = 0;

  private id(prefix: string) {
    this.counter += 1;
    return `dossier-${prefix}-${String(this.counter).padStart(3, "0")}`;
  }

  /**
   * Add one dossier evidence object (or a bare string) to a category.
   * `label` is prepended to the claim so buyer-unit context is never lost.
   */
  addEvidence(category: keyof Categories, assessmentType: string, raw: unknown, path: string, label = "") {
    const prefix = label ? `${label}: ` : "";
    if (typeof raw === "string" || typeof raw === "number") {
      const value = String(raw).trim();
      if (!value) return;
      this.notes.push({ path, message: "Plain text value without an evidence object (tag, source, snippet). Kept, but it cannot support a recommendation." });
      this.push(category, {
        evidenceState: "INFERRED", assessmentType, claim: `${prefix}${value}`, sourceUrl: null,
        basisFacts: [], basisSourceUrls: [], inference: "No evidence object supplied by the researcher.",
      });
      return;
    }
    if (!isObject(raw)) return;

    const value = text(raw.value);
    const snippet = text(raw.evidence);
    const url = httpUrl(raw.source_url);
    if (raw.source_url && !url) this.notes.push({ path: `${path}.source_url`, message: "Source URL is not a valid http(s) link and was dropped." });

    let tag = normalizeTag(raw.tag);
    if (!tag) {
      tag = "UNKNOWN";
      this.notes.push({ path: `${path}.tag`, message: `Missing or unrecognized tag ${JSON.stringify(raw.tag ?? null)}; treated as Unknown.` });
    }

    const dated = [raw.source_date ? `source date ${text(raw.source_date)}` : "", raw.stale === true ? "STALE (older than 3 years)" : ""].filter(Boolean).join("; ");
    const claimBody = value || (tag === "UNKNOWN" ? "Unknown — not found in public sources." : snippet);
    if (!claimBody) return;
    const claim = `${prefix}${claimBody}${dated ? ` (${dated})` : ""}`;
    const basis = [...(snippet ? [snippet] : []), ...(snippet && dated ? [`Source metadata: ${dated}`] : [])];

    if (tag === "UNKNOWN") {
      this.push(category, {
        evidenceState: "UNKNOWN", assessmentType, claim, sourceUrl: null,
        basisFacts: basis, basisSourceUrls: [], inference: null,
      });
      return;
    }
    if (tag === "INFERRED") {
      const confidence = text(raw.confidence);
      const reasoning = text(raw.reasoning);
      this.push(category, {
        evidenceState: "INFERRED", assessmentType, claim, sourceUrl: url,
        basisFacts: basis, basisSourceUrls: url ? [url] : [],
        inference: reasoning ? [reasoning, confidence ? `Confidence: ${confidence}.` : ""].filter(Boolean).join(" ") : null,
      });
      return;
    }
    this.push(category, {
      evidenceState: "EXPLICIT", assessmentType, claim, sourceUrl: url,
      basisFacts: basis, basisSourceUrls: url ? [url] : [], inference: null,
    });
  }

  /** Add a record the researcher built from a specific source (job posting, publication). */
  addSourced(category: keyof Categories, assessmentType: string, claim: string, facts: string[], rawUrl: unknown, path: string) {
    const url = httpUrl(rawUrl);
    if (rawUrl && !url) this.notes.push({ path: `${path}.source_url`, message: "Source URL is not a valid http(s) link and was dropped." });
    this.push(category, {
      evidenceState: "EXPLICIT", assessmentType, claim, sourceUrl: url,
      basisFacts: facts.length ? facts : [claim], basisSourceUrls: url ? [url] : [], inference: null,
    });
  }

  addUnknown(category: keyof Categories, assessmentType: string, claim: string) {
    if (!claim.trim()) return;
    this.push(category, {
      evidenceState: "UNKNOWN", assessmentType, claim: claim.trim(), sourceUrl: null,
      basisFacts: [], basisSourceUrls: [], inference: null,
    });
  }

  addContradicted(claim: string, facts: string[]) {
    this.push("negativeOrContradictoryEvidence", {
      evidenceState: "CONTRADICTED", assessmentType: "LIMITATION", claim, sourceUrl: null,
      basisFacts: facts, basisSourceUrls: [], inference: null,
    });
  }

  private push(category: keyof Categories, item: Omit<EvidenceItem, "evidenceId" | "provenanceType">) {
    this.categories[category].push({ ...item, evidenceId: this.id(category), provenanceType: "PUBLIC_SOURCE" });
  }
}

/** Basic shape checks. Returns blocking issues; an empty list means the dossier can be converted. */
export function validateDossierShape(dossier: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!isObject(dossier)) return [{ path: "", message: "The dossier must be a JSON object." }];
  const version = dossier.schema_version;
  if (version !== undefined && !DOSSIER_SCHEMA_VERSIONS.includes(String(version))) {
    issues.push({ path: "schema_version", message: `Unsupported dossier version ${JSON.stringify(version)}. Expected one of: ${DOSSIER_SCHEMA_VERSIONS.join(", ")}.` });
  }
  const name = text(dossier.organization?.official_name) || text(dossier.input?.organization_name);
  if (!name) issues.push({ path: "organization.official_name", message: "The dossier must name the organization (organization.official_name or input.organization_name)." });
  for (const key of ["buyer_units", "must_be_right_facts", "job_postings", "publications_and_presentations", "contradiction_checks", "open_unknowns"]) {
    if (dossier[key] !== undefined && dossier[key] !== null && !Array.isArray(dossier[key])) {
      issues.push({ path: key, message: "Must be a list (JSON array)." });
    }
  }
  return issues;
}

/** Convert a dossier into a frozen v1 research packet plus non-blocking conversion notes. */
export function convertDossier(dossier: Record<string, any>) {
  const b = new Builder();
  const org = isObject(dossier.organization) ? dossier.organization : {};
  const name = text(org.official_name) || text(dossier.input?.organization_name);

  // Must-be-right facts and the company's focus.
  list(dossier.must_be_right_facts).forEach((item, i) =>
    b.addEvidence("scientificNeeds", "COMPANY_FACT", item, `must_be_right_facts[${i}]`, "Must-be-right fact"));

  const focus = isObject(dossier.therapeutic_or_business_focus) ? dossier.therapeutic_or_business_focus : {};
  list(focus.modalities).forEach((item, i) =>
    b.addEvidence("scientificNeeds", "MODALITY", item, `therapeutic_or_business_focus.modalities[${i}]`, "Modality"));
  list(focus.disease_areas).forEach((item, i) =>
    b.addEvidence("scientificNeeds", "PROGRAM", item, `therapeutic_or_business_focus.disease_areas[${i}]`, "Disease area"));
  list(focus.pipeline_programs).forEach((program, i) => {
    if (!isObject(program)) return;
    const parts = [text(program.modality), text(program.target) && `target ${text(program.target)}`, text(program.indication), text(program.phase)].filter(Boolean).join("; ");
    const summary = `${text(program.program) || "Unnamed program"}${parts ? ` — ${parts}` : ""}`;
    const ev = isObject(program.evidence) ? { ...program.evidence, value: summary } : summary;
    b.addEvidence("scientificNeeds", "PROGRAM", ev, `therapeutic_or_business_focus.pipeline_programs[${i}]`, "Pipeline program");
  });
  list(focus.species_and_model_systems).forEach((item, i) =>
    b.addEvidence("samples", "SAMPLE", item, `therapeutic_or_business_focus.species_and_model_systems[${i}]`, "Species / model system"));

  // Company stage and recent milestones.
  if (text(org.company_stage)) {
    const stage = text(org.company_stage);
    if (stage.toLowerCase() === "unknown") b.addUnknown("translationalStage", "UNKNOWN", "Company stage is unknown.");
    else b.addEvidence("translationalStage", "COMPANY_FACT", org.company_stage, "organization.company_stage", "Company stage");
  }
  list(org.recent_milestones).forEach((item, i) =>
    b.addEvidence("buyingReadinessSignals", "COMPANY_FACT", item, `organization.recent_milestones[${i}]`, "Recent milestone"));
  if (org.latest_funding_event) b.addEvidence("buyingReadinessSignals", "COMPANY_FACT", org.latest_funding_event, "organization.latest_funding_event", "Latest funding");

  // Buyer units: every claim is labelled with its unit so departments stay separate.
  const units = list(dossier.buyer_units).filter(isObject) as Record<string, any>[];
  units.forEach((unit, u) => {
    const unitName = text(unit.unit_name) || `Buyer unit ${u + 1}`;
    const p = `buyer_units[${u}]`;
    const L = (what: string) => `[${unitName}] ${what}`;
    list(unit.research_focus).forEach((x, i) => b.addEvidence("scientificNeeds", "CAPABILITY", x, `${p}.research_focus[${i}]`, L("Research focus")));
    list(unit.sample_types).forEach((x, i) => b.addEvidence("samples", "SAMPLE_TYPE", x, `${p}.sample_types[${i}]`, L("Sample type")));
    list(unit.species).forEach((x, i) => b.addEvidence("samples", "SAMPLE", x, `${p}.species[${i}]`, L("Species")));
    const ms = isObject(unit.measurement_signals) ? unit.measurement_signals : {};
    list(ms.rna).forEach((x, i) => b.addEvidence("workflows", "WORKFLOW", x, `${p}.measurement_signals.rna[${i}]`, L("RNA signal")));
    list(ms.protein).forEach((x, i) => b.addEvidence("workflows", "WORKFLOW", x, `${p}.measurement_signals.protein[${i}]`, L("Protein signal")));
    if (ms.summary) b.addEvidence("workflows", "MODALITY", ms.summary, `${p}.measurement_signals.summary`, L("Measurement summary"));
    const rs = isObject(unit.resolution_signals) ? unit.resolution_signals : {};
    list(rs.single_cell).forEach((x, i) => b.addEvidence("workflows", "WORKFLOW", x, `${p}.resolution_signals.single_cell[${i}]`, L("Single-cell signal")));
    list(rs.region_or_bulk).forEach((x, i) => b.addEvidence("workflows", "WORKFLOW", x, `${p}.resolution_signals.region_or_bulk[${i}]`, L("Region/bulk signal")));
    list(rs.scale_and_throughput).forEach((x, i) => b.addEvidence("workflows", "WORKFLOW", x, `${p}.resolution_signals.scale_and_throughput[${i}]`, L("Scale/throughput")));
    const ac = isObject(unit.analysis_culture) ? unit.analysis_culture : {};
    if (ac.computational_team) b.addEvidence("technologies", "CAPABILITY", ac.computational_team, `${p}.analysis_culture.computational_team`, L("Computational team"));
    list(ac.software_named).forEach((x, i) => b.addEvidence("technologies", "CAPABILITY", x, `${p}.analysis_culture.software_named[${i}]`, L("Software")));
    list(ac.data_preferences).forEach((x, i) => b.addEvidence("technologies", "CAPABILITY", x, `${p}.analysis_culture.data_preferences[${i}]`, L("Data preference")));
    list(unit.infrastructure).forEach((x, i) => b.addEvidence("technologies", "CAPABILITY", x, `${p}.infrastructure[${i}]`, L("Infrastructure")));
    list(unit.spatial_platforms_detected).forEach((platform, i) => {
      if (!isObject(platform)) return;
      const summary = [text(platform.platform) || "Unnamed platform", text(platform.vendor) && `vendor ${text(platform.vendor)}`, text(platform.modality) && `modality ${text(platform.modality)}`, text(platform.in_house_or_outsourced) && text(platform.in_house_or_outsourced).replace(/_/g, " ")].filter(Boolean).join("; ");
      const ev = isObject(platform.evidence) ? { ...platform.evidence, value: summary } : summary;
      b.addEvidence("technologies", "CAPABILITY", ev, `${p}.spatial_platforms_detected[${i}]`, L("Spatial platform in use"));
    });
  });

  // Job postings and publications: the researcher built these directly from a source.
  list(dossier.job_postings).forEach((job, i) => {
    if (!isObject(job)) return;
    const facts = [
      text(job.techniques_named) && `Techniques named: ${text(job.techniques_named)}`,
      text(job.tools_and_software_named) && `Tools/software named: ${text(job.tools_and_software_named)}`,
      text(job.sample_types_named) && `Sample types named: ${text(job.sample_types_named)}`,
    ].filter(Boolean) as string[];
    const where = [text(job.buyer_unit), text(job.location), text(job.posted_date) && `posted ${text(job.posted_date)}`, text(job.status) && `status: ${text(job.status)}`].filter(Boolean).join("; ");
    const claim = `Job posting: ${text(job.title) || "Untitled role"}${where ? ` (${where})` : ""}${facts.length ? ` — ${facts.join(". ")}` : ""}`;
    b.addSourced("workflows", "SOURCE", claim, facts, job.source_url, `job_postings[${i}]`);
  });
  list(dossier.publications_and_presentations).forEach((pub, i) => {
    if (!isObject(pub)) return;
    const facts = [
      text(pub.methods_and_platforms_named) && `Methods/platforms named: ${text(pub.methods_and_platforms_named)}`,
      text(pub.sample_types) && `Sample types: ${text(pub.sample_types)}`,
      text(pub.species) && `Species: ${text(pub.species)}`,
    ].filter(Boolean) as string[];
    const where = [text(pub.buyer_unit), text(pub.venue), text(pub.year)].filter(Boolean).join("; ");
    const claim = `Publication/presentation: ${text(pub.title) || "Untitled"}${where ? ` (${where})` : ""}${facts.length ? ` — ${facts.join(". ")}` : ""}`;
    b.addSourced("technologies", "SOURCE", claim, facts, pub.source_url, `publications_and_presentations[${i}]`);
  });

  // Contradiction checks: contradicted inferences are recorded as contradictions;
  // weakened or unresolved ones become material unknowns. Supported ones add nothing new.
  list(dossier.contradiction_checks).forEach((check) => {
    if (!isObject(check)) return;
    const inference = text(check.inference_tested);
    if (!inference) return;
    const result = text(check.result).toLowerCase();
    const notes = [text(check.search_performed) && `Search: ${text(check.search_performed)}`, text(check.notes)].filter(Boolean) as string[];
    if (result === "contradicted") b.addContradicted(`Contradicted inference: ${inference}`, notes);
    else if (result === "weakened" || result === "no_evidence_found") {
      b.addUnknown("materialUnknowns", "LIMITATION", `Unresolved inference (${result.replace(/_/g, " ")}): ${inference}${notes.length ? ` — ${notes.join(". ")}` : ""}`);
    }
  });

  // Open questions for the meeting.
  list(dossier.open_unknowns).forEach((item) => {
    const q = typeof item === "string" ? item : text(isObject(item) ? item.value ?? item.question : item);
    b.addUnknown("materialUnknowns", "QUESTION", q);
  });

  const unitNames = units.map((u, i) => text(u.unit_name) || `Buyer unit ${i + 1}`);
  const dq = isObject(dossier.data_quality) ? dossier.data_quality : {};
  const header = [text(org.org_type).replace(/_/g, " "), text(org.company_stage) && `stage: ${text(org.company_stage)}`, text(org.hq_location)].filter(Boolean).join("; ");
  const brief = [
    `${name}${header ? ` (${header})` : ""}.`,
    unitNames.length ? `Buyer units: ${unitNames.join("; ")}.` : "Buyer units: not identified.",
    text(dossier.research_date) && `Research date: ${text(dossier.research_date)}.`,
    text(dq.overall_confidence) && `Researcher confidence: ${text(dq.overall_confidence)}.`,
    "Converted from account research dossier.",
  ].filter(Boolean).join(" ");

  const researchPacket = {
    schemaVersion: "bsb-company-research-v1",
    brief,
    qualificationEvidence: {
      schemaVersion: "1.0",
      purpose: "EVIDENCE_ONLY_NO_INSTRUMENT_SELECTION",
      generationStatus: "COMPLETE",
      categories: b.categories,
      // The researcher never selects instruments; the decider fills this in later.
      instrumentDiscriminatingEvidence: { cellScapeRelevant: [], cosMxRelevant: [], geoMxRelevant: [] },
    },
  };
  return { researchPacket, notes: b.notes };
}
