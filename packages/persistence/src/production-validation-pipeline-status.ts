import type {
  ArtifactKind,
  ArtifactStatus,
  ConversionRunStatus,
  ConversionStagingDocumentStatus,
  SourceDefinition,
} from "@markorbit/contracts";
import type { ConversionRunLedgerRepository } from "./conversion-runs";
import type { SourceRepository } from "./index";
import { RegistryError } from "./index";
import type { ProductionValidationManifest } from "./production-validation-discovery-intake";
import type { RawArtifactRepository } from "./raw-artifact-registry";
import type { StagingContentRegistryRepository } from "./staging-content-registry";

export type ProductionValidationPipelineState =
  | "NOT_REGISTERED"
  | "AWAITING_ARTIFACT"
  | "ARTIFACT_OBSERVED"
  | "CONVERSION_OBSERVED"
  | "KNOWLEDGE_VISIBLE";

export type ProductionValidationPipelineItem = {
  targetId: string;
  jurisdiction: string;
  authority: string;
  state: ProductionValidationPipelineState;
  sourceId?: string;
  artifactCount: number;
  artifactBytes: number;
  readyForConversionArtifactCount: number;
  latestArtifactId?: string;
  latestArtifactStatus?: ArtifactStatus;
  latestArtifactKind?: ArtifactKind;
  latestArtifactSizeBytes?: number;
  latestArtifactCreatedAt?: string;
  conversionRunCount: number;
  completedConversionRunCount: number;
  failedConversionRunCount: number;
  latestConversionRunId?: string;
  latestConversionStatus?: ConversionRunStatus;
  stagingDocumentCount: number;
  readyStagingDocumentCount: number;
  blockedStagingDocumentCount: number;
  latestStagingDocumentId?: string;
  latestStagingStatus?: ConversionStagingDocumentStatus;
  knowledgeVisible: boolean;
};

export type ProductionValidationPipelineStatus = {
  workspaceId: string;
  waveId: string;
  items: ProductionValidationPipelineItem[];
  summary: Record<ProductionValidationPipelineState, number> & {
    total: number;
    artifactsObserved: number;
    artifactBytes: number;
    conversionRunsObserved: number;
    completedConversionRuns: number;
    failedConversionRuns: number;
    stagingDocumentsObserved: number;
    knowledgeVisibleTargets: number;
  };
};

export type ProductionValidationPipelineDependencies = {
  sources: SourceRepository;
  artifacts: RawArtifactRepository;
  conversionRuns: ConversionRunLedgerRepository;
  staging: StagingContentRegistryRepository;
};

function canonicalUri(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function listWorkspaceSources(
  repository: SourceRepository,
  workspaceId: string,
): SourceDefinition[] {
  const sources: SourceDefinition[] = [];
  let offset = 0;
  while (true) {
    const page = repository.list({ workspaceId, limit: 100, offset });
    sources.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) return sources;
  }
}

function findRegisteredSource(
  sources: SourceDefinition[],
  targetUri: string,
): SourceDefinition | undefined {
  return sources.find((source) => {
    const uris = [
      source.canonicalUri,
      ...source.entrypoints.map((entrypoint) => entrypoint.uri),
    ].filter((uri): uri is string => Boolean(uri));
    return uris.some((uri) => {
      try {
        return canonicalUri(uri) === targetUri;
      } catch {
        return false;
      }
    });
  });
}

