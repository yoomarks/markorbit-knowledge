import type { DatabaseSync } from "node:sqlite";
import type {
  CurrentGovernedKnowledgeV1,
  KnowledgeAdmissibilityReasonCode,
  ReadyPackageContentExportV1_1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { projectCurrentGovernedKnowledge } from "@markorbit/persistence/current-governed-knowledge";
import type { ReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import { buildConfiguredReadyPackageContentExportV1 } from "./ready-package-content-export";
import { getReadyPackageRepository, getRegistryDatabase } from "./source-registry";

export type BrainReadyPackageExportInput = {
  viewerWorkspaceId: string;
  knowledgeWorkspaceId: string;
  readyPackageId: string;
};

export type BrainReadyProjectionItem = { id: string; workspaceId: string };
export type BrainReadyProjection = {
  brainReady: boolean;
  readyPackageId: string | null;
  brainReadyReasonCodes: readonly KnowledgeAdmissibilityReasonCode[];
};
type BrainReadyDependencies = {
  readyPackages: Pick<ReadyPackageRegistryRepository, "getById">;
  projectGovernance: (input: {
    viewerWorkspaceId: string;
    workspaceId: string;
    stagingDocumentId: string;
  }) => CurrentGovernedKnowledgeV1;
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

function assertConsumerAdmissible(projection: CurrentGovernedKnowledgeV1): void {
  if (projection.states.consumerAdmissible) return;
  const code = projection.reasonCodes[0] ?? "VERIFICATION_NOT_ACCEPTABLE";
  throw new RegistryConflictError(
    code,
    `Knowledge content is not consumer-admissible: ${projection.reasonCodes.join(", ") || code}`,
    { reasonCodes: [...projection.reasonCodes] },
  );
}
export function isCurrentBrainReadyStaging(
  database: DatabaseSync,
  workspaceId: string,
  stagingDocumentId: string,
): boolean {
  return projectCurrentGovernedKnowledge(database, {
    workspaceId,
    stagingDocumentId,
    viewerWorkspaceId: workspaceId,
  }).states.consumerAdmissible;
}

export async function buildBrainReadyPackageExport(
  input: BrainReadyPackageExportInput,
  dependencies: BrainReadyDependencies,
): Promise<ReadyPackageContentExportV1_1> {
  const viewerWorkspaceId = required(input.viewerWorkspaceId, "viewerWorkspaceId");
  const knowledgeWorkspaceId = required(input.knowledgeWorkspaceId, "knowledgeWorkspaceId");
  const readyPackageId = required(input.readyPackageId, "readyPackageId");
  const readyPackage = dependencies.readyPackages.getById(readyPackageId, knowledgeWorkspaceId);
  if (!readyPackage) {
    throw new RegistryError(
      "READY_PACKAGE_NOT_FOUND",
      `ReadyPackage ${readyPackageId} was not found`,
    );
  }
  const projection = dependencies.projectGovernance({
    viewerWorkspaceId,
    workspaceId: knowledgeWorkspaceId,
    stagingDocumentId: readyPackage.evidence.stagingDocumentId,
  });
  assertConsumerAdmissible(projection);
  if (projection.readyPackageId !== readyPackageId) {
    throw new RegistryConflictError(
      "CONTENT_NOT_CURRENT",
      "Requested ReadyPackage is not the current governed package for this Knowledge content",
      { reasonCodes: ["CONTENT_NOT_CURRENT"] },
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
    projectGovernance: ({ viewerWorkspaceId, workspaceId, stagingDocumentId }) =>
      projectCurrentGovernedKnowledge(database, {
        viewerWorkspaceId,
        workspaceId,
        stagingDocumentId,
      }),
    exportContent: buildConfiguredReadyPackageContentExportV1,
  });
}

export function projectBrainReadyItem(
  database: DatabaseSync,
  item: BrainReadyProjectionItem,
  viewerWorkspaceId = item.workspaceId,
): BrainReadyProjection {
  const projection = projectCurrentGovernedKnowledge(database, {
    workspaceId: item.workspaceId,
    stagingDocumentId: item.id,
    viewerWorkspaceId,
  });
  return projection.states.consumerAdmissible && projection.readyPackageId
    ? {
        brainReady: true,
        readyPackageId: projection.readyPackageId,
        brainReadyReasonCodes: [],
      }
    : {
        brainReady: false,
        readyPackageId: null,
        brainReadyReasonCodes: projection.reasonCodes,
      };
}
