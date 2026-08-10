import type { ReadyPackage, StagingDocumentDescriptor } from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import { SqliteSourceSupplyHealthRepository } from "@markorbit/persistence/source-supply-health";
import type { StagingDocumentRecord } from "@markorbit/persistence/staging-content";
import { normalizeFoundationalJurisdiction } from "@markorbit/worker-runtime/foundational-readiness";
import { canonicalDocumentMetadata } from "./canonical-document-metadata";
import {
  getConversionRunLedgerRepository,
  getRawArtifactRepository,
  getReadyPackageRepository,
  getRegistryDatabase,
  getRetrievalIndexRepository,
  getSourceRepository,
  getStagingContentRepository,
} from "./source-registry";

export const FOUNDATIONAL_CANONICAL_INDEX_STATES = [
  "MISSING_INDEX",
  "INDEXED",
  "MISSING_READY_PACKAGE",
  "EVIDENCE_MISMATCH",
] as const;

export type FoundationalCanonicalIndexState = (typeof FOUNDATIONAL_CANONICAL_INDEX_STATES)[number];

export type FoundationalVerifiedCanonicalCandidate = {
  stagingDocumentId: string;
  sourceId: string;
  rawArtifactId: string;
  conversionRunId: string;
  title: string;
  targetPath: string;
  contentSha256: string;
  generatedAt: string;
  readyPackageId: string | null;
  readyPackageStatus: "VERIFIED" | "HANDED_OFF" | null;
  state: FoundationalCanonicalIndexState;
  indexedDocumentId: string | null;
  indexedArtifactVersion: number | null;
  indexedAt: string | null;
  isCurrent: boolean;
};

export type FoundationalVerifiedCanonicalReindexSnapshot = {
  objectType: "FOUNDATIONAL_VERIFIED_CANONICAL_REINDEX_SNAPSHOT";
  version: "1.0";
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  sourceIds: string[];
  items: FoundationalVerifiedCanonicalCandidate[];
  summary: Record<FoundationalCanonicalIndexState, number> & { total: number };
  executionPolicy: "EXPLICIT_VERIFIED_CANONICAL_REINDEX_ONLY";
  automaticExecution: false;
  createsReadyPackage: false;
  mutatesRawArtifact: false;
};

export type FoundationalVerifiedCanonicalReindexResult = {
  objectType: "FOUNDATIONAL_VERIFIED_CANONICAL_REINDEX_RESULT";
  version: "1.0";
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  stagingDocumentId: string;
  readyPackageId: string;
  documentId: string;
  artifactVersion: number;
  chunkCount: number;
  indexedAt: string;
  replayed: boolean;
  automaticExecution: false;
};

type RetrievalIndexRow = {
  document_id: string;
  artifact_version: number;
  ready_package_id: string;
  content_sha256: string;
  indexed_at: string;
  is_current: number;
};

function normalizedWorkspaceId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError("workspaceId is required");
  return normalized;
}

function normalizedTargetId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError("targetId is required");
  return normalized;
}

function resolveTarget(input: { workspaceId: string; jurisdiction: string; targetId: string }): {
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  sourceIds: string[];
} {
  const workspaceId = normalizedWorkspaceId(input.workspaceId);
  const jurisdiction = normalizeFoundationalJurisdiction(input.jurisdiction);
  const targetId = normalizedTargetId(input.targetId);
  const health = new SqliteSourceSupplyHealthRepository(getRegistryDatabase()).list({
    workspaceId,
    jurisdiction,
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    targetId,
  });
  const target = health.items.find((item) => item.targetId === targetId);
  if (!target) {
    throw new RegistryValidationError(
      `No ACTIVE FOUNDATIONAL target ${targetId} is configured for ${jurisdiction}`,
    );
  }
  return { workspaceId, jurisdiction, targetId, sourceIds: [...target.sourceIds] };
}