export function inspectProductionValidationPipeline(
  input: { workspaceId: string; manifest: ProductionValidationManifest },
  dependencies: ProductionValidationPipelineDependencies,
): ProductionValidationPipelineStatus {
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId)
    throw new RegistryError("WORKSPACE_ID_REQUIRED", "workspaceId is required");
  const sources = listWorkspaceSources(dependencies.sources, workspaceId);

  const items = input.manifest.targets.map(
    (target): ProductionValidationPipelineItem => {
      const source = findRegisteredSource(
        sources,
        canonicalUri(target.canonicalUri),
      );
      if (!source) {
        return {
          targetId: target.id,
          jurisdiction: target.jurisdiction,
          authority: target.authority,
          state: "NOT_REGISTERED",
          artifactCount: 0,
          artifactBytes: 0,
          readyForConversionArtifactCount: 0,
          conversionRunCount: 0,
          completedConversionRunCount: 0,
          failedConversionRunCount: 0,
          stagingDocumentCount: 0,
          readyStagingDocumentCount: 0,
          blockedStagingDocumentCount: 0,
          knowledgeVisible: false,
        };
      }

      const artifacts = dependencies.artifacts.list({
        workspaceId,
        sourceId: source.id,
        limit: 100,
      });
      const latestArtifact = artifacts.items[0]?.artifact;
      const artifactBytes = artifacts.items.reduce(
        (sum, item) => sum + item.artifact.sizeBytes,
        0,
      );
      const readyForConversionArtifactCount = artifacts.items.filter(
        (item) => item.artifact.status === "READY_FOR_CONVERSION",
      ).length;

      const conversionRuns = dependencies.conversionRuns.list({
        workspaceId,
        sourceId: source.id,
        limit: 100,
      });
      const latestConversion = conversionRuns.items[0];
      const completedConversionRunCount = conversionRuns.items.filter(
        (run) => run.status === "COMPLETED",
      ).length;
      const failedConversionRunCount = conversionRuns.items.filter(
        (run) => run.status === "FAILED",
      ).length;

      const staging = dependencies.staging.listDocuments({
        workspaceId,
        sourceId: source.id,
        limit: 100,
      });
      const latestStaging = staging.items[0];
      const readyStagingDocumentCount = staging.items.filter(
        (record) => record.descriptor.status === "READY",
      ).length;
      const blockedStagingDocumentCount = staging.items.filter(
        (record) => record.descriptor.status === "BLOCKED",
      ).length;
      const knowledgeVisible = staging.items.some((record) =>
        ["GENERATED", "READY"].includes(record.descriptor.status),
      );

      const state: ProductionValidationPipelineState = knowledgeVisible
        ? "KNOWLEDGE_VISIBLE"
        : conversionRuns.total > 0
          ? "CONVERSION_OBSERVED"
          : artifacts.total > 0
            ? "ARTIFACT_OBSERVED"
            : "AWAITING_ARTIFACT";

      return {
        targetId: target.id,
        jurisdiction: target.jurisdiction,
        authority: target.authority,
        state,
        sourceId: source.id,
        artifactCount: artifacts.total,
        artifactBytes,
        readyForConversionArtifactCount,
        ...(latestArtifact
          ? {
              latestArtifactId: latestArtifact.id,
              latestArtifactStatus: latestArtifact.status,
              latestArtifactKind: latestArtifact.artifactKind,
              latestArtifactSizeBytes: latestArtifact.sizeBytes,
              latestArtifactCreatedAt: latestArtifact.createdAt,
            }
          : {}),
        conversionRunCount: conversionRuns.total,
        completedConversionRunCount,
        failedConversionRunCount,
        ...(latestConversion
          ? {
              latestConversionRunId: latestConversion.id,
              latestConversionStatus: latestConversion.status,
            }
          : {}),
        stagingDocumentCount: staging.total,
        readyStagingDocumentCount,
        blockedStagingDocumentCount,
        ...(latestStaging
          ? {
              latestStagingDocumentId: latestStaging.descriptor.id,
              latestStagingStatus: latestStaging.descriptor.status,
            }
          : {}),
        knowledgeVisible,
      };
    },
  );

  return {
    workspaceId,
    waveId: input.manifest.waveId,
    items,
    summary: {
      NOT_REGISTERED: items.filter((item) => item.state === "NOT_REGISTERED")
        .length,
      AWAITING_ARTIFACT: items.filter(
        (item) => item.state === "AWAITING_ARTIFACT",
      ).length,
      ARTIFACT_OBSERVED: items.filter(
        (item) => item.state === "ARTIFACT_OBSERVED",
      ).length,
      CONVERSION_OBSERVED: items.filter(
        (item) => item.state === "CONVERSION_OBSERVED",
      ).length,
      KNOWLEDGE_VISIBLE: items.filter(
        (item) => item.state === "KNOWLEDGE_VISIBLE",
      ).length,
      total: items.length,
      artifactsObserved: items.reduce(
        (sum, item) => sum + item.artifactCount,
        0,
      ),
      artifactBytes: items.reduce(
        (sum, item) => sum + item.artifactBytes,
        0,
      ),
      conversionRunsObserved: items.reduce(
        (sum, item) => sum + item.conversionRunCount,
        0,
      ),
      completedConversionRuns: items.reduce(
        (sum, item) => sum + item.completedConversionRunCount,
        0,
      ),
      failedConversionRuns: items.reduce(
        (sum, item) => sum + item.failedConversionRunCount,
        0,
      ),
      stagingDocumentsObserved: items.reduce(
        (sum, item) => sum + item.stagingDocumentCount,
        0,
      ),
      knowledgeVisibleTargets: items.filter((item) => item.knowledgeVisible)
        .length,
    },
  };
}
