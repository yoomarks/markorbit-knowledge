export const TMCLASS_SOURCE_EVIDENCE_VERSION = "TMCLASS_SOURCE_EVIDENCE_V1" as const;
export const TMCLASS_SOURCE_ID = "EUIPO_TMCLASS" as const;

export type TmclassTaxonomyNodeV1 = {
  label: string;
  sourceNodeId: string | null;
};

export type TmclassOfficeV1 = {
  name: string;
  code: string | null;
};

export type TmclassTranslationTargetV1 = {
  termId: string;
  languageCode: string;
  niceClass: number;
  text: string;
  quality: string;
};

export type TmclassTermSourceV1 = {
  conceptId: string;
  sourceName: string;
  referenceId: string;
};

export type TmclassTermPageV1 = {
  pageKind: "TERM";
  termId: string;
  text: string;
  niceClass: number;
  languageCode: string;
  languageLabel: string;
  acceptedBy: TmclassOfficeV1[];
  taxonomy: TmclassTaxonomyNodeV1[];
  translationTargets: TmclassTranslationTargetV1[];
  sources: TmclassTermSourceV1[];
};

export type TmclassConceptIdentityV1 = {
  conceptId: string;
  title: string;
  status: string;
  niceClass: number;
  sourceName: string;
  sourceDateText: string | null;
  referenceId: string;
  scopeStatus: string;
  taxonomy: TmclassTaxonomyNodeV1[];
};

export type TmclassConceptOverviewPageV1 = TmclassConceptIdentityV1 & {
  pageKind: "CONCEPT_OVERVIEW";
  languages: Array<{
    languageCode: string;
    masterTermId: string;
    masterTermText: string;
    variantCount: number;
    totalTermCount: number;
  }>;
  masterCount: number;
  variantCount: number;
};

export type TmclassConceptLanguagePageV1 = TmclassConceptIdentityV1 & {
  pageKind: "CONCEPT_LANGUAGE";
  languageCode: string;
  terms: Array<{
    termId: string;
    text: string;
    role: "MASTER" | "VARIANT";
    ordinal: number;
  }>;
};

export type TmclassSourcePageV1 =
  TmclassTermPageV1 | TmclassConceptOverviewPageV1 | TmclassConceptLanguagePageV1;

export type TmclassSourceEvidenceV1 = {
  contractVersion: typeof TMCLASS_SOURCE_EVIDENCE_VERSION;
  objectType: "TMCLASS_SOURCE_EVIDENCE";
  sourceOwner: "MARKORBIT_KNOWLEDGE";
  sourceId: typeof TMCLASS_SOURCE_ID;
  observedAt: string;
  evidence: {
    workspaceId: string;
    sourceDefinitionId: string;
    collectionRunId: string;
    rawArtifactId: string;
    artifactVersion: number;
    canonicalUri: string;
    sourceUri: string;
    sha256: string;
  };
  page: TmclassSourcePageV1;
};

const DECIMAL_ID = /^\d+$/u;
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function requiredText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validNiceClass(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 45;
}

function validateTaxonomy(nodes: readonly TmclassTaxonomyNodeV1[], errors: string[]): void {
  if (!Array.isArray(nodes) || nodes.length < 1) {
    errors.push("TAXONOMY_MISSING");
    return;
  }
  if (
    nodes.some(
      (node) =>
        !requiredText(node?.label) ||
        (node.sourceNodeId !== null && !requiredText(node.sourceNodeId)),
    )
  ) {
    errors.push("TAXONOMY_INVALID");
  }
}

function validateConceptIdentity(page: TmclassConceptIdentityV1, errors: string[]): void {
  if (!DECIMAL_ID.test(page.conceptId)) errors.push("CONCEPT_ID_INVALID");
  if (!requiredText(page.title)) errors.push("CONCEPT_TITLE_MISSING");
  if (!requiredText(page.status)) errors.push("CONCEPT_STATUS_MISSING");
  if (!validNiceClass(page.niceClass)) errors.push("NICE_CLASS_INVALID");
  if (!requiredText(page.sourceName)) errors.push("CONCEPT_SOURCE_MISSING");
  if (page.sourceDateText !== null && typeof page.sourceDateText !== "string") {
    errors.push("CONCEPT_SOURCE_DATE_INVALID");
  }
  if (!requiredText(page.referenceId)) errors.push("REFERENCE_ID_MISSING");
  if (!requiredText(page.scopeStatus)) errors.push("SCOPE_STATUS_MISSING");
  validateTaxonomy(page.taxonomy, errors);
}

