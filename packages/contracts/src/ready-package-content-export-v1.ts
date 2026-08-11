export const READY_PACKAGE_CONTENT_EXPORT_VERSION = "1.0" as const;

export const READY_PACKAGE_CONTENT_EXPORT_VERIFICATION_OUTCOMES = [
  "PASS",
  "PASS_WITH_WARNINGS",
] as const;
export type ReadyPackageContentExportVerificationOutcome =
  (typeof READY_PACKAGE_CONTENT_EXPORT_VERIFICATION_OUTCOMES)[number];

export type ReadyPackageContentExportV1 = {
  contractVersion: typeof READY_PACKAGE_CONTENT_EXPORT_VERSION;
  objectType: "READY_PACKAGE_CONTENT_EXPORT";
  readyPackageId: string;
  knowledgeWorkspaceId: string;
  readyPackageDigest: string;
  provenance: {
    sourceId: string;
    conversionRunId: string;
    verificationId: string;
    verificationOutcome: ReadyPackageContentExportVerificationOutcome;
    capturedAt: string;
    converter: {
      converterId: string;
      version: string;
    };
    legalTruthVerified: false;
  };
  rawArtifact: {
    artifactId: string;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
    originalName: string;
  };
  stagingDocument: {
    documentId: string;
    sha256: string;
    sizeBytes: number;
    mediaType: "text/markdown";
    encoding: "utf-8";
    content: string;
  };
};

const IDS = {
  readyPackage: /^rdp_[A-Za-z0-9][A-Za-z0-9_-]*$/u,
  workspace: /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/u,
  source: /^src_[0-9A-HJKMNP-TV-Z]{26}$/u,
  conversionRun: /^cvr_[0-9A-HJKMNP-TV-Z]{26}$/u,
  verification: /^svr_[0-9A-HJKMNP-TV-Z]{26}$/u,
  artifact: /^art_[0-9A-HJKMNP-TV-Z]{26}$/u,
  stagingDocument: /^std_[0-9A-HJKMNP-TV-Z]{26}$/u,
} as const;
const SHA256 = /^[a-f0-9]{64}$/u;
const MIME_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu;
const CONVERTER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isRfc3339(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function isReadyPackageContentExportV1(value: unknown): value is ReadyPackageContentExportV1 {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "contractVersion",
      "objectType",
      "readyPackageId",
      "knowledgeWorkspaceId",
      "readyPackageDigest",
      "provenance",
      "rawArtifact",
      "stagingDocument",
    ]) ||
    !isRecord(value.provenance) ||
    !isRecord(value.rawArtifact) ||
    !isRecord(value.stagingDocument)
  ) {
    return false;
  }

  const provenance = value.provenance;
  const rawArtifact = value.rawArtifact;
  const stagingDocument = value.stagingDocument;
  if (
    !exactKeys(provenance, [
      "sourceId",
      "conversionRunId",
      "verificationId",
      "verificationOutcome",
      "capturedAt",
      "converter",
      "legalTruthVerified",
    ]) ||
    !isRecord(provenance.converter) ||
    !exactKeys(provenance.converter, ["converterId", "version"]) ||
    !exactKeys(rawArtifact, ["artifactId", "sha256", "sizeBytes", "mimeType", "originalName"]) ||
    !exactKeys(stagingDocument, [
      "documentId",
      "sha256",
      "sizeBytes",
      "mediaType",
      "encoding",
      "content",
    ])
  ) {
    return false;
  }

  return (
    value.contractVersion === READY_PACKAGE_CONTENT_EXPORT_VERSION &&
    value.objectType === "READY_PACKAGE_CONTENT_EXPORT" &&
    typeof value.readyPackageId === "string" &&
    IDS.readyPackage.test(value.readyPackageId) &&
    typeof value.knowledgeWorkspaceId === "string" &&
    IDS.workspace.test(value.knowledgeWorkspaceId) &&
    typeof value.readyPackageDigest === "string" &&
    SHA256.test(value.readyPackageDigest) &&
    typeof provenance.sourceId === "string" &&
    IDS.source.test(provenance.sourceId) &&
    typeof provenance.conversionRunId === "string" &&
    IDS.conversionRun.test(provenance.conversionRunId) &&
    typeof provenance.verificationId === "string" &&
    IDS.verification.test(provenance.verificationId) &&
    typeof provenance.verificationOutcome === "string" &&
    READY_PACKAGE_CONTENT_EXPORT_VERIFICATION_OUTCOMES.includes(
      provenance.verificationOutcome as ReadyPackageContentExportVerificationOutcome,
    ) &&
    isRfc3339(provenance.capturedAt) &&
    typeof provenance.converter.converterId === "string" &&
    CONVERTER_ID.test(provenance.converter.converterId) &&
    typeof provenance.converter.version === "string" &&
    SEMVER.test(provenance.converter.version) &&
    provenance.legalTruthVerified === false &&
    typeof rawArtifact.artifactId === "string" &&
    IDS.artifact.test(rawArtifact.artifactId) &&
    typeof rawArtifact.sha256 === "string" &&
    SHA256.test(rawArtifact.sha256) &&
    typeof rawArtifact.sizeBytes === "number" &&
    Number.isSafeInteger(rawArtifact.sizeBytes) &&
    rawArtifact.sizeBytes >= 0 &&
    typeof rawArtifact.mimeType === "string" &&
    MIME_TYPE.test(rawArtifact.mimeType) &&
    typeof rawArtifact.originalName === "string" &&
    rawArtifact.originalName.length > 0 &&
    typeof stagingDocument.documentId === "string" &&
    IDS.stagingDocument.test(stagingDocument.documentId) &&
    typeof stagingDocument.sha256 === "string" &&
    SHA256.test(stagingDocument.sha256) &&
    typeof stagingDocument.sizeBytes === "number" &&
    Number.isSafeInteger(stagingDocument.sizeBytes) &&
    stagingDocument.sizeBytes >= 0 &&
    stagingDocument.mediaType === "text/markdown" &&
    stagingDocument.encoding === "utf-8" &&
    typeof stagingDocument.content === "string"
  );
}

