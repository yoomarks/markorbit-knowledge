import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  ARTIFACT_KINDS,
  CHANGE_EVIDENCE_METADATA_FIELDS,
  CHANGE_EVIDENCE_PROTOCOL_VERSION,
  OBJECTIVE_CHANGE_DIMENSIONS,
  type ChangeEvidenceDocumentRef,
  type ChangeEvidenceMetadataChange,
  type ChangeEvidenceMetadataField,
  type ChangeEvidenceMetadataValue,
  type ChangeEvidenceRawArtifactRef,
  type DocumentChangeEvidence,
  type DocumentChangeEvidenceFeedRequest,
  type DocumentChangeEvidenceFeedResult,
  type DocumentChangeEvent,
  type DocumentVersionDiff,
  type ObjectiveChangeDimension,
  type RetrievalDocument,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";
import { SqliteDocumentChangeFeedRepository } from "./document-change-feed";
import { SqliteRetrievalIndexRepository } from "./retrieval-index";

const CURSOR = /^ce_(\d+)$/;
const ABSOLUTE_LINK = /https?:\/\/[^\s<>"']+/gi;
const SHA256 = /^[a-f0-9]{64}$/;
const RAW_ARTIFACT_TABLE = "raw_artifacts";

type RawArtifactEvidenceRow = {
  workspace_id: string;
  source_id: string;
  content_digest: string;
  artifact_kind: string;
  mime_type: string;
  document_json: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function evidenceId(event: DocumentChangeEvent): string {
  return `dcev_${sha256(`${event.id}\u0000${event.toContentSha256}`).slice(0, 32)}`;
}

function documentRef(document: RetrievalDocument): ChangeEvidenceDocumentRef {
  return {
    artifactVersion: document.artifactVersion,
    rawArtifactId: document.rawArtifactId,
    stagingDocumentId: document.stagingDocumentId,
    readyPackageId: document.readyPackageId,
    contentSha256: document.contentSha256,
    capturedAt: document.capturedAt,
    sourceUri: document.sourceUri,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rawArtifactTableExists(database: DatabaseSync): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(RAW_ARTIFACT_TABLE),
  );
}

function requiredRawArtifactString(value: unknown, field: string, artifactId: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_RAW_ARTIFACT_INVALID",
      `RawArtifact ${artifactId} has invalid ${field}`,
    );
  }
  return value;
}

function optionalRawArtifactString(
  value: unknown,
  field: string,
  artifactId: string,
): string | null {
  if (value === undefined) return null;
  return requiredRawArtifactString(value, field, artifactId);
}

function rawArtifactRef(
  database: DatabaseSync,
  document: RetrievalDocument,
): ChangeEvidenceRawArtifactRef | null {
  if (!rawArtifactTableExists(database)) return null;
  const row = database
    .prepare(
      `SELECT workspace_id, source_id, content_digest, artifact_kind, mime_type, document_json
         FROM raw_artifacts WHERE id = ?`,
    )
    .get(document.rawArtifactId) as unknown as RawArtifactEvidenceRow | undefined;
  if (!row) return null;
  if (row.workspace_id !== document.workspaceId || row.source_id !== document.sourceId) {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_RAW_ARTIFACT_SCOPE_MISMATCH",
      "RawArtifact does not match the indexed document workspace/source scope",
      { rawArtifactId: document.rawArtifactId },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.document_json) as unknown;
  } catch {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_RAW_ARTIFACT_INVALID",
      `RawArtifact ${document.rawArtifactId} has invalid persisted JSON`,
    );
  }
  const artifact = record(parsed);
  const binaryHash = record(artifact?.binaryHash);
  const contentHash = artifact?.contentHash === undefined ? null : record(artifact.contentHash);
  const provenance = record(artifact?.provenance);
  const artifactKind = requiredRawArtifactString(
    artifact?.artifactKind,
    "artifactKind",
    document.rawArtifactId,
  );
  const mimeType = requiredRawArtifactString(
    artifact?.mimeType,
    "mimeType",
    document.rawArtifactId,
  );
  const binarySha256 = requiredRawArtifactString(
    binaryHash?.value,
    "binaryHash.value",
    document.rawArtifactId,
  );
  if (
    artifact?.objectType !== "RAW_ARTIFACT" ||
    artifact?.id !== document.rawArtifactId ||
    artifact?.workspaceId !== document.workspaceId ||
    artifact?.sourceId !== document.sourceId ||
    !(ARTIFACT_KINDS as readonly string[]).includes(artifactKind) ||
    artifactKind !== row.artifact_kind ||
    mimeType !== row.mime_type ||
    binaryHash?.algorithm !== "SHA-256" ||
    !SHA256.test(binarySha256) ||
    row.content_digest !== binarySha256
  ) {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_RAW_ARTIFACT_INVALID",
      `RawArtifact ${document.rawArtifactId} does not match its indexed evidence row`,
    );
  }
  if (
    contentHash &&
    (contentHash.algorithm !== "SHA-256" ||
      typeof contentHash.value !== "string" ||
      !SHA256.test(contentHash.value))
  ) {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_RAW_ARTIFACT_INVALID",
      `RawArtifact ${document.rawArtifactId} has invalid contentHash evidence`,
    );
  }
  if (!Number.isSafeInteger(artifact.sizeBytes) || Number(artifact.sizeBytes) <= 0) {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_RAW_ARTIFACT_INVALID",
      `RawArtifact ${document.rawArtifactId} has invalid sizeBytes`,
    );
  }

  return {
    artifactId: document.rawArtifactId,
    artifactKind: artifactKind as ChangeEvidenceRawArtifactRef["artifactKind"],
    mimeType,
    originalName: requiredRawArtifactString(
      artifact.originalName,
      "originalName",
      document.rawArtifactId,
    ),
    binarySha256,
    contentSha256: contentHash ? String(contentHash.value) : null,
    sizeBytes: Number(artifact.sizeBytes),
    capturedAt: requiredRawArtifactString(
      artifact.capturedAt,
      "capturedAt",
      document.rawArtifactId,
    ),
    publishedAt: optionalRawArtifactString(
      artifact.publishedAt,
      "publishedAt",
      document.rawArtifactId,
    ),
    sourceUri: requiredRawArtifactString(
      provenance?.sourceUri,
      "provenance.sourceUri",
      document.rawArtifactId,
    ),
    canonicalUri: optionalRawArtifactString(
      artifact.canonicalUri,
      "canonicalUri",
      document.rawArtifactId,
    ),
  };
}

