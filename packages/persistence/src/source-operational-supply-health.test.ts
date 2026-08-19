import { DatabaseSync } from "node:sqlite";
import type { SourceOperationalTopology } from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE,
  RegistryConflictError,
  SqliteSourceRepository,
  openRegistryDatabase,
} from "./index";
import {
  SqliteOperationalSupplyHealthRepository,
  projectSourceSupplyOperationalTopology,
} from "./source-compatibility-supply-health";

const observedAt = "2026-08-19T12:00:00.000Z";

function topology(
  sourceId: string,
  input: {
    root?: string;
    registry?: boolean;
    graph?: boolean;
    parentage?: boolean;
    authority?: boolean;
    mappedEntrypoints?: number;
    artifactLinkedEntrypoints?: number;
    artifacts?: number;
    provenance?: number;
    relationships?: number;
  } = {},
): SourceOperationalTopology {
  const entrypointCount = Math.max(
    input.mappedEntrypoints ?? 0,
    input.artifactLinkedEntrypoints ?? 0,
    1,
  );
  return {
    protocolVersion: "1.0",
    objectType: "SOURCE_OPERATIONAL_TOPOLOGY",
    workspaceId: DEFAULT_WORKSPACE.id,
    source: {
      sourceId,
      name: sourceId,
      sourceType: "WEB",
      category: "OFFICIAL_AUTHORITY",
      authorityLevel: "PRIMARY_OFFICIAL",
      canonicalUri: `https://${sourceId}.example/`,
    },
    family: {
      parentSourceIds: input.parentage ? [input.root ?? "source-root"] : [],
      familyRootSourceId: input.root ?? sourceId,
      relationshipBasis: "EXPLICIT_PARENT_SOURCE_ID",
    },
    authorities: input.authority
      ? [
          {
            nodeId: `authority-${sourceId}`,
            displayName: "Trademark Office",
            websiteUri: `https://${sourceId}.example/`,
            publishedByEdgeIds: [`published-by-${sourceId}`],
          },
        ]
      : [],
    entrypoints: Array.from({ length: entrypointCount }, (_, index) => ({
      uri: `https://${sourceId}.example/page-${index + 1}`,
      label: null,
      graphNodeId: index < (input.mappedEntrypoints ?? 0) ? `node-${sourceId}-${index}` : null,
      artifactIds:
        index < (input.artifactLinkedEntrypoints ?? 0) ? [`artifact-${sourceId}-${index}`] : [],
    })),
    artifacts: Array.from({ length: input.artifacts ?? 0 }, (_, index) => ({
      artifactId: `artifact-${sourceId}-${index}`,
      artifactKind: "HTML" as const,
      version: 1,
      logicalDocumentId: null,
      canonicalUri: `https://${sourceId}.example/page-${index + 1}`,
      sourceUri: `https://${sourceId}.example/page-${index + 1}`,
      binarySha256: "a".repeat(64),
      contentSha256: null,
      sizeBytes: 100,
      capturedAt: observedAt,
      matchedEntrypointUri: null,
    })),
    relationships: Array.from({ length: input.relationships ?? 0 }, () => ({
      relationshipType: "REFERENCES" as const,
      sourceId,
      relatedSourceId: "source-related",
    })),
    discoveryProvenance: Array.from({ length: input.provenance ?? 0 }, () => ({
      origin: "EXTERNAL_LINK" as const,
      discoveredAt: observedAt,
      discoveredFromSourceId: "source-parent",
      evidenceUrl: "https://parent.example/links",
    })),
    graph: input.graph
      ? {
          profileId: `profile-${sourceId}`,
          rootNodeId: `root-${sourceId}`,
          nodeCount: 3,
          edgeCount: 2,
        }
      : null,
    coverage: {
      sourceRegistryV2Observed: input.registry ?? false,
      sourceGraphObserved: input.graph ?? false,
      explicitParentageObserved: input.parentage ?? false,
      explicitAuthorityObserved: input.authority ?? false,
      rawArtifactRegistryAvailable: true,
      rawArtifactsObserved: (input.artifacts ?? 0) > 0,
    },
  };
}

