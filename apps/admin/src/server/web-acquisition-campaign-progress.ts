import type { DatabaseSync } from "node:sqlite";
import type { CollectionRunStatus } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";

const CAMPAIGN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TERMINAL = new Set<CollectionRunStatus>(["COMPLETED", "FAILED", "CANCELLED"]);
const BLOCKED_FAILURE_CODES = new Set([
  "ROBOTS_DENIED",
  "ROBOTS_DISALLOWED",
  "POLICY_BLOCKED",
  "SOURCE_BLOCKED",
]);

type JsonRecord = Record<string, unknown>;
type SourceRow = { id: string; name: string; document_json: string };
type RunRow = {
  id: string;
  status: CollectionRunStatus;
  requested_at: string;
  updated_at: string;
};
type CountRow = { count: number };
type StatusCountRow = { status: string; count: number };
type FailureCountRow = { code: string | null; count: number };

export type WebAcquisitionCampaignProgress = {
  campaignId: string;
  workspaceId: string;
  observedAt: string;
  domains: {
    total: number;
    notDispatched: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    blocked: number;
    withFetchedPages: number;
  };
  urls: {
    selected: number;
    discovered: number | null;
    discoveredKnown: number;
    fetched: number;
    excluded: number | null;
    duplicateDiscovery: number | null;
    unmaterialized: number | null;
    failed: null;
    changed: null;
    unchanged: null;
    detailedInventorySources: number;
    totalSources: number;
  };
  rawArtifactsCreated: number;
  normalizedDocumentsCreated: number;
  currentRetrievalDocuments: number;
  conversionRuns: Record<string, number>;
  collectionFailureCodes: Record<string, number>;
  conversionFailureCodes: Record<string, number>;
  throughput: {
    effectiveFetchedPagesPerMinute: number | null;
    remainingSelectedUrls: number | null;
    estimatedMinutesRemaining: number | null;
    finiteInventoryEstimate: boolean;
  };
  refreshAccounting: {
    failedUrlAccountingAvailable: false;
    changedUnchangedAvailable: false;
    note: string;
  };
  sourceClasses: Record<
    string,
    {
      domains: number;
      selectedUrls: number;
      fetchedUrls: number;
      currentRetrievalDocuments: number;
    }
  >;
  sources: Array<{
    sourceId: string;
    sourceKey: string;
    sourceName: string;
    sourceClass: string;
    discoveryMode: string;
    runId: string | null;
    runStatus: CollectionRunStatus | "NOT_DISPATCHED";
    blocked: boolean;
    selectedUrls: number;
    discoveredUrls: number | null;
    excludedUrls: number | null;
    duplicateDiscoveryUrls: number | null;
    inventoryErrorCount: number | null;
    fetchedUrls: number;
    rawArtifactsCreated: number;
    normalizedDocumentsCreated: number;
    currentRetrievalDocuments: number;
    conversionRuns: Record<string, number>;
    collectionFailureCodes: Record<string, number>;
    conversionFailureCodes: Record<string, number>;
  }>;
};

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function extensionNumber(extensions: JsonRecord | null, key: string): number | null {
  const value = extensions?.[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function extensionString(extensions: JsonRecord | null, key: string): string | null {
  const value = extensions?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(database: DatabaseSync, sql: string, ...values: string[]): number {
  return Number((database.prepare(sql).get(...values) as CountRow).count);
}

function increment(target: Record<string, number>, key: string, value: number): void {
  target[key] = (target[key] ?? 0) + value;
}

function earlier(current: string | null, candidate: string): string {
  return current === null || Date.parse(candidate) < Date.parse(current) ? candidate : current;
}

function later(current: string | null, candidate: string): string {
  return current === null || Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

function statusCounts(
  database: DatabaseSync,
  runId: string,
  conversionProfileName: string,
): Record<string, number> {
  const rows = database
    .prepare(
      `SELECT r.status, COUNT(*) AS count
       FROM conversion_runs r
       JOIN raw_artifacts a ON a.id = r.raw_artifact_id
       WHERE a.run_id = ?
         AND json_extract(r.document_json, '$.conversionProfileSnapshot.name') = ?
       GROUP BY r.status`,
    )
    .all(runId, conversionProfileName) as unknown as StatusCountRow[];
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
}

function failureCounts(
  database: DatabaseSync,
  sql: string,
  ...values: string[]
): Record<string, number> {
  const rows = database.prepare(sql).all(...values) as unknown as FailureCountRow[];
  return Object.fromEntries(rows.map((row) => [row.code ?? "UNKNOWN", Number(row.count)]));
}

function collectionFailures(database: DatabaseSync, runId: string): Record<string, number> {
  return failureCounts(
    database,
    `SELECT json_extract(document_json, '$.failure.code') AS code, COUNT(*) AS count
     FROM execution_attempts
     WHERE run_id = ? AND status = 'FAILED'
     GROUP BY code`,
    runId,
  );
}

function conversionFailures(
  database: DatabaseSync,
  runId: string,
  conversionProfileName: string,
): Record<string, number> {
  return failureCounts(
    database,
    `SELECT json_extract(a.document_json, '$.failure.code') AS code, COUNT(*) AS count
     FROM conversion_attempts a
     JOIN conversion_runs r ON r.id = a.conversion_run_id
     JOIN raw_artifacts raw ON raw.id = r.raw_artifact_id
     WHERE raw.run_id = ?
       AND json_extract(r.document_json, '$.conversionProfileSnapshot.name') = ?
       AND a.status = 'FAILED'
     GROUP BY code`,
    runId,
    conversionProfileName,
  );
}

function blockedFailure(codes: Record<string, number>): boolean {
  return Object.keys(codes).some(
    (code) => BLOCKED_FAILURE_CODES.has(code) || code.includes("BLOCKED"),
  );
}

export function readWebAcquisitionCampaignProgress(
  database: DatabaseSync,
  input: { workspaceId: string; campaignId: string; observedAt?: string },
): WebAcquisitionCampaignProgress {
  const campaignId = input.campaignId.trim().toLowerCase();
  if (!CAMPAIGN_ID_PATTERN.test(campaignId)) {
    throw new RegistryValidationError("campaignId must be lowercase kebab-case");
  }
  const observedAt = input.observedAt ?? new Date().toISOString();
  const sourceRows = database
    .prepare(
      `SELECT id, name, document_json
       FROM source_definitions
       WHERE workspace_id = ? AND source_type = 'WEB' AND slug LIKE ?
       ORDER BY name ASC, id ASC`,
    )
    .all(input.workspaceId, `campaign-${campaignId}-%`) as unknown as SourceRow[];

  const sources: WebAcquisitionCampaignProgress["sources"] = [];
  let earliestRequestedAt: string | null = null;
  let latestRunUpdatedAt: string | null = null;

  for (const row of sourceRows) {
    const source = record(JSON.parse(row.document_json));
    const extensions = record(source?.extensions);
    if (extensionString(extensions, "x-markorbit-campaign-id") !== campaignId) continue;
    const sourceKey = extensionString(extensions, "x-markorbit-campaign-source-key") ?? row.id;
    const sourceClass = extensionString(extensions, "x-markorbit-source-class") ?? "UNKNOWN";
    const discoveryMode = extensionString(extensions, "x-markorbit-discovery-mode") ?? "UNKNOWN";
    const conversionProfileName = `Bulk Web ${campaignId} Markdown Auto — ${sourceKey}`;
    const selectedUrls = extensionNumber(extensions, "x-markorbit-inventory-count") ?? 0;
    const discoveredUrls = extensionNumber(extensions, "x-markorbit-discovered-count");
    const excludedUrls = extensionNumber(extensions, "x-markorbit-excluded-count");
    const duplicateDiscoveryUrls = extensionNumber(extensions, "x-markorbit-duplicate-count");
    const inventoryErrorCount = extensionNumber(extensions, "x-markorbit-inventory-error-count");
    const run = database
      .prepare(
        `SELECT id, status, requested_at, updated_at
         FROM collection_runs
         WHERE workspace_id = ? AND source_id = ?
           AND json_extract(document_json, '$.planSnapshot.extensions.x-markorbit-campaign-id') = ?
         ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(input.workspaceId, row.id, campaignId) as RunRow | undefined;

    let fetchedUrls = 0;
    let rawArtifactsCreated = 0;
    let normalizedDocumentsCreated = 0;
    const currentRetrievalDocuments = count(
      database,
      `SELECT COUNT(*) AS count FROM retrieval_documents
       WHERE source_id = ? AND is_current = 1 AND target_path LIKE ?`,
      row.id,
      `sources/web/${campaignId}/${sourceKey}/%`,
    );
    let conversionRuns: Record<string, number> = {};
    let collectionFailureCodes: Record<string, number> = {};
    let conversionFailureCodes: Record<string, number> = {};
    if (run) {
      earliestRequestedAt = earlier(earliestRequestedAt, run.requested_at);
      latestRunUpdatedAt = later(latestRunUpdatedAt, run.updated_at);
      fetchedUrls = count(
        database,
        `SELECT COUNT(DISTINCT canonical_uri) AS count FROM raw_artifacts
         WHERE run_id = ? AND artifact_kind = 'MARKDOWN' AND canonical_uri IS NOT NULL`,
        run.id,
      );
      rawArtifactsCreated = count(
        database,
        "SELECT COUNT(*) AS count FROM raw_artifacts WHERE run_id = ?",
        run.id,
      );
      normalizedDocumentsCreated = count(
        database,
        `SELECT COUNT(*) AS count
         FROM staging_documents s
         JOIN raw_artifacts a ON a.id = s.raw_artifact_id
         JOIN conversion_runs r ON r.id = s.conversion_run_id
         WHERE a.run_id = ?
           AND json_extract(r.document_json, '$.conversionProfileSnapshot.name') = ?`,
        run.id,
        conversionProfileName,
      );
      conversionRuns = statusCounts(database, run.id, conversionProfileName);
      collectionFailureCodes = collectionFailures(database, run.id);
      conversionFailureCodes = conversionFailures(database, run.id, conversionProfileName);
    }
    sources.push({
      sourceId: row.id,
      sourceKey,
      sourceName: row.name,
      sourceClass,
      discoveryMode,
      runId: run?.id ?? null,
      runStatus: run?.status ?? "NOT_DISPATCHED",
      blocked: run?.status === "FAILED" && blockedFailure(collectionFailureCodes),
      selectedUrls,
      discoveredUrls,
      excludedUrls,
      duplicateDiscoveryUrls,
      inventoryErrorCount,
      fetchedUrls,
      rawArtifactsCreated,
      normalizedDocumentsCreated,
      currentRetrievalDocuments,
      conversionRuns,
      collectionFailureCodes,
      conversionFailureCodes,
    });
  }

  const detailed = sources.filter(
    (source) =>
      source.discoveredUrls !== null &&
      source.excludedUrls !== null &&
      source.duplicateDiscoveryUrls !== null,
  );
  const allDetailed = detailed.length === sources.length;
  const totalSelected = sources.reduce((sum, source) => sum + source.selectedUrls, 0);
  const totalFetched = sources.reduce((sum, source) => sum + source.fetchedUrls, 0);
  const totalRetrieval = sources.reduce((sum, source) => sum + source.currentRetrievalDocuments, 0);
  const totalRaw = sources.reduce((sum, source) => sum + source.rawArtifactsCreated, 0);
  const totalNormalized = sources.reduce(
    (sum, source) => sum + source.normalizedDocumentsCreated,
    0,
  );
  const conversionRuns: Record<string, number> = {};
  const collectionFailureCodes: Record<string, number> = {};
  const conversionFailureCodes: Record<string, number> = {};
  const sourceClasses: WebAcquisitionCampaignProgress["sourceClasses"] = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source.conversionRuns))
      increment(conversionRuns, key, value);
    for (const [key, value] of Object.entries(source.collectionFailureCodes))
      increment(collectionFailureCodes, key, value);
    for (const [key, value] of Object.entries(source.conversionFailureCodes))
      increment(conversionFailureCodes, key, value);
    const bucket = sourceClasses[source.sourceClass] ?? {
      domains: 0,
      selectedUrls: 0,
      fetchedUrls: 0,
      currentRetrievalDocuments: 0,
    };
    bucket.domains += 1;
    bucket.selectedUrls += source.selectedUrls;
    bucket.fetchedUrls += source.fetchedUrls;
    bucket.currentRetrievalDocuments += source.currentRetrievalDocuments;
    sourceClasses[source.sourceClass] = bucket;
  }

  const active = sources.some(
    (source) => source.runStatus !== "NOT_DISPATCHED" && !TERMINAL.has(source.runStatus),
  );
  const elapsedEnd = active ? observedAt : latestRunUpdatedAt;
  const elapsedMinutes =
    earliestRequestedAt && elapsedEnd
      ? Math.max(0, Date.parse(elapsedEnd) - Date.parse(earliestRequestedAt)) / 60_000
      : 0;
  const rate = elapsedMinutes > 0 && totalFetched > 0 ? totalFetched / elapsedMinutes : null;
  const finiteInventoryEstimate = sources.every(
    (source) => source.discoveryMode !== "LINK_CRAWL" && source.discoveryMode !== "UNKNOWN",
  );
  const remaining = finiteInventoryEstimate ? Math.max(0, totalSelected - totalFetched) : null;

  return {
    campaignId,
    workspaceId: input.workspaceId,
    observedAt,
    domains: {
      total: sources.length,
      notDispatched: sources.filter((source) => source.runStatus === "NOT_DISPATCHED").length,
      pending: sources.filter((source) => source.runStatus === "PENDING").length,
      running: sources.filter((source) => source.runStatus === "RUNNING").length,
      completed: sources.filter((source) => source.runStatus === "COMPLETED").length,
      failed: sources.filter((source) => source.runStatus === "FAILED").length,
      cancelled: sources.filter((source) => source.runStatus === "CANCELLED").length,
      blocked: sources.filter((source) => source.blocked).length,
      withFetchedPages: sources.filter((source) => source.fetchedUrls > 0).length,
    },
    urls: {
      selected: totalSelected,
      discovered: allDetailed
        ? sources.reduce((sum, source) => sum + (source.discoveredUrls ?? 0), 0)
        : null,
      discoveredKnown: sources.reduce((sum, source) => sum + (source.discoveredUrls ?? 0), 0),
      fetched: totalFetched,
      excluded: allDetailed
        ? sources.reduce((sum, source) => sum + (source.excludedUrls ?? 0), 0)
        : null,
      duplicateDiscovery: allDetailed
        ? sources.reduce((sum, source) => sum + (source.duplicateDiscoveryUrls ?? 0), 0)
        : null,
      unmaterialized: remaining,
      failed: null,
      changed: null,
      unchanged: null,
      detailedInventorySources: detailed.length,
      totalSources: sources.length,
    },
    rawArtifactsCreated: totalRaw,
    normalizedDocumentsCreated: totalNormalized,
    currentRetrievalDocuments: totalRetrieval,
    conversionRuns,
    collectionFailureCodes,
    conversionFailureCodes,
    throughput: {
      effectiveFetchedPagesPerMinute: rate,
      remainingSelectedUrls: remaining,
      estimatedMinutesRemaining:
        active && remaining !== null && rate && rate > 0 ? remaining / rate : null,
      finiteInventoryEstimate,
    },
    refreshAccounting: {
      failedUrlAccountingAvailable: false,
      changedUnchangedAvailable: false,
      note: "Per-URL failures and changed/unchanged accounting require structured incremental execution evidence and are not inferred from domain-level failure or artifact counts.",
    },
    sourceClasses,
    sources,
  };
}
