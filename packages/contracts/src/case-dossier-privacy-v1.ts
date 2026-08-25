import { CASE_CANDIDATE_ACCESS_CLASSIFICATIONS } from "./case-candidate-v1";

export const CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION = "1.0" as const;
export const CASE_DOSSIER_PRIVACY_REVIEW_OBJECT_TYPE = "CASE_DOSSIER_PRIVACY_REVIEW" as const;
export const CASE_DOSSIER_REDACTED_DERIVATIVE_OBJECT_TYPE =
  "CASE_DOSSIER_REDACTED_DERIVATIVE" as const;

export const CASE_DOSSIER_PRIVACY_STATES = [
  "REVIEW_REQUIRED",
  "NEEDS_REDACTION",
  "FINALIZED",
  "REJECTED",
] as const;
export type CaseDossierPrivacyState = (typeof CASE_DOSSIER_PRIVACY_STATES)[number];

export const CASE_DOSSIER_PRIVACY_CATEGORIES = [
  "PERSONAL_DATA",
  "PRIVILEGED_COMMUNICATION",
  "FINANCIAL_DATA",
  "CONFIDENTIAL_COMMERCIAL",
  "OTHER_SENSITIVE",
] as const;
export type CaseDossierPrivacyCategory = (typeof CASE_DOSSIER_PRIVACY_CATEGORIES)[number];

export const CASE_DOSSIER_REDACTION_ACTIONS = ["MASK_VALUE", "OMIT_ITEM"] as const;
export type CaseDossierRedactionAction = (typeof CASE_DOSSIER_REDACTION_ACTIONS)[number];

export const CASE_DOSSIER_PRIVACY_TARGET_SECTIONS = [
  "IDENTITY",
  "PARTY",
  "NARRATIVE",
  "TIMELINE",
  "DOCUMENT",
  "MONEY",
  "OUTCOME",
] as const;
export type CaseDossierPrivacyTargetSection = (typeof CASE_DOSSIER_PRIVACY_TARGET_SECTIONS)[number];

export type CaseDossierPrivacyTargetV1 = {
  section: CaseDossierPrivacyTargetSection;
  field: string;
  itemId?: string;
  itemIndex?: number;
};

export type CaseDossierPrivacyFindingV1 = {
  findingId: string;
  category: CaseDossierPrivacyCategory;
  target: CaseDossierPrivacyTargetV1;
  action: CaseDossierRedactionAction;
  reason: string;
};

export type CaseDossierAudienceExpansionApprovalV1 = {
  approvedBy: string;
  approvedAt: string;
  justification: string;
};

export type CaseDossierPrivacyReviewV1 = {
  protocolVersion: typeof CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION;
  objectType: typeof CASE_DOSSIER_PRIVACY_REVIEW_OBJECT_TYPE;
  reviewId: string;
  dossierId: string;
  dossierVersion: number;
  state: CaseDossierPrivacyState;
  sourceAccessClassification: (typeof CASE_CANDIDATE_ACCESS_CLASSIFICATIONS)[number];
  audienceAccessClassification: (typeof CASE_CANDIDATE_ACCESS_CLASSIFICATIONS)[number];
  reviewerRef: string;
  openedAt: string;
  decidedAt?: string;
  findings: CaseDossierPrivacyFindingV1[];
  derivativeId?: string;
  audienceExpansionApproval?: CaseDossierAudienceExpansionApprovalV1;
  publicationAuthorized: false;
};

export type CaseDossierAudienceIdentityV1 = {
  jurisdiction?: string;
  matterType?: string;
  markReference?: string;
  applicationNumber?: string;
  registrationNumber?: string;
  initiatingRequest?: string;
  startingProceduralState?: string;
  parties: Array<{ role: string; displayName: string }>;
};

export type CaseDossierAudienceTimelineEventV1 = {
  eventId: string;
  occurredAt: string;
  action: string;
  actorRole?: string;
  resultingStatus?: string;
  deadline?: string;
};