function normalizedSet(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function metadataValue(
  document: RetrievalDocument,
  field: ChangeEvidenceMetadataField,
): ChangeEvidenceMetadataValue {
  switch (field) {
    case "title":
      return document.title;
    case "targetPath":
      return document.targetPath;
    case "canonicalUri":
      return document.canonicalUri;
    case "sourceUri":
      return document.sourceUri;
    case "sourceName":
      return document.sourceName;
    case "sourceCategory":
      return document.sourceCategory;
    case "authorityLevel":
      return document.authorityLevel;
    case "jurisdictions":
      return normalizedSet(document.jurisdictions);
    case "languages":
      return normalizedSet(document.languages);
    case "publishedAt":
      return document.publishedAt;
  }
}

function valuesEqual(
  left: ChangeEvidenceMetadataValue,
  right: ChangeEvidenceMetadataValue,
): boolean {
  if (Array.isArray(left) && Array.isArray(right))
    return JSON.stringify(left) === JSON.stringify(right);
  return left === right;
}

function metadataChanges(
  before: RetrievalDocument | null,
  after: RetrievalDocument,
): ChangeEvidenceMetadataChange[] {
  if (!before) return [];
  return CHANGE_EVIDENCE_METADATA_FIELDS.flatMap((field) => {
    const previous = metadataValue(before, field);
    const current = metadataValue(after, field);
    return valuesEqual(previous, current) ? [] : [{ field, before: previous, after: current }];
  });
}

function normalizeLink(raw: string): string | null {
  const trimmed = raw.replace(/[),.;:!?]+$/g, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function links(text: string | null): Set<string> {
  const found = new Set<string>();
  if (!text) return found;
  for (const match of text.matchAll(ABSOLUTE_LINK)) {
    const value = normalizeLink(match[0]);
    if (value) found.add(value);
  }
  return found;
}

function linkDiff(diff: DocumentVersionDiff): { added: string[]; removed: string[] } {
  const before = new Set<string>();
  const after = new Set<string>();
  for (const section of diff.sections) {
    for (const value of links(section.beforeText)) before.add(value);
    for (const value of links(section.afterText)) after.add(value);
  }
  return {
    added: [...after].filter((value) => !before.has(value)).sort(),
    removed: [...before].filter((value) => !after.has(value)).sort(),
  };
}

function dimensions(
  event: DocumentChangeEvent,
  diff: DocumentVersionDiff,
  metadata: ChangeEvidenceMetadataChange[],
  linkChanges: { added: string[]; removed: string[] },
  rawBinaryChanged: boolean,
): ObjectiveChangeDimension[] {
  const observed = new Set<ObjectiveChangeDimension>();
  if (event.changeKind === "CREATED") observed.add("DOCUMENT_CREATED");
  if (event.fromContentSha256 !== event.toContentSha256) observed.add("CONTENT_CHANGED");
  if (rawBinaryChanged) observed.add("RAW_ARTIFACT_BINARY_CHANGED");
  if (metadata.length > 0) observed.add("METADATA_CHANGED");
  if (linkChanges.added.length > 0) observed.add("LINK_ADDED");
  if (linkChanges.removed.length > 0) observed.add("LINK_REMOVED");
  if (diff.summary.addedSections > 0) observed.add("SECTION_ADDED");
  if (diff.summary.removedSections > 0) observed.add("SECTION_REMOVED");
  if (diff.summary.modifiedSections > 0) observed.add("SECTION_MODIFIED");
  if (diff.summary.addedSections > 0 || diff.summary.removedSections > 0) {
    observed.add("STRUCTURE_CHANGED");
  }
  return OBJECTIVE_CHANGE_DIMENSIONS.filter((dimension) => observed.has(dimension));
}

function parseCursor(cursor?: string): string | undefined {
  if (!cursor) return undefined;
  const match = CURSOR.exec(cursor);
  if (!match) throw new RegistryValidationError("change evidence cursor is invalid");
  return `cf_${match[1]}`;
}

export class SqliteDocumentChangeEvidenceRepository {
  private readonly changeFeed: SqliteDocumentChangeFeedRepository;
  private readonly retrieval: SqliteRetrievalIndexRepository;

  constructor(private readonly database: DatabaseSync) {
    this.changeFeed = new SqliteDocumentChangeFeedRepository(database);
    this.retrieval = new SqliteRetrievalIndexRepository(database);
  }

  feed(request: DocumentChangeEvidenceFeedRequest): DocumentChangeEvidenceFeedResult {
    const workspaceId = request.workspaceId.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    const source = this.changeFeed.feed({
      workspaceId,
      cursor: parseCursor(request.cursor),
      sourceId: request.sourceId,
      documentId: request.documentId,
      limit: request.limit,
    });
    const items = source.items.map((event) => this.fromEvent(event));
    return {
      protocolVersion: CHANGE_EVIDENCE_PROTOCOL_VERSION,
      objectType: "DOCUMENT_CHANGE_EVIDENCE_FEED_RESULT",
      items,
      nextCursor: items.length > 0 ? `ce_${items[items.length - 1]!.sequence}` : null,
    };
  }

  fromEvent(event: DocumentChangeEvent): DocumentChangeEvidence {
    const after = this.retrieval.getDocument(event.workspaceId, event.documentId, event.toVersion);
    if (!after) {
      throw new RegistryConflictError(
        "CHANGE_EVIDENCE_AFTER_DOCUMENT_MISSING",
        "Change evidence cannot resolve the indexed after-document",
      );
    }
    const before =
      event.fromVersion === null
        ? null
        : this.retrieval.getDocument(event.workspaceId, event.documentId, event.fromVersion);
    if (event.fromVersion !== null && !before) {
      throw new RegistryConflictError(
        "CHANGE_EVIDENCE_BEFORE_DOCUMENT_MISSING",
        "Change evidence cannot resolve the indexed before-document",
      );
    }
    const diff = this.changeFeed.compareVersions(
      event.workspaceId,
      event.documentId,
      event.fromVersion,
      event.toVersion,
    );
    if (
      diff.sourceId !== event.sourceId ||
      diff.toContentSha256 !== event.toContentSha256 ||
      diff.fromContentSha256 !== event.fromContentSha256
    ) {
      throw new RegistryConflictError(
        "CHANGE_EVIDENCE_EVENT_DIFF_MISMATCH",
        "Change event and indexed version diff do not describe the same evidence",
      );
    }
    const metadata = metadataChanges(before, after);
    const linkChanges = linkDiff(diff);
    const beforeRaw = before ? rawArtifactRef(this.database, before) : null;
    const afterRaw = rawArtifactRef(this.database, after);
    const rawArtifactBinaryCovered = afterRaw !== null && (before === null || beforeRaw !== null);
    const rawBinaryChanged = Boolean(
      beforeRaw && afterRaw && beforeRaw.binarySha256 !== afterRaw.binarySha256,
    );
    return {
      protocolVersion: CHANGE_EVIDENCE_PROTOCOL_VERSION,
      objectType: "DOCUMENT_CHANGE_EVIDENCE",
      id: evidenceId(event),
      eventId: event.id,
      sequence: event.sequence,
      workspaceId: event.workspaceId,
      documentId: event.documentId,
      logicalDocumentId: event.logicalDocumentId,
      sourceId: event.sourceId,
      changeKind: event.changeKind,
      observedAt: event.observedAt,
      before: before ? documentRef(before) : null,
      after: documentRef(after),
      rawArtifacts: { before: beforeRaw, after: afterRaw },
      dimensions: dimensions(event, diff, metadata, linkChanges, rawBinaryChanged),
      summary: diff.summary,
      sections: diff.sections,
      metadataChanges: metadata,
      links: linkChanges,
      coverage: {
        documentMetadata: true,
        canonicalText: true,
        canonicalLinks: true,
        sectionStructure: true,
        rawArtifactBinary: rawArtifactBinaryCovered,
        linkedAttachments: false,
      },
    };
  }
}
