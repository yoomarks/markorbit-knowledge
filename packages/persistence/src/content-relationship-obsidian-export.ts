import { createHash } from "node:crypto";
import type { ContentFacetV1, ContentObjectRefV1 } from "@markorbit/contracts";
import { RegistryValidationError } from "./index";
import type { ContentNeighborV1, ContentRelationshipPage } from "./content-relationship-registry";

export type KnowledgeExportClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export type KnowledgeObsidianExportAccessContext = {
  authorized: boolean;
  workspaceId: string;
  classification: KnowledgeExportClassification;
};

export type KnowledgeObsidianExportInput = {
  content: ContentObjectRefV1;
  title: string;
  bodyMarkdown: string;
  sourceRef?: string;
  access: KnowledgeObsidianExportAccessContext;
};

export type KnowledgeObsidianExportArtifact = {
  content: ContentObjectRefV1;
  targetPath: string;
  markdown: string;
};

export interface ContentRelationshipReadRepository {
  listFacets(content: ContentObjectRefV1): ContentFacetV1[];
  listNeighbors(
    content: ContentObjectRefV1,
    limit?: number,
    offset?: number,
  ): ContentRelationshipPage<ContentNeighborV1>;
}

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return normalized;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function noteName(content: ContentObjectRefV1): string {
  const digest = createHash("sha256")
    .update(`${content.objectKind}\u001f${content.objectId}`, "utf8")
    .digest("hex")
    .slice(0, 16);
  return `${content.objectKind.toLowerCase()}-${digest}`;
}

export function knowledgeObsidianNoteTargetPath(content: ContentObjectRefV1): string {
  return `knowledge/${noteName(content)}.md`;
}

function wikilink(content: ContentObjectRefV1): string {
  return `[[${noteName(content)}]]`;
}

function renderFacets(facets: readonly ContentFacetV1[]): string[] {
  if (facets.length === 0) return ["- none"];
  return facets.map((facet) => `- ${facet.facetType}: ${facet.value} (${facet.origin})`);
}

function renderNeighbors(
  neighbors: readonly ContentNeighborV1[],
  direction: ContentNeighborV1["direction"],
): string[] {
  const selected = neighbors.filter((item) => item.direction === direction);
  if (selected.length === 0) return ["- none"];
  return selected.map((item) => {
    const algorithm = item.edge.algorithm
      ? `; algorithm=${item.edge.algorithm.id}@${item.edge.algorithm.version}`
      : "";
    return `- ${wikilink(item.neighbor)} — ${item.edge.relationType} (${item.edge.origin}${algorithm})`;
  });
}

export function buildKnowledgeObsidianRelationshipNote(
  repository: ContentRelationshipReadRepository,
  inputValue: KnowledgeObsidianExportInput,
): KnowledgeObsidianExportArtifact {
  const title = required(inputValue.title, "title");
  const bodyMarkdown = inputValue.bodyMarkdown.trim();
  const sourceRef = inputValue.sourceRef?.trim();
  const access = inputValue.access;

  if (!access?.authorized) {
    throw new RegistryValidationError(
      "Knowledge Obsidian export requires authorized server-side context",
    );
  }
  if (access.workspaceId !== inputValue.content.workspaceId) {
    throw new RegistryValidationError(
      "Knowledge Obsidian export workspace does not match content workspace",
    );
  }
  if (!bodyMarkdown) {
    throw new RegistryValidationError("bodyMarkdown is required");
  }

  const facets = repository.listFacets(inputValue.content);
  const neighbors = repository.listNeighbors(inputValue.content, 200, 0);
  if (neighbors.total > neighbors.items.length) {
    throw new RegistryValidationError(
      "Knowledge Obsidian export does not support truncated relationship neighborhoods",
    );
  }

  const lines = [
    "---",
    `knowledge_id: ${yamlString(inputValue.content.objectId)}`,
    `knowledge_kind: ${yamlString(inputValue.content.objectKind)}`,
    `workspace_id: ${yamlString(inputValue.content.workspaceId)}`,
    `classification: ${yamlString(access.classification)}`,
  ];
  if (sourceRef) lines.push(`source_ref: ${yamlString(sourceRef)}`);
  lines.push(
    "---",
    "",
    `# ${title}`,
    "",
    bodyMarkdown,
    "",
    "## Facets",
    "",
    ...renderFacets(facets),
    "",
    "## Related",
    "",
    ...renderNeighbors(neighbors.items, "OUTGOING"),
    "",
    "## Backlinks",
    "",
    ...renderNeighbors(neighbors.items, "INCOMING"),
    "",
  );

  return {
    content: structuredClone(inputValue.content),
    targetPath: knowledgeObsidianNoteTargetPath(inputValue.content),
    markdown: lines.join("\n"),
  };
}
