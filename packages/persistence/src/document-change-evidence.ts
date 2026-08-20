import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  ARTIFACT_KINDS,
  CHANGE_EVIDENCE_METADATA_FIELDS,
  CHANGE_EVIDENCE_PROTOCOL_VERSION,
  OBJECTIVE_CHANGE_DIMENSIONS,
  type ChangeEvidenceAttachmentDiff,
  type ChangeEvidenceAttachmentRef,
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
const COLLECTION_RUN_TABLE = "collection_runs";

type RawArtifactEvidenceRow = {
  id: string;
  workspace_id: string;
  source_id: string;
  content_digest: string;
  artifact_kind: string;
  mime_type: string;
  document_json: string;
};

type RawArtifactEvidence = {
  ref: ChangeEvidenceRawArtifactRef;
  collectionRunId: string | null;
  parentArtifactIds: string[];
};

type AttachmentObservation = {
  covered: boolean;
  items: ChangeEvidenceAttachmentRef[];
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

function tableExists(database: DatabaseSync, table: string): boolean {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
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

function rawArtifactStringArray(value: unknown, field: string, artifactId: string): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim()) ||
    new Set(value).size !== value.length
  ) {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_RAW_ARTIFACT_INVALID",
      `RawArtifact ${artifactId} has invalid ${field}`,
    );
  }
  return [...value].sort();
}

function parseRawArtifactEvidence(
  row: RawArtifactEvidenceRow,
  expectedWorkspaceId: string,
  expectedSourceId: string,
): RawArtifactEvidence {
  if (row.workspace_id !== expectedWorkspaceId || row.source_id !== expectedSourceId) {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_RAW_ARTIFACT_SCOPE_MISMATCH",
      "RawArtifact does not match the indexed document workspace/source scope",
      { rawArtifactId: row.id },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.document_json) as unknown;
  } catch {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_RAW_ARTIFACT_INVALID",
      `RawArtifact ${row.id} has invalid persisted JSON`,
    );
  }
  const artifact = record(parsed);
  const binaryHash = record(artifact?.binaryHash);
  const contentHash = artifact?.contentHash === undefined ? null : record(artifact.contentHash);
  const provenance = record(artifact?.provenance);
  const artifactKind = requiredRawArtifactString(artifact?.artifactKind, "artifactKind", row.id);
  const mimeType = requiredRawArtifactString(artifact?.mimeType, "mimeType", row.id);
  const binarySha256 = requiredRawArtifactString(binaryHash?.value, "binaryHash.value", row.id);
  if (
    artifact?.objectType !== "RAW_ARTIFACT" ||
    artifact?.id !== row.id ||
    artifact?.workspaceId !== expectedWorkspaceId ||
    artifact?.sourceId !== expectedSourceId ||
    !(ARTIFACT_KINDS as readonly string[]).includes(artifactKind) ||
    artifactKind !== row.artifact_kind ||
    mimeType !== row.mime_type ||
    binaryHash?.algorithm !== "SHA-256" ||
    !SHA256.test(binarySha256) ||
    row.content_digest !== binarySha256
  ) {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_RAW_ARTIFACT_INVALID",
      `RawArtifact ${row.id} does not match its indexed evidence row`,
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
      `RawArtifact ${row.id} has invalid contentHash evidence`,
    );
  }
  if (!Number.isSafeInteger(artifact.sizeBytes) || Number(artifact.sizeBytes) <= 0) {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_RAW_ARTIFACT_INVALID",
      `RawArtifact ${row.id} has invalid sizeBytes`,
    );
  }

  const ref: ChangeEvidenceRawArtifactRef = {
    artifactId: row.id,
    artifactKind: artifactKind as ChangeEvidenceRawArtifactRef["artifactKind"],
    mimeType,
    originalName: requiredRawArtifactString(artifact.originalName, "originalName", row.id),
    binarySha256,
    contentSha256: contentHash ? String(contentHash.value) : null,
    sizeBytes: Number(artifact.sizeBytes),
    capturedAt: requiredRawArtifactString(artifact.capturedAt, "capturedAt", row.id),
    publishedAt: optionalRawArtifactString(artifact.publishedAt, "publishedAt", row.id),
    sourceUri: requiredRawArtifactString(provenance?.sourceUri, "provenance.sourceUri", row.id),
    canonicalUri: optionalRawArtifactString(artifact.canonicalUri, "canonicalUri", row.id),
  };
  return {
    ref,
    collectionRunId: optionalRawArtifactString(artifact.collectionRunId, "collectionRunId", row.id),
    parentArtifactIds: rawArtifactStringArray(
      provenance?.parentArtifactIds,
      "provenance.parentArtifactIds",
      row.id,
    ),
  };
}

