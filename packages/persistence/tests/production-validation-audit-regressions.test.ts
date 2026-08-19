import { describe, expect, it } from "vitest";
import type { SourceDefinition } from "@markorbit/contracts";
import type { ExecutionLedgerRepository } from "../src/execution-ledger";
import type { SourceRepository } from "../src/index";
import {
  validateProductionValidationManifest,
  type ProductionValidationManifest,
} from "../src/production-validation-discovery-intake";
import { inspectProductionValidationExecution } from "../src/production-validation-execution-status";
import { inspectProductionValidationPipeline } from "../src/production-validation-pipeline-status";
import type { RawArtifactRepository } from "../src/raw-artifact-registry";
import type { ConversionRunLedgerRepository } from "../src/conversion-runs";
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
      jurisdiction: "WO",
      authority: "WIPO",
      canonicalUri: "https://www.wipo.int/en/web/trademarks",
      sourceClass: "OFFICIAL_AUTHORITY",
      priority: "P0",
      validationState: "PENDING_REAL_RUN",
    },
  ],
};

const source = {
  id: sourceId,
  workspaceId,
  canonicalUri: "https://www.wipo.int/en/web/trademarks",
  entrypoints: [],
} as unknown as SourceDefinition;

const sources = {
  list: () => ({ items: [source], total: 1, limit: 100, offset: 0 }),
} as unknown as SourceRepository;

describe("production validation audit regressions", () => {
  it("reads beyond the first staging page before deciding Knowledge visibility", () => {
    const artifacts = {
      list: () => ({ items: [], total: 0, limit: 100, offset: 0, summary: {} as never }),
    } as unknown as RawArtifactRepository;
    const conversionRuns = {
      list: () => ({ items: [], total: 0, limit: 100, offset: 0 }),
    } as unknown as ConversionRunLedgerRepository;
    const staging = {
      listDocuments: (filters: { offset?: number }) => {
        const offset = filters.offset ?? 0;
        const blocked = Array.from({ length: 100 }, (_, index) => ({
          descriptor: { id: `std_blocked_${index}`, status: "BLOCKED" },
          createdAt: "2026-08-19T00:00:00Z",
          updatedAt: "2026-08-19T00:00:00Z",
        }));
        const ready = [
          {
            descriptor: { id: "std_ready_101", status: "READY" },
            createdAt: "2026-08-18T00:00:00Z",
            updatedAt: "2026-08-18T00:00:00Z",
          },
        ];
        return {
          items: offset === 0 ? blocked : offset === 100 ? ready : [],
          total: 101,
          limit: 100,
          offset,
        };
      },
    } as unknown as StagingContentRegistryRepository;

    const result = inspectProductionValidationPipeline(
      { workspaceId, manifest },
      { sources, artifacts, conversionRuns, staging },
    );

    expect(result.items[0]).toMatchObject({
      state: "KNOWLEDGE_VISIBLE",
      stagingDocumentCount: 101,
      readyStagingDocumentCount: 1,
      blockedStagingDocumentCount: 100,
      knowledgeVisible: true,
    });
  });

  it("counts execution runs beyond the first 100 records", () => {
    const runs = {
      list: (filters: { offset?: number }) => {
        const offset = filters.offset ?? 0;
        const firstPage = Array.from({ length: 100 }, (_, index) => ({
          run: {
            id: `run_${index}`,
            status: "COMPLETED",
            requestedAt: `2026-08-19T00:${String(59 - (index % 60)).padStart(2, "0")}:00Z`,
          },
          jobs: [],
        }));
        const secondPage = [
          {
            run: {
              id: "run_101",
              status: "FAILED",
              requestedAt: "2026-08-17T00:00:00Z",
            },
            jobs: [],
          },
        ];
        return {
          items: offset === 0 ? firstPage : offset === 100 ? secondPage : [],
          total: 101,
          limit: 100,
          offset,
          summary: {} as never,
        };
      },
    } as unknown as ExecutionLedgerRepository;

    const result = inspectProductionValidationExecution(
      { workspaceId, manifest },
      { sources, runs },
    );

    expect(result.items[0]).toMatchObject({
      state: "RUN_OBSERVED",
      runCount: 101,
      completedRunCount: 100,
      failedRunCount: 1,
      secondRunObserved: true,
    });
  });

  it("rejects malformed manifests before status projection or intake", () => {
    expect(() =>
      validateProductionValidationManifest({
        ...manifest,
        targets: [{ ...manifest.targets[0], priority: "P9" }],
      }),
    ).toThrow(/priority is invalid/);
  });
});
