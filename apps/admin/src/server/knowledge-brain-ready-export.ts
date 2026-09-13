import type { DatabaseSync } from "node:sqlite";
import type { ReadyPackageContentExportV1_1 } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { currentKnowledgeReadyPackageId } from "@markorbit/persistence/knowledge-browser-query";
import type { ReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import { buildConfiguredReadyPackageContentExportV1 } from "./ready-package-content-export";
import { getReadyPackageRepository, getRegistryDatabase } from "./source-registry";
import { workspaceRetrievalScopes } from "./workspace-retrieval-overlay";

export type BrainReadyPackageExportInput = {
  viewerWorkspaceId: string;
  knowledgeWorkspaceId: string;
  readyPackageId: string;
};

export type BrainReadyProjectionItem = {
  id: string;
  workspaceId: string;
};
export type BrainReadyProjection = {
  brainReady: boolean;
  readyPackageId: string | null;
};

type BrainReadyDependencies = {
  readyPackages: Pick<ReadyPackageRegistryRepository, "getById">;
  isCurrentStaging: (workspaceId: string, stagingDocumentId: string) => boolean;
  exportContent: (input: {
    workspaceId: string;
    readyPackageId: string;
  }) => Promise<ReadyPackageContentExportV1_1>;
};

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function assertKnowledgeWorkspaceVisible(
  viewerWorkspaceId: string,
  knowledgeWorkspaceId: string,
): void {
  if (!workspaceRetrievalScopes(viewerWorkspaceId).includes(knowledgeWorkspaceId)) {
    throw new RegistryConflictError(
      "BRAIN_READY_EXPORT_WORKSPACE_NOT_VISIBLE",
      "Knowledge Workspace is outside the viewer Workspace retrieval scope",
    );
  }
}
export function isCurrentBrainReadyStaging(
  database: DatabaseSync,
  workspaceId: string,
  stagingDocumentId: string,
): boolean {
  return currentKnowledgeReadyPackageId(database, workspaceId, stagingDocumentId) !== null;
}

export async function buildBrainReadyPackageExport(
  input: BrainReadyPackageExportInput,
  dependencies: BrainReadyDependencies,
): Promise<ReadyPackageContentExportV1_1> {
  const viewerWorkspaceId = required(input.viewerWorkspaceId, "viewerWorkspaceId");
  const knowledgeWorkspaceId = required(input.knowledgeWorkspaceId, "knowledgeWorkspaceId");
  const readyPackageId = required(input.readyPackageId, "readyPackageId");
  assertKnowledgeWorkspaceVisible(viewerWorkspaceId, knowledgeWorkspaceId);

  const readyPackage = dependencies.readyPackages.getById(readyPackageId, knowledgeWorkspaceId);
  if (!readyPackage) {
    throw new RegistryError(
      "READY_PACKAGE_NOT_FOUND",
      `ReadyPackage ${readyPackageId} was not found`,
    );
  }
  if (
    !dependencies.isCurrentStaging(knowledgeWorkspaceId, readyPackage.evidence.stagingDocumentId)
  ) {
    throw new RegistryConflictError(
      "BRAIN_READY_EXPORT_NOT_CURRENT",
      "ReadyPackage is not part of current retrievable Knowledge",
    );
  }

  return dependencies.exportContent({
    workspaceId: knowledgeWorkspaceId,
    readyPackageId,
  });
}

export function buildConfiguredBrainReadyPackageExport(
  input: BrainReadyPackageExportInput,
): Promise<ReadyPackageContentExportV1_1> {
  const database = getRegistryDatabase();
  return buildBrainReadyPackageExport(input, {
    readyPackages: getReadyPackageRepository(),
    isCurrentStaging: (workspaceId, stagingDocumentId) =>
      isCurrentBrainReadyStaging(database, workspaceId, stagingDocumentId),
    exportContent: buildConfiguredReadyPackageContentExportV1,
  });
}
export function projectBrainReadyItem(
  database: DatabaseSync,
  item: BrainReadyProjectionItem,
  readyPackages: Pick<ReadyPackageRegistryRepository, "getById"> = getReadyPackageRepository(),
): BrainReadyProjection {
  if (!isCurrentBrainReadyStaging(database, item.workspaceId, item.id)) {
    return { brainReady: false, readyPackageId: null };
  }
  const readyPackageId = currentKnowledgeReadyPackageId(database, item.workspaceId, item.id);
  if (!readyPackageId) return { brainReady: false, readyPackageId: null };

  const readyPackage = readyPackages.getById(readyPackageId, item.workspaceId);
  if (!readyPackage || !["VERIFIED", "HANDED_OFF"].includes(readyPackage.status)) {
    return { brainReady: false, readyPackageId: null };
  }
  return { brainReady: true, readyPackageId: readyPackage.id };
}
