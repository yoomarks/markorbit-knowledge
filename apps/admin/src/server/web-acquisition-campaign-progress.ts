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
type CountBySourceRow = { source_id: string; count: number };
type RunBySourceRow = RunRow & { source_id: string };
type RawStatsRow = { run_id: string; fetched: number; total: number };
type ProfileCountRow = { run_id: string; profile_name: string | null; count: number };
type ProfileStatusRow = ProfileCountRow & { status: string };
type RunFailureRow = { run_id: string; code: string | null; count: number };
type ProfileFailureRow = RunFailureRow & { profile_name: string | null };
type ChangeAccountingByRunRow = {
  run_id: string;
  receipts: number;
  observed: number | null;
  changed: number | null;
};

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
    changed: number | null;
    unchanged: number | null;
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
    changedUnchangedAvailable: boolean;
    accountedSources: number;
    totalSources: number;
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
    changedUrls: number | null;
    unchangedUrls: number | null;
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

function placeholders(values: readonly string[]): string {
  if (values.length === 0) throw new Error("Expected at least one identifier");
  return values.map(() => "?").join(",");
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

  const campaignSources = sourceRows.flatMap((row) => {
    const source = record(JSON.parse(row.document_json));
    const extensions = record(source?.extensions);
    if (extensionString(extensions, "x-markorbit-campaign-id") !== campaignId) return [];
    const sourceKey = extensionString(extensions, "x-markorbit-campaign-source-key") ?? row.id;
    return [
      {
        row,
        sourceKey,
        sourceClass: extensionString(extensions, "x-markorbit-source-class") ?? "UNKNOWN",
        discoveryMode: extensionString(extensions, "x-markorbit-discovery-mode") ?? "UNKNOWN",
        conversionProfileName: `Bulk Web ${campaignId} Markdown Auto — ${sourceKey}`,
        selectedUrls: extensionNumber(extensions, "x-markorbit-inventory-count") ?? 0,
        discoveredUrls: extensionNumber(extensions, "x-markorbit-discovered-count"),
        excludedUrls: extensionNumber(extensions, "x-markorbit-excluded-count"),
        duplicateDiscoveryUrls: extensionNumber(extensions, "x-markorbit-duplicate-count"),
        inventoryErrorCount: extensionNumber(extensions, "x-markorbit-inventory-error-count"),
      },
    ];
  });
  const sourceIds = campaignSources.map(({ row }) => row.id);
  const initialRunBySource = new Map<string, RunRow>();
  const refreshRunBySource = new Map<string, RunRow>();
  const retrievalBySource = new Map<string, number>();
  if (sourceIds.length > 0) {
    const initialRows = database
      .prepare(
        `
      WITH ranked AS (
        SELECT id, source_id, status, requested_at, updated_at,
               ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY created_at DESC, id DESC) AS rn
        FROM collection_runs
        WHERE workspace_id = ? AND source_id IN (${placeholders(sourceIds)})
          AND json_extract(document_json, '$.planSnapshot.extensions.x-markorbit-campaign-id') = ?
          AND COALESCE(json_extract(document_json, '$.planSnapshot.extensions.x-markorbit-plan-role'), 'INITIAL_COLLECTION') <> 'REFRESH_WATCH'
      )
      SELECT id, source_id, status, requested_at, updated_at FROM ranked WHERE rn = 1
    `,
      )
      .all(input.workspaceId, ...sourceIds, campaignId) as unknown as RunBySourceRow[];
    for (const run of initialRows) initialRunBySource.set(run.source_id, run);

    const refreshRows = database
      .prepare(
        `
      WITH ranked AS (
        SELECT id, source_id, status, requested_at, updated_at,
               ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY created_at DESC, id DESC) AS rn
        FROM collection_runs
        WHERE workspace_id = ? AND source_id IN (${placeholders(sourceIds)})
          AND json_extract(document_json, '$.planSnapshot.extensions.x-markorbit-campaign-id') = ?
          AND json_extract(document_json, '$.planSnapshot.extensions.x-markorbit-plan-role') = 'REFRESH_WATCH'
          AND json_extract(document_json, '$.planSnapshot.schedule.mode') = 'CHANGE_WATCH'
          AND json_extract(document_json, '$.planSnapshot.policy.fetchAttachments') = 0
      )
      SELECT id, source_id, status, requested_at, updated_at FROM ranked WHERE rn = 1
    `,
      )
      .all(input.workspaceId, ...sourceIds, campaignId) as unknown as RunBySourceRow[];
    for (const run of refreshRows) refreshRunBySource.set(run.source_id, run);
    const wanted = JSON.stringify(
      campaignSources.map(({ row, sourceKey }) => ({
        sourceId: row.id,
        prefix: `sources/web/${campaignId}/${sourceKey}/`,
      })),
    );
    const retrievalRows = database
      .prepare(
        `
      WITH wanted AS (
        SELECT json_extract(value, '$.sourceId') AS source_id,
               json_extract(value, '$.prefix') AS prefix
        FROM json_each(?)
      )
      SELECT d.source_id, COUNT(*) AS count
      FROM retrieval_documents d
      JOIN wanted w ON w.source_id = d.source_id
      WHERE d.is_current = 1 AND d.target_path LIKE w.prefix || '%'
      GROUP BY d.source_id
    `,
      )
      .all(wanted) as unknown as CountBySourceRow[];
    for (const row of retrievalRows) retrievalBySource.set(row.source_id, Number(row.count));
  }

  const initialRuns = [...initialRunBySource.values()];
  const initialRunIds = initialRuns.map((run) => run.id);
  const expectedProfileByRun = new Map<string, string>();
  for (const source of campaignSources) {
    const run = initialRunBySource.get(source.row.id);
    if (run) expectedProfileByRun.set(run.id, source.conversionProfileName);
  }
  const rawStatsByRun = new Map<string, { fetched: number; total: number }>();
  const normalizedByRun = new Map<string, number>();
  const conversionStatusByRun = new Map<string, Record<string, number>>();
  const collectionFailuresByRun = new Map<string, Record<string, number>>();
  const conversionFailuresByRun = new Map<string, Record<string, number>>();
  if (initialRunIds.length > 0) {
    const rawRows = database
      .prepare(
        `
      SELECT run_id,
             COUNT(DISTINCT CASE WHEN artifact_kind = 'MARKDOWN' AND canonical_uri IS NOT NULL THEN canonical_uri END) AS fetched,
             COUNT(*) AS total
      FROM raw_artifacts WHERE run_id IN (${placeholders(initialRunIds)}) GROUP BY run_id
    `,
      )
      .all(...initialRunIds) as unknown as RawStatsRow[];
    for (const row of rawRows)
      rawStatsByRun.set(row.run_id, { fetched: Number(row.fetched), total: Number(row.total) });

    const normalizedRows = database
      .prepare(
        `
      SELECT a.run_id,
             json_extract(r.document_json, '$.conversionProfileSnapshot.name') AS profile_name,
             COUNT(*) AS count
      FROM staging_documents s
      JOIN raw_artifacts a ON a.id = s.raw_artifact_id
      JOIN conversion_runs r ON r.id = s.conversion_run_id
      WHERE a.run_id IN (${placeholders(initialRunIds)})
      GROUP BY a.run_id, profile_name
    `,
      )
      .all(...initialRunIds) as unknown as ProfileCountRow[];
    for (const row of normalizedRows) {
      if (row.profile_name === expectedProfileByRun.get(row.run_id))
        normalizedByRun.set(row.run_id, Number(row.count));
    }

    const statusRows = database
      .prepare(
        `
      SELECT a.run_id,
             json_extract(r.document_json, '$.conversionProfileSnapshot.name') AS profile_name,
             r.status, COUNT(*) AS count
      FROM conversion_runs r
      JOIN raw_artifacts a ON a.id = r.raw_artifact_id
      WHERE a.run_id IN (${placeholders(initialRunIds)})
      GROUP BY a.run_id, profile_name, r.status
    `,
      )
      .all(...initialRunIds) as unknown as ProfileStatusRow[];
    for (const row of statusRows) {
      if (row.profile_name !== expectedProfileByRun.get(row.run_id)) continue;
      const bucket = conversionStatusByRun.get(row.run_id) ?? {};
      increment(bucket, row.status, Number(row.count));
      conversionStatusByRun.set(row.run_id, bucket);
    }

    const collectionRows = database
      .prepare(
        `
      SELECT run_id, json_extract(document_json, '$.failure.code') AS code, COUNT(*) AS count
      FROM execution_attempts
      WHERE run_id IN (${placeholders(initialRunIds)}) AND status = 'FAILED'
      GROUP BY run_id, code
    `,
      )
      .all(...initialRunIds) as unknown as RunFailureRow[];
    for (const row of collectionRows) {
      const bucket = collectionFailuresByRun.get(row.run_id) ?? {};
      increment(bucket, row.code ?? "UNKNOWN", Number(row.count));
      collectionFailuresByRun.set(row.run_id, bucket);
    }

    const failureRows = database
      .prepare(
        `
      SELECT raw.run_id,
             json_extract(r.document_json, '$.conversionProfileSnapshot.name') AS profile_name,
             json_extract(a.document_json, '$.failure.code') AS code,
             COUNT(*) AS count
      FROM conversion_attempts a
      JOIN conversion_runs r ON r.id = a.conversion_run_id
      JOIN raw_artifacts raw ON raw.id = r.raw_artifact_id
      WHERE raw.run_id IN (${placeholders(initialRunIds)}) AND a.status = 'FAILED'
      GROUP BY raw.run_id, profile_name, code
    `,
      )
      .all(...initialRunIds) as unknown as ProfileFailureRow[];
    for (const row of failureRows) {
      if (row.profile_name !== expectedProfileByRun.get(row.run_id)) continue;
      const bucket = conversionFailuresByRun.get(row.run_id) ?? {};
      increment(bucket, row.code ?? "UNKNOWN", Number(row.count));
      conversionFailuresByRun.set(row.run_id, bucket);
    }
  }
  const completedRefreshRunIds = [...refreshRunBySource.values()]
    .filter((run) => run.status === "COMPLETED")
    .map((run) => run.id);
  const refreshAccountingByRun = new Map<string, { changed: number; unchanged: number }>();
  if (completedRefreshRunIds.length > 0) {
    const accountingRows = database
      .prepare(
        `
      SELECT run_id,
             COUNT(*) AS receipts,
             SUM(CAST(json_extract(document_json, '$.receipt.itemsObserved') AS INTEGER)) AS observed,
             SUM(CASE
               WHEN json_extract(document_json, '$.receipt.metadataOnly') = 1 THEN 0
               ELSE COALESCE(json_array_length(json_extract(document_json, '$.receipt.artifactReceiptIds')), 0)
             END) AS changed
      FROM execution_attempts
      WHERE run_id IN (${placeholders(completedRefreshRunIds)}) AND status = 'COMPLETED'
        AND json_type(document_json, '$.receipt.itemsObserved') IN ('integer', 'real')
      GROUP BY run_id
    `,
      )
      .all(...completedRefreshRunIds) as unknown as ChangeAccountingByRunRow[];
    for (const row of accountingRows) {
      const receipts = Number(row.receipts);
      const observed = Number(row.observed ?? 0);
      const changed = Number(row.changed ?? 0);
      if (receipts > 0 && changed <= observed) {
        refreshAccountingByRun.set(row.run_id, { changed, unchanged: observed - changed });
      }
    }
  }

  const sources: WebAcquisitionCampaignProgress["sources"] = [];
  let earliestRequestedAt: string | null = null;
  let latestRunUpdatedAt: string | null = null;
  for (const source of campaignSources) {
    const run = initialRunBySource.get(source.row.id);
    const refreshRun = refreshRunBySource.get(source.row.id);
    if (run) {
      earliestRequestedAt = earlier(earliestRequestedAt, run.requested_at);
      latestRunUpdatedAt = later(latestRunUpdatedAt, run.updated_at);
    }
    const rawStats = run ? rawStatsByRun.get(run.id) : undefined;
    const collectionFailureCodes = run ? (collectionFailuresByRun.get(run.id) ?? {}) : {};
    const accounting =
      refreshRun?.status === "COMPLETED" ? refreshAccountingByRun.get(refreshRun.id) : undefined;
    sources.push({
      sourceId: source.row.id,
      sourceKey: source.sourceKey,
      sourceName: source.row.name,
      sourceClass: source.sourceClass,
      discoveryMode: source.discoveryMode,
      runId: run?.id ?? null,
      runStatus: run?.status ?? "NOT_DISPATCHED",
      blocked: run?.status === "FAILED" && blockedFailure(collectionFailureCodes),
      selectedUrls: source.selectedUrls,
      discoveredUrls: source.discoveredUrls,
      excludedUrls: source.excludedUrls,
      duplicateDiscoveryUrls: source.duplicateDiscoveryUrls,
      inventoryErrorCount: source.inventoryErrorCount,
      fetchedUrls: rawStats?.fetched ?? 0,
      rawArtifactsCreated: rawStats?.total ?? 0,
      normalizedDocumentsCreated: run ? (normalizedByRun.get(run.id) ?? 0) : 0,
      currentRetrievalDocuments: retrievalBySource.get(source.row.id) ?? 0,
      changedUrls: accounting?.changed ?? null,
      unchangedUrls: accounting?.unchanged ?? null,
      conversionRuns: run ? (conversionStatusByRun.get(run.id) ?? {}) : {},
      collectionFailureCodes,
      conversionFailureCodes: run ? (conversionFailuresByRun.get(run.id) ?? {}) : {},
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
  const refreshAccounted = sources.filter(
    (source) => source.changedUrls !== null && source.unchangedUrls !== null,
  );
  const allRefreshAccounted = sources.length > 0 && refreshAccounted.length === sources.length;
  const totalChanged = allRefreshAccounted
    ? refreshAccounted.reduce((sum, source) => sum + (source.changedUrls ?? 0), 0)
    : null;
  const totalUnchanged = allRefreshAccounted
    ? refreshAccounted.reduce((sum, source) => sum + (source.unchangedUrls ?? 0), 0)
    : null;
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
      changed: totalChanged,
      unchanged: totalUnchanged,
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
      changedUnchangedAvailable: allRefreshAccounted,
      accountedSources: refreshAccounted.length,
      totalSources: sources.length,
      note: allRefreshAccounted
        ? "Changed/unchanged counts come from existing Worker receipt facts (items observed versus immutable artifact receipts); per-URL failure accounting remains unavailable."
        : "Changed/unchanged totals stay unavailable until every campaign source has a completed refresh receipt; per-source evidence is exposed when present.",
    },
    sourceClasses,
    sources,
  };
}