export function assertReadyPackageContentExportV1(
  value: unknown,
): asserts value is ReadyPackageContentExportV1 {
  if (!isReadyPackageContentExportV1(value)) {
    throw new TypeError("Invalid ReadyPackageContentExportV1");
  }
}

export function serializeReadyPackageContentExportV1(value: ReadyPackageContentExportV1): string {
  assertReadyPackageContentExportV1(value);
  return JSON.stringify({
    contractVersion: value.contractVersion,
    objectType: value.objectType,
    readyPackageId: value.readyPackageId,
    knowledgeWorkspaceId: value.knowledgeWorkspaceId,
    readyPackageDigest: value.readyPackageDigest,
    provenance: {
      sourceId: value.provenance.sourceId,
      conversionRunId: value.provenance.conversionRunId,
      verificationId: value.provenance.verificationId,
      verificationOutcome: value.provenance.verificationOutcome,
      capturedAt: value.provenance.capturedAt,
      converter: {
        converterId: value.provenance.converter.converterId,
        version: value.provenance.converter.version,
      },
      legalTruthVerified: false,
    },
    rawArtifact: {
      artifactId: value.rawArtifact.artifactId,
      sha256: value.rawArtifact.sha256,
      sizeBytes: value.rawArtifact.sizeBytes,
      mimeType: value.rawArtifact.mimeType,
      originalName: value.rawArtifact.originalName,
    },
    stagingDocument: {
      documentId: value.stagingDocument.documentId,
      sha256: value.stagingDocument.sha256,
      sizeBytes: value.stagingDocument.sizeBytes,
      mediaType: "text/markdown",
      encoding: "utf-8",
      content: value.stagingDocument.content,
    },
  } satisfies ReadyPackageContentExportV1);
}