function loadRawArtifactEvidence(
  database: DatabaseSync,
  document: RetrievalDocument,
): RawArtifactEvidence | null {
  if (!tableExists(database, RAW_ARTIFACT_TABLE)) return null;
  const row = database
    .prepare(
      `SELECT id, workspace_id, source_id, content_digest, artifact_kind, mime_type, document_json
         FROM raw_artifacts WHERE id = ?`,
    )
    .get(document.rawArtifactId) as unknown as RawArtifactEvidenceRow | undefined;
  if (!row) return null;
  return parseRawArtifactEvidence(row, document.workspaceId, document.sourceId);
}

function rawArtifactRef(evidence: RawArtifactEvidence | null): ChangeEvidenceRawArtifactRef | null {
  return evidence?.ref ?? null;
}

function collectionRunCoversAttachments(
  database: DatabaseSync,
  parent: RawArtifactEvidence | null,
  workspaceId: string,
  sourceId: string,
): boolean {
  if (!parent?.collectionRunId || !tableExists(database, COLLECTION_RUN_TABLE)) return false;
  const row = database
    .prepare("SELECT workspace_id, source_id, document_json FROM collection_runs WHERE id = ?")
    .get(parent.collectionRunId) as
    { workspace_id: string; source_id: string; document_json: string } | undefined;
  if (!row) return false;
  if (row.workspace_id !== workspaceId || row.source_id !== sourceId) {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_ATTACHMENT_RUN_SCOPE_MISMATCH",
      "Attachment collection evidence belongs to a different workspace/source scope",
      { collectionRunId: parent.collectionRunId },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.document_json) as unknown;
  } catch {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_ATTACHMENT_RUN_INVALID",
      `CollectionRun ${parent.collectionRunId} has invalid persisted JSON`,
    );
  }
  const run = record(parsed);
  const planSnapshot = record(run?.planSnapshot);
  const policy = record(planSnapshot?.policy);
  if (
    run?.objectType !== "COLLECTION_RUN" ||
    run?.id !== parent.collectionRunId ||
    run?.workspaceId !== workspaceId ||
    run?.sourceId !== sourceId ||
    typeof policy?.fetchAttachments !== "boolean"
  ) {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_ATTACHMENT_RUN_INVALID",
      `CollectionRun ${parent.collectionRunId} cannot prove attachment collection policy`,
    );
  }
  return policy.fetchAttachments;
}

function attachmentIdentityUri(ref: ChangeEvidenceRawArtifactRef): string {
  const raw = ref.canonicalUri ?? ref.sourceUri;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
    url.hash = "";
    return url.toString();
  } catch {
    throw new RegistryConflictError(
      "CHANGE_EVIDENCE_ATTACHMENT_URI_INVALID",
      `Attachment ${ref.artifactId} lacks a stable HTTP(S) identity URI`,
    );
  }
}

function linkedAttachmentItems(
  database: DatabaseSync,
  parent: RawArtifactEvidence | null,
  workspaceId: string,
  sourceId: string,
): ChangeEvidenceAttachmentRef[] {
  if (!parent || !tableExists(database, RAW_ARTIFACT_TABLE)) return [];
  const rows = database
    .prepare(
      `SELECT id, workspace_id, source_id, content_digest, artifact_kind, mime_type, document_json
         FROM raw_artifacts
        WHERE workspace_id = ? AND source_id = ?
          AND EXISTS (
            SELECT 1
              FROM json_each(json_extract(document_json, '$.provenance.parentArtifactIds'))
             WHERE value = ?
          )`,
    )
    .all(workspaceId, sourceId, parent.ref.artifactId) as unknown as RawArtifactEvidenceRow[];
  const items = rows.map((row) => {
    const evidence = parseRawArtifactEvidence(row, workspaceId, sourceId);
    if (!evidence.parentArtifactIds.includes(parent.ref.artifactId)) {
      throw new RegistryConflictError(
        "CHANGE_EVIDENCE_ATTACHMENT_LINEAGE_MISMATCH",
        `Attachment ${row.id} does not preserve the queried parent lineage`,
      );
    }
    return { ...evidence.ref, identityUri: attachmentIdentityUri(evidence.ref) };
  });
  items.sort(
    (left, right) =>
      left.identityUri.localeCompare(right.identityUri) ||
      left.artifactId.localeCompare(right.artifactId),
  );
  const identities = new Set<string>();
  for (const item of items) {
    if (identities.has(item.identityUri)) {
      throw new RegistryConflictError(
        "CHANGE_EVIDENCE_ATTACHMENT_IDENTITY_AMBIGUOUS",
        `Multiple attachment artifacts share identity ${item.identityUri} for one parent version`,
      );
    }
    identities.add(item.identityUri);
  }
  return items;
}

