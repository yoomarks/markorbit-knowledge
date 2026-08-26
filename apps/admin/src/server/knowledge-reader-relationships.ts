import type { ContentEdgeV1, ContentFacetV1, ContentObjectRefV1 } from "@markorbit/contracts";

const RELATIONSHIP_LIMIT = 200;

export type KnowledgeReaderRelationshipMetadata = {
  title?: string;
  readerHref?: string;
  sourceName?: string;
  version?: number;
  jurisdictions?: readonly string[];
};

export type KnowledgeReaderRelationshipItem = {
  direction: "OUTGOING" | "INCOMING";
  relationType: ContentEdgeV1["relationType"];
  origin: ContentEdgeV1["origin"];
  evidenceRef?: string;
  algorithm?: Readonly<{ id: string; version: string }>;
  content: ContentObjectRefV1 & {
    title?: string;
    readerHref?: string;
    sourceName?: string;
    version?: number;
    jurisdictions: string[];
    facets: Array<{
      facetType: ContentFacetV1["facetType"];
      value: string;
      origin: ContentFacetV1["origin"];
      evidenceRef?: string;
    }>;
  };
};

export type KnowledgeReaderRelationships = {
  protocolVersion: "1.0";
  content: ContentObjectRefV1;
  related: KnowledgeReaderRelationshipItem[];
  backlinks: KnowledgeReaderRelationshipItem[];
  truncated: boolean;
};

export interface KnowledgeReaderRelationshipRepository {
  listFacets(content: ContentObjectRefV1): ContentFacetV1[];
  listNeighbors(
    content: ContentObjectRefV1,
    limit?: number,
    offset?: number,
  ): {
    items: Array<{
      direction: "OUTGOING" | "INCOMING";
      edge: ContentEdgeV1;
      neighbor: ContentObjectRefV1;
    }>;
    total: number;
    limit: number;
    offset: number;
  };
  listBacklinks(
    content: ContentObjectRefV1,
    limit?: number,
    offset?: number,
  ): { items: ContentEdgeV1[]; total: number; limit: number; offset: number };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function contentView(
  repository: KnowledgeReaderRelationshipRepository,
  content: ContentObjectRefV1,
  metadata: KnowledgeReaderRelationshipMetadata | undefined,
): KnowledgeReaderRelationshipItem["content"] {
  const facets = repository.listFacets(content);
  const facetJurisdictions = facets
    .filter((facet) => facet.facetType === "JURISDICTION")
    .map((facet) => facet.value);
  return {
    ...structuredClone(content),
    ...(metadata?.title ? { title: metadata.title } : {}),
    ...(metadata?.readerHref ? { readerHref: metadata.readerHref } : {}),
    ...(metadata?.sourceName ? { sourceName: metadata.sourceName } : {}),
    ...(metadata?.version === undefined ? {} : { version: metadata.version }),
    jurisdictions: unique([...(metadata?.jurisdictions ?? []), ...facetJurisdictions]),
    facets: facets.map((facet) => ({
      facetType: facet.facetType,
      value: facet.value,
      origin: facet.origin,
      ...(facet.evidenceRef ? { evidenceRef: facet.evidenceRef } : {}),
    })),
  };
}

function relationshipItem(
  repository: KnowledgeReaderRelationshipRepository,
  direction: "OUTGOING" | "INCOMING",
  edge: ContentEdgeV1,
  content: ContentObjectRefV1,
  resolveMetadata: (content: ContentObjectRefV1) => KnowledgeReaderRelationshipMetadata | undefined,
): KnowledgeReaderRelationshipItem {
  return {
    direction,
    relationType: edge.relationType,
    origin: edge.origin,
    ...(edge.evidenceRef ? { evidenceRef: edge.evidenceRef } : {}),
    ...(edge.algorithm ? { algorithm: structuredClone(edge.algorithm) } : {}),
    content: contentView(repository, content, resolveMetadata(content)),
  };
}

export function buildKnowledgeReaderRelationships(
  repository: KnowledgeReaderRelationshipRepository,
  content: ContentObjectRefV1,
  resolveMetadata: (
    content: ContentObjectRefV1,
  ) => KnowledgeReaderRelationshipMetadata | undefined = () => undefined,
): KnowledgeReaderRelationships {
  const neighbors = repository.listNeighbors(content, RELATIONSHIP_LIMIT, 0);
  const backlinkPage = repository.listBacklinks(content, RELATIONSHIP_LIMIT, 0);

  const related = neighbors.items
    .filter((item) => item.direction === "OUTGOING")
    .map((item) =>
      relationshipItem(repository, "OUTGOING", item.edge, item.neighbor, resolveMetadata),
    );
  const backlinks = backlinkPage.items.map((edge) =>
    relationshipItem(repository, "INCOMING", edge, edge.from, resolveMetadata),
  );

  return {
    protocolVersion: "1.0",
    content: structuredClone(content),
    related,
    backlinks,
    truncated:
      neighbors.total > neighbors.items.length || backlinkPage.total > backlinkPage.items.length,
  };
}
