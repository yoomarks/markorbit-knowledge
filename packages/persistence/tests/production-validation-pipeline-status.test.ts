import { describe, expect, it } from "vitest";
import type { SourceDefinition } from "@markorbit/contracts";
import type { ConversionRunLedgerRepository } from "../src/conversion-runs";
import type { SourceRepository } from "../src/index";
import type { ProductionValidationManifest } from "../src/production-validation-discovery-intake";
import { inspectProductionValidationPipeline } from "../src/production-validation-pipeline-status";
import type { RawArtifactRepository } from "../src/raw-artifact-registry";
import type { StagingContentRegistryRepository } from "../src/staging-content-registry";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const sourceId = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";

const manifest: ProductionValidationManifest = {
  manifestVersion: "1.0",
  waveId: "wave-1",
  governance: {
    collectionAuthorizationRequired: true,
    discoveryDoesNotActivateSource: true,
    noAutomaticProductionScheduling: true,
    realObservationsOnly: true,
  },
  targets: [
    {
      id: "wipo",
      jurisdiction: "GLOBAL",
      authority: "WIPO",
      canonicalUri: "https://www.wipo.int/portal/en/",
      sourceClass: "OFFICIAL_AUTHORITY",
      priority: "P0",
      validationState: "PENDING_REAL_RUN",
    },
  ],
};

function source(): SourceDefinition {
  return {
    id: sourceId,
    workspaceId,
    canonicalUri: "https://www.wipo.int/portal/en/",
    entrypoints: [],
  } as unknown as SourceDefinition;
}

function dependencies(input: {
  registered?: boolean;
  artifact?: boolean;
  conversion?: boolean;
  staging?: boolean;
}) {
  const sources = {
    list: () => ({
      items: input.registered ? [source()] : [],
      total: input.registered ? 1 : 0,
      limit: 100,
      offset: 0,
    }),
  } as unknown as SourceRepository;

  const artifacts = {
    list: () => ({
      items: input.artifact
        ? [
            {
              artifact: {
                id: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                sourceId,
                workspaceId,
                status: "READY_FOR_CONVERSION",
                artifactKind: "HTML",
                sizeBytes: 2048,
                createdAt: "2026-08-19T00:00:00Z",
              },
            },
          ]
        : [],
      total: input.artifact ? 1 : 0,
      limit: 100,
      offset: 0,
      summary: {} as never,
    }),
  } as unknown as RawArtifactRepository;

  const conversionRuns = {
    list: () => ({
      items: input.conversion
        ? [
            {
              id: "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
              status: "COMPLETED",
            },
          ]
        : [],
      total: input.conversion ? 1 : 0,
      limit: 100,
      offset: 0,
    }),
  } as unknown as ConversionRunLedgerRepository;

  const staging = {
    listDocuments: () => ({
      items: input.staging
        ? [
            {
              descriptor: {
                id: "std_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                status: "READY",
              },
              createdAt: "2026-08-19T00:02:00Z",
              updatedAt: "2026-08-19T00:02:00Z",
            },
          ]
        : [],
      total: input.staging ? 1 : 0,
      limit: 100,
      offset: 0,
    }),
  } as unknown as StagingContentRegistryRepository;

  return { sources, artifacts, conversionRuns, staging };
}

describe("inspectProductionValidationPipeline", () => {
  it("keeps an unregistered target explicit", () => {
    const result = inspectProductionValidationPipeline({ workspaceId, manifest }, dependencies({}));

    expect(result.items[0]?.state).toBe("NOT_REGISTERED");
    expect(result.summary.knowledgeVisibleTargets).toBe(0);
  });

  it("reports a registered source that has not produced an artifact", () => {
    const result = inspectProductionValidationPipeline(
      { workspaceId, manifest },
      dependencies({ registered: true }),
    );

    expect(result.items[0]).toMatchObject({
      state: "AWAITING_ARTIFACT",
      sourceId,
      artifactCount: 0,
      knowledgeVisible: false,
    });
  });

  it("projects persisted artifact, conversion, and Knowledge-visible facts", () => {
    const result = inspectProductionValidationPipeline(
      { workspaceId, manifest },
      dependencies({
        registered: true,
        artifact: true,
        conversion: true,
        staging: true,
      }),
    );

    expect(result.items[0]).toMatchObject({
      state: "KNOWLEDGE_VISIBLE",
      artifactCount: 1,
      artifactBytes: 2048,
      readyForConversionArtifactCount: 1,
      conversionRunCount: 1,
      completedConversionRunCount: 1,
      stagingDocumentCount: 1,
      readyStagingDocumentCount: 1,
      knowledgeVisible: true,
    });
    expect(result.summary).toMatchObject({
      artifactsObserved: 1,
      artifactBytes: 2048,
      conversionRunsObserved: 1,
      completedConversionRuns: 1,
      stagingDocumentsObserved: 1,
      knowledgeVisibleTargets: 1,
    });
  });
});
