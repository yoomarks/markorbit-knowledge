import { DatabaseSync } from "node:sqlite";
import { isRawArtifact, type RawArtifact } from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";
import { RawArtifactNotFoundError } from "./raw-artifact-registry";

const TABLE_NAME = "raw_artifacts";

export const RAW_ARTIFACT_LINEAGE_INSPECTION_VERSION =
  "RAW_ARTIFACT_LINEAGE_INSPECTION_V1" as const;

export type RawArtifactLineageInspection = {
  version: typeof RAW_ARTIFACT_LINEAGE_INSPECTION_VERSION;
  objectType: "RAW_ARTIFACT_LINEAGE_INSPECTION";
  workspaceId: string;
  artifact: RawArtifact;
  parents: RawArtifact[];
  children: RawArtifact[];
  integrity: {
    declaredParentCount: number;
    resolvedParentCount: number;
    childCount: number;
    complete: true;
  };
};

type ArtifactRow = { document_json: string };

function tableExists(database: DatabaseSync): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(TABLE_NAME),
  );
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function parseArtifact(row: ArtifactRow, expectedWorkspaceId: string): RawArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.document_json) as unknown;
  } catch {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_LINEAGE_DOCUMENT_INVALID",
      "RawArtifact lineage contains invalid persisted JSON",
    );
  }
  if (!isRawArtifact(parsed) || parsed.workspaceId !== expectedWorkspaceId) {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_LINEAGE_DOCUMENT_INVALID",
      "RawArtifact lineage contains a document that does not satisfy its immutable contract",
    );
  }
  return parsed;
}

function artifactRow(
  database: DatabaseSync,
  workspaceId: string,
  artifactId: string,
): ArtifactRow | undefined {
  return database
    .prepare("SELECT document_json FROM raw_artifacts WHERE workspace_id = ? AND id = ?")
    .get(workspaceId, artifactId) as ArtifactRow | undefined;
}

function resolveParents(
  database: DatabaseSync,
  workspaceId: string,
  artifact: RawArtifact,
): RawArtifact[] {
  const declared = [...new Set(artifact.provenance.parentArtifactIds ?? [])];
  const parents = declared.map((parentArtifactId) => {
    const row = artifactRow(database, workspaceId, parentArtifactId);
    if (!row) {
      throw new RegistryConflictError(
        "RAW_ARTIFACT_PARENT_LINEAGE_BROKEN",
        `RawArtifact ${artifact.id} references missing parent ${parentArtifactId}`,
        { artifactId: artifact.id, parentArtifactId },
      );
    }
    return parseArtifact(row, workspaceId);
  });
  for (const parent of parents) {
    if (parent.sourceId !== artifact.sourceId) {
      throw new RegistryConflictError(
        "RAW_ARTIFACT_PARENT_LINEAGE_SCOPE_MISMATCH",
        "RawArtifact parent lineage crosses Source scope unexpectedly",
        { artifactId: artifact.id, parentArtifactId: parent.id },
      );
    }
  }
  return parents.sort((left, right) => left.id.localeCompare(right.id));
}

function resolveChildren(
  database: DatabaseSync,
  workspaceId: string,
  artifact: RawArtifact,
): RawArtifact[] {
  const rows = database
    .prepare(
      `SELECT document_json
         FROM raw_artifacts AS child
        WHERE child.workspace_id = ?
          AND EXISTS (
            SELECT 1
              FROM json_each(child.document_json, '$.provenance.parentArtifactIds') AS parent
             WHERE parent.value = ?
          )
        ORDER BY child.created_at ASC, child.id ASC`,
    )
    .all(workspaceId, artifact.id) as unknown as ArtifactRow[];
  const children = rows.map((row) => parseArtifact(row, workspaceId));
  for (const child of children) {
    if (
      child.sourceId !== artifact.sourceId ||
      !child.provenance.parentArtifactIds?.includes(artifact.id)
    ) {
      throw new RegistryConflictError(
        "RAW_ARTIFACT_CHILD_LINEAGE_SCOPE_MISMATCH",
        "RawArtifact child lineage does not match immutable parent provenance",
        { artifactId: artifact.id, childArtifactId: child.id },
      );
    }
  }
  return children;
}

/**
 * Side-effect-free inspection of immutable RawArtifact parent/child provenance.
 * It intentionally describes historical lineage only; it does not claim that a
 * child is still linked from the current representation of a page.
 */
export function inspectRawArtifactLineage(
  database: DatabaseSync,
  input: { workspaceId: string; artifactId: string },
): RawArtifactLineageInspection {
  const workspaceId = required(input.workspaceId, "workspaceId");
  const artifactId = required(input.artifactId, "artifactId");
  if (!tableExists(database)) throw new RawArtifactNotFoundError(artifactId);
  const row = artifactRow(database, workspaceId, artifactId);
  if (!row) throw new RawArtifactNotFoundError(artifactId);
  const artifact = parseArtifact(row, workspaceId);
  const parents = resolveParents(database, workspaceId, artifact);
  const children = resolveChildren(database, workspaceId, artifact);
  return {
    version: RAW_ARTIFACT_LINEAGE_INSPECTION_VERSION,
    objectType: "RAW_ARTIFACT_LINEAGE_INSPECTION",
    workspaceId,
    artifact,
    parents,
    children,
    integrity: {
      declaredParentCount: artifact.provenance.parentArtifactIds?.length ?? 0,
      resolvedParentCount: parents.length,
      childCount: children.length,
      complete: true,
    },
  };
}