function attachmentObservation(
  database: DatabaseSync,
  parent: RawArtifactEvidence | null,
  workspaceId: string,
  sourceId: string,
): AttachmentObservation {
  return {
    covered: collectionRunCoversAttachments(database, parent, workspaceId, sourceId),
    items: linkedAttachmentItems(database, parent, workspaceId, sourceId),
  };
}

function attachmentDiff(
  before: AttachmentObservation,
  after: AttachmentObservation,
  hasBeforeDocument: boolean,
): { covered: boolean; diff: ChangeEvidenceAttachmentDiff } {
  const covered = after.covered && (!hasBeforeDocument || before.covered);
  const diff: ChangeEvidenceAttachmentDiff = {
    before: before.items,
    after: after.items,
    added: [],
    removed: [],
    modified: [],
  };
  if (!covered) return { covered, diff };

  const beforeByUri = new Map(before.items.map((item) => [item.identityUri, item]));
  const afterByUri = new Map(after.items.map((item) => [item.identityUri, item]));
  diff.added = after.items.filter((item) => !beforeByUri.has(item.identityUri));
  diff.removed = hasBeforeDocument
    ? before.items.filter((item) => !afterByUri.has(item.identityUri))
    : [];
  if (hasBeforeDocument) {
    diff.modified = after.items.flatMap((current) => {
      const previous = beforeByUri.get(current.identityUri);
      if (!previous || previous.binarySha256 === current.binarySha256) return [];
      return [{ identityUri: current.identityUri, before: previous, after: current }];
    });
  }
  return { covered, diff };
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
  attachmentChanges: ChangeEvidenceAttachmentDiff,
): ObjectiveChangeDimension[] {
  const observed = new Set<ObjectiveChangeDimension>();
  if (event.changeKind === "CREATED") observed.add("DOCUMENT_CREATED");
  if (event.fromContentSha256 !== event.toContentSha256) observed.add("CONTENT_CHANGED");
  if (rawBinaryChanged) observed.add("RAW_ARTIFACT_BINARY_CHANGED");
  if (metadata.length > 0) observed.add("METADATA_CHANGED");
  if (linkChanges.added.length > 0) observed.add("LINK_ADDED");
  if (linkChanges.removed.length > 0) observed.add("LINK_REMOVED");
  if (attachmentChanges.added.length > 0) observed.add("ATTACHMENT_ADDED");
  if (attachmentChanges.removed.length > 0) observed.add("ATTACHMENT_REMOVED");
  if (attachmentChanges.modified.length > 0) observed.add("ATTACHMENT_BINARY_CHANGED");
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
    const beforeRawEvidence = before ? loadRawArtifactEvidence(this.database, before) : null;
    const afterRawEvidence = loadRawArtifactEvidence(this.database, after);
    const beforeRaw = rawArtifactRef(beforeRawEvidence);
    const afterRaw = rawArtifactRef(afterRawEvidence);
    const rawArtifactBinaryCovered = afterRaw !== null && (before === null || beforeRaw !== null);
    const rawBinaryChanged = Boolean(
      beforeRaw && afterRaw && beforeRaw.binarySha256 !== afterRaw.binarySha256,
    );
    const beforeAttachments = attachmentObservation(
      this.database,
      beforeRawEvidence,
      event.workspaceId,
      event.sourceId,
    );
    const afterAttachments = attachmentObservation(
      this.database,
      afterRawEvidence,
      event.workspaceId,
      event.sourceId,
    );
    const attachmentEvidence = attachmentDiff(beforeAttachments, afterAttachments, before !== null);
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
      attachments: attachmentEvidence.diff,
      dimensions: dimensions(
        event,
        diff,
        metadata,
        linkChanges,
        rawBinaryChanged,
        attachmentEvidence.diff,
      ),
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
        linkedAttachments: attachmentEvidence.covered,
      },
    };
  }
}
