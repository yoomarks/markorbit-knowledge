import { CASE_CANDIDATE_ACCESS_CLASSIFICATIONS } from "./case-candidate-v1";

export const CASE_DOSSIER_PROTOCOL_VERSION = "1.0" as const;
export const CASE_DOSSIER_OBJECT_TYPE = "CASE_DOSSIER" as const;

export const CASE_DOSSIER_STATES = [
  "COLLECTING",
  "ASSEMBLED",
  "REVIEW_REQUIRED",
  "FINALIZED",
  "REJECTED",
  "BLOCKED_SOURCE",
  "NEEDS_REDACTION",
  "SUPERSEDED",
] as const;
export type CaseDossierState = (typeof CASE_DOSSIER_STATES)[number];

export const CASE_DOSSIER_EVIDENCE_SURFACES = [
  "FORMAL_MATTER",
  "LIFECYCLE_PROVENANCE",
  "DOCUMENT_PACKAGE",
] as const;
export type CaseDossierEvidenceSurface = (typeof CASE_DOSSIER_EVIDENCE_SURFACES)[number];

export const CASE_DOSSIER_COMPLETENESS_STATUSES = [
  "PRESENT",
  "MISSING",
  "SOURCE_UNAVAILABLE",
  "NOT_APPLICABLE",
  "PENDING_REVIEW",
] as const;
export type CaseDossierCompletenessStatus = (typeof CASE_DOSSIER_COMPLETENESS_STATUSES)[number];

export type CaseDossierEvidenceRefV1 = {
  collectionId: string;
  surface: CaseDossierEvidenceSurface;
  sourceRef: string;
  sha256: string;
  documentPackageId?: string;
};

export type CaseDossierTextFactV1 = {
  value: string;
  evidence: CaseDossierEvidenceRefV1[];
};

export type CaseDossierTimestampFactV1 = {
  value: string;
  evidence: CaseDossierEvidenceRefV1[];
};

export type CaseDossierPartyV1 = {
  role: string;
  displayName: string;
  evidence: CaseDossierEvidenceRefV1[];
};

export type CaseDossierIdentityV1 = {
  jurisdiction?: CaseDossierTextFactV1;
  matterType?: CaseDossierTextFactV1;
  markReference?: CaseDossierTextFactV1;
  applicationNumber?: CaseDossierTextFactV1;
  registrationNumber?: CaseDossierTextFactV1;
  initiatingRequest?: CaseDossierTextFactV1;
  startingProceduralState?: CaseDossierTextFactV1;
  parties: CaseDossierPartyV1[];
  casePeriod?: {
    startedAt?: CaseDossierTimestampFactV1;
    endedAt?: CaseDossierTimestampFactV1;
  };
};

export type CaseDossierNarrativeStatementV1 = {
  statementId: string;
  text: string;
  evidence: CaseDossierEvidenceRefV1[];
};

export type CaseDossierAmountV1 = {
  amount: string;
  currency: string;
  category: string;
  evidence: CaseDossierEvidenceRefV1[];
};

export type CaseDossierTimelineEventV1 = {
  eventId: string;
  occurredAt: CaseDossierTimestampFactV1;
  action: CaseDossierTextFactV1;
  actorRole?: CaseDossierTextFactV1;
  resultingStatus?: CaseDossierTextFactV1;
  deadline?: CaseDossierTimestampFactV1;
  amount?: CaseDossierAmountV1;
  inputEvidence: CaseDossierEvidenceRefV1[];
  outputEvidence: CaseDossierEvidenceRefV1[];
};

export type CaseDossierDocumentV1 = {
  documentId: string;
  documentPackageId: string;
  documentItemId?: string;
  documentType?: string;
  displayName?: string;
  checksum?: string;
  storageReference?: string;
  verificationStatus?: string;
  evidence: CaseDossierEvidenceRefV1[];
};

export type CaseDossierDurationV1 = {
  durationId: string;
  label: string;
  milliseconds: number;
  calculationBasis: "DETERMINISTIC_TIMESTAMP_DIFFERENCE";
  startedAt: CaseDossierTimestampFactV1;
  endedAt: CaseDossierTimestampFactV1;
};

