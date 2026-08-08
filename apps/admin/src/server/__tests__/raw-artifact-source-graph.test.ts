import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_V1_VERSION,
  SOURCE_GRAPH_PROTOCOL_VERSION,
  validateSourceGraphObservationBatch,
  type RawArtifact,
  type SourceGraphNode,
  type WebsiteSourceProfile,
} from "@markorbit/contracts";
import { initializeRegistry } from "@markorbit/persistence";
import { SqliteSourceGraphRepository } from "@markorbit/persistence/source-graph";
import { buildRawArtifactSourceGraphBatch } from "../raw-artifact-source-graph";

const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PROFILE_ID = "spf_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ROOT_ID = "sgn_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const T0 = "2026-08-08T00:00:00Z";
const T1 = "2026-08-08T01:00:00Z";

type WebsiteNode = Extract<SourceGraphNode, { kind: "WEBSITE" }>;

function profile(): WebsiteSourceProfile {
  return {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "WEBSITE_SOURCE_PROFILE",
    id: PROFILE_ID,
    workspaceId: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    canonicalOrigin: "https://example.com/",
    canonicalHost: "example.com",
    observedHostAliases: ["example.com", "www.example.com"],
    rootNodeId: ROOT_ID,
    createdAt: T0,
    updatedAt: T0,
  };
}

function root(): WebsiteNode {
  return {
    protocolVersion: SOURCE_GRAPH_PROTOCOL_VERSION,
    objectType: "SOURCE_GRAPH_NODE",
    id: ROOT_ID,
    workspaceId: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    profileId: PROFILE_ID,
    kind: "WEBSITE",
    identity: { strategy: "CANONICAL_URI", key: "https://example.com/" },
    reviewState: "RETAINED",
    lifecycleState: "ACTIVE",
    firstObservedAt: T0,
    lastObservedAt: T0,
    provenance: [
      {
        kind: "MANUAL",
        sourceId: SOURCE_ID,
        sourceUri: "https://example.com/",
        observedAt: T0,
      },
    ],
    canonicalOrigin: "https://example.com/",
    host: "example.com",
    displayName: "Example",
  };
}

function artifact(canonicalUri: string): RawArtifact {
  return {
    schemaVersion: SCHEMA_V1_VERSION,
    objectType: "RAW_ARTIFACT",
    id: ARTIFACT_ID,
    workspaceId: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    collectionRunId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    version: 1,
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: "page.html",
    canonicalUri,
    storage: { provider: "LOCAL", uri: "file:///tmp/page.html" },
    binaryHash: { algorithm: "SHA-256", value: "0".repeat(64) },
    sizeBytes: 1024,
    capturedAt: T1,
    collector: { connectorId: "crawl4ai-web", connectorVersion: "1.0.0" },
    provenance: { sourceUri: canonicalUri },
    status: "REGISTERED",
    createdAt: T1,
  };
}

function repository() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  const graph = new SqliteSourceGraphRepository(database);
  graph.createProfile(profile(), root());
  return { database, graph };
}

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Trademark Services</title>
    <link rel="canonical" href="/services/trademarks" />
    <script type="application/ld+json">
      {
        "@type": "Article",
        "author": {
          "@type": "Person",
          "name": "Alex Smith",
          "jobTitle": "Trademark Attorney",
          "email": "alex@example.com",
          "worksFor": {
            "@type": "LegalService",
            "name": "Example IP",
            "url": "https://example.com/",
            "telephone": "+1 202 555 0100"
          }
        },
        "publisher": {
          "@type": "Organization",
          "name": "Example IP",
          "url": "https://example.com/",
          "email": "info@example.com"
        }
      }
    </script>
  </head>
  <body>
    <a href="/guides/fees.pdf">Fee guide</a>
    <a href="/sitemap.xml">Sitemap</a>
    <a href="/contact">Contact</a>
    <a href="https://outside.example/news">External</a>
    <a href="mailto:info@example.com">Email</a>
    <a href="tel:+12025550100">Call</a>
  </body>
