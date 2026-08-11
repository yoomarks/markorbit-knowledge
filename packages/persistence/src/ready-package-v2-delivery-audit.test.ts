import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_DOWNSTREAM_DOCUMENT_CONTRACT_VERSION,
  CANONICAL_DOWNSTREAM_DOCUMENT_OBJECT_TYPE,
  CANONICAL_DOWNSTREAM_DOCUMENT_STATUS,
  READY_PACKAGE_CONTENT_EXPORT_V2_OBJECT_TYPE,
  READY_PACKAGE_CONTENT_EXPORT_V2_VERSION,
  READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION,
  READY_PACKAGE_V2_DELIVERY_RESULT_OBJECT_TYPE,
  type CanonicalDownstreamDocumentV1,
  type ReadyPackageContentExportV2,
  type ReadyPackageV2DeliveryResultV1,
} from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, initializeRegistry } from "./index";
import { ensureCanonicalDownstreamDocumentRegistry } from "./canonical-downstream-document";
import { SqliteReadyPackageV2RegistryRepository } from "./ready-package-v2-registry";
import { SqliteReadyPackageV2DeliverySubmissionRepository } from "./ready-package-v2-delivery-submission";

const CONTENT_SHA = "a".repeat(64);
const ROOT_SHA = "b".repeat(64);
const CORE_WORKSPACE = "123e4567-e89b-12d3-a456-426614174000";

function canonicalDocument(): CanonicalDownstreamDocumentV1 {
  return {
    contractVersion: CANONICAL_DOWNSTREAM_DOCUMENT_CONTRACT_VERSION,
    objectType: CANONICAL_DOWNSTREAM_DOCUMENT_OBJECT_TYPE,
    id: "cdd_01K15TEST000000000000000001",
    workspaceId: DEFAULT_WORKSPACE.id,
    status: CANONICAL_DOWNSTREAM_DOCUMENT_STATUS,
    origin: {
      kind: "VAULT_IMPORT",
      inspectionRunId: "vin_01K15TEST000000000000000001",
      importIntentId: "vmi_01K15TEST000000000000000001",
      importExecutionId: "vie_01K15TEST000000000000000001",
      vaultStagingDocumentId: "vst_01K15TEST000000000000000001",
      verificationId: "vsv_01K15TEST000000000000000001",
      verificationOutcome: "PASS",
      finalizationId: "vsf_01K15TEST000000000000000001",
      rootFingerprintSha256: ROOT_SHA,
      binding: {
        bindingId: "vlt_01K15TEST000000000000000001",
        revision: 5,
        relativeRoot: "MarkOrbit/Review",
      },
      vaultRelativePath: "MarkOrbit/Review/incoming/k15.md",
      bindingRelativePath: "incoming/k15.md",
      observedAt: "2026-08-11T17:00:00.000Z",
      reviewedAt: "2026-08-11T17:05:00.000Z",
      importedAt: "2026-08-11T17:10:00.000Z",
      verifiedAt: "2026-08-11T17:15:00.000Z",
    },
    content: {
      sha256: CONTENT_SHA,
      sizeBytes: 7,
      contentAddressedRef: `cas:sha256:${CONTENT_SHA}`,
      mediaType: "text/markdown",
      encoding: "utf-8",
    },
    legalTruthVerified: false,
    promotedAt: "2026-08-11T17:20:00.000Z",
  };
}

