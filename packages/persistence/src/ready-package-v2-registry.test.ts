import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_DOWNSTREAM_DOCUMENT_CONTRACT_VERSION,
  CANONICAL_DOWNSTREAM_DOCUMENT_OBJECT_TYPE,
  CANONICAL_DOWNSTREAM_DOCUMENT_STATUS,
  type CanonicalDownstreamDocumentV1,
} from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, initializeRegistry } from "./index";
import { ensureCanonicalDownstreamDocumentRegistry } from "./canonical-downstream-document";
import { SqliteReadyPackageV2RegistryRepository } from "./ready-package-v2-registry";

const CONTENT_SHA = "a".repeat(64);
const ROOT_SHA = "b".repeat(64);

function canonicalDocument(): CanonicalDownstreamDocumentV1 {
  return {
    contractVersion: CANONICAL_DOWNSTREAM_DOCUMENT_CONTRACT_VERSION,
    objectType: CANONICAL_DOWNSTREAM_DOCUMENT_OBJECT_TYPE,
    id: "cdd_01K13TEST000000000000000001",
    workspaceId: DEFAULT_WORKSPACE.id,
    status: CANONICAL_DOWNSTREAM_DOCUMENT_STATUS,
    origin: {
      kind: "VAULT_IMPORT",
      inspectionRunId: "vin_01K13TEST000000000000000001",
      importIntentId: "vmi_01K13TEST000000000000000001",
      importExecutionId: "vie_01K13TEST000000000000000001",
      vaultStagingDocumentId: "vst_01K13TEST000000000000000001",
      verificationId: "vsv_01K13TEST000000000000000001",
      verificationOutcome: "PASS",
      finalizationId: "vsf_01K13TEST000000000000000001",
      rootFingerprintSha256: ROOT_SHA,
      binding: {
        bindingId: "vlt_01K13TEST000000000000000001",
        revision: 3,
        relativeRoot: "MarkOrbit/Review",
      },
      vaultRelativePath: "MarkOrbit/Review/incoming/k13.md",
      bindingRelativePath: "incoming/k13.md",
      observedAt: "2026-08-11T15:00:00.000Z",
      reviewedAt: "2026-08-11T15:05:00.000Z",
      importedAt: "2026-08-11T15:10:00.000Z",
      verifiedAt: "2026-08-11T15:15:00.000Z",
    },
    content: {
      sha256: CONTENT_SHA,
      sizeBytes: 123,
      contentAddressedRef: `cas:sha256:${CONTENT_SHA}`,
      mediaType: "text/markdown",
      encoding: "utf-8",
    },
    legalTruthVerified: false,
    promotedAt: "2026-08-11T15:20:00.000Z",
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

describe("ReadyPackage V2 registry", () => {
  it("freezes authoritative canonical provenance without conversion fabrication", () => {
    const db = database();
    const repository = new SqliteReadyPackageV2RegistryRepository(
      db,
      undefined,
      () => new Date("2026-08-11T15:25:00.000Z"),
      () => "rdp_01K13TEST000000000000000001",
    );

    const result = repository.createFromCanonical({
      workspaceId: DEFAULT_WORKSPACE.id,
      canonicalDocumentId: canonicalDocument().id,
    });

    expect(result.replayed).toBe(false);
    expect(result.readyPackage.contractVersion).toBe("2.0");
    expect(result.readyPackage.status).toBe("VERIFIED");
    expect(result.readyPackage.evidence.canonicalDocumentId).toBe(canonicalDocument().id);
    expect(result.readyPackage.evidence.origin.kind).toBe("VAULT_IMPORT");
    expect(result.readyPackage.evidence.origin.importExecutionId).toBe(
      canonicalDocument().origin.importExecutionId,
    );
    expect(result.readyPackage.evidence.content.sha256).toBe(CONTENT_SHA);
    expect(result.readyPackage.evidence.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(result.readyPackage)).not.toMatch(
      /sourceId|rawArtifactId|conversionRunId|workerId|converterId/u,
    );
  });

  it("replays one immutable package per canonical document across repository reopen", () => {
    const db = database();
    const firstRepository = new SqliteReadyPackageV2RegistryRepository(
      db,
      undefined,
      () => new Date("2026-08-11T15:25:00.000Z"),
      () => "rdp_01K13TEST000000000000000001",
    );
    const input = {
      workspaceId: DEFAULT_WORKSPACE.id,
      canonicalDocumentId: canonicalDocument().id,
    };
    const first = firstRepository.createFromCanonical(input);
    const reopened = new SqliteReadyPackageV2RegistryRepository(db);
    const replay = reopened.createFromCanonical(input);

    expect(replay.replayed).toBe(true);
    expect(replay.readyPackage).toEqual(first.readyPackage);
    expect(reopened.list(DEFAULT_WORKSPACE.id)).toEqual([first.readyPackage]);
  });

  it("does not allow request-body provenance because creation resolves the canonical ledger by id", () => {
    const db = database();
    const repository = new SqliteReadyPackageV2RegistryRepository(db);

    expect(() =>
      repository.createFromCanonical({
        workspaceId: DEFAULT_WORKSPACE.id,
        canonicalDocumentId: "cdd_missing",
      }),
    ).toThrowError(/was not found/u);
    expect(repository.list(DEFAULT_WORKSPACE.id)).toHaveLength(0);
  });

  it("keeps V1 ReadyPackage storage untouched", () => {
    const db = database();
    const repository = new SqliteReadyPackageV2RegistryRepository(db);
    repository.createFromCanonical({
      workspaceId: DEFAULT_WORKSPACE.id,
      canonicalDocumentId: canonicalDocument().id,
    });

    const legacyTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ready_packages'")
      .get();
    expect(legacyTable).toBeUndefined();
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM ready_packages_v2").get() as { count: number },
    ).toEqual({ count: 1 });
  });
});
