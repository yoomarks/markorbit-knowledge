import { afterEach, describe, expect, it } from "vitest";
import { openRegistryDatabase, SqliteSourceRepository } from "./index";
import {
  queueProductionValidationWaveForDiscovery,
  type ProductionValidationManifest,
} from "./production-validation-discovery-intake";
import { inspectProductionValidationOnboarding } from "./production-validation-onboarding-status";
import { SqliteSourceDiscoveryRepository } from "./source-discovery-registry";

const databases: Array<ReturnType<typeof openRegistryDatabase>> = [];
const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

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
  const clock = () => new Date("2026-08-19T03:30:00Z");
  return {
    sources: new SqliteSourceRepository(database, clock),
    discovery: new SqliteSourceDiscoveryRepository(database, clock),
  };
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe("production validation onboarding status", () => {
  it("reports untouched wave targets as not queued", () => {
    const dependencies = setup();
    const status = inspectProductionValidationOnboarding(
      { workspaceId, manifest: manifest() },
      dependencies,
    );

    expect(status.summary).toEqual({
      NOT_QUEUED: 2,
      IN_DISCOVERY: 0,
      REGISTERED: 0,
      total: 2,
    });
    expect(status.items.map((item) => item.state)).toEqual(["NOT_QUEUED", "NOT_QUEUED"]);
  });

  it("reports queued wave targets from the governed Discovery registry", () => {
    const dependencies = setup();
    const wave = manifest();
    queueProductionValidationWaveForDiscovery({ workspaceId, manifest: wave }, dependencies);

    const status = inspectProductionValidationOnboarding(
      { workspaceId, manifest: wave },
      dependencies,
    );

    expect(status.summary).toEqual({
      NOT_QUEUED: 0,
      IN_DISCOVERY: 2,
      REGISTERED: 0,
      total: 2,
    });
    expect(status.items.every((item) => item.candidateStatus === "DISCOVERED")).toBe(true);
    expect(status.items.every((item) => Boolean(item.candidateId))).toBe(true);
  });
});