function setup() {
  const db = new DatabaseSync(":memory:");
  initializeRegistry(db);
  ensureCanonicalDownstreamDocumentRegistry(db);
  const document = canonicalDocument();
  db.prepare(
    `INSERT INTO canonical_downstream_documents
     (id, workspace_id, origin_kind, vault_staging_document_id, import_intent_id,
      verification_id, finalization_id, content_sha256, frozen_digest, status,
      document_json, promoted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    document.id,
    document.workspaceId,
    document.origin.kind,
    document.origin.vaultStagingDocumentId,
    document.origin.importIntentId,
    document.origin.verificationId,
    document.origin.finalizationId,
    document.content.sha256,
    "c".repeat(64),
    document.status,
    JSON.stringify(document),
    document.promotedAt,
  );
  const packages = new SqliteReadyPackageV2RegistryRepository(
    db,
    undefined,
    () => new Date("2026-08-11T17:25:00.000Z"),
    () => "rdp_01K15TEST000000000000000001",
  );
  const readyPackage = packages.createFromCanonical({
    workspaceId: DEFAULT_WORKSPACE.id,
    canonicalDocumentId: document.id,
  }).readyPackage;
  const contentExport: ReadyPackageContentExportV2 = {
    contractVersion: READY_PACKAGE_CONTENT_EXPORT_V2_VERSION,
    objectType: READY_PACKAGE_CONTENT_EXPORT_V2_OBJECT_TYPE,
    readyPackageId: readyPackage.id,
    knowledgeWorkspaceId: DEFAULT_WORKSPACE.id,
    readyPackageDigest: readyPackage.evidence.digest,
    canonicalDocument: { documentId: document.id, promotedAt: document.promotedAt },
    provenance: { origin: document.origin, legalTruthVerified: false },
    content: { ...document.content, content: "hello\n" },
  };
  return { db, readyPackage, contentExport };
}

function consumerResult(
  submissionId: string,
  readyPackageId: string,
  requestSha256: string,
): ReadyPackageV2DeliveryResultV1 {
  return {
    protocolVersion: READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION,
    objectType: READY_PACKAGE_V2_DELIVERY_RESULT_OBJECT_TYPE,
    deliveryId: submissionId,
    readyPackageId,
    status: "RECEIVED",
    requestSha256,
  };
}

describe("ReadyPackage V2 delivery audit timeline", () => {
  it("records one append-only sequence across unknown outcome, retry, result and finalization", () => {
    const { db, readyPackage, contentExport } = setup();
    let now = 0;
    const times = [
      "2026-08-11T17:30:00.000Z",
      "2026-08-11T17:31:00.000Z",
      "2026-08-11T17:32:00.000Z",
      "2026-08-11T17:33:00.000Z",
      "2026-08-11T17:34:00.000Z",
      "2026-08-11T17:35:00.000Z",
    ];
    const repository = new SqliteReadyPackageV2DeliverySubmissionRepository(
      db,
      () => new Date(times[now++] ?? times.at(-1)!),
      () => "rvd_01K15TEST000000000000000001",
    );
    const prepared = repository.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      readyPackage,
      coreWorkspaceId: CORE_WORKSPACE,
      contentExport,
    }).submission;
    repository.markTransportAttempt(DEFAULT_WORKSPACE.id, prepared.submissionId);
    repository.recordTransportUncertainty(DEFAULT_WORKSPACE.id, prepared.submissionId, {
      issueCode: "CORE_V2_DELIVERY_TIMEOUT",
      httpStatus: 504,
    });
    repository.markTransportAttempt(DEFAULT_WORKSPACE.id, prepared.submissionId);
    const received = consumerResult(prepared.submissionId, readyPackage.id, prepared.requestSha256);
    repository.recordTransportResult(DEFAULT_WORKSPACE.id, prepared.submissionId, received);
    repository.recordResult(DEFAULT_WORKSPACE.id, prepared.submissionId, received);

    const events = repository.listAuditEvents(DEFAULT_WORKSPACE.id, prepared.submissionId);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events.map((event) => event.type)).toEqual([
      "PREPARED",
      "TRANSPORT_ATTEMPT_STARTED",
      "TRANSPORT_OUTCOME_UNKNOWN",
      "TRANSPORT_ATTEMPT_STARTED",
      "TRANSPORT_RESULT_RECORDED",
      "FINALIZED",
    ]);
    expect(events[2]).toMatchObject({
      attemptNumber: 1,
      issueCode: "CORE_V2_DELIVERY_TIMEOUT",
      httpStatus: 504,
    });
    expect(events[4]).toMatchObject({ attemptNumber: 2, resultStatus: "RECEIVED" });
    expect(events[5]).toMatchObject({ attemptNumber: 2, resultStatus: "RECEIVED" });
    expect(JSON.stringify(events)).not.toContain("ready-package-v2-delivery:");
    expect(JSON.stringify(events)).not.toContain("hello");
  });

  it("rolls back the attempt counter if its matching audit event cannot be committed", () => {
    const { db, readyPackage, contentExport } = setup();
    const repository = new SqliteReadyPackageV2DeliverySubmissionRepository(
      db,
      () => new Date("2026-08-11T17:30:00.000Z"),
      () => "rvd_01K15TEST000000000000000001",
    );
    const prepared = repository.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      readyPackage,
      coreWorkspaceId: CORE_WORKSPACE,
      contentExport,
    }).submission;

    db.exec(`
      CREATE TRIGGER block_k15_attempt_audit
      BEFORE INSERT ON ready_package_v2_delivery_audit_events
      WHEN NEW.event_type = 'TRANSPORT_ATTEMPT_STARTED'
      BEGIN
        SELECT RAISE(ABORT, 'blocked audit insert');
      END;
    `);

    expect(() =>
      repository.markTransportAttempt(DEFAULT_WORKSPACE.id, prepared.submissionId),
    ).toThrowError(/blocked audit insert/u);

    const reopened = new SqliteReadyPackageV2DeliverySubmissionRepository(db);
    expect(
      reopened.getByReadyPackage(DEFAULT_WORKSPACE.id, readyPackage.id)?.transportAttempts,
    ).toBe(0);
    expect(
      reopened
        .listAuditEvents(DEFAULT_WORKSPACE.id, prepared.submissionId)
        .map((event) => event.type),
    ).toEqual(["PREPARED"]);
  });

  it("replays one unknown-outcome event per attempt and rejects conflicting evidence", () => {
    const { db, readyPackage, contentExport } = setup();
    let now = 0;
    const times = [
      "2026-08-11T17:30:00.000Z",
      "2026-08-11T17:31:00.000Z",
      "2026-08-11T17:32:00.000Z",
    ];
    const repository = new SqliteReadyPackageV2DeliverySubmissionRepository(
      db,
      () => new Date(times[now++] ?? times.at(-1)!),
      () => "rvd_01K15TEST000000000000000001",
    );
    const prepared = repository.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      readyPackage,
      coreWorkspaceId: CORE_WORKSPACE,
      contentExport,
    }).submission;
    repository.markTransportAttempt(DEFAULT_WORKSPACE.id, prepared.submissionId);
    const first = repository.recordTransportUncertainty(
      DEFAULT_WORKSPACE.id,
      prepared.submissionId,
      { issueCode: "CORE_V2_DELIVERY_UNAVAILABLE", httpStatus: 502 },
    );
    const replay = repository.recordTransportUncertainty(
      DEFAULT_WORKSPACE.id,
      prepared.submissionId,
      { issueCode: "CORE_V2_DELIVERY_UNAVAILABLE", httpStatus: 502 },
    );

    expect(replay).toEqual(first);
    expect(() =>
      repository.recordTransportUncertainty(DEFAULT_WORKSPACE.id, prepared.submissionId, {
        issueCode: "CORE_V2_DELIVERY_TIMEOUT",
        httpStatus: 504,
      }),
    ).toThrowError(/different unknown-outcome event/u);
    expect(repository.listAuditEvents(DEFAULT_WORKSPACE.id, prepared.submissionId)).toHaveLength(3);
  });
});
