import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isContentEdgeV1,
  isContentFacetV1,
  isContentObjectRefV1,
  type ContentEdgeV1,
  type ContentFacetType,
  type ContentFacetV1,
  type ContentObjectRefV1,
} from "@markorbit/contracts";
import { RegistryValidationError, initializeRegistry } from "./index";

const MIGRATION_ID = "0023_content_relationship_graph";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type ContentRelationshipPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type ContentNeighborV1 = {
  direction: "OUTGOING" | "INCOMING";
  edge: ContentEdgeV1;
  neighbor: ContentObjectRefV1;
};

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized || normalized !== value) {
    throw new RegistryValidationError(`${field} must be a non-blank canonical string`);
  }
  return normalized;
}

function page(limit = DEFAULT_LIMIT, offset = 0): { limit: number; offset: number } {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RegistryValidationError("offset must be a non-negative integer");
  }
  return { limit: Math.min(limit, MAX_LIMIT), offset };
}

function digest(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}

function facetId(facet: ContentFacetV1): string {
  return `facet_${digest([
    facet.content.workspaceId,
    facet.content.objectKind,
    facet.content.objectId,
    facet.facetType,
    facet.normalizedValue,
    facet.origin,
    facet.evidenceRef ?? "",
  ])}`;
}

function edgeId(edge: ContentEdgeV1): string {
  return `edge_${digest([
    edge.from.workspaceId,
    edge.from.objectKind,
    edge.from.objectId,
    edge.relationType,
    edge.to.objectKind,
    edge.to.objectId,
    edge.origin,
    edge.evidenceRef ?? "",
    edge.algorithm?.id ?? "",
    edge.algorithm?.version ?? "",
  ])}`;
}

function ensureRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS content_relationship_facets (
        facet_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        content_kind TEXT NOT NULL,
        content_id TEXT NOT NULL,
        facet_type TEXT NOT NULL,
        normalized_value TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE UNIQUE INDEX IF NOT EXISTS content_relationship_facets_identity_idx
        ON content_relationship_facets(
          workspace_id, content_kind, content_id, facet_type, normalized_value, facet_id
        );
      CREATE INDEX IF NOT EXISTS content_relationship_facets_lookup_idx
        ON content_relationship_facets(workspace_id, facet_type, normalized_value, content_id);
      CREATE INDEX IF NOT EXISTS content_relationship_facets_content_idx
        ON content_relationship_facets(workspace_id, content_kind, content_id, facet_type);

      CREATE TABLE IF NOT EXISTS content_relationship_edges (
        edge_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        from_kind TEXT NOT NULL,
        from_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        to_kind TEXT NOT NULL,
        to_id TEXT NOT NULL,
        origin TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS content_relationship_edges_from_idx
        ON content_relationship_edges(workspace_id, from_kind, from_id, relation_type, edge_id);
      CREATE INDEX IF NOT EXISTS content_relationship_edges_to_idx
        ON content_relationship_edges(workspace_id, to_kind, to_id, relation_type, edge_id);
    `);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function parseFacet(documentJson: string): ContentFacetV1 {
  const value = JSON.parse(documentJson) as unknown;
  if (!isContentFacetV1(value)) {
    throw new RegistryValidationError("Persisted content facet is invalid");
  }
  return value;
}

function parseEdge(documentJson: string): ContentEdgeV1 {
  const value = JSON.parse(documentJson) as unknown;
  if (!isContentEdgeV1(value)) {
    throw new RegistryValidationError("Persisted content edge is invalid");
  }
  return value;
}

export class SqliteContentRelationshipRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureRegistry(database);
  }

  upsertFacet(facet: ContentFacetV1): ContentFacetV1 {
    if (!isContentFacetV1(facet)) {
      throw new RegistryValidationError("Content facet is invalid");
    }
    const id = facetId(facet);
    this.database
      .prepare(
        `INSERT INTO content_relationship_facets(
           facet_id, workspace_id, content_kind, content_id, facet_type,
           normalized_value, document_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(facet_id) DO UPDATE SET document_json = excluded.document_json`,
      )
      .run(
        id,
        facet.content.workspaceId,
        facet.content.objectKind,
        facet.content.objectId,
        facet.facetType,
        facet.normalizedValue,
        JSON.stringify(facet),
        this.clock().toISOString(),
      );
    return structuredClone(facet);
  }

  upsertEdge(edge: ContentEdgeV1): ContentEdgeV1 {
    if (!isContentEdgeV1(edge)) {
      throw new RegistryValidationError("Content edge is invalid");
    }
    const id = edgeId(edge);
    this.database
      .prepare(
        `INSERT INTO content_relationship_edges(
           edge_id, workspace_id, from_kind, from_id, relation_type,
           to_kind, to_id, origin, document_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(edge_id) DO UPDATE SET document_json = excluded.document_json`,
      )
      .run(
        id,
        edge.from.workspaceId,
        edge.from.objectKind,
        edge.from.objectId,
        edge.relationType,
        edge.to.objectKind,
        edge.to.objectId,
        edge.origin,
        JSON.stringify(edge),
        this.clock().toISOString(),
      );
    return structuredClone(edge);
  }

  replaceProjection(
    content: ContentObjectRefV1,
    facets: readonly ContentFacetV1[],
    outgoingEdges: readonly ContentEdgeV1[],
  ): void {
    if (!isContentObjectRefV1(content)) {
      throw new RegistryValidationError("Content object reference is invalid");
    }
    if (
      facets.some(
        (facet) =>
          facet.content.objectId !== content.objectId ||
          facet.content.workspaceId !== content.workspaceId,
      )
    ) {
      throw new RegistryValidationError("All facets must belong to the projected content object");
    }
    if (
      outgoingEdges.some(
        (edge) =>
          edge.from.objectId !== content.objectId || edge.from.workspaceId !== content.workspaceId,
      )
    ) {
      throw new RegistryValidationError(
        "All replacement edges must originate from the projected content object",
      );
    }

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `DELETE FROM content_relationship_facets
           WHERE workspace_id = ? AND content_kind = ? AND content_id = ?`,
        )
        .run(content.workspaceId, content.objectKind, content.objectId);
      this.database
        .prepare(
          `DELETE FROM content_relationship_edges
           WHERE workspace_id = ? AND from_kind = ? AND from_id = ?`,
        )
        .run(content.workspaceId, content.objectKind, content.objectId);
      for (const facet of facets) this.upsertFacet(facet);
      for (const edge of outgoingEdges) this.upsertEdge(edge);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  listFacets(content: ContentObjectRefV1): ContentFacetV1[] {
    if (!isContentObjectRefV1(content)) {
      throw new RegistryValidationError("Content object reference is invalid");
    }
    return (
      this.database
        .prepare(
          `SELECT document_json FROM content_relationship_facets
           WHERE workspace_id = ? AND content_kind = ? AND content_id = ?
           ORDER BY facet_type ASC, normalized_value ASC, facet_id ASC`,
        )
        .all(content.workspaceId, content.objectKind, content.objectId) as {
        document_json: string;
      }[]
    ).map((row) => parseFacet(row.document_json));
  }

  listBacklinks(
    content: ContentObjectRefV1,
    limit?: number,
    offset?: number,
  ): ContentRelationshipPage<ContentEdgeV1> {
    if (!isContentObjectRefV1(content)) {
      throw new RegistryValidationError("Content object reference is invalid");
    }
    const pagination = page(limit, offset);
    const params = [content.workspaceId, content.objectKind, content.objectId] as const;
    const totalRow = this.database
      .prepare(
        `SELECT COUNT(*) AS count FROM content_relationship_edges
         WHERE workspace_id = ? AND to_kind = ? AND to_id = ?`,
      )
      .get(...params) as { count: number };
    const rows = this.database
      .prepare(
        `SELECT document_json FROM content_relationship_edges
         WHERE workspace_id = ? AND to_kind = ? AND to_id = ?
         ORDER BY relation_type ASC, from_kind ASC, from_id ASC, edge_id ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pagination.limit, pagination.offset) as { document_json: string }[];
    return {
      items: rows.map((row) => parseEdge(row.document_json)),
      total: Number(totalRow.count),
      ...pagination,
    };
  }

  listNeighbors(
    content: ContentObjectRefV1,
    limit?: number,
    offset?: number,
  ): ContentRelationshipPage<ContentNeighborV1> {
    if (!isContentObjectRefV1(content)) {
      throw new RegistryValidationError("Content object reference is invalid");
    }
    const pagination = page(limit, offset);
    const workspaceId = required(content.workspaceId, "workspaceId");
    const kind = required(content.objectKind, "objectKind");
    const id = required(content.objectId, "objectId");
    const count = this.database
      .prepare(
        `SELECT COUNT(*) AS count FROM content_relationship_edges
         WHERE workspace_id = ? AND (
           (from_kind = ? AND from_id = ?) OR (to_kind = ? AND to_id = ?)
         )`,
      )
      .get(workspaceId, kind, id, kind, id) as { count: number };
    const rows = this.database
      .prepare(
        `SELECT document_json FROM content_relationship_edges
         WHERE workspace_id = ? AND (
           (from_kind = ? AND from_id = ?) OR (to_kind = ? AND to_id = ?)
         )
         ORDER BY relation_type ASC, edge_id ASC
         LIMIT ? OFFSET ?`,
      )
      .all(workspaceId, kind, id, kind, id, pagination.limit, pagination.offset) as {
      document_json: string;
    }[];
    const items = rows.map((row): ContentNeighborV1 => {
      const edge = parseEdge(row.document_json);
      const outgoing =
        edge.from.objectKind === content.objectKind && edge.from.objectId === content.objectId;
      return {
        direction: outgoing ? "OUTGOING" : "INCOMING",
        edge,
        neighbor: structuredClone(outgoing ? edge.to : edge.from),
      };
    });
    return { items, total: Number(count.count), ...pagination };
  }

  findContentByFacet(
    workspaceId: string,
    facetType: ContentFacetType,
    normalizedValue: string,
    limit?: number,
    offset?: number,
  ): ContentRelationshipPage<ContentObjectRefV1> {
    const workspace = required(workspaceId, "workspaceId");
    const value = required(normalizedValue, "normalizedValue");
    const pagination = page(limit, offset);
    const total = this.database
      .prepare(
        `SELECT COUNT(DISTINCT content_kind || char(31) || content_id) AS count
         FROM content_relationship_facets
         WHERE workspace_id = ? AND facet_type = ? AND normalized_value = ?`,
      )
      .get(workspace, facetType, value) as { count: number };
    const rows = this.database
      .prepare(
        `SELECT content_kind, content_id
         FROM content_relationship_facets
         WHERE workspace_id = ? AND facet_type = ? AND normalized_value = ?
         GROUP BY content_kind, content_id
         ORDER BY content_kind ASC, content_id ASC
         LIMIT ? OFFSET ?`,
      )
      .all(workspace, facetType, value, pagination.limit, pagination.offset) as {
      content_kind: ContentObjectRefV1["objectKind"];
      content_id: string;
    }[];
    return {
      items: rows.map((row) => ({
        protocolVersion: "1.0",
        objectType: "CONTENT_OBJECT_REF",
        objectId: row.content_id,
        objectKind: row.content_kind,
        workspaceId: workspace,
      })),
      total: Number(total.count),
      ...pagination,
    };
  }
}
