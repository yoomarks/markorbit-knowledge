import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentRelationshipReadRepository } from "@markorbit/persistence/content-relationship-obsidian-export";
import type { ExecuteKnowledgeRelationshipVaultExportInput } from "@markorbit/persistence/knowledge-relationship-vault-export";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const roots: string[] = [];

function resetProductionRegistry(): void {
  delete (globalThis as typeof globalThis & { markorbitRegistries?: unknown }).markorbitRegistries;
}

const relationships: ContentRelationshipReadRepository = {
  listFacets: () => [],
  listNeighbors: () => ({ items: [], total: 0, limit: 200, offset: 0 }),
};

afterEach(() => {
  resetProductionRegistry();
  delete process.env.MARKORBIT_KNOWLEDGE_DB_PATH;
  delete process.env.MARKORBIT_ARTIFACT_STORE_PATH;
  delete process.env.MARKORBIT_STAGING_STORE_PATH;
  delete process.env.MARKORBIT_MANUAL_UPLOAD_MAX_BYTES;
  vi.resetModules();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe("Knowledge relationship production READY-to-Vault acceptance", () => {
  it("runs governed ingestion through READY staging, writes the deterministic Vault note, and replays without rewriting", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "markorbit-kg-vault-export-"));
    roots.push(tempRoot);
    const vaultRoot = join(tempRoot, "vault");
    process.env.MARKORBIT_KNOWLEDGE_DB_PATH = join(tempRoot, "knowledge.sqlite");
    process.env.MARKORBIT_ARTIFACT_STORE_PATH = join(tempRoot, "artifacts");
    process.env.MARKORBIT_STAGING_STORE_PATH = join(tempRoot, "staging");
    process.env.MARKORBIT_MANUAL_UPLOAD_MAX_BYTES = String(1024 * 1024);
    resetProductionRegistry();
    vi.resetModules();

    const { executeKnowledgeRelationshipVaultExport } =
      await import("@markorbit/persistence/knowledge-relationship-vault-export");
    const { LocalObsidianVaultProjectionRepository } =
      await import("@markorbit/persistence/obsidian-vault-projection");
    const { SqliteVaultExportRunRepository } =
      await import("@markorbit/persistence/vault-export-runs");
    const { ProductionKnowledgeRelationshipReadyStagingGateway } =
      await import("../knowledge-relationship-ready-staging-gateway");
    const {
      getConversionRunLedgerRepository,
      getReadyPackageRepository,
      getRegistryDatabase,
      getStagingContentRepository,
      getStagingVerificationRepository,
    } = await import("../source-registry");

    const staging = getStagingContentRepository();
    const exportRuns = new SqliteVaultExportRunRepository(getRegistryDatabase());
    const projection = new LocalObsidianVaultProjectionRepository(staging, vaultRoot);
    const gateway = new ProductionKnowledgeRelationshipReadyStagingGateway();
    const request: ExecuteKnowledgeRelationshipVaultExportInput = {
      note: {
        content: {
          protocolVersion: "1.0",
          objectType: "CONTENT_OBJECT_REF",
          objectId: "web:article:kg-production-acceptance",
          objectKind: "WEB_CONTENT",
          workspaceId,
        },
        title: "KG Production Acceptance",
        bodyMarkdown: "Relationship-aware Knowledge export body.",
        sourceRef: "https://example.invalid/kg-production-acceptance",
        access: {
          authorized: true,
          workspaceId,
          classification: "INTERNAL",
        },
      },
      rootFingerprintSha256: "a".repeat(64),
      binding: {
        bindingId: "vlt_kg_production_acceptance",
        revision: 1,
        relativeRoot: "knowledge-export",
      },
    };

    let first;
    try {
      first = await executeKnowledgeRelationshipVaultExport(
        { relationships, staging: gateway, exportRuns, projection },
        request,
      );
    } catch (error) {
      const documents = staging.listDocuments({ workspaceId, limit: 100 }).items;
      const evidence = documents.map((document) => ({
        id: document.descriptor.id,
        status: document.descriptor.status,
        validation: document.descriptor.validation,
        verification: getStagingVerificationRepository().getByDocument(
          document.descriptor.id,
          workspaceId,
        ),
      }));
      throw new Error(
        `KG004_FULL_VAULT_STAGING_DIAGNOSTIC ${JSON.stringify({
          cause: error instanceof Error ? error.message : String(error),
          evidence,
        })}`,
      );
    }

    expect(first.run.state).toBe("SUCCEEDED");
    expect(first.staging.targetPath).toBe(first.artifact.targetPath);
    expect(first.artifact.targetPath).toMatch(/^knowledge\/.+\.md$/u);
    expect(first.projection.vaultRelativePath).toBe(`${workspaceId}/${first.artifact.targetPath}`);
    expect(first.projection.written).toBe(true);

    const stagedRecord = staging.getDocument(first.staging.stagingDocumentId, workspaceId);
    expect(stagedRecord?.descriptor.status).toBe("READY");
    expect(stagedRecord?.descriptor.targetPath).toBe(first.artifact.targetPath);
    expect(stagedRecord?.descriptor.contentHash.value).toBe(first.staging.contentSha256);
    const stagedMarkdown = new TextDecoder().decode(
      staging.readContent(first.staging.stagingDocumentId, workspaceId),
    );
    expect(stagedMarkdown.match(/^---$/gmu)).toHaveLength(2);
    expect(stagedMarkdown).toContain("markorbit:");
    expect(stagedMarkdown).toContain('knowledge_id: "web:article:kg-production-acceptance"');
    expect(stagedMarkdown).toContain("Relationship-aware Knowledge export body.");

    const projectedPath = join(vaultRoot, workspaceId, first.artifact.targetPath);
    expect(readFileSync(projectedPath, "utf8")).toBe(stagedMarkdown);

    const readyPackages = getReadyPackageRepository().list(workspaceId);
    expect(readyPackages).toHaveLength(1);
    expect(readyPackages[0]?.evidence.stagingDocumentId).toBe(first.staging.stagingDocumentId);

    const second = await executeKnowledgeRelationshipVaultExport(
      { relationships, staging: gateway, exportRuns, projection },
      request,
    );
    expect(second.run.id).toBe(first.run.id);
    expect(second.staging.stagingDocumentId).toBe(first.staging.stagingDocumentId);
    expect(second.projection.written).toBe(false);
    expect(readFileSync(projectedPath, "utf8")).toBe(stagedMarkdown);

    const conversionRuns = getConversionRunLedgerRepository().list({
      workspaceId,
      converterId: "builtin-markdown-staging",
      limit: 100,
    });
    expect(conversionRuns.items).toHaveLength(1);
    expect(conversionRuns.items[0]?.status).toBe("COMPLETED");
    expect(staging.listDocuments({ workspaceId, limit: 100 }).total).toBe(1);
  }, 30_000);
});
