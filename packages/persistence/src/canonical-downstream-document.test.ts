import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { VaultImportExecutionV1, VaultImportIntentV1 } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, initializeRegistry } from "./index";
import { SqliteCanonicalDownstreamDocumentRepository } from "./canonical-downstream-document";
import { SqliteVaultOriginStagingRepository } from "./vault-import-execution-registry";
import { SqliteVaultOriginStagingVerificationRepository } from "./vault-origin-staging-verification";

const roots: string[] = [];
const CONTENT = new TextEncoder().encode("hello canonical");
const CONTENT_SHA = "7b01fabb7e70bed8db5ebaeafe2a2e269e127dfc2b22acccf330f86198f0a48d";
const BINDING = {
  bindingId: "vlt_01K12TEST000000000000000001",
  revision: 7,
  relativeRoot: "MarkOrbit/Review",
} as const;

function storageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "markorbit-k12-staging-"));
  roots.push(root);
  return root;
}

function database(): DatabaseSync {
  const value = new DatabaseSync(":memory:");
  initializeRegistry(value);
  return value;
}

function makeFixture(content = CONTENT, contentSha = CONTENT_SHA) {
  const db = database();
  const root = storageRoot();
  const stagingRepository = new SqliteVaultOriginStagingRepository(
    db,
    root,
    () => new Date("2026-08-11T15:10:00.000Z"),
    () => "vst_01K12TEST000000000000000001",
  );
  const candidate = {
    vaultRelativePath: "MarkOrbit/Review/incoming/canonical.md",
    bindingRelativePath: "incoming/canonical.md",
    observedSha256: contentSha,
    sizeBytes: content.byteLength,
  } as const;
  const intent: VaultImportIntentV1 = {
    contractVersion: "1.0",
    objectType: "VAULT_IMPORT_INTENT",
    id: "vmi_01K12TEST000000000000000001",
    workspaceId: DEFAULT_WORKSPACE.id,
    idempotencyKey: "k12-review-1",
    inspection: {
      inspectionRunId: "vin_01K12TEST000000000000000001",
      rootFingerprintSha256: "a".repeat(64),
      observedAt: "2026-08-11T15:00:00.000Z",
      binding: BINDING,
    },
    candidate,
    action: "IMPORT_TO_STAGING",
    state: "PENDING_EXECUTION",
    reviewedAt: "2026-08-11T15:05:00.000Z",
  };
  const staged = stagingRepository.ingest({
    workspaceId: DEFAULT_WORKSPACE.id,
    importIntentId: intent.id,
    inspectionRunId: intent.inspection.inspectionRunId,
    binding: BINDING,
    candidate,
    content,
  }).document;
  const receipt = {
    vaultStagingDocumentId: staged.id,
    contentSha256: staged.contentHash.value,
    sizeBytes: staged.sizeBytes,
    contentAddressedRef: staged.contentAddressedRef,
    recordedAt: "2026-08-11T15:11:00.000Z",
  } as const;
  const execution: VaultImportExecutionV1 = {
    contractVersion: "1.0",
    objectType: "VAULT_IMPORT_EXECUTION",
    id: "vie_01K12TEST000000000000000001",
    workspaceId: DEFAULT_WORKSPACE.id,
    importIntentId: intent.id,
    state: "SUCCEEDED",
    rootFingerprintSha256: intent.inspection.rootFingerprintSha256,
    binding: BINDING,
    candidate,
    preparedAt: "2026-08-11T15:09:00.000Z",
    updatedAt: "2026-08-11T15:12:00.000Z",
    stagingReceipt: receipt,
    result: receipt,
  };
  const verifications = new SqliteVaultOriginStagingVerificationRepository(
    db,
    stagingRepository,
    () => new Date("2026-08-11T15:13:00.000Z"),
    () => "vsv_01K12TEST000000000000000001",
    () => "vsf_01K12TEST000000000000000001",
  );
  const verification = verifications.verify({
    workspaceId: DEFAULT_WORKSPACE.id,
    vaultStagingDocumentId: staged.id,
    idempotencyKey: "k12-verify-1",
  }).evidence;
  const finalization = verifications.finalize({
    workspaceId: DEFAULT_WORKSPACE.id,
    vaultStagingDocumentId: staged.id,
    idempotencyKey: "k12-finalize-1",
  }).finalization;
  const canonical = new SqliteCanonicalDownstreamDocumentRepository(
    db,
    () => new Date("2026-08-11T15:14:00.000Z"),
    () => "cdd_01K12TEST000000000000000001",
  );
  return {
    db,
    root,
    stagingRepository,
    intent,
    execution,
    staged,
    verification,
    finalization,
    canonical,
    content,
  };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("canonical downstream Vault-origin promotion", () => {
  it("persists the full reviewed Vault provenance chain without fabricating conversion provenance", () => {
    const fixture = makeFixture();
    const result = fixture.canonical.promoteVaultImport({
      workspaceId: DEFAULT_WORKSPACE.id,
      intent: fixture.intent,
      execution: fixture.execution,
      staging: fixture.staged,
      verification: fixture.verification,
      finalization: fixture.finalization,
      content: fixture.content,
    });

    expect(result.replayed).toBe(false);
    expect(result.document.status).toBe("READY");
    expect(result.document.origin.kind).toBe("VAULT_IMPORT");
    expect(result.document.origin.inspectionRunId).toBe(fixture.intent.inspection.inspectionRunId);
    expect(result.document.origin.importIntentId).toBe(fixture.intent.id);
    expect(result.document.origin.importExecutionId).toBe(fixture.execution.id);
    expect(result.document.origin.vaultStagingDocumentId).toBe(fixture.staged.id);
    expect(result.document.origin.verificationId).toBe(fixture.verification.id);
    expect(result.document.origin.finalizationId).toBe(fixture.finalization.id);
    expect(result.document.content.sha256).toBe(fixture.staged.contentHash.value);
    expect(JSON.stringify(result.document)).not.toMatch(
      /conversionRunId|rawArtifactId|workerId|converterId/u,
    );
  });

  it("replays the one-to-one immutable promotion across repository reopen", () => {
    const fixture = makeFixture();
    const input = {
      workspaceId: DEFAULT_WORKSPACE.id,
      intent: fixture.intent,
      execution: fixture.execution,
      staging: fixture.staged,
      verification: fixture.verification,
      finalization: fixture.finalization,
      content: fixture.content,
    };
    const first = fixture.canonical.promoteVaultImport(input);
    const reopened = new SqliteCanonicalDownstreamDocumentRepository(fixture.db);
    const replay = reopened.promoteVaultImport(input);

    expect(replay.replayed).toBe(true);
    expect(replay.document).toEqual(first.document);
    expect(reopened.getByVaultStagingDocument(DEFAULT_WORKSPACE.id, fixture.staged.id)).toEqual(
      first.document,
    );
  });

  it("rejects content bytes that no longer match the verified immutable CAS identity", () => {
    const fixture = makeFixture();
    expect(() =>
      fixture.canonical.promoteVaultImport({
        workspaceId: DEFAULT_WORKSPACE.id,
        intent: fixture.intent,
        execution: fixture.execution,
        staging: fixture.staged,
        verification: fixture.verification,
        finalization: fixture.finalization,
        content: new TextEncoder().encode("changed"),
      }),
    ).toThrowError(/does not match immutable Vault-origin Staging evidence/u);
    expect(fixture.canonical.list(DEFAULT_WORKSPACE.id)).toHaveLength(0);
  });

  it("rejects a mismatched execution receipt instead of repairing provenance", () => {
    const fixture = makeFixture();
    const execution: VaultImportExecutionV1 = {
      ...fixture.execution,
      result: { ...fixture.execution.result!, contentSha256: "b".repeat(64) },
    };
    expect(() =>
      fixture.canonical.promoteVaultImport({
        workspaceId: DEFAULT_WORKSPACE.id,
        intent: fixture.intent,
        execution,
        staging: fixture.staged,
        verification: fixture.verification,
        finalization: fixture.finalization,
        content: fixture.content,
      }),
    ).toThrowError(/receipt does not match the Staging document/u);
  });

  it("refuses BLOCKED finalization even when the underlying bytes are present", () => {
    const forged = new TextEncoder().encode("---\nmarkorbit.fake: forged\n---\nbody");
    const forgedSha = createHash("sha256").update(forged).digest("hex");
    const fixture = makeFixture(forged, forgedSha);
    expect(fixture.verification.outcome).toBe("FAIL");
    expect(fixture.finalization.state).toBe("BLOCKED");
    expect(() =>
      fixture.canonical.promoteVaultImport({
        workspaceId: DEFAULT_WORKSPACE.id,
        intent: fixture.intent,
        execution: fixture.execution,
        staging: fixture.staged,
        verification: fixture.verification,
        finalization: fixture.finalization,
        content: fixture.content,
      }),
    ).toThrowError(/requires passing verification/u);
  });
});