function createCoverageSource(database: DatabaseSync) {
  return new SqliteSourceRepository(database).create({
    workspaceId: DEFAULT_WORKSPACE.id,
    name: "USPTO Trademarks",
    slug: "operational-health-uspto",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    canonicalUri: "https://www.uspto.gov/trademarks",
    entrypoints: [{ uri: "https://www.uspto.gov/trademarks" }],
    tags: ["source-coverage", "foundational"],
  });
}

describe("operational topology supply health", () => {
  it("aggregates only observed topology facts and records governed projection failures", () => {
    const observations = new Map([
      [
        "source-a",
        topology("source-a", {
          root: "source-root",
          registry: true,
          graph: true,
          parentage: true,
          authority: true,
          mappedEntrypoints: 2,
          artifactLinkedEntrypoints: 1,
          artifacts: 2,
          provenance: 2,
          relationships: 1,
        }),
      ],
      [
        "source-b",
        topology("source-b", {
          root: "source-root",
          registry: true,
          mappedEntrypoints: 0,
          artifacts: 1,
          provenance: 1,
        }),
      ],
    ]);
    const repository = {
      get(sourceId: string) {
        if (sourceId === "source-c") {
          throw new RegistryConflictError("SOURCE_TOPOLOGY_PARENT_CYCLE", "cycle");
        }
        return observations.get(sourceId)!;
      },
    };

    const result = projectSourceSupplyOperationalTopology(
      ["source-b", "source-a", "source-c", "source-a"],
      repository,
    );

    expect(result).toEqual({
      projectionState: "PARTIAL",
      registeredSourceCount: 3,
      projectedSourceCount: 2,
      unprojectableSourceIds: ["source-c"],
      sourceRegistryV2ObservedSourceCount: 2,
      sourceGraphObservedSourceCount: 1,
      explicitParentageObservedSourceCount: 1,
      explicitAuthorityObservedSourceCount: 1,
      entrypointCount: 3,
      graphMappedEntrypointCount: 2,
      artifactLinkedEntrypointCount: 1,
      rawArtifactCount: 3,
      discoveryProvenanceCount: 3,
      relationshipCount: 1,
      familyRootSourceIds: ["source-root"],
    });
  });

  it("does not swallow unknown infrastructure failures", () => {
    expect(() =>
      projectSourceSupplyOperationalTopology(["source-a"], {
        get() {
          throw new Error("sqlite unavailable");
        },
      }),
    ).toThrow("sqlite unavailable");
  });

  it("adds topology coverage without changing the existing supply state or gaps", () => {
    const database = openRegistryDatabase(":memory:");
    createCoverageSource(database);
    const result = new SqliteOperationalSupplyHealthRepository(database, () =>
      new Date("2026-08-19T12:00:00.000Z"),
    ).list({
      workspaceId: DEFAULT_WORKSPACE.id,
      targetId: "us-uspto-trademarks-root",
    });

    expect(result.items).toHaveLength(1);
    const item = result.items[0]!;
    expect(item.state).toBe("BLOCKED");
    expect(item.gaps).toEqual(
      expect.arrayContaining([
        "NO_ACQUISITION_EVIDENCE",
        "NO_NORMALIZED_DOCUMENT",
        "NO_RETRIEVAL_DOCUMENT",
      ]),
    );
    expect(item.operationalTopology).toMatchObject({
      projectionState: "COMPLETE",
      registeredSourceCount: 1,
      projectedSourceCount: 1,
      sourceRegistryV2ObservedSourceCount: 0,
      sourceGraphObservedSourceCount: 0,
      entrypointCount: 1,
      graphMappedEntrypointCount: 0,
      rawArtifactCount: 0,
    });
    expect(result.summary.byTopologyProjection).toEqual({
      UNREGISTERED: 0,
      COMPLETE: 1,
      PARTIAL: 0,
      FAILED: 0,
    });
    expect(result.summary.topologySourceRegistryV2Observed).toBe(0);
    expect(result.summary.topologySourceGraphObserved).toBe(0);
    database.close();
  });

  it("keeps unregistered targets explicit instead of fabricating zero-observation success", () => {
    const result = projectSourceSupplyOperationalTopology([], {
      get() {
        throw new Error("must not be called");
      },
    });
    expect(result).toMatchObject({
      projectionState: "UNREGISTERED",
      registeredSourceCount: 0,
      projectedSourceCount: 0,
    });
  });
});
