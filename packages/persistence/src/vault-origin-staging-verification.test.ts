import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, initializeRegistry } from "./index";
import { SqliteVaultOriginStagingRepository } from "./vault-import-execution-registry";
import { SqliteVaultOriginStagingVerificationRepository } from "./vault-origin-staging-verification";

const roots: string[] = [];
const BINDING = {
  bindingId: "vlt_01K11TEST000000000000000001",
  revision: 5,
  relativeRoot: "MarkOrbit/Review",
} as const;

function database(): DatabaseSync {
  const value = new DatabaseSync(":memory:");
  initializeRegistry(value);
  return value;
}

function storageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "markorbit-k11-staging-"));
  roots.push(root);
  return root;
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function ingest(staging: SqliteVaultOriginStagingRepository, suffix: string, markdown: string) {
  const content = new TextEncoder().encode(markdown);
  const contentHash = hash(content);
  return staging.ingest({
    workspaceId: DEFAULT_WORKSPACE.id,
    importIntentId: `vmi_01K11TEST0000000000000000${suffix}`,
    inspectionRunId: `vin_01K11TEST0000000000000000${suffix}`,
    binding: BINDING,
    candidate: {
      vaultRelativePath: `MarkOrbit/Review/incoming/${suffix}.md`,
      bindingRelativePath: `incoming/${suffix}.md`,
      observedSha256: contentHash,
      sizeBytes: content.byteLength,
    },
    content,
  }).document;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("Vault-origin Staging verification", () => {
  it("verifies immutable CAS Markdown and finalizes a passing document without rereading Vault", () => {
    const db = database();
    const root = storageRoot();
    const staging = new SqliteVaultOriginStagingRepository(db, root);
    const document = ingest(staging, "01", "---\ntitle: Imported note\n---\n# Hello\n");
    const repository = new SqliteVaultOriginStagingVerificationRepository(
      db,
      staging,
      () => new Date("2026-08-11T15:00:00.000Z"),
      () => "vsv_01K11TEST000000000000000001",
      () => "vsf_01K11TEST000000000000000001",
    );

    const first = repository.verify({
      workspaceId: DEFAULT_WORKSPACE.id,
      vaultStagingDocumentId: document.id,
      idempotencyKey: "verify-01",
    });
    expect(first.replayed).toBe(false);
    expect(first.evidence.outcome).toBe("PASS");
    expect(first.evidence.contentSha256).toBe(document.contentHash.value);

    const replay = repository.verify({
      workspaceId: DEFAULT_WORKSPACE.id,
      vaultStagingDocumentId: document.id,
      idempotencyKey: "verify-01",
    });
    expect(replay.replayed).toBe(true);
    expect(replay.evidence).toEqual(first.evidence);

    rmSync(root, { recursive: true, force: true });
    const finalized = repository.finalize({
      workspaceId: DEFAULT_WORKSPACE.id,
      vaultStagingDocumentId: document.id,
      idempotencyKey: "finalize-01",
    });
    expect(finalized.finalization.state).toBe("VERIFIED");
    expect(finalized.finalization.verificationId).toBe(first.evidence.id);
    expect(finalized.replayed).toBe(false);
    expect(
      repository.finalize({
        workspaceId: DEFAULT_WORKSPACE.id,
        vaultStagingDocumentId: document.id,
        idempotencyKey: "finalize-01",
      }).replayed,
    ).toBe(true);
  });

  it("blocks Vault-authored markorbit provenance claims", () => {
    const db = database();
    const staging = new SqliteVaultOriginStagingRepository(db, storageRoot());
    const document = ingest(
      staging,
      "02",
      "---\nmarkorbit.workspaceId: wsp_forged\ntitle: forged\n---\n# Body\n",
    );
    const repository = new SqliteVaultOriginStagingVerificationRepository(db, staging);
    const verification = repository.verify({
      workspaceId: DEFAULT_WORKSPACE.id,
      vaultStagingDocumentId: document.id,
      idempotencyKey: "verify-02",
    });
    expect(verification.evidence.outcome).toBe("FAIL");
    expect(
      verification.evidence.checks.find(
        (item) => item.code === "MARKORBIT_RESERVED_NAMESPACE_CLEAR",
      )?.status,
    ).toBe("FAIL");
    expect(
      repository.finalize({
        workspaceId: DEFAULT_WORKSPACE.id,
        vaultStagingDocumentId: document.id,
        idempotencyKey: "finalize-02",
      }).finalization.state,
    ).toBe("BLOCKED");
  });

  it("records empty Markdown as PASS_WITH_WARNINGS instead of fabricating content", () => {
    const db = database();
    const staging = new SqliteVaultOriginStagingRepository(db, storageRoot());
    const document = ingest(staging, "03", "");
    const repository = new SqliteVaultOriginStagingVerificationRepository(db, staging);
    const verification = repository.verify({
      workspaceId: DEFAULT_WORKSPACE.id,
      vaultStagingDocumentId: document.id,
      idempotencyKey: "verify-03",
    });
    expect(verification.evidence.outcome).toBe("PASS_WITH_WARNINGS");
    expect(verification.evidence.warnings).toContain("Markdown body is empty");
  });

  it("fails malformed frontmatter and refuses finalization before verification", () => {
    const db = database();
    const staging = new SqliteVaultOriginStagingRepository(db, storageRoot());
    const document = ingest(staging, "04", "---\ntitle: missing close\n# Body\n");
    const repository = new SqliteVaultOriginStagingVerificationRepository(db, staging);

    expect(() =>
      repository.finalize({
        workspaceId: DEFAULT_WORKSPACE.id,
        vaultStagingDocumentId: document.id,
        idempotencyKey: "finalize-04",
      }),
    ).toThrowError(/verification evidence/u);

    const verification = repository.verify({
      workspaceId: DEFAULT_WORKSPACE.id,
      vaultStagingDocumentId: document.id,
      idempotencyKey: "verify-04",
    });
    expect(verification.evidence.outcome).toBe("FAIL");
  });

  it("persists decisions across repository reopen and keeps one immutable decision per document", () => {
    const db = database();
    const staging = new SqliteVaultOriginStagingRepository(db, storageRoot());
    const document = ingest(staging, "05", "# Stable\n");
    const first = new SqliteVaultOriginStagingVerificationRepository(db, staging);
    const verification = first.verify({
      workspaceId: DEFAULT_WORKSPACE.id,
      vaultStagingDocumentId: document.id,
      idempotencyKey: "verify-05",
    });
    const finalization = first.finalize({
      workspaceId: DEFAULT_WORKSPACE.id,
      vaultStagingDocumentId: document.id,
      idempotencyKey: "finalize-05",
    });

    const reopened = new SqliteVaultOriginStagingVerificationRepository(db, staging);
    expect(reopened.getVerificationByDocument(DEFAULT_WORKSPACE.id, document.id)).toEqual(
      verification.evidence,
    );
    expect(reopened.getFinalizationByDocument(DEFAULT_WORKSPACE.id, document.id)).toEqual(
      finalization.finalization,
    );
    expect(() =>
      reopened.verify({
        workspaceId: DEFAULT_WORKSPACE.id,
        vaultStagingDocumentId: document.id,
        idempotencyKey: "another-key",
      }),
    ).toThrowError(/already has verification evidence/u);
  });
});
