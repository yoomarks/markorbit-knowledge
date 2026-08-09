import { DatabaseSync } from "node:sqlite";
import {
  SqliteRetrievalQualityAuditRepository,
  type RetrievalQualityAuditFilters,
  type RetrievalQualityAuditRecord,
  type RetrievalQualityGap,
} from "./retrieval-quality-audit";

export const RETRIEVAL_QUALITY_REMEDIATION_PROTOCOL_VERSION = "1.0" as const;

export type RetrievalQualityRemediationState =
  | "NO_ACTION"
  | "REVIEW_REQUIRED"
  | "REMEDIATION_REQUIRED";

export type RetrievalQualityRemediationActionCode =
  | "RESTORE_PROVENANCE_EVIDENCE"
  | "RECONCILE_CURRENT_VERSION"
  | "REBUILD_RETRIEVAL_INDEX"
  | "REVIEW_DUPLICATE_CHUNKING";

export type RetrievalQualityRemediationAction = {
  code: RetrievalQualityRemediationActionCode;
  severity: "BLOCKING" | "REVIEW";
  gapCodes: RetrievalQualityGap[];
  operatorInstruction: string;
  automaticExecution: false;
};

export type RetrievalQualityRemediationRecord = {
  protocolVersion: typeof RETRIEVAL_QUALITY_REMEDIATION_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_QUALITY_REMEDIATION";
  workspaceId: string;
  sourceId: string;
  documentId: string;
  stagingDocumentId: string;
  readyPackageId: string;
  rawArtifactId: string;
  artifactVersion: number;
  title: string;
  jurisdictions: string[];
  isCurrent: boolean;
  auditState: RetrievalQualityAuditRecord["state"];
  auditGaps: RetrievalQualityGap[];
  state: RetrievalQualityRemediationState;
  actions: RetrievalQualityRemediationAction[];
  plannedAt: string;
};

export type RetrievalQualityRemediationSummary = {
  total: number;
  byState: Record<RetrievalQualityRemediationState, number>;
  actionCounts: Partial<Record<RetrievalQualityRemediationActionCode, number>>;
};

export type RetrievalQualityRemediationResult = {
  protocolVersion: typeof RETRIEVAL_QUALITY_REMEDIATION_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_QUALITY_REMEDIATION_LIST";
  filters: RetrievalQualityAuditFilters;
  summary: RetrievalQualityRemediationSummary;
  items: RetrievalQualityRemediationRecord[];
  plannedAt: string;
  executionPolicy: "MANUAL_ONLY";
};

const PROVENANCE_GAPS = new Set<RetrievalQualityGap>([
  "STAGING_DOCUMENT_MISSING",
  "READY_PACKAGE_MISSING",
  "RAW_ARTIFACT_MISSING",
  "PROVENANCE_LINK_MISMATCH",
]);

const VERSION_GAPS = new Set<RetrievalQualityGap>([
  "MULTIPLE_CURRENT_VERSIONS",
  "CURRENT_VERSION_NOT_LATEST",
]);

const INDEX_GAPS = new Set<RetrievalQualityGap>([
  "NO_CHUNKS",
  "CHUNK_COUNT_MISMATCH",
  "CHUNK_ORDINAL_GAP",
  "EMPTY_CHUNK",
  "FTS_ROW_COUNT_MISMATCH",
]);

function matchingGaps(
  gaps: readonly RetrievalQualityGap[],
  candidates: ReadonlySet<RetrievalQualityGap>,
): RetrievalQualityGap[] {
  return gaps.filter((gap) => candidates.has(gap));
}