function readyDocuments(workspaceId: string, sourceIds: readonly string[]): StagingDocumentRecord[] {
  const repository = getStagingContentRepository();
  const records = new Map<string, StagingDocumentRecord>();
  for (const sourceId of sourceIds) {
    let offset = 0;
    while (true) {
      const page = repository.listDocuments({
        workspaceId,
        sourceId,
        status: "READY",
        limit: 100,
        offset,
      });
      for (const record of page.items) records.set(record.descriptor.id, record);
      offset += page.items.length;
      if (offset >= page.total || page.items.length === 0) break;
    }
  }
  return [...records.values()].sort((left, right) => {
    const byGeneratedAt =
      Date.parse(right.descriptor.generatedAt) - Date.parse(left.descriptor.generatedAt);
    if (Number.isFinite(byGeneratedAt) && byGeneratedAt !== 0) return byGeneratedAt;
    return right.descriptor.id.localeCompare(left.descriptor.id);
  });
}

function indexRow(workspaceId: string, stagingDocumentId: string): RetrievalIndexRow | null {
  return (
    (getRegistryDatabase()
      .prepare(
        `SELECT document_id, artifact_version, ready_package_id, content_sha256, indexed_at, is_current
         FROM retrieval_documents
         WHERE workspace_id = ? AND staging_document_id = ?`,
      )
      .get(workspaceId, stagingDocumentId) as RetrievalIndexRow | undefined) ?? null
  );
}

function packageMatchesCandidate(
  readyPackage: ReadyPackage,
  descriptor: StagingDocumentDescriptor,
): boolean {
  return (
    readyPackage.evidence.stagingDocumentId === descriptor.id &&
    readyPackage.evidence.sourceId === descriptor.sourceId &&
    readyPackage.evidence.artifactIds.length === 1 &&
    readyPackage.evidence.artifactIds[0] === descriptor.rawArtifactId &&
    readyPackage.evidence.conversionRunId === descriptor.conversionRunId &&
    readyPackage.evidence.stagingSha256 === descriptor.contentHash.value
  );
}

function candidateFor(
  workspaceId: string,
  record: StagingDocumentRecord,
): FoundationalVerifiedCanonicalCandidate {
  const descriptor = record.descriptor;
  const readyPackage = getReadyPackageRepository().getByConversionRun(
    descriptor.conversionRunId,
    workspaceId,
  );
  const indexed = indexRow(workspaceId, descriptor.id);
  let state: FoundationalCanonicalIndexState;
  if (!readyPackage) state = "MISSING_READY_PACKAGE";
  else if (
    !packageMatchesCandidate(readyPackage, descriptor) ||
    (indexed !== null &&
      (indexed.ready_package_id !== readyPackage.id ||
        indexed.content_sha256 !== descriptor.contentHash.value))
  ) {
    state = "EVIDENCE_MISMATCH";
  } else if (indexed) state = "INDEXED";
  else state = "MISSING_INDEX";

  return {
    stagingDocumentId: descriptor.id,
    sourceId: descriptor.sourceId,
    rawArtifactId: descriptor.rawArtifactId,
    conversionRunId: descriptor.conversionRunId,
    title: descriptor.title,
    targetPath: descriptor.targetPath,
    contentSha256: descriptor.contentHash.value,
    generatedAt: descriptor.generatedAt,
    readyPackageId: readyPackage?.id ?? null,
    readyPackageStatus:
      readyPackage?.status === "VERIFIED" || readyPackage?.status === "HANDED_OFF"
        ? readyPackage.status
        : null,
    state,
    indexedDocumentId: indexed?.document_id ?? null,
    indexedArtifactVersion: indexed?.artifact_version ?? null,
    indexedAt: indexed?.indexed_at ?? null,
    isCurrent: indexed?.is_current === 1,
  };
}

function summary(items: readonly FoundationalVerifiedCanonicalCandidate[]) {
  const counts = Object.fromEntries(
    FOUNDATIONAL_CANONICAL_INDEX_STATES.map((state) => [state, 0]),
  ) as Record<FoundationalCanonicalIndexState, number>;
  for (const item of items) counts[item.state] += 1;
  return { ...counts, total: items.length };
}

export function listFoundationalVerifiedCanonicalReindex(input: {
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
}): FoundationalVerifiedCanonicalReindexSnapshot {
  const target = resolveTarget(input);
  const items = readyDocuments(target.workspaceId, target.sourceIds).map((record) =>
    candidateFor(target.workspaceId, record),
  );
  return {
    objectType: "FOUNDATIONAL_VERIFIED_CANONICAL_REINDEX_SNAPSHOT",
    version: "1.0",
    workspaceId: target.workspaceId,
    jurisdiction: target.jurisdiction,
    targetId: target.targetId,
    sourceIds: target.sourceIds,
    items,
    summary: summary(items),
    executionPolicy: "EXPLICIT_VERIFIED_CANONICAL_REINDEX_ONLY",
    automaticExecution: false,
    createsReadyPackage: false,
    mutatesRawArtifact: false,
  };
}

