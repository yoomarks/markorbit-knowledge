import { afterEach, describe, expect, it } from "vitest";
import { openRegistryDatabase, SqliteSourceRepository } from "./index";
import {
  queueProductionValidationWaveForDiscovery,
  type ProductionValidationManifest,
} from "./production-validation-discovery-intake";
import { SqliteSourceDiscoveryRepository } from "./source-discovery-registry";

const databases: Array<ReturnType<typeof openRegistryDatabase>> = [];

function manifest(): ProductionValidationManifest {
  return {
    manifestVersion: "1.0",
    waveId: "official-wave-test",
    governance: {
      collectionAuthorizationRequired: true,
      discoveryDoesNotActivateSource: true,
      noAutomaticProductionScheduling: true,
      realObservationsOnly: true,
    },
    targets: [
      {
        id: "us-uspto-trademarks",
        jurisdiction: "US",
        authority: "United States Patent and Trademark Office",
        canonicalUri: "https://www.uspto.gov/trademarks",
        sourceClass: "OFFICIAL_AUTHORITY",
        priority: "P0",
        validationState: "PENDING_REAL_RUN",
      },
      {
        id: "wo-wipo-trademarks",
        jurisdiction: "WO",
        authority: "World Intellectual Property Organization",
        canonicalUri: "https://www.wipo.int/en/web/trademarks",
        sourceClass: "OFFICIAL_AUTHORITY",
        priority: "P0",
        validationState: "PENDING_REAL_RUN",
      },
    ],
  };
}

function setup() {
  const database = openRegistryDatabase(":memory:");
  databases.push(database);
  const clock = () => new Date("2026-08-19T02:30:00Z");
  return {
    sources: new SqliteSourceRepository(database, clock),
    discovery: new SqliteSourceDiscoveryRepository(database, clock),
    clock,
  };
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe("production validation discovery intake", () => {
  it("queues a bounded Discovery-only batch without activating sources or collection", () => {
    const dependencies = setup();
    const result = queueProductionValidationWaveForDiscovery(
      { workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV", manifest: manifest() },
      dependencies,
    );

    expect(result.summary).toEqual({
      QUEUED: 2,
      ALREADY_IN_DISCOVERY: 0,
      ALREADY_REGISTERED: 0,
      total: 2,
    });
    expect(dependencies.sources.list().total).toBe(0);
    expect(dependencies.discovery.listCandidates().total).toBe(2);
    const batch = dependencies.discovery.getBatch(result.batchId ?? "");
    expect(batch?.status).toBe("COMPLETED");
    expect(batch?.batch.constraints).toMatchObject({
      maxDepth: 0,
      maxCandidates: 2,
      maxFetches: 0,
      respectRobots: true,
      discoverExternalLinks: false,
      maxExpansionGeneration: 0,
    });
    expect(result.results[0]?.candidate?.candidate.metadata).toMatchObject({
      productionValidation: {
        collectionAuthorizationRequired: true,
        noAutomaticProductionScheduling: true,
      },
    });
  });

  it("is idempotent and does not create another batch for existing candidates", () => {
    const dependencies = setup();
    const input = { workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV", manifest: manifest() };

    const first = queueProductionValidationWaveForDiscovery(input, dependencies);
    const second = queueProductionValidationWaveForDiscovery(input, dependencies);

    expect(first.summary.QUEUED).toBe(2);
    expect(second.batchId).toBeUndefined();
    expect(second.summary).toEqual({
      QUEUED: 0,
      ALREADY_IN_DISCOVERY: 2,
      ALREADY_REGISTERED: 0,
      total: 2,
    });
    expect(dependencies.discovery.listBatches()).toHaveLength(1);
  });

  it("rejects manifests that weaken the collection authorization boundary", () => {
    const dependencies = setup();
    const invalid = structuredClone(manifest()) as unknown as {
      governance: { collectionAuthorizationRequired: boolean };
    };
    invalid.governance.collectionAuthorizationRequired = false;

    expect(() =>
      queueProductionValidationWaveForDiscovery(
        {
          workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          manifest: invalid as unknown as ProductionValidationManifest,
        },
        dependencies,
      ),
    ).toThrow("Production validation governance boundaries are required");
  });
});
