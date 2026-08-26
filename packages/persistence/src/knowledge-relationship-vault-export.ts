import { createHash } from "node:crypto";
import type { VaultExportBindingSnapshotV1, VaultExportRunV1 } from "@markorbit/contracts";
import type { ContentRelationshipReadRepository } from "./content-relationship-obsidian-export";
import {
  buildKnowledgeObsidianRelationshipNote,
  type KnowledgeObsidianExportArtifact,
  type KnowledgeObsidianExportInput,
} from "./content-relationship-obsidian-export";
import type {
  ObsidianVaultProjectionRepository,
  ObsidianVaultProjectionResult,
} from "./obsidian-vault-projection";
import { RegistryValidationError } from "./index";
import type { VaultExportRunRepository } from "./vault-export-run-registry";

export type KnowledgeRelationshipStagingInput = {
  workspaceId: string;
  title: string;
  targetPath: string;
  markdown: string;
  idempotencyKey: string;
};

export type KnowledgeRelationshipReadyStaging = {
  stagingDocumentId: string;
  workspaceId: string;
  targetPath: string;
  sourceContentSha256: string;
  contentSha256: string;
};

export interface KnowledgeRelationshipExportStagingGateway {
  stageReady(input: KnowledgeRelationshipStagingInput): Promise<KnowledgeRelationshipReadyStaging>;
}

export type ExecuteKnowledgeRelationshipVaultExportInput = {
  note: KnowledgeObsidianExportInput;
  rootFingerprintSha256: string;
  binding: VaultExportBindingSnapshotV1;
};

export type ExecuteKnowledgeRelationshipVaultExportResult = {
  artifact: KnowledgeObsidianExportArtifact;
  staging: KnowledgeRelationshipReadyStaging;
  projection: ObsidianVaultProjectionResult;
  run: VaultExportRunV1;
};

export type KnowledgeRelationshipVaultExportDependencies = {
  relationships: ContentRelationshipReadRepository;
  staging: KnowledgeRelationshipExportStagingGateway;
  exportRuns: VaultExportRunRepository;
  projection: ObsidianVaultProjectionRepository;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertSha256(value: string, field: string): string {
  const normalized = value?.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) {
    throw new RegistryValidationError(`${field} must be SHA-256`);
  }
  return normalized;
}

function stagingIdempotencyKey(artifact: KnowledgeObsidianExportArtifact): string {
  return `knowledge-obsidian:${sha256(
    [
      artifact.content.workspaceId,
      artifact.content.objectKind,
      artifact.content.objectId,
      artifact.targetPath,
      sha256(artifact.markdown),
    ].join("\u001f"),
  )}`;
}

export async function executeKnowledgeRelationshipVaultExport(
  dependencies: KnowledgeRelationshipVaultExportDependencies,
  input: ExecuteKnowledgeRelationshipVaultExportInput,
): Promise<ExecuteKnowledgeRelationshipVaultExportResult> {
  const rootFingerprintSha256 = assertSha256(input.rootFingerprintSha256, "rootFingerprintSha256");
  const artifact = buildKnowledgeObsidianRelationshipNote(dependencies.relationships, input.note);
  const renderedContentSha256 = sha256(artifact.markdown);
  const staging = await dependencies.staging.stageReady({
    workspaceId: artifact.content.workspaceId,
    title: input.note.title,
    targetPath: artifact.targetPath,
    markdown: artifact.markdown,
    idempotencyKey: stagingIdempotencyKey(artifact),
  });

  if (
    staging.workspaceId !== artifact.content.workspaceId ||
    staging.targetPath !== artifact.targetPath ||
    staging.sourceContentSha256 !== renderedContentSha256 ||
    !/^[a-f0-9]{64}$/u.test(staging.contentSha256)
  ) {
    throw new RegistryValidationError(
      "Knowledge relationship staging result does not match the rendered artifact",
    );
  }

  const prepared = dependencies.exportRuns.prepare({
    workspaceId: staging.workspaceId,
    rootFingerprintSha256,
    binding: input.binding,
    staging: {
      stagingDocumentId: staging.stagingDocumentId,
      contentSha256: staging.contentSha256,
      targetPath: staging.targetPath,
    },
  });

  if (prepared.run.state === "SUCCEEDED" && prepared.run.result) {
    return {
      artifact,
      staging,
      projection: {
        stagingDocumentId: staging.stagingDocumentId,
        workspaceId: staging.workspaceId,
        vaultRelativePath: prepared.run.result.vaultRelativePath,
        contentSha256: prepared.run.result.contentSha256,
        written: prepared.run.result.disposition === "WRITTEN",
      },
      run: prepared.run,
    };
  }

  const projection = dependencies.projection.project(
    staging.workspaceId,
    staging.stagingDocumentId,
    { conflictPolicy: "FAIL_IF_DIFFERENT" },
  );
  const withReceipt = dependencies.exportRuns.recordProjectionReceipt(
    staging.workspaceId,
    prepared.run.id,
    {
      vaultRelativePath: projection.vaultRelativePath,
      contentSha256: projection.contentSha256,
      disposition: projection.written ? "WRITTEN" : "ALREADY_PRESENT",
    },
  );
  const run =
    withReceipt.state === "SUCCEEDED"
      ? withReceipt
      : dependencies.exportRuns.finalize(staging.workspaceId, prepared.run.id);

  return { artifact, staging, projection, run };
}
