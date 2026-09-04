import type { DatabaseSync } from "node:sqlite";
import type {
  CanonicalDownstreamDocumentV1,
  ReadyPackageV2,
  VaultOriginStagingDocumentV1,
  VaultOriginStagingFinalizationV1,
  VaultOriginStagingVerificationEvidenceV1,
} from "@markorbit/contracts";
import { ensureCanonicalDownstreamDocumentRegistry } from "@markorbit/persistence/canonical-downstream-documents";
import {
  buildProducerCoreReliabilityScorecard,
  type ProducerCoreReliabilityQueryV1,
  type ProducerCoreReliabilityScorecardV1,
} from "@markorbit/persistence/producer-core-reliability-scorecard";
import {
  ensureReadyPackageV2DeliverySubmissionRegistry,
  type ReadyPackageV2DeliveryAuditEvent,
  type ReadyPackageV2DeliverySubmission,
} from "@markorbit/persistence/ready-package-v2-deliveries";
import { ensureReadyPackageV2Registry } from "@markorbit/persistence/ready-packages-v2";
import { ensureVaultOriginStagingVerification } from "@markorbit/persistence/vault-origin-staging-verification";
import { getRegistryDatabase } from "./source-registry";

type JsonRow = { value: string };
type AuditRow = {
  workspace_id: string;
  submission_id: string;
  ready_package_id: string;
  sequence: number;
  event_type: ReadyPackageV2DeliveryAuditEvent["type"];
  request_sha256: string;
  recorded_at: string;
  attempt_number: number | null;
  issue_code: string | null;
  http_status: number | null;
  result_status: ReadyPackageV2DeliveryAuditEvent["resultStatus"] | null;
};

function parseJsonRows<T>(rows: JsonRow[], label: string): T[] {
  return rows.map((row) => {
    try {
      return JSON.parse(row.value) as T;
    } catch (error) {
      throw new Error(`Invalid ${label} durable JSON`, { cause: error });
    }
  });
}

function selectJsonBefore<T>(
  database: DatabaseSync,
  table: string,
  jsonColumn: string,
  timeColumn: string,
  workspaceId: string,
  to: string,
  label: string,
): T[] {
  const rows = database
    .prepare(
      `SELECT ${jsonColumn} AS value FROM ${table}
       WHERE workspace_id = ? AND ${timeColumn} < ?
       ORDER BY ${timeColumn} ASC`,
    )
    .all(workspaceId, to) as JsonRow[];
  return parseJsonRows<T>(rows, label);
}

function selectAuditBefore(
  database: DatabaseSync,
  workspaceId: string,
  to: string,
): ReadyPackageV2DeliveryAuditEvent[] {
  const rows = database
    .prepare(
      `SELECT workspace_id, submission_id, ready_package_id, sequence, event_type,
              request_sha256, recorded_at, attempt_number, issue_code, http_status, result_status
       FROM ready_package_v2_delivery_audit_events
       WHERE workspace_id = ? AND recorded_at < ?
       ORDER BY submission_id ASC, sequence ASC`,
    )
    .all(workspaceId, to) as AuditRow[];
  return rows.map((row) => ({
    workspaceId: row.workspace_id,
    submissionId: row.submission_id,
    readyPackageId: row.ready_package_id,
    sequence: row.sequence,
    type: row.event_type,
    requestSha256: row.request_sha256,
    recordedAt: row.recorded_at,
    ...(row.attempt_number === null ? {} : { attemptNumber: row.attempt_number }),
    ...(row.issue_code === null ? {} : { issueCode: row.issue_code }),
    ...(row.http_status === null ? {} : { httpStatus: row.http_status }),
    ...(row.result_status === null ? {} : { resultStatus: row.result_status }),
  }));
}

function ensureDurableEvidenceTables(database: DatabaseSync): void {
  ensureVaultOriginStagingVerification(database);
  ensureCanonicalDownstreamDocumentRegistry(database);
  ensureReadyPackageV2Registry(database);
  ensureReadyPackageV2DeliverySubmissionRegistry(database);
}

export function getProducerCoreReliabilityScorecard(
  query: ProducerCoreReliabilityQueryV1,
  database: DatabaseSync = getRegistryDatabase(),
): ProducerCoreReliabilityScorecardV1 {
  ensureDurableEvidenceTables(database);

  const stagingDocuments = selectJsonBefore<VaultOriginStagingDocumentV1>(
    database,
    "vault_origin_staging_documents",
    "document_json",
    "imported_at",
    query.workspaceId,
    query.window.to,
    "Vault-origin staging document",
  );
  const verifications = selectJsonBefore<VaultOriginStagingVerificationEvidenceV1>(
    database,
    "vault_origin_staging_verifications",
    "evidence_json",
    "created_at",
    query.workspaceId,
    query.window.to,
    "Vault-origin verification",
  );
  const finalizations = selectJsonBefore<VaultOriginStagingFinalizationV1>(
    database,
    "vault_origin_staging_finalizations",
    "finalization_json",
    "finalized_at",
    query.workspaceId,
    query.window.to,
    "Vault-origin finalization",
  );
  const canonicalDocuments = selectJsonBefore<CanonicalDownstreamDocumentV1>(
    database,
    "canonical_downstream_documents",
    "document_json",
    "promoted_at",
    query.workspaceId,
    query.window.to,
    "canonical downstream document",
  );
  const readyPackages = selectJsonBefore<ReadyPackageV2>(
    database,
    "ready_packages_v2",
    "document_json",
    "created_at",
    query.workspaceId,
    query.window.to,
    "ReadyPackage V2",
  );
  const submissions = selectJsonBefore<ReadyPackageV2DeliverySubmission>(
    database,
    "ready_package_v2_delivery_submissions",
    "document_json",
    "created_at",
    query.workspaceId,
    query.window.to,
    "ReadyPackage V2 delivery submission",
  );
  const auditEvents = selectAuditBefore(database, query.workspaceId, query.window.to);
  const auditBySubmission = new Map<string, ReadyPackageV2DeliveryAuditEvent[]>();
  for (const event of auditEvents) {
    const events = auditBySubmission.get(event.submissionId) ?? [];
    events.push(event);
    auditBySubmission.set(event.submissionId, events);
  }

  return buildProducerCoreReliabilityScorecard(query, {
    stagingDocuments,
    verifications,
    finalizations,
    canonicalDocuments,
    readyPackages,
    deliveries: submissions.map((submission) => ({
      submission,
      auditEvents: auditBySubmission.get(submission.submissionId) ?? [],
    })),
  });
}
