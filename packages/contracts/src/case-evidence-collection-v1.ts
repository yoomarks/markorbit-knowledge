export const CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION = "1.0" as const;
export const CASE_EVIDENCE_COLLECTION_OBJECT_TYPE = "CASE_EVIDENCE_COLLECTION" as const;
export const CASE_EVIDENCE_SOURCE_SYSTEM = "MARKREG" as const;

export const CASE_EVIDENCE_OPTIONAL_SURFACES = [
  "LIFECYCLE_PROVENANCE",
  "DOCUMENT_PACKAGES",
] as const;
export type CaseEvidenceOptionalSurface = (typeof CASE_EVIDENCE_OPTIONAL_SURFACES)[number];

export const CASE_EVIDENCE_OMISSION_REASONS = ["NOT_AUTHORIZED", "NOT_AVAILABLE"] as const;
export type CaseEvidenceOmissionReason = (typeof CASE_EVIDENCE_OMISSION_REASONS)[number];

export type ExactCaseSourcePayloadV1 = {
  sourceRef: string;
  mediaType: "application/json";
  sha256: string;
  sizeBytes: number;
  dataBase64: string;
};

export type CaseDocumentPackageEvidenceV1 = {
  documentPackageId: string;
  sourceFormalMatterVersion: number;
  sourceFormalMatterHash: string;
  payload: ExactCaseSourcePayloadV1;
};

export type CaseEvidenceSurfaceOmissionV1 = {
  surface: CaseEvidenceOptionalSurface;
  reason: CaseEvidenceOmissionReason;
};

/**
 * Immutable Knowledge evidence snapshot collected from the real MarkReg read
 * surfaces. MarkReg remains the system of record; this object preserves the
 * exact JSON bytes observed by Knowledge and their source lineage.
 */
export type CaseEvidenceCollectionV1 = {
  protocolVersion: typeof CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION;
  objectType: typeof CASE_EVIDENCE_COLLECTION_OBJECT_TYPE;
  collectionId: string;
  candidateId: string;
  sourceSystem: typeof CASE_EVIDENCE_SOURCE_SYSTEM;
  sourceMatter: {
    sourceMatterId: string;
    sourceMatterVersion: number;
    sourceSnapshotSha256: string;
    sourceRetrievalRef: string;
    sourceWorkspaceId: string;
  };
  formalMatter: ExactCaseSourcePayloadV1;
  lifecycleProvenance?: ExactCaseSourcePayloadV1;
  documentPackages: CaseDocumentPackageEvidenceV1[];
  omissions: CaseEvidenceSurfaceOmissionV1[];
  collectedAt: string;
  provenance: {
    sourceFamily: "CASE";
    originalSystem: "MARKREG";
    originalSystemAuthoritative: true;
    knowledgeSnapshotIsSystemOfRecord: false;
  };
};

