import { DatabaseSync } from "node:sqlite";
import type { RawArtifact, SourceGraphNode, SourceGraphObservationBatch } from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, SqliteSourceRepository } from "./index";
import {
  generateSourceGraphId,
  SqliteSourceGraphRepository,
} from "./source-graph-registry";
import { SqliteSourceOperationalTopologyRepository } from "./source-operational-topology";
import { SqliteSourceRegistryV2Repository } from "./source-registry-v2-registry";

const observedAt = "2026-08-19T12:00:00.000Z";

function createSource(
  sources: SqliteSourceRepository,
  slug: string,
  entrypoint = `https://${slug}.example/rules`,
) {
  return sources.create({
    name: slug.toUpperCase(),
    slug,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    canonicalUri: `https://${slug}.example/`,
    entrypoints: [{ uri: entrypoint, label: "Rules" }],
    tags: [],
  });
}

function provenance(sourceId: string, sourceUri: string) {
  return [{ kind: "MANUAL" as const, sourceId, sourceUri, observedAt }];
}

function createGraph(database: DatabaseSync, sourceId: string, entrypoint: string, linked = true) {
  const graph = new SqliteSourceGraphRepository(database);
  const profileId = generateSourceGraphId("spf");
  const rootId = generateSourceGraphId("sgn");
  const pageId = generateSourceGraphId("sgn");
  const authorityId = generateSourceGraphId("sgn");
  const origin = new URL(entrypoint).origin + "/";
  const root: SourceGraphNode = {
    protocolVersion: "1.0",
    objectType: "SOURCE_GRAPH_NODE",
    id: rootId,
    workspaceId: DEFAULT_WORKSPACE.id,
    sourceId,
    profileId,
    kind: "WEBSITE",
    identity: { strategy: "CANONICAL_URI", key: origin },
    reviewState: "RETAINED",
    lifecycleState: "ACTIVE",
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    provenance: provenance(sourceId, origin),
    canonicalOrigin: origin,
    host: new URL(origin).host,
    displayName: "Official site",
  };
  graph.createProfile(
    {
      protocolVersion: "1.0",
      objectType: "WEBSITE_SOURCE_PROFILE",
      id: profileId,
      workspaceId: DEFAULT_WORKSPACE.id,
      sourceId,
      canonicalOrigin: origin,
      canonicalHost: new URL(origin).host,
      observedHostAliases: [],
      rootNodeId: rootId,
      createdAt: observedAt,
      updatedAt: observedAt,
    },
    root,
  );
  const page: SourceGraphNode = {
    protocolVersion: "1.0",
    objectType: "SOURCE_GRAPH_NODE",
    id: pageId,
    workspaceId: DEFAULT_WORKSPACE.id,
    sourceId,
    profileId,
    kind: "PAGE",
    identity: { strategy: "CANONICAL_URI", key: entrypoint },
    reviewState: "RETAINED",
    lifecycleState: "ACTIVE",
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    provenance: provenance(sourceId, entrypoint),
    canonicalUri: entrypoint,
    title: "Rules",
  };
  const authority: SourceGraphNode = {
    protocolVersion: "1.0",
    objectType: "SOURCE_GRAPH_NODE",
    id: authorityId,
    workspaceId: DEFAULT_WORKSPACE.id,
    sourceId,
    profileId,
    kind: "ORGANIZATION",
    identity: { strategy: "SOURCE_LOCAL", key: "authority:office" },
    reviewState: "RETAINED",
    lifecycleState: "ACTIVE",
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    provenance: provenance(sourceId, entrypoint),
    displayName: "Trademark Office",
    organizationType: "AUTHORITY",
    websiteUri: origin,
  };
  const batch: SourceGraphObservationBatch = {
    protocolVersion: "1.0",
    objectType: "SOURCE_GRAPH_OBSERVATION_BATCH",
    id: generateSourceGraphId("sgb"),
    workspaceId: DEFAULT_WORKSPACE.id,
    sourceId,
    profileId,
    idempotencyKey: `topology-test-${sourceId}-${linked}`,
    observedAt,
    producer: { kind: "MANUAL_IMPORT", name: "topology-test" },
    nodes: [page, authority],
    edges: linked
      ? [
          {
            protocolVersion: "1.0",
            objectType: "SOURCE_GRAPH_EDGE",
            id: generateSourceGraphId("sge"),
            workspaceId: DEFAULT_WORKSPACE.id,
            sourceId,
            profileId,
            kind: "PUBLISHED_BY",
            subjectNodeId: pageId,
            objectNodeId: authorityId,
            reviewState: "RETAINED",
            lifecycleState: "ACTIVE",
            firstObservedAt: observedAt,
            lastObservedAt: observedAt,
            provenance: provenance(sourceId, entrypoint),
          },
        ]
      : [],
  };
  graph.ingestObservationBatch(batch);
  return { profileId, rootId, pageId, authorityId };
}