export function deriveRetrievalQualityRemediationActions(
  gaps: readonly RetrievalQualityGap[],
): RetrievalQualityRemediationAction[] {
  const actions: RetrievalQualityRemediationAction[] = [];
  const provenanceGaps = matchingGaps(gaps, PROVENANCE_GAPS);
  if (provenanceGaps.length > 0) {
    actions.push({
      code: "RESTORE_PROVENANCE_EVIDENCE",
      severity: "BLOCKING",
      gapCodes: provenanceGaps,
      operatorInstruction:
        "Verify the immutable RawArtifact → StagingDocument → ReadyPackage chain. Restore only from verifiable persisted evidence; if evidence cannot be restored, use the governed acquisition/conversion path to create a new version rather than silently backfilling history.",
      automaticExecution: false,
    });
  }

  const versionGaps = matchingGaps(gaps, VERSION_GAPS);
  if (versionGaps.length > 0) {
    actions.push({
      code: "RECONCILE_CURRENT_VERSION",
      severity: "BLOCKING",
      gapCodes: versionGaps,
      operatorInstruction:
        "Review retrieval version currentness against persisted artifact versions and rebuild the derived current-version projection from verified evidence. Do not delete historical versions.",
      automaticExecution: false,
    });
  }

  const indexGaps = matchingGaps(gaps, INDEX_GAPS);
  if (indexGaps.length > 0) {
    actions.push({
      code: "REBUILD_RETRIEVAL_INDEX",
      severity: "BLOCKING",
      gapCodes: indexGaps,
      operatorInstruction:
        "Rebuild retrieval chunks and FTS rows from the verified ReadyPackage/canonical Markdown through the existing indexing boundary, then rerun the quality audit.",
      automaticExecution: false,
    });
  }

  if (gaps.includes("DUPLICATE_CHUNK_CONTENT")) {
    actions.push({
      code: "REVIEW_DUPLICATE_CHUNKING",
      severity: "REVIEW",
      gapCodes: ["DUPLICATE_CHUNK_CONTENT"],
      operatorInstruction:
        "Review repeated normalized chunk text and chunk-boundary behavior. Keep the document available unless another blocking gap is present; no destructive deduplication is authorized.",
      automaticExecution: false,
    });
  }

  return actions;
}

function remediationState(record: RetrievalQualityAuditRecord): RetrievalQualityRemediationState {
  if (record.state === "READY") return "NO_ACTION";
  if (record.state === "DEGRADED") return "REVIEW_REQUIRED";
  return "REMEDIATION_REQUIRED";
}

export function planRetrievalQualityRemediation(
  record: RetrievalQualityAuditRecord,
  plannedAt = record.auditedAt,
): RetrievalQualityRemediationRecord {
  return {
    protocolVersion: RETRIEVAL_QUALITY_REMEDIATION_PROTOCOL_VERSION,
    objectType: "RETRIEVAL_QUALITY_REMEDIATION",
    workspaceId: record.workspaceId,
    sourceId: record.sourceId,
    documentId: record.documentId,
    stagingDocumentId: record.stagingDocumentId,
    readyPackageId: record.readyPackageId,
    rawArtifactId: record.rawArtifactId,
    artifactVersion: record.artifactVersion,
    title: record.title,
    jurisdictions: record.jurisdictions,
    isCurrent: record.isCurrent,
    auditState: record.state,
    auditGaps: record.gaps,
    state: remediationState(record),
    actions: deriveRetrievalQualityRemediationActions(record.gaps),
    plannedAt,
  };
}

function summarize(
  items: readonly RetrievalQualityRemediationRecord[],
): RetrievalQualityRemediationSummary {
  const summary: RetrievalQualityRemediationSummary = {
    total: items.length,
    byState: { NO_ACTION: 0, REVIEW_REQUIRED: 0, REMEDIATION_REQUIRED: 0 },
    actionCounts: {},
  };
  for (const item of items) {
    summary.byState[item.state] += 1;
    for (const action of item.actions) {
      summary.actionCounts[action.code] = (summary.actionCounts[action.code] ?? 0) + 1;
    }
  }
  return summary;
}

export class SqliteRetrievalQualityRemediationRepository {
  private readonly audits: SqliteRetrievalQualityAuditRepository;

  constructor(
    database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.audits = new SqliteRetrievalQualityAuditRepository(database, clock);
  }

  list(filters: RetrievalQualityAuditFilters): RetrievalQualityRemediationResult {
    const audit = this.audits.list(filters);
    const plannedAt = this.clock().toISOString();
    const items = audit.items.map((record) => planRetrievalQualityRemediation(record, plannedAt));
    return {
      protocolVersion: RETRIEVAL_QUALITY_REMEDIATION_PROTOCOL_VERSION,
      objectType: "RETRIEVAL_QUALITY_REMEDIATION_LIST",
      filters: audit.filters,
      summary: summarize(items),
      items,
      plannedAt,
      executionPolicy: "MANUAL_ONLY",
    };
  }
}
