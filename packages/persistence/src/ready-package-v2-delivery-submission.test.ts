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
    id: "cdd_01K14TEST000000000000000001",
    workspaceId: DEFAULT_WORKSPACE.id,
    status: CANONICAL_DOWNSTREAM_DOCUMENT_STATUS,
    origin: {
      kind: "VAULT_IMPORT",
      inspectionRunId: "vin_01K14TEST000000000000000001",
      importIntentId: "vmi_01K14TEST000000000000000001",
      importExecutionId: "vie_01K14TEST000000000000000001",
      vaultStagingDocumentId: "vst_01K14TEST000000000000000001",
      verificationId: "vsv_01K14TEST000000000000000001",
      verificationOutcome: "PASS",
      finalizationId: "vsf_01K14TEST000000000000000001",
      rootFingerprintSha256: ROOT_SHA,
      binding: {
        bindingId: "vlt_01K14TEST000000000000000001",
        revision: 4,
        relativeRoot: "MarkOrbit/Review",
      },
      vaultRelativePath: "MarkOrbit/Review/incoming/k14.md",
      bindingRelativePath: "incoming/k14.md",
      observedAt: "2026-08-11T16:00:00.000Z",
      reviewedAt: "2026-08-11T16:05:00.000Z",
      importedAt: "2026-08-11T16:10:00.000Z",
      verifiedAt: "2026-08-11T16:15:00.000Z",
    },
    content: {
      sha256: CONTENT_SHA,
      sizeBytes: 7,
      contentAddressedRef: `cas:sha256:${CONTENT_SHA}`,
      mediaType: "text/markdown",
      encoding: "utf-8",
    },
    legalTruthVerified: false,
    promotedAt: "2026-08-11T16:20:00.000Z",
  };
}

function database(): DatabaseSync {
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
  return db;
}

function setup() {
  const db = database();
  const packages = new SqliteReadyPackageV2RegistryRepository(
    db,
    undefined,
    () => new Date("2026-08-11T16:25:00.000Z"),
    () => "rdp_01K14TEST000000000000000001",
  );
  const readyPackage = packages.createFromCanonical({
    workspaceId: DEFAULT_WORKSPACE.id,
    canonicalDocumentId: canonicalDocument().id,
  }).readyPackage;
  const contentExport: ReadyPackageContentExportV2 = {
    contractVersion: READY_PACKAGE_CONTENT_EXPORT_V2_VERSION,
    objectType: READY_PACKAGE_CONTENT_EXPORT_V2_OBJECT_TYPE,
    readyPackageId: readyPackage.id,
    knowledgeWorkspaceId: DEFAULT_WORKSPACE.id,
    readyPackageDigest: readyPackage.evidence.digest,
    canonicalDocument: {
      documentId: canonicalDocument().id,
      promotedAt: canonicalDocument().promotedAt,
    },
    provenance: {
      origin: canonicalDocument().origin,
      legalTruthVerified: false,
    },
    content: {
      ...canonicalDocument().content,
      content: "hello\n",
    },
  };
  return { db, readyPackage, contentExport };
}

function result(submissionId: string, readyPackageId: string, requestSha256: string): ReadyPackageV2DeliveryResultV1 {
  return {
    protocolVersion: READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION,
    objectType: READY_PACKAGE_V2_DELIVERY_RESULT_OBJECT_TYPE,
    deliveryId: submissionId,
    readyPackageId,
    status: "RECEIVED",
    requestSha256,
  };
}

describe("ReadyPackage V2 delivery submission registry", () => {
  it("freezes one exact request and replays it across repository reopen", () => {
    const { db, readyPackage, contentExport } = setup();
    const repository = new SqliteReadyPackageV2DeliverySubmissionRepository(
      db,
      () => new Date("2026-08-11T16:30:00.000Z"),
      () => "rvd_01K14TEST000000000000000001",
    );
    const first = repository.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      readyPackage,
      coreWorkspaceId: CORE_WORKSPACE,
      contentExport,
    });
    const reopened = new SqliteReadyPackageV2DeliverySubmissionRepository(db);
    const replay = reopened.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      readyPackage,
      coreWorkspaceId: CORE_WORKSPACE,
      contentExport,
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.submission).toEqual(first.submission);
    expect(first.submission.transportAttempts).toBe(0);
    expect(first.submission.requestSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.submission.contentExportSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.submission.requestJson).toContain("READY_PACKAGE_V2_DELIVERY_REQUEST");
    expect(first.submission.requestJson).toContain(CORE_WORKSPACE);
  });

  it("persists attempt evidence before outcome and finalizes only from the durable transport result", () => {
    const { db, readyPackage, contentExport } = setup();
    let now = 0;
    const times = [
      "2026-08-11T16:30:00.000Z",
      "2026-08-11T16:31:00.000Z",
      "2026-08-11T16:32:00.000Z",
      "2026-08-11T16:33:00.000Z",
    ];
    const repository = new SqliteReadyPackageV2DeliverySubmissionRepository(
      db,
      () => new Date(times[now++] ?? times.at(-1)!),
      () => "rvd_01K14TEST000000000000000001",
    );
    const prepared = repository.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      readyPackage,
      coreWorkspaceId: CORE_WORKSPACE,
      contentExport,
    }).submission;
    const attempted = repository.markTransportAttempt(DEFAULT_WORKSPACE.id, prepared.submissionId);
    const received = result(prepared.submissionId, readyPackage.id, prepared.requestSha256);

    expect(attempted.state).toBe("PENDING");
    expect(attempted.transportAttempts).toBe(1);
    expect(attempted.transportResult).toBeUndefined();
    expect(() =>
      repository.recordResult(DEFAULT_WORKSPACE.id, prepared.submissionId, received),
    ).toThrowError(/durable transport result/u);

    const transportRecorded = repository.recordTransportResult(
      DEFAULT_WORKSPACE.id,
      prepared.submissionId,
      received,
    );
    expect(transportRecorded.state).toBe("PENDING");
    expect(transportRecorded.transportResult?.status).toBe("RECEIVED");

    const finalized = repository.recordResult(
      DEFAULT_WORKSPACE.id,
      prepared.submissionId,
      received,
    );
    expect(finalized.state).toBe("RESULT_RECORDED");
    expect(finalized.result?.status).toBe("RECEIVED");
  });

  it("rejects changes to frozen target or content export", () => {
    const { db, readyPackage, contentExport } = setup();
    const repository = new SqliteReadyPackageV2DeliverySubmissionRepository(
      db,
      () => new Date("2026-08-11T16:30:00.000Z"),
      () => "rvd_01K14TEST000000000000000001",
    );
    repository.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      readyPackage,
      coreWorkspaceId: CORE_WORKSPACE,
      contentExport,
    });

    expect(() =>
      repository.prepare({
        workspaceId: DEFAULT_WORKSPACE.id,
        readyPackage,
        coreWorkspaceId: "223e4567-e89b-12d3-a456-426614174000",
        contentExport,
      }),
    ).toThrowError(/already frozen/u);
    expect(() =>
      repository.prepare({
        workspaceId: DEFAULT_WORKSPACE.id,
        readyPackage,
        coreWorkspaceId: CORE_WORKSPACE,
        contentExport: {
          ...contentExport,
          content: { ...contentExport.content, content: "changed\n" },
        },
      }),
    ).toThrowError(/already frozen/u);
  });
});
