import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  SOURCE_DISCOVERY_ORIGINS,
  SOURCE_RELATIONSHIP_TYPES,
  type SourceDiscoveryProvenance,
  type SourceRegistryV2Record,
  type SourceRelationship,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryNotFoundError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "1130_source_registry_v2_persistence";

export interface SourceRegistryV2Repository {
  get(sourceId: string): SourceRegistryV2Record | null;
  recordDiscovery(
    sourceId: string,
    provenance: SourceDiscoveryProvenance,
    parentSourceId?: string,
  ): SourceRegistryV2Record;
  addRelationship(relationship: SourceRelationship): SourceRegistryV2Record;
}

function ensureMigration(database: DatabaseSync): void {
  initializeRegistry(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS source_registry_v2_records (
        source_id TEXT PRIMARY KEY,
        parent_source_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES source_definitions(id),
        FOREIGN KEY (parent_source_id) REFERENCES source_definitions(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS source_registry_v2_provenance (
        source_id TEXT NOT NULL,
        identity_key TEXT NOT NULL,
        origin TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        discovered_from_source_id TEXT,
        discovered_from_url TEXT,
        evidence_url TEXT,
        PRIMARY KEY (source_id, identity_key),
        FOREIGN KEY (source_id) REFERENCES source_registry_v2_records(source_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS source_registry_v2_relationships (
        source_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        related_source_id TEXT NOT NULL,
        PRIMARY KEY (source_id, relationship_type, related_source_id),
        FOREIGN KEY (source_id) REFERENCES source_registry_v2_records(source_id),
        FOREIGN KEY (related_source_id) REFERENCES source_definitions(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_source_registry_v2_parent
        ON source_registry_v2_records(parent_source_id);
      CREATE INDEX IF NOT EXISTS idx_source_registry_v2_provenance_origin
        ON source_registry_v2_provenance(origin, discovered_at DESC);
      CREATE INDEX IF NOT EXISTS idx_source_registry_v2_provenance_parent
        ON source_registry_v2_provenance(discovered_from_source_id);
      CREATE INDEX IF NOT EXISTS idx_source_registry_v2_relationship_related
        ON source_registry_v2_relationships(related_source_id, relationship_type);
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

function requireSourceId(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function requireTimestamp(value: string): string {
  const normalized = value.trim();
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new RegistryValidationError("Source discovery provenance requires a valid discoveredAt");
  }
  return normalized;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function provenanceIdentity(provenance: SourceDiscoveryProvenance): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        provenance.origin,
        provenance.discoveredAt,
        provenance.discoveredFromSourceId ?? null,
        provenance.discoveredFromUrl ?? null,
        provenance.evidenceUrl ?? null,
      ]),
    )
    .digest("hex");
}

export class SqliteSourceRegistryV2Repository implements SourceRegistryV2Repository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureMigration(database);
  }

  get(sourceId: string): SourceRegistryV2Record | null {
    const normalizedSourceId = requireSourceId(sourceId, "sourceId");
    const record = this.database
      .prepare(
        "SELECT source_id, parent_source_id FROM source_registry_v2_records WHERE source_id = ?",
      )
      .get(normalizedSourceId) as
      { source_id: string; parent_source_id: string | null } | undefined;
    if (!record) return null;

    const provenance = this.database
      .prepare(
        `SELECT origin, discovered_at, discovered_from_source_id, discovered_from_url, evidence_url
         FROM source_registry_v2_provenance
         WHERE source_id = ?
         ORDER BY discovered_at ASC, identity_key ASC`,
      )
      .all(normalizedSourceId)
      .map((row) => {
        const value = row as Record<string, unknown>;
        return {
          origin: String(value.origin) as SourceDiscoveryProvenance["origin"],
          discoveredAt: String(value.discovered_at),
          ...(value.discovered_from_source_id
            ? { discoveredFromSourceId: String(value.discovered_from_source_id) }
            : {}),
          ...(value.discovered_from_url
            ? { discoveredFromUrl: String(value.discovered_from_url) }
            : {}),
          ...(value.evidence_url ? { evidenceUrl: String(value.evidence_url) } : {}),
        } satisfies SourceDiscoveryProvenance;
      });

    const relationships = this.database
      .prepare(
        `SELECT relationship_type, source_id, related_source_id
         FROM source_registry_v2_relationships
         WHERE source_id = ?
         ORDER BY relationship_type ASC, related_source_id ASC`,
      )
      .all(normalizedSourceId)
      .map((row) => {
        const value = row as Record<string, unknown>;
        return {
          relationshipType: String(
            value.relationship_type,
          ) as SourceRelationship["relationshipType"],
          sourceId: String(value.source_id),
          relatedSourceId: String(value.related_source_id),
        } satisfies SourceRelationship;
      });

    return {
      sourceId: record.source_id,
      ...(record.parent_source_id ? { parentSourceId: record.parent_source_id } : {}),
      discoveryProvenance: provenance,
      relationships,
    };
  }

  recordDiscovery(
    sourceId: string,
    provenance: SourceDiscoveryProvenance,
    parentSourceId?: string,
  ): SourceRegistryV2Record {
    const normalizedSourceId = requireSourceId(sourceId, "sourceId");
    const normalizedParent = parentSourceId
      ? requireSourceId(parentSourceId, "parentSourceId")
      : undefined;
    if (normalizedParent === normalizedSourceId) {
      throw new RegistryValidationError("A source cannot be its own parent");
    }
    this.requireRegisteredSource(normalizedSourceId);
    if (normalizedParent) this.requireRegisteredSource(normalizedParent);

    if (!SOURCE_DISCOVERY_ORIGINS.includes(provenance.origin)) {
      throw new RegistryValidationError(
        `Unsupported source discovery origin: ${provenance.origin}`,
      );
    }
    const normalizedProvenance: SourceDiscoveryProvenance = {
      origin: provenance.origin,
      discoveredAt: requireTimestamp(provenance.discoveredAt),
      ...(optionalText(provenance.discoveredFromSourceId)
        ? { discoveredFromSourceId: optionalText(provenance.discoveredFromSourceId) }
        : {}),
      ...(optionalText(provenance.discoveredFromUrl)
        ? { discoveredFromUrl: optionalText(provenance.discoveredFromUrl) }
        : {}),
      ...(optionalText(provenance.evidenceUrl)
        ? { evidenceUrl: optionalText(provenance.evidenceUrl) }
        : {}),
    };
    if (normalizedProvenance.discoveredFromSourceId) {
      this.requireRegisteredSource(normalizedProvenance.discoveredFromSourceId);
    }

    const existing = this.database
      .prepare("SELECT parent_source_id FROM source_registry_v2_records WHERE source_id = ?")
      .get(normalizedSourceId) as { parent_source_id: string | null } | undefined;
    if (
      existing?.parent_source_id &&
      normalizedParent &&
      existing.parent_source_id !== normalizedParent
    ) {
      throw new RegistryConflictError(
        "SOURCE_REGISTRY_V2_PARENT_CONFLICT",
        `Source ${normalizedSourceId} already has parent ${existing.parent_source_id}`,
      );
    }

    const timestamp = this.clock().toISOString();
    this.database
      .prepare(
        `INSERT INTO source_registry_v2_records (source_id, parent_source_id, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           parent_source_id = COALESCE(source_registry_v2_records.parent_source_id, excluded.parent_source_id),
           updated_at = excluded.updated_at`,
      )
      .run(normalizedSourceId, normalizedParent ?? null, timestamp, timestamp);

    this.database
      .prepare(
        `INSERT OR IGNORE INTO source_registry_v2_provenance (
           source_id, identity_key, origin, discovered_at, discovered_from_source_id,
           discovered_from_url, evidence_url
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        normalizedSourceId,
        provenanceIdentity(normalizedProvenance),
        normalizedProvenance.origin,
        normalizedProvenance.discoveredAt,
        normalizedProvenance.discoveredFromSourceId ?? null,
        normalizedProvenance.discoveredFromUrl ?? null,
        normalizedProvenance.evidenceUrl ?? null,
      );

    return this.get(normalizedSourceId)!;
  }

  addRelationship(relationship: SourceRelationship): SourceRegistryV2Record {
    const sourceId = requireSourceId(relationship.sourceId, "sourceId");
    const relatedSourceId = requireSourceId(relationship.relatedSourceId, "relatedSourceId");
    if (sourceId === relatedSourceId) {
      throw new RegistryValidationError("A source relationship cannot point to itself");
    }
    if (!SOURCE_RELATIONSHIP_TYPES.includes(relationship.relationshipType)) {
      throw new RegistryValidationError(
        `Unsupported source relationship type: ${relationship.relationshipType}`,
      );
    }
    this.requireRegisteredSource(sourceId);
    this.requireRegisteredSource(relatedSourceId);

    const timestamp = this.clock().toISOString();
    this.database
      .prepare(
        `INSERT OR IGNORE INTO source_registry_v2_records (
           source_id, parent_source_id, created_at, updated_at
         ) VALUES (?, NULL, ?, ?)`,
      )
      .run(sourceId, timestamp, timestamp);

    this.database
      .prepare(
        `INSERT OR IGNORE INTO source_registry_v2_relationships (
           source_id, relationship_type, related_source_id
         ) VALUES (?, ?, ?)`,
      )
      .run(sourceId, relationship.relationshipType, relatedSourceId);
    this.database
      .prepare("UPDATE source_registry_v2_records SET updated_at = ? WHERE source_id = ?")
      .run(timestamp, sourceId);

    return this.get(sourceId)!;
  }

  private requireRegisteredSource(sourceId: string): void {
    const row = this.database
      .prepare("SELECT id FROM source_definitions WHERE id = ?")
      .get(sourceId);
    if (!row) throw new RegistryNotFoundError(sourceId);
  }
}
