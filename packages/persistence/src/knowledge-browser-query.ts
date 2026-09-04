import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  isRawArtifact,
  isSourceDefinition,
  isStagingDocumentDescriptor,
  type ArtifactKind,
  type RawArtifact,
  type SourceDefinition,
  type StagingDocumentDescriptor,
} from "@markorbit/contracts";
import { RegistryValidationError } from "./index";

export const KNOWLEDGE_BROWSER_QUERY_VERSION = "1.0" as const;

export type KnowledgeBrowserQueryV1 = {
  workspaceId: string;
  q?: string;
  sourceId?: string;
  jurisdiction?: string;
  artifactKind?: ArtifactKind;
  status?: StagingDocumentDescriptor["status"];
  offset?: number;
  limit?: number;
};

export type KnowledgeBrowserSourceOption = {
  id: string;
  name: string;
  jurisdictions: string[];
};

export type KnowledgeBrowserItem = {
  id: string;
  title: string;
  targetPath: string;
  outputFormat: StagingDocumentDescriptor["outputFormat"];
  sizeBytes: number;
  status: StagingDocumentDescriptor["status"];
  validation: StagingDocumentDescriptor["validation"];
  generatedAt: string;
  updatedAt: string;
  source: {
    id: string;
    name: string;
    sourceType: SourceDefinition["sourceType"];
    category: SourceDefinition["category"];
    authorityLevel: SourceDefinition["authorityLevel"];
    jurisdictions: string[];
    languages: string[];
    canonicalUri: string | null;
  } | null;
  artifact: {
    id: string;
    originalName: string;
    artifactKind: ArtifactKind;
    mimeType: string;
    version: number;
    sizeBytes: number;
    capturedAt: string;
    publishedAt: string | null;
    canonicalUri: string | null;
    sourceUri: string;
    status: RawArtifact["status"];
  } | null;
};

export type KnowledgeBrowserQueryResultV1 = {
  version: typeof KNOWLEDGE_BROWSER_QUERY_VERSION;
  items: KnowledgeBrowserItem[];
  total: number;
  offset: number;
  limit: number;
  summary: {
    total: number;
    ready: number;
    generated: number;
    blocked: number;
    archived: number;
  };
  filters: {
    sources: KnowledgeBrowserSourceOption[];
    jurisdictions: string[];
    artifactKinds: ArtifactKind[];
  };
};

type BrowserRow = {
  staging_json: string;
  updated_at: string;
  source_json: string | null;
  artifact_json: string | null;
};

type SummaryRow = {
  total: number;
  ready: number;
  generated: number;
  blocked: number;
  archived: number;
};

type SourceRow = { document_json: string };
type KindRow = { artifact_kind: string };

function parseStaging(value: string): StagingDocumentDescriptor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new RegistryValidationError("Persisted staging document is invalid JSON", {
      cause: error,
    });
  }
  if (!isStagingDocumentDescriptor(parsed)) {
    throw new RegistryValidationError(
      "Persisted staging document no longer satisfies its contract",
    );
  }
  return parsed;
}

function parseSource(value: string | null): SourceDefinition | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new RegistryValidationError("Persisted source is invalid JSON", { cause: error });
  }
  if (!isSourceDefinition(parsed)) {
    throw new RegistryValidationError("Persisted source no longer satisfies Schema v1");
  }
  return parsed;
}

function parseArtifact(value: string | null): RawArtifact | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new RegistryValidationError("Persisted raw artifact is invalid JSON", { cause: error });
  }
  if (!isRawArtifact(parsed)) {
    throw new RegistryValidationError("Persisted raw artifact no longer satisfies its contract");
  }
  return parsed;
}

function normalizeQuery(
  query: KnowledgeBrowserQueryV1,
): Required<Pick<KnowledgeBrowserQueryV1, "workspaceId" | "offset" | "limit">> &
  KnowledgeBrowserQueryV1 {
  const workspaceId = query.workspaceId.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 25;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RegistryValidationError("offset must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 50) {
    throw new RegistryValidationError("limit must be an integer between 1 and 50");
  }
  return {
    ...query,
    workspaceId,
    q: query.q?.trim().toLowerCase() || undefined,
    sourceId: query.sourceId?.trim() || undefined,
    jurisdiction: query.jurisdiction?.trim().toUpperCase() || undefined,
    offset,
    limit,
  };
}

function filteredWhere(query: ReturnType<typeof normalizeQuery>): {
  sql: string;
  values: SQLInputValue[];
} {
  const clauses = ["s.workspace_id = ?"];
  const values: SQLInputValue[] = [query.workspaceId];

  if (query.sourceId) {
    clauses.push("s.source_id = ?");
    values.push(query.sourceId);
  }
  if (query.status) {
    clauses.push("s.status = ?");
    values.push(query.status);
  }
  if (query.artifactKind) {
    clauses.push("a.artifact_kind = ?");
    values.push(query.artifactKind);
  }
  if (query.jurisdiction) {
    clauses.push(
      "EXISTS (SELECT 1 FROM json_each(src.jurisdictions_json) jurisdiction WHERE upper(CAST(jurisdiction.value AS TEXT)) = ?)",
    );
    values.push(query.jurisdiction);
  }
  if (query.q) {
    clauses.push(`(
      instr(lower(COALESCE(json_extract(s.document_json, '$.title'), '')), ?) > 0 OR
      instr(lower(s.target_path), ?) > 0 OR
      instr(lower(COALESCE(src.name, '')), ?) > 0 OR
      instr(lower(COALESCE(json_extract(a.document_json, '$.originalName'), '')), ?) > 0 OR
      instr(lower(COALESCE(json_extract(a.document_json, '$.provenance.sourceUri'), '')), ?) > 0
    )`);
    values.push(query.q, query.q, query.q, query.q, query.q);
  }

  return { sql: `WHERE ${clauses.join(" AND ")}`, values };
}

