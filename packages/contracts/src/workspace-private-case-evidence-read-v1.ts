export const WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_PROTOCOL_VERSION = "1.0" as const;

export type WorkspacePrivateCaseEvidenceReadRequestV1 = Readonly<{
  bindingId: string;
  expectedVersion: number;
}>;

export type WorkspacePrivateCaseEvidenceReadGrantV1 = Readonly<{
  protocolVersion: typeof WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_PROTOCOL_VERSION;
  objectType: "WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_GRANT";
  bindingId: string;
  bindingVersion: number;
  workspaceId: string;
  userId: string;
  membershipId: string;
  knowledgeWorkspaceId: string;
  readyPackageId: string;
  readyPackageDigest: string;
  coreIntakeId: string;
  contentExportSha256: string;
  stagingDocumentId: string;
  stagingSha256: string;
  rawArtifactId: string;
  rawArtifactSha256: string;
  caseId: string;
  caseVersion: number;
  caseSnapshotSha256: string;
  sourceLocators: readonly string[];
  authoritySnapshot: Readonly<{
    workspaceVersion: number;
    userVersion: number;
    membershipVersion: number;
  }>;
  currentness: Readonly<{
    workspaceAuthority: "CURRENT";
    formalMatter: "CURRENT";
    coreKnowledgeEvidence: "CURRENT";
    knowledgeRetrieval: "MUST_VERIFY";
  }>;
  consequences: Readonly<{
    officialTruthCreated: false;
    filingAuthorized: false;
    externalActionAuthorized: false;
  }>;
  verifiedAt: string;
  expiresAt: string;
}>;