function validatePage(page: TmclassSourcePageV1, errors: string[]): void {
  if (page.pageKind === "TERM") {
    if (!DECIMAL_ID.test(page.termId)) errors.push("TERM_ID_INVALID");
    if (!requiredText(page.text)) errors.push("TERM_TEXT_MISSING");
    if (!validNiceClass(page.niceClass)) errors.push("NICE_CLASS_INVALID");
    if (!LANGUAGE.test(page.languageCode)) errors.push("LANGUAGE_CODE_INVALID");
    if (!requiredText(page.languageLabel)) errors.push("LANGUAGE_LABEL_MISSING");
    validateTaxonomy(page.taxonomy, errors);
    if (
      !Array.isArray(page.acceptedBy) ||
      page.acceptedBy.some(
        (office) =>
          !requiredText(office?.name) || (office.code !== null && !requiredText(office.code)),
      )
    ) {
      errors.push("ACCEPTED_OFFICES_INVALID");
    }
    if (
      !Array.isArray(page.translationTargets) ||
      page.translationTargets.some(
        (target) =>
          !DECIMAL_ID.test(target?.termId) ||
          !LANGUAGE.test(target.languageCode) ||
          !validNiceClass(target.niceClass) ||
          !requiredText(target.text) ||
          !requiredText(target.quality),
      )
    ) {
      errors.push("TRANSLATION_TARGETS_INVALID");
    }
    if (
      !Array.isArray(page.sources) ||
      page.sources.some(
        (source) =>
          !DECIMAL_ID.test(source?.conceptId) ||
          !requiredText(source.sourceName) ||
          !requiredText(source.referenceId),
      )
    ) {
      errors.push("TERM_SOURCES_INVALID");
    }
    return;
  }

  validateConceptIdentity(page, errors);
  if (page.pageKind === "CONCEPT_OVERVIEW") {
    if (!Number.isSafeInteger(page.masterCount) || page.masterCount < 0) {
      errors.push("MASTER_COUNT_INVALID");
    }
    if (!Number.isSafeInteger(page.variantCount) || page.variantCount < 0) {
      errors.push("VARIANT_COUNT_INVALID");
    }
    if (!Array.isArray(page.languages) || page.languages.length < 1) {
      errors.push("CONCEPT_LANGUAGES_MISSING");
      return;
    }
    for (const language of page.languages) {
      if (
        !LANGUAGE.test(language.languageCode) ||
        !DECIMAL_ID.test(language.masterTermId) ||
        !requiredText(language.masterTermText) ||
        !Number.isSafeInteger(language.variantCount) ||
        language.variantCount < 0 ||
        !Number.isSafeInteger(language.totalTermCount) ||
        language.totalTermCount !== language.variantCount + 1
      ) {
        errors.push("CONCEPT_LANGUAGE_SUMMARY_INVALID");
      }
    }
    return;
  }

  if (!LANGUAGE.test(page.languageCode)) errors.push("LANGUAGE_CODE_INVALID");
  if (!Array.isArray(page.terms) || page.terms.length < 1) {
    errors.push("CONCEPT_TERMS_MISSING");
    return;
  }
  if (page.terms.filter((term) => term.role === "MASTER").length !== 1) {
    errors.push("CONCEPT_MASTER_CARDINALITY_INVALID");
  }
  const seen = new Set<string>();
  for (const term of page.terms) {
    if (
      !DECIMAL_ID.test(term.termId) ||
      !requiredText(term.text) ||
      (term.role !== "MASTER" && term.role !== "VARIANT") ||
      !Number.isSafeInteger(term.ordinal) ||
      term.ordinal < 1 ||
      seen.has(term.termId)
    ) {
      errors.push("CONCEPT_TERM_INVALID");
    }
    seen.add(term.termId);
  }
}

export function validateTmclassSourceEvidenceV1(value: TmclassSourceEvidenceV1): string[] {
  const errors: string[] = [];
  if (
    value.contractVersion !== TMCLASS_SOURCE_EVIDENCE_VERSION ||
    value.objectType !== "TMCLASS_SOURCE_EVIDENCE" ||
    value.sourceOwner !== "MARKORBIT_KNOWLEDGE" ||
    value.sourceId !== TMCLASS_SOURCE_ID
  ) {
    errors.push("CONTRACT_IDENTITY_INVALID");
  }
  if (!Number.isFinite(Date.parse(value.observedAt))) errors.push("OBSERVED_AT_INVALID");
  const evidence = value.evidence;
  if (
    !requiredText(evidence.workspaceId) ||
    !requiredText(evidence.sourceDefinitionId) ||
    !requiredText(evidence.collectionRunId) ||
    !requiredText(evidence.rawArtifactId) ||
    !Number.isSafeInteger(evidence.artifactVersion) ||
    evidence.artifactVersion < 1 ||
    !requiredText(evidence.canonicalUri) ||
    !requiredText(evidence.sourceUri) ||
    !SHA256.test(evidence.sha256)
  ) {
    errors.push("EVIDENCE_LINEAGE_INVALID");
  }
  validatePage(value.page, errors);
  return [...new Set(errors)];
}

export function assertTmclassSourceEvidenceV1(value: TmclassSourceEvidenceV1): void {
  const errors = validateTmclassSourceEvidenceV1(value);
  if (errors.length > 0) throw new Error(`Invalid TMclass source evidence: ${errors.join(", ")}`);
}