const JOIN_SQL = `
  FROM staging_documents s
  LEFT JOIN source_definitions src
    ON src.id = s.source_id
   AND src.workspace_id = s.workspace_id
  LEFT JOIN raw_artifacts a
    ON a.id = s.raw_artifact_id
   AND a.workspace_id = s.workspace_id
   AND a.source_id = s.source_id
`;

function sourceSummary(source: SourceDefinition | null): KnowledgeBrowserItem["source"] {
  return source
    ? {
        id: source.id,
        name: source.name,
        sourceType: source.sourceType,
        category: source.category,
        authorityLevel: source.authorityLevel,
        jurisdictions: source.jurisdictions,
        languages: source.languages,
        canonicalUri: source.canonicalUri ?? null,
      }
    : null;
}

function artifactSummary(artifact: RawArtifact | null): KnowledgeBrowserItem["artifact"] {
  return artifact
    ? {
        id: artifact.id,
        originalName: artifact.originalName,
        artifactKind: artifact.artifactKind,
        mimeType: artifact.mimeType,
        version: artifact.version,
        sizeBytes: artifact.sizeBytes,
        capturedAt: artifact.capturedAt,
        publishedAt: artifact.publishedAt ?? null,
        canonicalUri: artifact.canonicalUri ?? null,
        sourceUri: artifact.provenance.sourceUri,
        status: artifact.status,
      }
    : null;
}

/**
 * Executes the Knowledge Browser semantics over the complete workspace corpus.
 *
 * `total`, `summary`, and `artifactKinds` use the same active document filters as the item query.
 * Source and jurisdiction options intentionally describe the complete workspace source catalog so
 * operators can change filters even when the current match set is empty.
 */
export function queryKnowledgeBrowser(
  database: DatabaseSync,
  input: KnowledgeBrowserQueryV1,
): KnowledgeBrowserQueryResultV1 {
  const query = normalizeQuery(input);
  const where = filteredWhere(query);

  const rows = database
    .prepare(
      `SELECT s.document_json AS staging_json,
              s.updated_at,
              src.document_json AS source_json,
              a.document_json AS artifact_json
       ${JOIN_SQL}
       ${where.sql}
       ORDER BY json_extract(s.document_json, '$.generatedAt') DESC, s.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...where.values, query.limit, query.offset) as BrowserRow[];

  const summary = database
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN s.status = 'READY' THEN 1 ELSE 0 END), 0) AS ready,
              COALESCE(SUM(CASE WHEN s.status = 'GENERATED' THEN 1 ELSE 0 END), 0) AS generated,
              COALESCE(SUM(CASE WHEN s.status = 'BLOCKED' THEN 1 ELSE 0 END), 0) AS blocked,
              COALESCE(SUM(CASE WHEN s.status = 'ARCHIVED' THEN 1 ELSE 0 END), 0) AS archived
       ${JOIN_SQL}
       ${where.sql}`,
    )
    .get(...where.values) as SummaryRow;

  const sourceRows = database
    .prepare(
      `SELECT document_json
       FROM source_definitions
       WHERE workspace_id = ?
       ORDER BY lower(name) ASC, id ASC`,
    )
    .all(query.workspaceId) as SourceRow[];
  const sourceDocuments = sourceRows.map((row) => parseSource(row.document_json));
  const sources = sourceDocuments.flatMap((source): KnowledgeBrowserSourceOption[] =>
    source ? [{ id: source.id, name: source.name, jurisdictions: source.jurisdictions }] : [],
  );
  const jurisdictions = [...new Set(sources.flatMap((source) => source.jurisdictions))].sort();

  const kindRows = database
    .prepare(
      `SELECT DISTINCT a.artifact_kind
       ${JOIN_SQL}
       ${where.sql}
       AND a.artifact_kind IS NOT NULL
       ORDER BY a.artifact_kind ASC`,
    )
    .all(...where.values) as KindRow[];
  const artifactKinds = kindRows.map((row) => row.artifact_kind as ArtifactKind);

  const items = rows.map((row): KnowledgeBrowserItem => {
    const descriptor = parseStaging(row.staging_json);
    const source = parseSource(row.source_json);
    const artifact = parseArtifact(row.artifact_json);
    return {
      id: descriptor.id,
      title: descriptor.title || artifact?.originalName || descriptor.targetPath,
      targetPath: descriptor.targetPath,
      outputFormat: descriptor.outputFormat,
      sizeBytes: descriptor.sizeBytes,
      status: descriptor.status,
      validation: descriptor.validation,
      generatedAt: descriptor.generatedAt,
      updatedAt: row.updated_at,
      source: sourceSummary(source),
      artifact: artifactSummary(artifact),
    };
  });

  return {
    version: KNOWLEDGE_BROWSER_QUERY_VERSION,
    items,
    total: summary.total,
    offset: query.offset,
    limit: query.limit,
    summary: {
      total: summary.total,
      ready: summary.ready,
      generated: summary.generated,
      blocked: summary.blocked,
      archived: summary.archived,
    },
    filters: { sources, jurisdictions, artifactKinds },
  };
}