export function reindexFoundationalVerifiedCanonical(input: {
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  stagingDocumentId: string;
  execute: boolean;
}): FoundationalVerifiedCanonicalReindexResult {
  if (input.execute !== true) {
    throw new RegistryValidationError("execute=true is required for verified canonical reindex");
  }
  const target = resolveTarget(input);
  const stagingDocumentId = input.stagingDocumentId.trim();
  if (!stagingDocumentId) throw new RegistryValidationError("stagingDocumentId is required");

  const staging = getStagingContentRepository().getDocument(stagingDocumentId, target.workspaceId);
  if (!staging || staging.descriptor.status !== "READY") {
    throw new RegistryConflictError(
      "FOUNDATIONAL_REINDEX_STAGING_NOT_READY",
      "Explicit reindex requires an existing READY staging document",
    );
  }
  const descriptor = staging.descriptor;
  if (!target.sourceIds.includes(descriptor.sourceId)) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_REINDEX_TARGET_SCOPE_MISMATCH",
      "Staging document does not belong to the requested foundational target",
    );
  }

  const readyPackage = getReadyPackageRepository().getByConversionRun(
    descriptor.conversionRunId,
    target.workspaceId,
  );
  if (!readyPackage) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_REINDEX_READY_PACKAGE_MISSING",
      "Verified canonical reindex requires the existing ReadyPackage evidence",
    );
  }
  if (!packageMatchesCandidate(readyPackage, descriptor)) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_REINDEX_READY_PACKAGE_MISMATCH",
      "ReadyPackage evidence does not match the requested staging document",
    );
  }
  const existing = indexRow(target.workspaceId, descriptor.id);
  if (
    existing &&
    (existing.ready_package_id !== readyPackage.id ||
      existing.content_sha256 !== descriptor.contentHash.value)
  ) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_REINDEX_EXISTING_INDEX_MISMATCH",
      "Existing retrieval index evidence conflicts with the verified canonical document",
    );
  }

  const run = getConversionRunLedgerRepository().getById(
    descriptor.conversionRunId,
    target.workspaceId,
  );
  if (!run || run.run.status !== "COMPLETED") {
    throw new RegistryConflictError(
      "FOUNDATIONAL_REINDEX_CONVERSION_NOT_COMPLETED",
      "Verified canonical reindex requires a completed ConversionRun",
    );
  }
  const artifact = getRawArtifactRepository().getArtifact(descriptor.rawArtifactId);
  if (!artifact) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_REINDEX_RAW_ARTIFACT_MISSING",
      "Verified canonical reindex requires the immutable RawArtifact evidence",
    );
  }
  const source = getSourceRepository().getById(descriptor.sourceId);
  if (!source) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_REINDEX_SOURCE_MISSING",
      "Verified canonical reindex requires the registered Source definition",
    );
  }
  const metadata = canonicalDocumentMetadata(run.run, artifact.artifact, source);
  const canonicalMarkdown = getStagingContentRepository().readContent(
    descriptor.id,
    target.workspaceId,
  );
  const indexed = getRetrievalIndexRepository().indexVerified({
    metadata,
    stagingDocumentId: descriptor.id,
    readyPackageId: readyPackage.id,
    title: descriptor.title,
    targetPath: descriptor.targetPath,
    contentSha256: descriptor.contentHash.value,
    canonicalMarkdown,
  });

  return {
    objectType: "FOUNDATIONAL_VERIFIED_CANONICAL_REINDEX_RESULT",
    version: "1.0",
    workspaceId: target.workspaceId,
    jurisdiction: target.jurisdiction,
    targetId: target.targetId,
    stagingDocumentId: descriptor.id,
    readyPackageId: readyPackage.id,
    documentId: indexed.document.documentId,
    artifactVersion: indexed.document.artifactVersion,
    chunkCount: indexed.chunks.length,
    indexedAt: indexed.document.indexedAt,
    replayed: indexed.replayed,
    automaticExecution: false,
  };
}
