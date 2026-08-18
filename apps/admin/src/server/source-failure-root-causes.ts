import type { DatabaseSync } from "node:sqlite";

export type SourceFailureEvidence = {
  sourceId: string;
  sourceName: string;
  canonicalUri: string | null;
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
};

export type SourceFailureRootCause = {
  code: string;
  domain: string;
  retryable: boolean;
  sourceCount: number;
  sourceIds: string[];
  latestOccurredAt: string;
  sampleMessage: string;
};

export type SourceFailureRootCauseSummary = {
  sourcesWithFailureEvidence: number;
  retryableSources: number;
  terminalSources: number;
  clusters: SourceFailureRootCause[];
};

type FailureRecord = Record<string, unknown>;

function tableExists(database: DatabaseSync, tableName: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  );
}

function failureFromAttempt(value: string): Pick<SourceFailureEvidence, "code" | "message" | "retryable" | "occurredAt"> | null {
  try {
    const attempt = JSON.parse(value) as FailureRecord;
    const failure = attempt.failure;
    if (typeof failure !== "object" || failure === null || Array.isArray(failure)) return null;
    const record = failure as FailureRecord;
    if (
      typeof record.code !== "string" ||
      typeof record.message !== "string" ||
      typeof record.retryable !== "boolean" ||
      typeof record.occurredAt !== "string"
    ) {
      return null;
    }
    return {
      code: record.code,
      message: record.message,
      retryable: record.retryable,
      occurredAt: record.occurredAt,
    };
  } catch {
    return null;
  }
}

export function sourceFailureDomain(canonicalUri: string | null): string {
  if (!canonicalUri) return "unknown";
  try {
    return new URL(canonicalUri).hostname.toLowerCase() || "unknown";
  } catch {
    return "unknown";
  }
}

export function summarizeSourceFailureRootCauses(
  evidence: readonly SourceFailureEvidence[],
  limit = 8,
): SourceFailureRootCauseSummary {
  const groups = new Map<
    string,
    SourceFailureRootCause & { sourceIdSet: Set<string> }
  >();
  const retryableSourceIds = new Set<string>();
  const terminalSourceIds = new Set<string>();
  const sourceIds = new Set<string>();

  for (const item of evidence) {
    sourceIds.add(item.sourceId);
    if (item.retryable) retryableSourceIds.add(item.sourceId);
    else terminalSourceIds.add(item.sourceId);
    const domain = sourceFailureDomain(item.canonicalUri);
    const key = `${item.code}\u0000${domain}\u0000${item.retryable ? "retryable" : "terminal"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.sourceIdSet.add(item.sourceId);
      existing.sourceCount = existing.sourceIdSet.size;
      if (item.occurredAt > existing.latestOccurredAt) {
        existing.latestOccurredAt = item.occurredAt;
        existing.sampleMessage = item.message;
      }
      continue;
    }
    groups.set(key, {
      code: item.code,
      domain,
      retryable: item.retryable,
      sourceCount: 1,
      sourceIds: [item.sourceId],
      sourceIdSet: new Set([item.sourceId]),
      latestOccurredAt: item.occurredAt,
      sampleMessage: item.message,
    });
  }

  const clusters = [...groups.values()]
    .map(({ sourceIdSet, ...cluster }) => ({
      ...cluster,
      sourceIds: [...sourceIdSet].sort(),
    }))
    .sort((left, right) => {
      if (left.sourceCount !== right.sourceCount) return right.sourceCount - left.sourceCount;
      if (left.latestOccurredAt !== right.latestOccurredAt) {
        return right.latestOccurredAt.localeCompare(left.latestOccurredAt);
      }
      return `${left.code}:${left.domain}`.localeCompare(`${right.code}:${right.domain}`);
    })
    .slice(0, Math.max(1, limit));

  return {
    sourcesWithFailureEvidence: sourceIds.size,
    retryableSources: retryableSourceIds.size,
    terminalSources: terminalSourceIds.size,
    clusters,
  };
}

export function listSourceFailureRootCauses(
  database: DatabaseSync,
  workspaceId: string,
  limit = 8,
): SourceFailureRootCauseSummary {
  if (!tableExists(database, "execution_attempts")) {
    return summarizeSourceFailureRootCauses([], limit);
  }

  const rows = database
    .prepare(
      `WITH ranked AS (
         SELECT j.source_id AS sourceId,
                s.name AS sourceName,
                s.canonical_uri AS canonicalUri,
                a.document_json AS attemptJson,
                ROW_NUMBER() OVER (
                  PARTITION BY j.source_id
                  ORDER BY COALESCE(a.completed_at, a.updated_at) DESC, a.id DESC
                ) AS row_number
         FROM execution_attempts a
         JOIN jobs j ON j.id = a.job_id
         JOIN source_definitions s ON s.id = j.source_id
         WHERE j.workspace_id = ?
           AND a.status = 'FAILED'
           AND s.status != 'ARCHIVED'
       )
       SELECT sourceId, sourceName, canonicalUri, attemptJson
       FROM ranked
       WHERE row_number = 1`,
    )
    .all(workspaceId) as Array<{
    sourceId: string;
    sourceName: string;
    canonicalUri: string | null;
    attemptJson: string;
  }>;

  const evidence: SourceFailureEvidence[] = [];
  for (const row of rows) {
    const failure = failureFromAttempt(row.attemptJson);
    if (!failure) continue;
    evidence.push({
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      canonicalUri: row.canonicalUri,
      ...failure,
    });
  }
  return summarizeSourceFailureRootCauses(evidence, limit);
}
