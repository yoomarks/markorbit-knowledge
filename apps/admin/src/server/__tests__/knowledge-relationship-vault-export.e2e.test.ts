import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import type { ContentRelationshipReadRepository } from "@markorbit/persistence/content-relationship-obsidian-export";
import { executeKnowledgeRelationshipVaultExport } from "@markorbit/persistence/knowledge-relationship-vault-export";
import { LocalObsidianVaultProjectionRepository } from "@markorbit/persistence/obsidian-vault-projection";
import { SqliteVaultExportRunRepository } from "@markorbit/persistence/vault-export-runs";
import { ProductionKnowledgeRelationshipReadyStagingGateway } from "../knowledge-relationship-ready-staging-gateway";
import {
  getConversionRunLedgerRepository,
  getReadyPackageRepository,
  getRegistryDatabase,
  getStagingContentRepository,
} from "../source-registry";

const tempRoot = mkdtempSync(join(tmpdir(), "markorbit-kg-vault-export-"));
const vaultRoot = join(tempRoot, "vault");

beforeAll(() => {
  process.env.MARKORBIT_KNOWLEDGE_DB_PATH = join(tempRoot, "knowledge.sqlite");
  process.env.MARKORBIT_ARTIFACT_STORE_PATH = join(tempRoot, "artifacts");
  process.env.MARKORBIT_STAGING_STORE_PATH = join(tempRoot, "staging");
  process.env.MARKORBIT_MANUAL_UPLOAD_MAX_BYTES = String(1024 * 1024);
});

afterAll(() => {
  delete process.env.MARKORBIT_KNOWLEDGE_DB_PATH;
  delete process.env.MARKORBIT_ARTIFACT_STORE_PATH;
  delete process.env.MARKORBIT_STAGING_STORE_PATH;
  delete process.env.MARKORBIT_MANUAL_UPLOAD_MAX_BYTES;
  rmSync(tempRoot, { recursive: true, force: true });
});

const relationships: ContentRelationshipReadRepository = {
  listFacets: () => [],
  listNeighbors: () => ({ items: [], total: 0, limit: 200, offset: 0 }),
};

describe("Knowledge relationship production READY-to-Vault acceptance", () => {
  it("runs governed ingestion through READY staging, writes the deterministic Vault note, and replays without rewriting", async () => {
    const staging = getStagingContentRepository();
    const exportRuns = new SqliteVaultExportRunRepository(getRegistryDatabase());
    const projection = new LocalObsidianVaultProjectionRepository(staging, vaultRoot);
    const gateway = new ProductionKnowledgeRelationshipReadyStagingGateway();
    const request = {
      note: {
        content: {
          protocolVersion: "1.0" as const,
          objectType: "CONTENT_OBJECT_REF" as const,
          objectId: "web:article:kg-production-acceptance",
          objectKind: "WEB_CONTENT",
          workspaceId: DEFAULT_WORKSPACE.id,
        },
        title: "KG Production Acceptance",
        bodyMarkdown: "Relationship-aware Knowledge export body.",
        sourceRef: "https://example.invalid/kg-production-acceptance",
        access: {
          authorized: true,
          workspaceId: DEFAULT_WORKSPACE.id,
          classification: "INTERNAL" as const,
        },
      },
      rootFingerprintSha256: "a".repeat(64),
      binding: {
        bindingId: "vlt_kg_production_acceptance",
        revision: 1,
        relativeRoot: "knowledge-export",
      },
    };

    const first = await executeKnowledgeRelationshipVaultExport(
      { relationships, staging: gateway, exportRuns, projection },
      request,
    );

    expect(first.run.state).toBe("SUCCEEDED");
    expect(first.staging.targetPath).toBe(first.artifact.targetPath);
    expect(first.artifact.targetPath).toMatch(/^knowledge\/.+\.md$/u);
    expect(first.projection.vaultRelativePath).toBe(
      `${DEFAULT_WORKSPACE.id}/${first.artifact.targetPath}`,
    );
    expect(first.projection.written).toBe(true);

    const stagedRecord = staging.getDocument(first.staging.stagingDocumentId, DEFAULT_WORKSPACE.id);
    expect(stagedRecord?.descriptor.status).toBe("READY");
    expect(stagedRecord?.descriptor.targetPath).toBe(first.artifact.targetPath);
    expect(stagedRecord?.descriptor.contentHash.value).toBe(first.staging.contentSha256);
    const stagedMarkdown = new TextDecoder().decode(
      staging.readContent(first.staging.stagingDocumentId, DEFAULT_WORKSPACE.id),
    );
    expect(stagedMarkdown.match(/^---$/gmu)).toHaveLength(2);
    expect(stagedMarkdown).toContain("markorbit:");
    expect(stagedMarkdown).toContain('knowledge_id: "web:article:kg-production-acceptance"');
    expect(stagedMarkdown).toContain("Relationship-aware Knowledge export body.");

    const projectedPath = join(vaultRoot, DEFAULT_WORKSPACE.id, first.artifact.targetPath);
    expect(readFileSync(projectedPath, "utf8")).toBe(stagedMarkdown);

    const readyPackages = getReadyPackageRepository().list(DEFAULT_WORKSPACE.id);
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
      workspaceId: DEFAULT_WORKSPACE.id,
      converterId: "builtin-markdown-staging",
      limit: 100,
    });
    expect(conversionRuns.items).toHaveLength(1);
    expect(conversionRuns.items[0]?.status).toBe("COMPLETED");
    expect(staging.listDocuments({ workspaceId: DEFAULT_WORKSPACE.id, limit: 100 }).total).toBe(1);
  }, 30_000);
});