export type CaseDossierOutcomeV1 = {
  code: string;
  label: string;
  occurredAt?: CaseDossierTimestampFactV1;
  evidence: CaseDossierEvidenceRefV1[];
};

export type CaseDossierCompletenessV1 = {
  matterMetadata: CaseDossierCompletenessStatus;
  startEndState: CaseDossierCompletenessStatus;
  timeline: CaseDossierCompletenessStatus;
  communications: CaseDossierCompletenessStatus;
  materialDocuments: CaseDossierCompletenessStatus;
  feeData: CaseDossierCompletenessStatus;
  outcome: CaseDossierCompletenessStatus;
  privacyReview: CaseDossierCompletenessStatus;
  sourceReferences: CaseDossierCompletenessStatus;
};

/**
 * Objective, evidence-backed Case Dossier aggregate.
 *
 * This contract is deliberately narrower than a universal case ontology. Every
 * populated factual statement must point back to immutable K-CASE-004 evidence.
 * Missing source families remain explicit completeness states rather than facts
 * invented by Knowledge. FINALIZED never means published.
 */
export type CaseDossierV1 = {
  protocolVersion: typeof CASE_DOSSIER_PROTOCOL_VERSION;
  objectType: typeof CASE_DOSSIER_OBJECT_TYPE;
  dossierId: string;
  version: number;
  candidateId: string;
  evidenceCollectionId: string;
  sourceMatter: {
    sourceMatterId: string;
    sourceMatterVersion: number;
    sourceSnapshotSha256: string;
    sourceWorkspaceId: string;
  };
  state: CaseDossierState;
  accessClassification: (typeof CASE_CANDIDATE_ACCESS_CLASSIFICATIONS)[number];
  identity: CaseDossierIdentityV1;
  narrative: CaseDossierNarrativeStatementV1[];
  timeline: CaseDossierTimelineEventV1[];
  documents: CaseDossierDocumentV1[];
  money: CaseDossierAmountV1[];
  durations: CaseDossierDurationV1[];
  outcome?: CaseDossierOutcomeV1;
  completeness: CaseDossierCompletenessV1;
  assembledAt: string;
  updatedAt: string;
  supersedesDossierVersion?: number;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const DOSSIER_ID = /^case-dossier_[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const CASE_CANDIDATE_ID = /^case-candidate_[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const COLLECTION_ID = /^case-evidence_[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const FORMAL_MATTER_ID = /^formal-matter_[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const DECIMAL_AMOUNT = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;

const FORBIDDEN_SEMANTIC_KEYS = new Set([
  "lesson",
  "lessons",
  "recommendation",
  "recommendations",
  "bestpractice",
  "bestpractices",
  "successprobability",
  "truthscore",
  "legaltruthverified",
  "authorityscore",
  "predictedoutcome",
  "prediction",
  "predictions",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function allowedKeys(item: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(item).every((key) => keys.includes(key));
}

function normalizedKey(value: string): string {
  return value.replace(/[-_\s]/gu, "").toLowerCase();
}

function containsForbiddenSemanticKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenSemanticKey);
  const item = record(value);
  if (!item) return false;
  for (const [key, nested] of Object.entries(item)) {
    if (FORBIDDEN_SEMANTIC_KEYS.has(normalizedKey(key))) return true;
    if (containsForbiddenSemanticKey(nested)) return true;
  }
  return false;
}

function evidenceRef(
  value: unknown,
  expectedCollectionId: string,
): value is CaseDossierEvidenceRefV1 {
  const item = record(value);
  if (!item) return false;
  if (
    !allowedKeys(item, ["collectionId", "surface", "sourceRef", "sha256", "documentPackageId"]) ||
    item.collectionId !== expectedCollectionId ||
    !CASE_DOSSIER_EVIDENCE_SURFACES.includes(item.surface as CaseDossierEvidenceSurface) ||
    !nonEmpty(item.sourceRef) ||
    typeof item.sha256 !== "string" ||
    !SHA256.test(item.sha256)
  ) {
    return false;
  }
  if (item.surface === "DOCUMENT_PACKAGE") return nonEmpty(item.documentPackageId);
  return item.documentPackageId === undefined;
}

function evidenceList(value: unknown, collectionId: string, requireOne = true): boolean {
  return (
    Array.isArray(value) &&
    (!requireOne || value.length > 0) &&
    value.every((entry) => evidenceRef(entry, collectionId))
  );
}

function textFact(value: unknown, collectionId: string): value is CaseDossierTextFactV1 {
  const item = record(value);
  return (
    item !== null &&
    allowedKeys(item, ["value", "evidence"]) &&
    nonEmpty(item.value) &&
    evidenceList(item.evidence, collectionId)
  );
}

function timestampFact(value: unknown, collectionId: string): value is CaseDossierTimestampFactV1 {
  const item = record(value);
  return (
    item !== null &&
    allowedKeys(item, ["value", "evidence"]) &&
    timestamp(item.value) &&
    evidenceList(item.evidence, collectionId)
  );
}

function amount(value: unknown, collectionId: string): value is CaseDossierAmountV1 {
  const item = record(value);
  return (
    item !== null &&
    allowedKeys(item, ["amount", "currency", "category", "evidence"]) &&
    typeof item.amount === "string" &&
    DECIMAL_AMOUNT.test(item.amount) &&
    nonEmpty(item.currency) &&
    nonEmpty(item.category) &&
    evidenceList(item.evidence, collectionId)
  );
}

function party(value: unknown, collectionId: string): value is CaseDossierPartyV1 {
  const item = record(value);
  return (
    item !== null &&
    allowedKeys(item, ["role", "displayName", "evidence"]) &&
    nonEmpty(item.role) &&
    nonEmpty(item.displayName) &&
    evidenceList(item.evidence, collectionId)
  );
}

function identity(value: unknown, collectionId: string): value is CaseDossierIdentityV1 {
  const item = record(value);
  if (
    !item ||
    !allowedKeys(item, [
      "jurisdiction",
      "matterType",
      "markReference",
      "applicationNumber",
      "registrationNumber",
      "initiatingRequest",
      "startingProceduralState",
      "parties",
      "casePeriod",
    ]) ||
    !Array.isArray(item.parties) ||
    !item.parties.every((entry) => party(entry, collectionId))
  ) {
    return false;
  }
  for (const key of [
    "jurisdiction",
    "matterType",
    "markReference",
    "applicationNumber",
    "registrationNumber",
    "initiatingRequest",
    "startingProceduralState",
  ] as const) {
    if (item[key] !== undefined && !textFact(item[key], collectionId)) return false;
  }
  if (item.casePeriod !== undefined) {
    const period = record(item.casePeriod);
    if (!period || !allowedKeys(period, ["startedAt", "endedAt"])) return false;
    if (period.startedAt !== undefined && !timestampFact(period.startedAt, collectionId))
      return false;
    if (period.endedAt !== undefined && !timestampFact(period.endedAt, collectionId)) return false;
  }
  return true;
}

function narrativeStatement(
  value: unknown,
  collectionId: string,
): value is CaseDossierNarrativeStatementV1 {
  const item = record(value);
  return (
    item !== null &&
    allowedKeys(item, ["statementId", "text", "evidence"]) &&
    nonEmpty(item.statementId) &&
    nonEmpty(item.text) &&
    evidenceList(item.evidence, collectionId)
  );
}

function timelineEvent(value: unknown, collectionId: string): value is CaseDossierTimelineEventV1 {
  const item = record(value);
  if (
    !item ||
    !allowedKeys(item, [
      "eventId",
      "occurredAt",
      "action",
      "actorRole",
      "resultingStatus",
      "deadline",
      "amount",
      "inputEvidence",
      "outputEvidence",
    ]) ||
    !nonEmpty(item.eventId) ||
    !timestampFact(item.occurredAt, collectionId) ||
    !textFact(item.action, collectionId) ||
    !evidenceList(item.inputEvidence, collectionId, false) ||
    !evidenceList(item.outputEvidence, collectionId, false)
  ) {
    return false;
  }
  if (item.actorRole !== undefined && !textFact(item.actorRole, collectionId)) return false;
  if (item.resultingStatus !== undefined && !textFact(item.resultingStatus, collectionId))
    return false;
  if (item.deadline !== undefined && !timestampFact(item.deadline, collectionId)) return false;
  if (item.amount !== undefined && !amount(item.amount, collectionId)) return false;
  return true;
}

function document(value: unknown, collectionId: string): value is CaseDossierDocumentV1 {
  const item = record(value);
  if (
    !item ||
    !allowedKeys(item, [
      "documentId",
      "documentPackageId",
      "documentItemId",
      "documentType",
      "displayName",
      "checksum",
      "storageReference",
      "verificationStatus",
      "evidence",
    ]) ||
    !nonEmpty(item.documentId) ||
    !nonEmpty(item.documentPackageId) ||
    !evidenceList(item.evidence, collectionId)
  ) {
    return false;
  }
  for (const key of [
    "documentItemId",
    "documentType",
    "displayName",
    "storageReference",
    "verificationStatus",
  ] as const) {
    if (item[key] !== undefined && !nonEmpty(item[key])) return false;
  }
  if (item.checksum !== undefined && !nonEmpty(item.checksum)) return false;
  return (item.evidence as CaseDossierEvidenceRefV1[]).some(
    (entry) =>
      entry.surface === "DOCUMENT_PACKAGE" && entry.documentPackageId === item.documentPackageId,
  );
}

function duration(value: unknown, collectionId: string): value is CaseDossierDurationV1 {
  const item = record(value);
  if (
    !item ||
    !allowedKeys(item, [
      "durationId",
      "label",
      "milliseconds",
      "calculationBasis",
      "startedAt",
      "endedAt",
    ]) ||
    !nonEmpty(item.durationId) ||
    !nonEmpty(item.label) ||
    typeof item.milliseconds !== "number" ||
    !Number.isSafeInteger(item.milliseconds) ||
    item.milliseconds < 0 ||
    item.calculationBasis !== "DETERMINISTIC_TIMESTAMP_DIFFERENCE" ||
    !timestampFact(item.startedAt, collectionId) ||
    !timestampFact(item.endedAt, collectionId)
  ) {
    return false;
  }
  return Date.parse(item.endedAt.value) - Date.parse(item.startedAt.value) === item.milliseconds;
}

function outcome(value: unknown, collectionId: string): value is CaseDossierOutcomeV1 {
  const item = record(value);
  return (
    item !== null &&
    allowedKeys(item, ["code", "label", "occurredAt", "evidence"]) &&
    nonEmpty(item.code) &&
    nonEmpty(item.label) &&
    (item.occurredAt === undefined || timestampFact(item.occurredAt, collectionId)) &&
    evidenceList(item.evidence, collectionId)
  );
}

function completeness(value: unknown): value is CaseDossierCompletenessV1 {
  const item = record(value);
  if (
    !item ||
    !allowedKeys(item, [
      "matterMetadata",
      "startEndState",
      "timeline",
      "communications",
      "materialDocuments",
      "feeData",
      "outcome",
      "privacyReview",
      "sourceReferences",
    ])
  ) {
    return false;
  }
  return [
    item.matterMetadata,
    item.startEndState,
    item.timeline,
    item.communications,
    item.materialDocuments,
    item.feeData,
    item.outcome,
    item.privacyReview,
    item.sourceReferences,
  ].every((status) =>
    CASE_DOSSIER_COMPLETENESS_STATUSES.includes(status as CaseDossierCompletenessStatus),
  );
}

function uniqueIds(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export function isCaseDossierV1(value: unknown): value is CaseDossierV1 {
  const item = record(value);
  if (!item || containsForbiddenSemanticKey(item)) return false;
  if (
    !allowedKeys(item, [
      "protocolVersion",
      "objectType",
      "dossierId",
      "version",
      "candidateId",
      "evidenceCollectionId",
      "sourceMatter",
      "state",
      "accessClassification",
      "identity",
      "narrative",
      "timeline",
      "documents",
      "money",
      "durations",
      "outcome",
      "completeness",
      "assembledAt",
      "updatedAt",
      "supersedesDossierVersion",
    ]) ||
    item.protocolVersion !== CASE_DOSSIER_PROTOCOL_VERSION ||
    item.objectType !== CASE_DOSSIER_OBJECT_TYPE ||
    typeof item.dossierId !== "string" ||
    !DOSSIER_ID.test(item.dossierId) ||
    typeof item.version !== "number" ||
    !Number.isSafeInteger(item.version) ||
    item.version < 1 ||
    typeof item.candidateId !== "string" ||
    !CASE_CANDIDATE_ID.test(item.candidateId) ||
    typeof item.evidenceCollectionId !== "string" ||
    !COLLECTION_ID.test(item.evidenceCollectionId) ||
    !CASE_DOSSIER_STATES.includes(item.state as CaseDossierState) ||
    !CASE_CANDIDATE_ACCESS_CLASSIFICATIONS.includes(
      item.accessClassification as (typeof CASE_CANDIDATE_ACCESS_CLASSIFICATIONS)[number],
    ) ||
    !timestamp(item.assembledAt) ||
    !timestamp(item.updatedAt) ||
    Date.parse(item.updatedAt) < Date.parse(item.assembledAt)
  ) {
    return false;
  }

  if (
    item.supersedesDossierVersion !== undefined &&
    (typeof item.supersedesDossierVersion !== "number" ||
      !Number.isSafeInteger(item.supersedesDossierVersion) ||
      item.supersedesDossierVersion < 1 ||
      item.supersedesDossierVersion >= item.version)
  ) {
    return false;
  }

  const sourceMatter = record(item.sourceMatter);
  if (
    !sourceMatter ||
    !allowedKeys(sourceMatter, [
      "sourceMatterId",
      "sourceMatterVersion",
      "sourceSnapshotSha256",
      "sourceWorkspaceId",
    ]) ||
    typeof sourceMatter.sourceMatterId !== "string" ||
    !FORMAL_MATTER_ID.test(sourceMatter.sourceMatterId) ||
    typeof sourceMatter.sourceMatterVersion !== "number" ||
    !Number.isSafeInteger(sourceMatter.sourceMatterVersion) ||
    sourceMatter.sourceMatterVersion < 1 ||
    typeof sourceMatter.sourceSnapshotSha256 !== "string" ||
    !SHA256.test(sourceMatter.sourceSnapshotSha256) ||
    !nonEmpty(sourceMatter.sourceWorkspaceId)
  ) {
    return false;
  }

  const collectionId = item.evidenceCollectionId;
  if (
    !identity(item.identity, collectionId) ||
    !Array.isArray(item.narrative) ||
    !item.narrative.every((entry) => narrativeStatement(entry, collectionId)) ||
    !uniqueIds(
      item.narrative.map((entry) => (entry as CaseDossierNarrativeStatementV1).statementId),
    ) ||
    !Array.isArray(item.timeline) ||
    !item.timeline.every((entry) => timelineEvent(entry, collectionId)) ||
    !uniqueIds(item.timeline.map((entry) => (entry as CaseDossierTimelineEventV1).eventId)) ||
    !Array.isArray(item.documents) ||
    !item.documents.every((entry) => document(entry, collectionId)) ||
    !uniqueIds(item.documents.map((entry) => (entry as CaseDossierDocumentV1).documentId)) ||
    !Array.isArray(item.money) ||
    !item.money.every((entry) => amount(entry, collectionId)) ||
    !Array.isArray(item.durations) ||
    !item.durations.every((entry) => duration(entry, collectionId)) ||
    !uniqueIds(item.durations.map((entry) => (entry as CaseDossierDurationV1).durationId)) ||
    (item.outcome !== undefined && !outcome(item.outcome, collectionId)) ||
    !completeness(item.completeness)
  ) {
    return false;
  }

  return true;
}

export function assertCaseDossierV1(value: unknown): asserts value is CaseDossierV1 {
  if (!isCaseDossierV1(value)) throw new TypeError("Invalid CaseDossierV1");
}