const SHA256 = /^[a-f0-9]{64}$/u;
const COLLECTION_ID = /^case-evidence_[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const FORMAL_MATTER_ID = /^formal-matter_[a-zA-Z0-9][a-zA-Z0-9._:-]{2,255}$/u;

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

function exactPayload(value: unknown): value is ExactCaseSourcePayloadV1 {
  const item = record(value);
  if (!item) return false;
  return (
    Object.keys(item).every((key) =>
      ["sourceRef", "mediaType", "sha256", "sizeBytes", "dataBase64"].includes(key),
    ) &&
    nonEmpty(item.sourceRef) &&
    item.mediaType === "application/json" &&
    typeof item.sha256 === "string" &&
    SHA256.test(item.sha256) &&
    typeof item.sizeBytes === "number" &&
    Number.isSafeInteger(item.sizeBytes) &&
    item.sizeBytes >= 0 &&
    typeof item.dataBase64 === "string"
  );
}

function omission(value: unknown): value is CaseEvidenceSurfaceOmissionV1 {
  const item = record(value);
  if (!item) return false;
  return (
    Object.keys(item).every((key) => ["surface", "reason"].includes(key)) &&
    CASE_EVIDENCE_OPTIONAL_SURFACES.includes(item.surface as CaseEvidenceOptionalSurface) &&
    CASE_EVIDENCE_OMISSION_REASONS.includes(item.reason as CaseEvidenceOmissionReason)
  );
}

function documentPackage(value: unknown): value is CaseDocumentPackageEvidenceV1 {
  const item = record(value);
  if (!item) return false;
  return (
    Object.keys(item).every((key) =>
      ["documentPackageId", "sourceFormalMatterVersion", "sourceFormalMatterHash", "payload"].includes(
        key,
      ),
    ) &&
    nonEmpty(item.documentPackageId) &&
    typeof item.sourceFormalMatterVersion === "number" &&
    Number.isSafeInteger(item.sourceFormalMatterVersion) &&
    item.sourceFormalMatterVersion >= 1 &&
    typeof item.sourceFormalMatterHash === "string" &&
    SHA256.test(item.sourceFormalMatterHash) &&
    exactPayload(item.payload)
  );
}

export function isCaseEvidenceCollectionV1(value: unknown): value is CaseEvidenceCollectionV1 {
  const item = record(value);
  if (!item) return false;
  if (
    !Object.keys(item).every((key) =>
      [
        "protocolVersion",
        "objectType",
        "collectionId",
        "candidateId",
        "sourceSystem",
        "sourceMatter",
        "formalMatter",
        "lifecycleProvenance",
        "documentPackages",
        "omissions",
        "collectedAt",
        "provenance",
      ].includes(key),
    )
  ) {
    return false;
  }

  const sourceMatter = record(item.sourceMatter);
  const provenance = record(item.provenance);
  if (!sourceMatter || !provenance) return false;

  return (
    item.protocolVersion === CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION &&
    item.objectType === CASE_EVIDENCE_COLLECTION_OBJECT_TYPE &&
    typeof item.collectionId === "string" &&
    COLLECTION_ID.test(item.collectionId) &&
    nonEmpty(item.candidateId) &&
    item.sourceSystem === CASE_EVIDENCE_SOURCE_SYSTEM &&
    Object.keys(sourceMatter).every((key) =>
      [
        "sourceMatterId",
        "sourceMatterVersion",
        "sourceSnapshotSha256",
        "sourceRetrievalRef",
        "sourceWorkspaceId",
      ].includes(key),
    ) &&
    typeof sourceMatter.sourceMatterId === "string" &&
    FORMAL_MATTER_ID.test(sourceMatter.sourceMatterId) &&
    typeof sourceMatter.sourceMatterVersion === "number" &&
    Number.isSafeInteger(sourceMatter.sourceMatterVersion) &&
    sourceMatter.sourceMatterVersion >= 1 &&
    typeof sourceMatter.sourceSnapshotSha256 === "string" &&
    SHA256.test(sourceMatter.sourceSnapshotSha256) &&
    nonEmpty(sourceMatter.sourceRetrievalRef) &&
    nonEmpty(sourceMatter.sourceWorkspaceId) &&
    exactPayload(item.formalMatter) &&
    (item.lifecycleProvenance === undefined || exactPayload(item.lifecycleProvenance)) &&
    Array.isArray(item.documentPackages) &&
    item.documentPackages.every(documentPackage) &&
    Array.isArray(item.omissions) &&
    item.omissions.every(omission) &&
    new Set(item.omissions.map((entry) => (entry as CaseEvidenceSurfaceOmissionV1).surface)).size ===
      item.omissions.length &&
    timestamp(item.collectedAt) &&
    Object.keys(provenance).every((key) =>
      [
        "sourceFamily",
        "originalSystem",
        "originalSystemAuthoritative",
        "knowledgeSnapshotIsSystemOfRecord",
      ].includes(key),
    ) &&
    provenance.sourceFamily === "CASE" &&
    provenance.originalSystem === "MARKREG" &&
    provenance.originalSystemAuthoritative === true &&
    provenance.knowledgeSnapshotIsSystemOfRecord === false
  );
}

export function assertCaseEvidenceCollectionV1(
  value: unknown,
): asserts value is CaseEvidenceCollectionV1 {
  if (!isCaseEvidenceCollectionV1(value)) throw new TypeError("Invalid CaseEvidenceCollectionV1");
}
