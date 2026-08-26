import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const roots: string[] = [];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function resetProductionRegistry(): void {
  delete (globalThis as typeof globalThis & { markorbitRegistries?: unknown }).markorbitRegistries;
}

afterEach(() => {
  resetProductionRegistry();
  delete process.env.MARKORBIT_KNOWLEDGE_DB_PATH;
  delete process.env.MARKORBIT_ARTIFACT_STORE_PATH;
  delete process.env.MARKORBIT_STAGING_STORE_PATH;
  vi.resetModules();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe("ProductionKnowledgeRelationshipReadyStagingGateway E2E", () => {
  it("drives rendered Markdown through governed RawArtifact conversion into verified READY staging", async () => {
    const root = mkdtempSync(join(tmpdir(), `markorbit-kg004-${randomUUID()}-`));
    roots.push(root);
    process.env.MARKORBIT_KNOWLEDGE_DB_PATH = join(root, "knowledge.sqlite");
    process.env.MARKORBIT_ARTIFACT_STORE_PATH = join(root, "artifacts");
    process.env.MARKORBIT_STAGING_STORE_PATH = join(root, "staging");
    resetProductionRegistry();
    vi.resetModules();

    const { ProductionKnowledgeRelationshipReadyStagingGateway } =
      await import("../knowledge-relationship-ready-staging-gateway");
    const {
      getConversionRunLedgerRepository,
      getConversionRuntimeRepository,
      getStagingContentRepository,
      getWorkerRegistryRepository,
    } = await import("../source-registry");

    const markdown = [
      "---",
      'knowledge_id: "web:article:assignment-guide"',
      'knowledge_kind: "WEB_CONTENT"',
      "---",
      "",
      "# Assignment Guide",
      "",
      "Canonical relationship body.",
      "",
    ].join("\n");
    const request = {
      workspaceId,
      title: "Assignment Guide",
      targetPath: "knowledge/web_content-assignment-guide.md",
      markdown,
      idempotencyKey: `knowledge-obsidian:${"a".repeat(64)}`,
    };

    const gateway = new ProductionKnowledgeRelationshipReadyStagingGateway();
    const first = await gateway.stageReady(request);

    expect(first.workspaceId).toBe(workspaceId);
    expect(first.targetPath).toBe(request.targetPath);
    expect(first.sourceContentSha256).toBe(sha256(markdown));
    expect(first.contentSha256).not.toBe(first.sourceContentSha256);

    const staging = getStagingContentRepository().getDocument(first.stagingDocumentId, workspaceId);
    expect(staging?.descriptor.status).toBe("READY");
    expect(staging?.descriptor.targetPath).toBe(request.targetPath);
    expect(staging?.descriptor.contentHash.value).toBe(first.contentSha256);
    const canonical = new TextDecoder().decode(
      getStagingContentRepository().readContent(first.stagingDocumentId, workspaceId),
    );
    expect(canonical).toMatch(/^---\nmarkorbit:\n/u);
    expect(canonical).toContain('knowledge_id: "web:article:assignment-guide"');
    expect(canonical).toContain("Canonical relationship body.");

    const runs = getConversionRunLedgerRepository().list({
      workspaceId,
      converterId: "builtin-markdown-staging",
      trigger: "AUTO_PROFILE",
      limit: 20,
    }).items;
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("COMPLETED");
    expect(runs[0]?.requestedOutput.targetPathTemplate).toBe(request.targetPath);

    const conversionWorkers = getWorkerRegistryRepository().list({
      workspaceId,
      runtimeId: "admin-knowledge-relationship-export",
      limit: 20,
    }).items;
    expect(conversionWorkers).toHaveLength(1);
    expect(conversionWorkers[0]?.worker.desiredState).toBe("DISABLED");
    expect(
      getConversionRuntimeRepository().listCapabilities({
        workspaceId,
        workerId: conversionWorkers[0]?.worker.id,
        limit: 20,
      }).items,
    ).toEqual([expect.objectContaining({ active: false })]);

    const second = await gateway.stageReady(request);
    expect(second).toEqual(first);
    expect(
      getConversionRunLedgerRepository().list({
        workspaceId,
        converterId: "builtin-markdown-staging",
        trigger: "AUTO_PROFILE",
        limit: 20,
      }).items,
    ).toHaveLength(1);
    expect(
      getWorkerRegistryRepository().list({
        workspaceId,
        runtimeId: "admin-knowledge-relationship-export",
        limit: 20,
      }).items,
    ).toHaveLength(1);
  });
});