export type CaseDossierAudienceDocumentV1 = {
  documentId: string;
  documentType?: string;
  displayName?: string;
  verificationStatus?: string;
};

export type CaseDossierAudienceMoneyV1 = {
  amount: string;
  currency: string;
  category: string;
};

export type CaseDossierAudienceViewV1 = {
  identity: CaseDossierAudienceIdentityV1;
  narrative: Array<{ statementId: string; text: string }>;
  timeline: CaseDossierAudienceTimelineEventV1[];
  documents: CaseDossierAudienceDocumentV1[];
  money: CaseDossierAudienceMoneyV1[];
  durations: Array<{ durationId: string; label: string; milliseconds: number }>;
  outcome?: { code: string; label: string; occurredAt?: string };
};

export type CaseDossierRedactionReceiptV1 = {
  findingId: string;
  target: CaseDossierPrivacyTargetV1;
  action: CaseDossierRedactionAction;
};

export type CaseDossierRedactedDerivativeV1 = {
  protocolVersion: typeof CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION;
  objectType: typeof CASE_DOSSIER_REDACTED_DERIVATIVE_OBJECT_TYPE;
  derivativeId: string;
  version: 1;
  sourceDossierId: string;
  sourceDossierVersion: number;
  reviewId: string;
  accessClassification: (typeof CASE_CANDIDATE_ACCESS_CLASSIFICATIONS)[number];
  generatedAt: string;
  contentSha256: string;
  redactions: CaseDossierRedactionReceiptV1[];
  content: CaseDossierAudienceViewV1;
  publicationAuthorized: false;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const REVIEW_ID = /^case-privacy-review_[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const DERIVATIVE_ID = /^case-redacted_[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const DOSSIER_ID = /^case-dossier_[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;

const RESTRICTION_RANK = {
  INTERNAL: 0,
  CONFIDENTIAL: 1,
  RESTRICTED: 2,
} as const;

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

const FORBIDDEN_AUDIENCE_CONTENT_KEYS = new Set([
  "evidence",
  "evidenceref",
  "evidencerefs",
  "sourceref",
  "storageReference".toLowerCase(),
  "checksum",
  "candidateid",
  "evidencecollectionid",
  "sourcesnapshotsha256",
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

function containsForbiddenAudienceContentKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenAudienceContentKey);
  const item = record(value);
  if (!item) return false;
  for (const [key, nested] of Object.entries(item)) {
    if (FORBIDDEN_AUDIENCE_CONTENT_KEYS.has(normalizedKey(key))) return true;
    if (containsForbiddenAudienceContentKey(nested)) return true;
  }
  return false;
}

function classification(value: unknown): value is keyof typeof RESTRICTION_RANK {
  return CASE_CANDIDATE_ACCESS_CLASSIFICATIONS.includes(
    value as (typeof CASE_CANDIDATE_ACCESS_CLASSIFICATIONS)[number],
  );
}

export function isCaseDossierAccessBroadened(
  source: (typeof CASE_CANDIDATE_ACCESS_CLASSIFICATIONS)[number],
  audience: (typeof CASE_CANDIDATE_ACCESS_CLASSIFICATIONS)[number],
): boolean {
  return RESTRICTION_RANK[audience] < RESTRICTION_RANK[source];
}

function target(value: unknown): value is CaseDossierPrivacyTargetV1 {
  const item = record(value);
  if (!item || !allowedKeys(item, ["section", "field", "itemId", "itemIndex"])) return false;
  if (
    !CASE_DOSSIER_PRIVACY_TARGET_SECTIONS.includes(item.section as CaseDossierPrivacyTargetSection)
  ) {
    return false;
  }
  if (!nonEmpty(item.field)) return false;
  if (item.itemId !== undefined && !nonEmpty(item.itemId)) return false;
  if (
    item.itemIndex !== undefined &&
    (typeof item.itemIndex !== "number" ||
      !Number.isSafeInteger(item.itemIndex) ||
      item.itemIndex < 0)
  ) {
    return false;
  }

  switch (item.section) {
    case "IDENTITY":
      return (
        item.itemId === undefined &&
        item.itemIndex === undefined &&
        [
          "jurisdiction",
          "matterType",
          "markReference",
          "applicationNumber",
          "registrationNumber",
          "initiatingRequest",
          "startingProceduralState",
        ].includes(item.field as string)
      );
    case "PARTY":
      return (
        item.itemId === undefined && item.itemIndex !== undefined && item.field === "displayName"
      );
    case "NARRATIVE":
      return item.itemId !== undefined && item.itemIndex === undefined && item.field === "text";
    case "TIMELINE":
      return (
        item.itemId !== undefined &&
        item.itemIndex === undefined &&
        ["occurredAt", "action", "actorRole", "resultingStatus", "deadline"].includes(
          item.field as string,
        )
      );
    case "DOCUMENT":
      return (
        item.itemId !== undefined &&
        item.itemIndex === undefined &&
        ["displayName", "documentType", "verificationStatus"].includes(item.field as string)
      );
    case "MONEY":
      return (
        item.itemId === undefined &&
        item.itemIndex !== undefined &&
        ["amount", "currency", "category"].includes(item.field as string)
      );
    case "OUTCOME":
      return (
        item.itemId === undefined &&
        item.itemIndex === undefined &&
        ["code", "label", "occurredAt"].includes(item.field as string)
      );
    default:
      return false;
  }
}

function finding(value: unknown): value is CaseDossierPrivacyFindingV1 {
  const item = record(value);
  if (!item || !allowedKeys(item, ["findingId", "category", "target", "action", "reason"])) {
    return false;
  }
  return (
    nonEmpty(item.findingId) &&
    CASE_DOSSIER_PRIVACY_CATEGORIES.includes(item.category as CaseDossierPrivacyCategory) &&
    target(item.target) &&
    CASE_DOSSIER_REDACTION_ACTIONS.includes(item.action as CaseDossierRedactionAction) &&
    nonEmpty(item.reason)
  );
}

function expansionApproval(value: unknown): value is CaseDossierAudienceExpansionApprovalV1 {
  const item = record(value);
  if (!item || !allowedKeys(item, ["approvedBy", "approvedAt", "justification"])) return false;
  return nonEmpty(item.approvedBy) && timestamp(item.approvedAt) && nonEmpty(item.justification);
}

export function isCaseDossierPrivacyReviewV1(value: unknown): value is CaseDossierPrivacyReviewV1 {
  const item = record(value);
  if (!item || containsForbiddenSemanticKey(item)) return false;
  if (
    !allowedKeys(item, [
      "protocolVersion",
      "objectType",
      "reviewId",
      "dossierId",
      "dossierVersion",
      "state",
      "sourceAccessClassification",
      "audienceAccessClassification",
      "reviewerRef",
      "openedAt",
      "decidedAt",
      "findings",
      "derivativeId",
      "audienceExpansionApproval",
      "publicationAuthorized",
    ])
  ) {
    return false;
  }
  if (
    item.protocolVersion !== CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION ||
    item.objectType !== CASE_DOSSIER_PRIVACY_REVIEW_OBJECT_TYPE ||
    typeof item.reviewId !== "string" ||
    !REVIEW_ID.test(item.reviewId) ||
    typeof item.dossierId !== "string" ||
    !DOSSIER_ID.test(item.dossierId) ||
    typeof item.dossierVersion !== "number" ||
    !Number.isSafeInteger(item.dossierVersion) ||
    item.dossierVersion < 1 ||
    !CASE_DOSSIER_PRIVACY_STATES.includes(item.state as CaseDossierPrivacyState) ||
    !classification(item.sourceAccessClassification) ||
    !classification(item.audienceAccessClassification) ||
    !nonEmpty(item.reviewerRef) ||
    !timestamp(item.openedAt) ||
    !Array.isArray(item.findings) ||
    !item.findings.every(finding) ||
    new Set(item.findings.map((entry) => (entry as CaseDossierPrivacyFindingV1).findingId)).size !==
      item.findings.length ||
    item.publicationAuthorized !== false
  ) {
    return false;
  }

  const broadened = isCaseDossierAccessBroadened(
    item.sourceAccessClassification,
    item.audienceAccessClassification,
  );
  if (broadened !== (item.audienceExpansionApproval !== undefined)) return false;
  if (
    item.audienceExpansionApproval !== undefined &&
    !expansionApproval(item.audienceExpansionApproval)
  ) {
    return false;
  }

  if (item.state === "REVIEW_REQUIRED") {
    return item.decidedAt === undefined && item.derivativeId === undefined;
  }
  if (!timestamp(item.decidedAt)) return false;
  if (item.state === "NEEDS_REDACTION") {
    return item.findings.length > 0 && item.derivativeId === undefined;
  }
  if (item.state === "FINALIZED") {
    return typeof item.derivativeId === "string" && DERIVATIVE_ID.test(item.derivativeId);
  }
  return item.state === "REJECTED" && item.derivativeId === undefined;
}

function audienceIdentity(value: unknown): value is CaseDossierAudienceIdentityV1 {
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
    ]) ||
    !Array.isArray(item.parties)
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
    if (item[key] !== undefined && !nonEmpty(item[key])) return false;
  }
  return item.parties.every((entry) => {
    const party = record(entry);
    return (
      Boolean(party) &&
      allowedKeys(party!, ["role", "displayName"]) &&
      nonEmpty(party!.role) &&
      nonEmpty(party!.displayName)
    );
  });
}

function audienceView(value: unknown): value is CaseDossierAudienceViewV1 {
  const item = record(value);
  if (
    !item ||
    containsForbiddenSemanticKey(item) ||
    containsForbiddenAudienceContentKey(item) ||
    !allowedKeys(item, [
      "identity",
      "narrative",
      "timeline",
      "documents",
      "money",
      "durations",
      "outcome",
    ]) ||
    !audienceIdentity(item.identity) ||
    !Array.isArray(item.narrative) ||
    !Array.isArray(item.timeline) ||
    !Array.isArray(item.documents) ||
    !Array.isArray(item.money) ||
    !Array.isArray(item.durations)
  ) {
    return false;
  }
  if (
    !item.narrative.every((entry) => {
      const row = record(entry);
      return (
        Boolean(row) &&
        allowedKeys(row!, ["statementId", "text"]) &&
        nonEmpty(row!.statementId) &&
        nonEmpty(row!.text)
      );
    })
  )
    return false;
  if (
    !item.timeline.every((entry) => {
      const row = record(entry);
      if (
        !row ||
        !allowedKeys(row, [
          "eventId",
          "occurredAt",
          "action",
          "actorRole",
          "resultingStatus",
          "deadline",
        ])
      )
        return false;
      return (
        nonEmpty(row.eventId) &&
        nonEmpty(row.occurredAt) &&
        nonEmpty(row.action) &&
        (row.actorRole === undefined || nonEmpty(row.actorRole)) &&
        (row.resultingStatus === undefined || nonEmpty(row.resultingStatus)) &&
        (row.deadline === undefined || nonEmpty(row.deadline))
      );
    })
  )
    return false;
  if (
    !item.documents.every((entry) => {
      const row = record(entry);
      if (
        !row ||
        !allowedKeys(row, ["documentId", "documentType", "displayName", "verificationStatus"])
      )
        return false;
      return (
        nonEmpty(row.documentId) &&
        (row.documentType === undefined || nonEmpty(row.documentType)) &&
        (row.displayName === undefined || nonEmpty(row.displayName)) &&
        (row.verificationStatus === undefined || nonEmpty(row.verificationStatus))
      );
    })
  )
    return false;
  if (
    !item.money.every((entry) => {
      const row = record(entry);
      return (
        Boolean(row) &&
        allowedKeys(row!, ["amount", "currency", "category"]) &&
        nonEmpty(row!.amount) &&
        nonEmpty(row!.currency) &&
        nonEmpty(row!.category)
      );
    })
  )
    return false;
  if (
    !item.durations.every((entry) => {
      const row = record(entry);
      return (
        Boolean(row) &&
        allowedKeys(row!, ["durationId", "label", "milliseconds"]) &&
        nonEmpty(row!.durationId) &&
        nonEmpty(row!.label) &&
        typeof row!.milliseconds === "number" &&
        Number.isSafeInteger(row!.milliseconds) &&
        row!.milliseconds >= 0
      );
    })
  )
    return false;
  if (item.outcome !== undefined) {
    const outcome = record(item.outcome);
    if (
      !outcome ||
      !allowedKeys(outcome, ["code", "label", "occurredAt"]) ||
      !nonEmpty(outcome.code) ||
      !nonEmpty(outcome.label) ||
      (outcome.occurredAt !== undefined && !nonEmpty(outcome.occurredAt))
    )
      return false;
  }
  return true;
}

function receipt(value: unknown): value is CaseDossierRedactionReceiptV1 {
  const item = record(value);
  return (
    Boolean(item) &&
    allowedKeys(item!, ["findingId", "target", "action"]) &&
    nonEmpty(item!.findingId) &&
    target(item!.target) &&
    CASE_DOSSIER_REDACTION_ACTIONS.includes(item!.action as CaseDossierRedactionAction)
  );
}

export function isCaseDossierRedactedDerivativeV1(
  value: unknown,
): value is CaseDossierRedactedDerivativeV1 {
  const item = record(value);
  if (!item || containsForbiddenSemanticKey(item)) return false;
  return (
    allowedKeys(item, [
      "protocolVersion",
      "objectType",
      "derivativeId",
      "version",
      "sourceDossierId",
      "sourceDossierVersion",
      "reviewId",
      "accessClassification",
      "generatedAt",
      "contentSha256",
      "redactions",
      "content",
      "publicationAuthorized",
    ]) &&
    item.protocolVersion === CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION &&
    item.objectType === CASE_DOSSIER_REDACTED_DERIVATIVE_OBJECT_TYPE &&
    typeof item.derivativeId === "string" &&
    DERIVATIVE_ID.test(item.derivativeId) &&
    item.version === 1 &&
    typeof item.sourceDossierId === "string" &&
    DOSSIER_ID.test(item.sourceDossierId) &&
    typeof item.sourceDossierVersion === "number" &&
    Number.isSafeInteger(item.sourceDossierVersion) &&
    item.sourceDossierVersion >= 1 &&
    typeof item.reviewId === "string" &&
    REVIEW_ID.test(item.reviewId) &&
    classification(item.accessClassification) &&
    timestamp(item.generatedAt) &&
    typeof item.contentSha256 === "string" &&
    SHA256.test(item.contentSha256) &&
    Array.isArray(item.redactions) &&
    item.redactions.every(receipt) &&
    new Set(item.redactions.map((entry) => (entry as CaseDossierRedactionReceiptV1).findingId))
      .size === item.redactions.length &&
    audienceView(item.content) &&
    item.publicationAuthorized === false
  );
}

export function assertCaseDossierPrivacyReviewV1(
  value: unknown,
): asserts value is CaseDossierPrivacyReviewV1 {
  if (!isCaseDossierPrivacyReviewV1(value)) {
    throw new TypeError("Invalid CaseDossierPrivacyReviewV1");
  }
}

export function assertCaseDossierRedactedDerivativeV1(
  value: unknown,
): asserts value is CaseDossierRedactedDerivativeV1 {
  if (!isCaseDossierRedactedDerivativeV1(value)) {
    throw new TypeError("Invalid CaseDossierRedactedDerivativeV1");
  }
}
