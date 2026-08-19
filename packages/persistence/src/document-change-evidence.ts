import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  CHANGE_EVIDENCE_METADATA_FIELDS,
  CHANGE_EVIDENCE_PROTOCOL_VERSION,
  OBJECTIVE_CHANGE_DIMENSIONS,
  type ChangeEvidenceDocumentRef,
  type ChangeEvidenceMetadataChange,
  type ChangeEvidenceMetadataField,
  type ChangeEvidenceMetadataValue,
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
): ObjectiveChangeDimension[] {
  const observed = new Set<ObjectiveChangeDimension>();
  if (event.changeKind === "CREATED") observed.add("DOCUMENT_CREATED");
  if (event.fromContentSha256 !== event.toContentSha256) observed.add("CONTENT_CHANGED");
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

  constructor(database: DatabaseSync) {
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
      dimensions: dimensions(event, diff, metadata, linkChanges),
      summary: diff.summary,
      sections: diff.sections,
      metadataChanges: metadata,
      links: linkChanges,
      coverage: {
        documentMetadata: true,
        canonicalText: true,
        canonicalLinks: true,
        sectionStructure: true,
        linkedAttachments: false,
      },
    };
  }
}