</html>`;

describe("RawArtifact → Source Graph extraction", () => {
  it("extracts same-site structure, explicit JSON-LD entities and public business contacts", () => {
    const { database, graph } = repository();
    const built = buildRawArtifactSourceGraphBatch(
      artifact("https://example.com/services/trademarks"),
      profile(),
      HTML,
      graph,
    );

    expect(validateSourceGraphObservationBatch(built.batch)).toEqual([]);
    expect(built.linkCount).toBe(3);
    expect(built.entityCount).toBeGreaterThanOrEqual(2);
    expect(built.contactCount).toBeGreaterThanOrEqual(3);
    expect(built.batch.nodes.some((node) => node.kind === "DOCUMENT")).toBe(true);
    expect(built.batch.nodes.some((node) => node.kind === "SITEMAP")).toBe(true);
    expect(built.batch.nodes.some((node) => node.kind === "PERSON")).toBe(true);
    expect(built.batch.nodes.some((node) => node.kind === "ORGANIZATION")).toBe(true);
    expect(built.batch.nodes.some((node) => node.kind === "CONTACT_POINT")).toBe(true);
    expect(
      built.batch.nodes.some(
        (node) =>
          "canonicalUri" in node &&
          typeof node.canonicalUri === "string" &&
          node.canonicalUri.includes("outside.example"),
      ),
    ).toBe(false);
    expect(
      built.batch.nodes
        .filter((node) => node.kind === "CONTACT_POINT")
        .every((node) => node.reviewState === "OBSERVED" && node.lastVerifiedAt === undefined),
    ).toBe(true);
    expect(
      built.batch.nodes.every((node) =>
        node.provenance.every(
          (item) => item.kind === "RAW_ARTIFACT" && item.rawArtifactId === ARTIFACT_ID,
        ),
      ),
    ).toBe(true);

    database.close();
  });

  it("replays the same immutable artifact with byte-for-byte deterministic observation content", () => {
    const { database, graph } = repository();
    const raw = artifact("https://example.com/services/trademarks");
    const first = buildRawArtifactSourceGraphBatch(raw, profile(), HTML, graph);
    const firstIngest = graph.ingestObservationBatch(first.batch);
    expect(firstIngest.replayed).toBe(false);

    const second = buildRawArtifactSourceGraphBatch(raw, profile(), HTML, graph);
    expect(second.batch).toEqual(first.batch);
    const secondIngest = graph.ingestObservationBatch(second.batch);
    expect(secondIngest.replayed).toBe(true);

    const retainedContact = graph
      .listNodes(PROFILE_ID)
      .find((node) => node.kind === "CONTACT_POINT");
    expect(retainedContact).toBeDefined();
    graph.reviewNode(retainedContact!.id, "RETAINED");
    graph.ingestObservationBatch(second.batch);
    expect(graph.getNode(retainedContact!.id)?.reviewState).toBe("RETAINED");

    database.close();
  });

  it("collapses a captured homepage into the WEBSITE root instead of inventing a duplicate PAGE", () => {
    const { database, graph } = repository();
    const homepage = `
      <html><head><title>Example</title><link rel="canonical" href="https://example.com/" /></head>
      <body><a href="/trademarks">Trademarks</a></body></html>
    `;
    const built = buildRawArtifactSourceGraphBatch(
      artifact("https://example.com/"),
      profile(),
      homepage,
      graph,
    );
    expect(validateSourceGraphObservationBatch(built.batch)).toEqual([]);
    expect(
      built.batch.nodes.filter(
        (node) => node.kind === "PAGE" && node.canonicalUri === "https://example.com/",
      ),
    ).toHaveLength(0);
    expect(built.batch.nodes.some((node) => node.kind === "WEBSITE" && node.id === ROOT_ID)).toBe(
      true,
    );

    database.close();
  });
});
