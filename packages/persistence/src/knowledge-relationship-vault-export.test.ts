import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ContentObjectRefV1, VaultExportRunV1 } from "@markorbit/contracts";
import type { ContentRelationshipReadRepository } from "./content-relationship-obsidian-export";
import type { ObsidianVaultProjectionRepository } from "./obsidian-vault-projection";
import type { VaultExportRunRepository } from "./vault-export-run-registry";
import {
  executeKnowledgeRelationshipVaultExport,
  type KnowledgeRelationshipExportStagingGateway,
} from "./knowledge-relationship-vault-export";

const content: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "web:article:assignment-guide",
  objectKind: "WEB_CONTENT",
  workspaceId: "workspace-a",
};

const relationships: ContentRelationshipReadRepository = {
  listFacets: () => [],
  listNeighbors: () => ({ items: [], total: 0, limit: 200, offset: 0 }),
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function input() {
  return {
    note: {
      content,
      title: "Assignment Guide",
      bodyMarkdown: "Canonical body.",
      sourceRef: "https://example.test/assignment",
      access: {
        authorized: true,
        workspaceId: "workspace-a",
        classification: "INTERNAL" as const,
      },
    },
    rootFingerprintSha256: "a".repeat(64),
    binding: { bindingId: "vlt_binding-a", revision: 1, relativeRoot: "knowledge" },
  };
}

function pendingRun(stagingDocumentId: string, contentSha256: string): VaultExportRunV1 {
  return {
    contractVersion: "1.0",
    objectType: "VAULT_EXPORT_RUN",
    id: "vex_test",
    workspaceId: "workspace-a",
    idempotencyKey: "vault-export:test",
    rootFingerprintSha256: "a".repeat(64),
    binding: { bindingId: "vlt_binding-a", revision: 1, relativeRoot: "knowledge" },
    staging: {
      stagingDocumentId,
      contentSha256,
      targetPath: "knowledge/web_content-test.md",
    },
    state: "PENDING",
    preparedAt: "2026-08-26T06:00:00.000Z",
    updatedAt: "2026-08-26T06:00:00.000Z",
  };
}

describe("Knowledge relationship Vault export orchestration", () => {
  it("stages the deterministic note, projects it and finalizes the export run", async () => {
    let stagedKey = "";
    let stagedMarkdown = "";
    let projectionCalls = 0;
    let currentRun: VaultExportRunV1 | null = null;

    const staging: KnowledgeRelationshipExportStagingGateway = {
      stageReady: async (stageInput) => {
        stagedKey = stageInput.idempotencyKey;
        stagedMarkdown = stageInput.markdown;
        return {
          stagingDocumentId: "stg_relationship-note",
          workspaceId: stageInput.workspaceId,
          targetPath: stageInput.targetPath,
          contentSha256: sha256(stageInput.markdown),
        };
      },
    };

    const exportRuns: VaultExportRunRepository = {
      prepare: (prepareInput) => {
        currentRun = pendingRun(
          prepareInput.staging.stagingDocumentId,
          prepareInput.staging.contentSha256,
        );
        currentRun.staging.targetPath = prepareInput.staging.targetPath;
        return { run: currentRun, replayed: false };
      },
      getById: () => currentRun,
      getPendingByStaging: () => currentRun,
      recordProjectionReceipt: (_workspaceId, _runId, receipt) => {
        if (!currentRun) throw new Error("run missing");
        currentRun = {
          ...currentRun,
          projectionReceipt: { ...receipt, recordedAt: "2026-08-26T06:00:01.000Z" },
        };
        return currentRun;
      },
      finalize: () => {
        if (!currentRun?.projectionReceipt) throw new Error("receipt missing");
        currentRun = {
          ...currentRun,
          state: "SUCCEEDED",
          result: currentRun.projectionReceipt,
          updatedAt: "2026-08-26T06:00:02.000Z",
        };
        return currentRun;
      },
      list: () => (currentRun ? [currentRun] : []),
    };

    const projection: ObsidianVaultProjectionRepository = {
      inspect: () => {
        throw new Error("not used");
      },
      project: (workspaceId, stagingDocumentId) => {
        projectionCalls += 1;
        return {
          stagingDocumentId,
          workspaceId,
          vaultRelativePath: "knowledge/note.md",
          contentSha256: sha256(stagedMarkdown),
          written: true,
        };
      },
    };

    const result = await executeKnowledgeRelationshipVaultExport(
      { relationships, staging, exportRuns, projection },
      input(),
    );

    expect(stagedKey).toMatch(/^knowledge-obsidian:[a-f0-9]{64}$/u);
    expect(stagedMarkdown).toContain('knowledge_id: "web:article:assignment-guide"');
    expect(projectionCalls).toBe(1);
    expect(result.run.state).toBe("SUCCEEDED");
    expect(result.run.result?.disposition).toBe("WRITTEN");
  });

  it("returns a completed replay without projecting a second time", async () => {
    let projectionCalls = 0;
    const staging: KnowledgeRelationshipExportStagingGateway = {
      stageReady: async (stageInput) => ({
        stagingDocumentId: "stg_relationship-note",
        workspaceId: stageInput.workspaceId,
        targetPath: stageInput.targetPath,
        contentSha256: sha256(stageInput.markdown),
      }),
    };

    const exportRuns: VaultExportRunRepository = {
      prepare: (prepareInput) => {
        const run = pendingRun(
          prepareInput.staging.stagingDocumentId,
          prepareInput.staging.contentSha256,
        );
        run.staging.targetPath = prepareInput.staging.targetPath;
        const receipt = {
          vaultRelativePath: "knowledge/note.md",
          contentSha256: prepareInput.staging.contentSha256,
          disposition: "ALREADY_PRESENT" as const,
          recordedAt: "2026-08-26T06:00:01.000Z",
        };
        return {
          replayed: true,
          run: { ...run, state: "SUCCEEDED", projectionReceipt: receipt, result: receipt },
        };
      },
      getById: () => null,
      getPendingByStaging: () => null,
      recordProjectionReceipt: () => {
        throw new Error("not used");
      },
      finalize: () => {
        throw new Error("not used");
      },
      list: () => [],
    };
    const projection: ObsidianVaultProjectionRepository = {
      inspect: () => {
        throw new Error("not used");
      },
      project: () => {
        projectionCalls += 1;
        throw new Error("should not project replay");
      },
    };

    const result = await executeKnowledgeRelationshipVaultExport(
      { relationships, staging, exportRuns, projection },
      input(),
    );

    expect(projectionCalls).toBe(0);
    expect(result.run.state).toBe("SUCCEEDED");
    expect(result.projection.written).toBe(false);
  });

  it("fails closed when the staging gateway changes the rendered artifact", async () => {
    const staging: KnowledgeRelationshipExportStagingGateway = {
      stageReady: async (stageInput) => ({
        stagingDocumentId: "stg_relationship-note",
        workspaceId: stageInput.workspaceId,
        targetPath: stageInput.targetPath,
        contentSha256: "b".repeat(64),
      }),
    };

    await expect(
      executeKnowledgeRelationshipVaultExport(
        {
          relationships,
          staging,
          exportRuns: {} as VaultExportRunRepository,
          projection: {} as ObsidianVaultProjectionRepository,
        },
        input(),
      ),
    ).rejects.toThrow(/does not match the rendered artifact/i);
  });
});