export type WorkspacePrivateCaseEvidenceReadResultV1 = Readonly<{
  protocolVersion: typeof WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_PROTOCOL_VERSION;
  objectType: "WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_RESULT";
  binding: Readonly<{
    bindingId: string;
    bindingVersion: number;
    caseId: string;
    caseVersion: number;
    caseSnapshotSha256: string;
  }>;
  authority: Readonly<{
    coreWorkspaceId: string;
    knowledgeWorkspaceId: string;
    userId: string;
    membershipId: string;
    verifiedAt: string;
    expiresAt: string;
  }>;
  lineage: Readonly<{
    readyPackageId: string;
    readyPackageDigest: string;
    coreIntakeId: string;
    contentExportSha256: string;
    rawArtifactId: string;
    rawArtifactSha256: string;
  }>;
  document: Readonly<{
    documentId: string;
    artifactVersion: number;
    stagingDocumentId: string;
    canonicalSha256: string;
    stagingSha256: string;
    documentSha256: string;
    indexedAt: string;
  }>;
  currentness: Readonly<{
    workspaceAuthority: "CURRENT";
    formalMatter: "CURRENT";
    coreKnowledgeEvidence: "CURRENT";
    knowledgeRetrieval: "CURRENT";
    documentVersion: "CURRENT";
  }>;
  locatorSemantics: Readonly<{
    basis: "RETRIEVAL_CHUNK";
    pageNumbers: "UNAVAILABLE";
    textOffsets: "UNAVAILABLE";
  }>;
  chunks: readonly Readonly<{
    locator: string;
    chunkId: string;
    ordinal: number;
    headingPath: readonly string[];
    text: string;
    contentSha256: string;
    contentKind: "CANONICAL_MARKDOWN_CHUNK";
    pageNumber: null;
    textStartOffset: null;
    textEndOffset: null;
  }>[];
  consequences: Readonly<{
    officialTruthCreated: false;
    filingAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const canonicalUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
const sha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const positiveVersion = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
const rfc3339 = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export function isWorkspacePrivateCaseEvidenceReadRequestV1(
  value: unknown,
): value is WorkspacePrivateCaseEvidenceReadRequestV1 {
  return (
    isRecord(value) &&
    exactKeys(value, ["bindingId", "expectedVersion"]) &&
    canonicalUuid(value.bindingId) &&
    positiveVersion(value.expectedVersion)
  );
}

export function assertWorkspacePrivateCaseEvidenceReadRequestV1(
  value: unknown,
): asserts value is WorkspacePrivateCaseEvidenceReadRequestV1 {
  if (!isWorkspacePrivateCaseEvidenceReadRequestV1(value)) {
    throw new TypeError("Invalid WorkspacePrivateCaseEvidenceReadRequestV1");
  }
}

export function isWorkspacePrivateCaseEvidenceReadGrantV1(
  value: unknown,
): value is WorkspacePrivateCaseEvidenceReadGrantV1 {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "protocolVersion",
      "objectType",
      "bindingId",
      "bindingVersion",
      "workspaceId",
      "userId",
      "membershipId",
      "knowledgeWorkspaceId",
      "readyPackageId",
      "readyPackageDigest",
      "coreIntakeId",
      "contentExportSha256",
      "stagingDocumentId",
      "stagingSha256",
      "rawArtifactId",
      "rawArtifactSha256",
      "caseId",
      "caseVersion",
      "caseSnapshotSha256",
      "sourceLocators",
      "authoritySnapshot",
      "currentness",
      "consequences",
      "verifiedAt",
      "expiresAt",
    ])
  ) {
    return false;
  }
  const authority = value.authoritySnapshot;
  const currentness = value.currentness;
  const consequences = value.consequences;
  return (
    value.protocolVersion === WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_PROTOCOL_VERSION &&
    value.objectType === "WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_GRANT" &&
    canonicalUuid(value.bindingId) &&
    positiveVersion(value.bindingVersion) &&
    canonicalUuid(value.workspaceId) &&
    canonicalUuid(value.userId) &&
    canonicalUuid(value.membershipId) &&
    nonEmpty(value.knowledgeWorkspaceId) &&
    nonEmpty(value.readyPackageId) &&
    sha256(value.readyPackageDigest) &&
    nonEmpty(value.coreIntakeId) &&
    sha256(value.contentExportSha256) &&
    nonEmpty(value.stagingDocumentId) &&
    sha256(value.stagingSha256) &&
    nonEmpty(value.rawArtifactId) &&
    sha256(value.rawArtifactSha256) &&
    nonEmpty(value.caseId) &&
    positiveVersion(value.caseVersion) &&
    sha256(value.caseSnapshotSha256) &&
    Array.isArray(value.sourceLocators) &&
    value.sourceLocators.length > 0 &&
    value.sourceLocators.every(nonEmpty) &&
    isRecord(authority) &&
    exactKeys(authority, ["workspaceVersion", "userVersion", "membershipVersion"]) &&
    positiveVersion(authority.workspaceVersion) &&
    positiveVersion(authority.userVersion) &&
    positiveVersion(authority.membershipVersion) &&
    isRecord(currentness) &&
    exactKeys(currentness, [
      "workspaceAuthority",
      "formalMatter",
      "coreKnowledgeEvidence",
      "knowledgeRetrieval",
    ]) &&
    currentness.workspaceAuthority === "CURRENT" &&
    currentness.formalMatter === "CURRENT" &&
    currentness.coreKnowledgeEvidence === "CURRENT" &&
    currentness.knowledgeRetrieval === "MUST_VERIFY" &&
    isRecord(consequences) &&
    exactKeys(consequences, [
      "officialTruthCreated",
      "filingAuthorized",
      "externalActionAuthorized",
    ]) &&
    consequences.officialTruthCreated === false &&
    consequences.filingAuthorized === false &&
    consequences.externalActionAuthorized === false &&
    rfc3339(value.verifiedAt) &&
    rfc3339(value.expiresAt) &&
    Date.parse(value.expiresAt) > Date.parse(value.verifiedAt)
  );
}

export function assertWorkspacePrivateCaseEvidenceReadGrantV1(
  value: unknown,
): asserts value is WorkspacePrivateCaseEvidenceReadGrantV1 {
  if (!isWorkspacePrivateCaseEvidenceReadGrantV1(value)) {
    throw new TypeError("Invalid WorkspacePrivateCaseEvidenceReadGrantV1");
  }
}