function createRawArtifactsTable(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE raw_artifacts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
  `);
}

function artifact(
  id: string,
  sourceId: string,
  version: number,
  sourceUri: string,
  canonicalUri?: string,
): RawArtifact {
  return {
    schemaVersion: "1.0",
    objectType: "RAW_ARTIFACT",
    id,
    workspaceId: DEFAULT_WORKSPACE.id,
    sourceId,
    logicalDocumentId: `rules-${sourceId}`,
    version,
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: `rules-${version}.html`,
    ...(canonicalUri ? { canonicalUri } : {}),
    storage: { provider: "LOCAL", uri: `cas://${id}` },
    binaryHash: { algorithm: "SHA-256", value: String(version).repeat(64).slice(0, 64) },
    sizeBytes: 100 + version,
    capturedAt: `2026-08-${String(19 + version).padStart(2, "0")}T00:00:00.000Z`,
    collector: { connectorId: "crawl4ai-web", connectorVersion: "1.0.0" },
    provenance: { sourceUri },
    status: "READY_FOR_CONVERSION",
    createdAt: `2026-08-${String(19 + version).padStart(2, "0")}T00:00:00.000Z`,
  };
}

describe("SqliteSourceOperationalTopologyRepository", () => {
  it("projects only explicit family, authority, entrypoint and artifact facts", () => {
    const database = new DatabaseSync(":memory:");
    const sources = new SqliteSourceRepository(database);
    const root = createSource(sources, "family-root");
    const parent = createSource(sources, "family-parent");
    const entrypoint = "https://office.example/rules";
    const child = createSource(sources, "office", entrypoint);
    const v2 = new SqliteSourceRegistryV2Repository(database);
    v2.recordDiscovery(parent.id, { origin: "MANUAL_SEED", discoveredAt: observedAt }, root.id);
    v2.recordDiscovery(
      child.id,
      {
        origin: "EXTERNAL_LINK",
        discoveredAt: observedAt,
        discoveredFromSourceId: parent.id,
        evidenceUrl: "https://family-parent.example/links",
      },
      parent.id,
    );
    const graphIds = createGraph(database, child.id, entrypoint, true);
    createRawArtifactsTable(database);
    const matched = artifact(
      "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      child.id,
      1,
      entrypoint,
      entrypoint,
    );
    const unmatched = artifact(
      "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      child.id,
      2,
      "https://office.example/fees.pdf",
    );
    const insert = database.prepare(
      "INSERT INTO raw_artifacts (id, workspace_id, source_id, document_json, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    for (const item of [matched, unmatched]) {
      insert.run(item.id, item.workspaceId, item.sourceId, JSON.stringify(item), item.createdAt);
    }

    const topology = new SqliteSourceOperationalTopologyRepository(database).get(child.id);
    expect(topology.family).toEqual({
      parentSourceIds: [parent.id, root.id],
      familyRootSourceId: root.id,
      relationshipBasis: "EXPLICIT_PARENT_SOURCE_ID",
    });
    expect(topology.authorities).toEqual([
      expect.objectContaining({ nodeId: graphIds.authorityId, displayName: "Trademark Office" }),
    ]);
    expect(topology.entrypoints).toEqual([
      {
        uri: entrypoint,
        label: "Rules",
        graphNodeId: graphIds.pageId,
        artifactIds: [matched.id],
      },
    ]);
    expect(topology.artifacts).toHaveLength(2);
    expect(topology.artifacts[0]).toMatchObject({
      artifactId: matched.id,
      matchedEntrypointUri: entrypoint,
    });
    expect(topology.artifacts[1]).toMatchObject({
      artifactId: unmatched.id,
      matchedEntrypointUri: null,
    });
    expect(topology.coverage).toEqual({
      sourceRegistryV2Observed: true,
      sourceGraphObserved: true,
      explicitParentageObserved: true,
      explicitAuthorityObserved: true,
      rawArtifactRegistryAvailable: true,
      rawArtifactsObserved: true,
    });
  });

  it("does not infer an authority from source category or an unlinked authority node", () => {
    const database = new DatabaseSync(":memory:");
    const sources = new SqliteSourceRepository(database);
    const source = createSource(sources, "unlinked-authority");
    createGraph(database, source.id, source.entrypoints[0]!.uri, false);

    const topology = new SqliteSourceOperationalTopologyRepository(database).get(source.id);
    expect(topology.source.category).toBe("OFFICIAL_AUTHORITY");
    expect(topology.authorities).toEqual([]);
    expect(topology.coverage.explicitAuthorityObserved).toBe(false);
    expect(topology.coverage.rawArtifactRegistryAvailable).toBe(false);
  });

  it("fails closed when explicit parentage contains a cycle", () => {
    const database = new DatabaseSync(":memory:");
    const sources = new SqliteSourceRepository(database);
    const first = createSource(sources, "cycle-first");
    const second = createSource(sources, "cycle-second");
    const v2 = new SqliteSourceRegistryV2Repository(database);
    v2.recordDiscovery(first.id, { origin: "MANUAL_SEED", discoveredAt: observedAt }, second.id);
    v2.recordDiscovery(second.id, { origin: "MANUAL_SEED", discoveredAt: observedAt }, first.id);

    expect(() => new SqliteSourceOperationalTopologyRepository(database).get(first.id)).toThrow(
      "Explicit source parentage contains a cycle",
    );
  });
});
