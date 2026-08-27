import {
  isContentEdgeV1,
  isContentObjectRefV1,
  isKnowledgeRetrievalCompositionQueryV1,
  type ContentObjectRefV1,
  type KnowledgeGraphEvidenceV1,
  type KnowledgeLexicalEvidenceV1,
  type KnowledgeRetrievalCompositionQueryV1,
  type KnowledgeRetrievalCompositionResultV1,
  type KnowledgeRetrievalEvidenceV1,
  type KnowledgeVectorEvidenceV1,
  type KnowledgeVectorProviderDescriptorV1,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import type { ContentNeighborV1 } from "@markorbit/persistence/content-relationships";

const DEFAULT_LIMIT = 20;

export type KnowledgeLexicalHit = {
  content: ContentObjectRefV1;
  indexMode: string;
  score: number;
  snippet: string;
  headingPath: string[];
};

export interface KnowledgeLexicalRetrievalReader {
  search(input: { workspaceId: string; queryText: string; limit: number }):
    | KnowledgeLexicalHit[]
    | Promise<KnowledgeLexicalHit[]>;
}

export interface KnowledgeGraphRetrievalReader {
  listNeighbors(
    content: ContentObjectRefV1,
    limit?: number,
    offset?: number,
  ): { items: ContentNeighborV1[] };
}

export type KnowledgeVectorHit = {
  content: ContentObjectRefV1;
  value: number;
};

export interface KnowledgeVectorRetrievalProvider {
  descriptor: KnowledgeVectorProviderDescriptorV1;
  search(input: { workspaceId: string; queryText: string; limit: number }):
    | KnowledgeVectorHit[]
    | Promise<KnowledgeVectorHit[]>;
}

export class KnowledgeVectorProviderUnavailableError extends Error {
  readonly code = "KNOWLEDGE_VECTOR_PROVIDER_UNAVAILABLE";
  readonly httpStatus = 503;

  constructor() {
    super("Vector retrieval was required, but no real vector provider is configured.");
    this.name = "KnowledgeVectorProviderUnavailableError";
  }
}

function identity(content: ContentObjectRefV1): string {
  return [content.workspaceId, content.objectKind, content.objectId].join("\u001f");
}

function validateContent(content: ContentObjectRefV1, workspaceId: string, channel: string): void {
  if (!isContentObjectRefV1(content) || content.workspaceId !== workspaceId) {
    throw new RegistryValidationError(`${channel} retrieval returned invalid workspace content`);
  }
}

function validateGraphNeighbor(
  seed: ContentObjectRefV1,
  neighbor: ContentNeighborV1,
  workspaceId: string,
): void {
  validateContent(neighbor.neighbor, workspaceId, "GRAPH");
  if (!isContentEdgeV1(neighbor.edge)) {
    throw new RegistryValidationError("GRAPH retrieval returned an invalid content edge");
  }

  const seedIdentity = identity(seed);
  const neighborIdentity = identity(neighbor.neighbor);
  const fromIdentity = identity(neighbor.edge.from);
  const toIdentity = identity(neighbor.edge.to);
  const matchesDirection =
    neighbor.direction === "OUTGOING"
      ? fromIdentity === seedIdentity && toIdentity === neighborIdentity
      : neighbor.direction === "INCOMING"
        ? toIdentity === seedIdentity && fromIdentity === neighborIdentity
        : false;

  if (!matchesDirection) {
    throw new RegistryValidationError(
      "GRAPH retrieval returned an edge inconsistent with the requested seed and neighbor",
    );
  }
}

function validateDescriptor(descriptor: KnowledgeVectorProviderDescriptorV1): void {
  const strings = [descriptor.providerId, descriptor.modelId, descriptor.indexId];
  if (strings.some((value) => !value || value !== value.trim())) {
    throw new RegistryValidationError("Vector provider descriptor is invalid");
  }
  if (
    descriptor.metric !== "SIMILARITY_HIGHER_IS_BETTER" &&
    descriptor.metric !== "DISTANCE_LOWER_IS_BETTER"
  ) {
    throw new RegistryValidationError("Vector provider metric is invalid");
  }
}

function channelOrder(evidence: KnowledgeRetrievalEvidenceV1): number {
  if (evidence.channel === "LEXICAL") return 0;
  if (evidence.channel === "GRAPH") return 1;
  return 2;
}

export async function composeKnowledgeRetrieval(
  query: KnowledgeRetrievalCompositionQueryV1,
  lexical: KnowledgeLexicalRetrievalReader,
  graph: KnowledgeGraphRetrievalReader,
  vector?: KnowledgeVectorRetrievalProvider,
): Promise<KnowledgeRetrievalCompositionResultV1> {
  if (!isKnowledgeRetrievalCompositionQueryV1(query)) {
    throw new RegistryValidationError("Knowledge retrieval composition query is invalid");
  }

  const lexicalLimit = query.lexicalLimit ?? DEFAULT_LIMIT;
  const graphLimit = query.graphLimit ?? DEFAULT_LIMIT;
  const vectorLimit = query.vectorLimit ?? DEFAULT_LIMIT;
  const vectorMode = query.vectorMode ?? "OPTIONAL";
  if (vectorMode === "REQUIRED" && !vector) throw new KnowledgeVectorProviderUnavailableError();

  const items = new Map<
    string,
    { content: ContentObjectRefV1; evidence: KnowledgeRetrievalEvidenceV1[] }
  >();
  const add = (content: ContentObjectRefV1, evidence: KnowledgeRetrievalEvidenceV1) => {
    validateContent(content, query.workspaceId, evidence.channel);
    const key = identity(content);
    const item = items.get(key) ?? { content: structuredClone(content), evidence: [] };
    item.evidence.push(structuredClone(evidence));
    items.set(key, item);
  };

  const lexicalHits = await lexical.search({
    workspaceId: query.workspaceId,
    queryText: query.queryText,
    limit: lexicalLimit,
  });
  lexicalHits.forEach((hit, index) => {
    if (!Number.isFinite(hit.score)) {
      throw new RegistryValidationError("Lexical retrieval returned an invalid score");
    }
    const evidence: KnowledgeLexicalEvidenceV1 = {
      channel: "LEXICAL",
      position: index + 1,
      indexMode: hit.indexMode,
      score: hit.score,
      snippet: hit.snippet,
      headingPath: [...hit.headingPath],
    };
    add(hit.content, evidence);
  });

  const graphNeighbors = query.graphSeed
    ? graph.listNeighbors(query.graphSeed, graphLimit, 0).items
    : [];
  graphNeighbors.forEach((neighbor, index) => {
    validateGraphNeighbor(query.graphSeed!, neighbor, query.workspaceId);
    const evidence: KnowledgeGraphEvidenceV1 = {
      channel: "GRAPH",
      position: index + 1,
      seed: structuredClone(query.graphSeed!),
      direction: neighbor.direction,
      edge: structuredClone(neighbor.edge),
    };
    add(neighbor.neighbor, evidence);
  });

  let vectorHits: KnowledgeVectorHit[] = [];
  if (vector && vectorMode !== "DISABLED") {
    validateDescriptor(vector.descriptor);
    vectorHits = await vector.search({
      workspaceId: query.workspaceId,
      queryText: query.queryText,
      limit: vectorLimit,
    });
    vectorHits.forEach((hit, index) => {
      if (!Number.isFinite(hit.value)) {
        throw new RegistryValidationError("Vector retrieval returned an invalid native value");
      }
      const evidence: KnowledgeVectorEvidenceV1 = {
        channel: "VECTOR",
        position: index + 1,
        provider: structuredClone(vector.descriptor),
        value: hit.value,
      };
      add(hit.content, evidence);
    });
  }

  const resultItems = [...items.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, item]) => ({
      content: item.content,
      evidence: item.evidence.sort(
        (left, right) => channelOrder(left) - channelOrder(right) || left.position - right.position,
      ),
    }));

  return {
    protocolVersion: "1.0",
    objectType: "KNOWLEDGE_RETRIEVAL_COMPOSITION_RESULT",
    workspaceId: query.workspaceId,
    queryText: query.queryText,
    channels: {
      lexical: { available: true, count: lexicalHits.length },
      graph: query.graphSeed
        ? { available: true, count: graphNeighbors.length }
        : { available: false, count: 0, reason: "NO_GRAPH_SEED" },
      vector:
        vectorMode === "DISABLED"
          ? { available: false, count: 0, reason: "DISABLED" }
          : vector
            ? {
                available: true,
                count: vectorHits.length,
                provider: structuredClone(vector.descriptor),
              }
            : { available: false, count: 0, reason: "PROVIDER_UNAVAILABLE" },
    },
    items: resultItems,
  };
}
