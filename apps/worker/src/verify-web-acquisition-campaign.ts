import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

function positiveInteger(name: string, fallback: number): number {
  const raw = argument(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
type CampaignSourceResult = {
  sourceKey: string;
  sourceId: string;
  runId: string | null;
  conversionProfileId: string;
};

export type CampaignResult = {
  campaignId: string;
  workspaceId: string;
  sources: CampaignSourceResult[];
};

type CountRow = { source_id: string; count: number };
type StatusRow = { id: string; source_id: string; status: string };
type ConversionStatusRow = { source_id: string; status: string; count: number };
type AttemptDocumentRow = { source_id: string; document_json: string };
type VerificationDocumentRow = { source_id: string; document_json: string };

export type CampaignVerification = {
  campaignId: string;
  workspaceId: string;
  observedAt: string;
  terminalRuns: number;
  completedRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  domainsWithPages: number;
  markdownPages: number;
  rawMarkdownArtifacts: number;
  duplicateMarkdownArtifacts: number;
  currentRetrievalDocuments: number;
  conversionRuns: Record<string, number>;
  conversionFailureCodes: Record<string, number>;
  stagingVerificationFailureCodes: Record<string, number>;
  collectionFailureCodes: Record<string, number>;
  backgroundConversionRuns: Record<string, number>;
  sources: Array<{
    sourceKey: string;
    runStatus: string;
    markdownPages: number;
    rawMarkdownArtifacts: number;
    retrievalDocuments: number;
    conversionRuns: Record<string, number>;
    conversionFailureCodes: Record<string, number>;
    stagingVerificationFailureCodes: Record<string, number>;
    collectionFailureCodes: Record<string, number>;
    backgroundConversionRuns: Record<string, number>;
  }>;
};
function placeholders(values: readonly string[]): string {
  if (values.length === 0) throw new Error("Campaign has no source identifiers");
  return values.map(() => "?").join(",");
}

function countMap(rows: readonly CountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.source_id, Number(row.count)]));
}

function increment(target: Record<string, number>, key: string, value = 1): void {
  target[key] = (target[key] ?? 0) + value;
}

function attemptFailureCode(documentJson: string): string {
  try {
    const parsed = JSON.parse(documentJson) as { failure?: { code?: unknown } };
    return typeof parsed.failure?.code === "string" && parsed.failure.code
      ? parsed.failure.code
      : "UNKNOWN";
  } catch {
    return "MALFORMED_ATTEMPT_DOCUMENT";
  }
}

function stagingVerificationFailureCodes(documentJson: string): string[] {
  try {
    const parsed = JSON.parse(documentJson) as {
      checks?: Array<{ code?: unknown; status?: unknown }>;
    };
    if (!Array.isArray(parsed.checks)) return ["MALFORMED_STAGING_VERIFICATION_EVIDENCE"];
    const codes = parsed.checks
      .filter((check) => check?.status === "FAIL")
      .map((check) =>
        typeof check.code === "string" && check.code ? check.code : "UNKNOWN_STAGING_CHECK",
      );
    return codes.length > 0 ? codes : ["UNKNOWN_STAGING_VERIFICATION_FAILURE"];
  } catch {
    return ["MALFORMED_STAGING_VERIFICATION_EVIDENCE"];
  }
}

export function observeWebAcquisitionCampaign(
  database: DatabaseSync,
  campaign: CampaignResult,
): CampaignVerification {
  const sourceIds = campaign.sources.map((source) => source.sourceId);
  const runIds = campaign.sources
    .map((source) => source.runId)
    .filter((id): id is string => Boolean(id));
  if (runIds.length !== campaign.sources.length) {
    throw new Error("Campaign result does not contain one dispatched run per source");
  }

  const runRows = database
    .prepare(
      `SELECT id, source_id, status FROM collection_runs WHERE id IN (${placeholders(runIds)})`,
    )
    .all(...runIds) as unknown as StatusRow[];
  const runBySource = new Map(runRows.map((row) => [row.source_id, row]));
  const markdownRows = database
    .prepare(
      `SELECT source_id, COUNT(DISTINCT canonical_uri) AS count
       FROM raw_artifacts
       WHERE run_id IN (${placeholders(runIds)})
         AND artifact_kind = 'MARKDOWN'
         AND canonical_uri IS NOT NULL
       GROUP BY source_id`,
    )
    .all(...runIds) as unknown as CountRow[];
  const rawMarkdownRows = database
    .prepare(
      `SELECT source_id, COUNT(*) AS count
       FROM raw_artifacts
       WHERE run_id IN (${placeholders(runIds)}) AND artifact_kind = 'MARKDOWN'
       GROUP BY source_id`,
    )
    .all(...runIds) as unknown as CountRow[];
  const retrievalRows = database
    .prepare(
      `SELECT d.source_id, COUNT(*) AS count
       FROM retrieval_documents d
       JOIN raw_artifacts a ON a.id = d.raw_artifact_id
       WHERE a.run_id IN (${placeholders(runIds)}) AND d.is_current = 1
       GROUP BY d.source_id`,
    )
    .all(...runIds) as unknown as CountRow[];
  const markdownBySource = countMap(markdownRows);
  const rawMarkdownBySource = countMap(rawMarkdownRows);
  const retrievalBySource = countMap(retrievalRows);
  const profileIds = campaign.sources.map((source) => source.conversionProfileId);
  if (profileIds.some((id) => !id)) {
    throw new Error("Campaign result does not contain one conversion profile per source");
  }
  const conversionStatusRows = database
    .prepare(
      `SELECT r.source_id, r.status, COUNT(*) AS count
       FROM conversion_runs r
       JOIN raw_artifacts a ON a.id = r.raw_artifact_id
       WHERE r.conversion_profile_id IN (${placeholders(profileIds)})
         AND a.run_id IN (${placeholders(runIds)})
       GROUP BY r.source_id, r.status`,
    )
    .all(...profileIds, ...runIds) as unknown as ConversionStatusRow[];
  const conversionRuns: Record<string, number> = {};
  const conversionBySource = new Map<string, Record<string, number>>();
  for (const row of conversionStatusRows) {
    increment(conversionRuns, row.status, Number(row.count));
    const perSource = conversionBySource.get(row.source_id) ?? {};
    increment(perSource, row.status, Number(row.count));
    conversionBySource.set(row.source_id, perSource);
  }
  const backgroundStatusRows = database
    .prepare(
      `SELECT r.source_id, r.status, COUNT(*) AS count
       FROM conversion_runs r
       JOIN raw_artifacts a ON a.id = r.raw_artifact_id
       WHERE r.source_id IN (${placeholders(sourceIds)})
         AND r.conversion_profile_id NOT IN (${placeholders(profileIds)})
         AND a.run_id IN (${placeholders(runIds)})
       GROUP BY r.source_id, r.status`,
    )
    .all(...sourceIds, ...profileIds, ...runIds) as unknown as ConversionStatusRow[];
  const backgroundConversionRuns: Record<string, number> = {};
  const backgroundBySource = new Map<string, Record<string, number>>();
  for (const row of backgroundStatusRows) {
    increment(backgroundConversionRuns, row.status, Number(row.count));
    const perSource = backgroundBySource.get(row.source_id) ?? {};
    increment(perSource, row.status, Number(row.count));
    backgroundBySource.set(row.source_id, perSource);
  }
  const failedAttemptRows = database
    .prepare(
      `SELECT r.source_id, a.document_json
       FROM conversion_attempts a
       JOIN conversion_runs r ON r.id = a.conversion_run_id
       JOIN raw_artifacts raw ON raw.id = r.raw_artifact_id
       WHERE r.conversion_profile_id IN (${placeholders(profileIds)})
         AND raw.run_id IN (${placeholders(runIds)})
         AND a.status = 'FAILED'`,
    )
    .all(...profileIds, ...runIds) as unknown as AttemptDocumentRow[];
  const conversionFailureCodes: Record<string, number> = {};
  const failuresBySource = new Map<string, Record<string, number>>();
  for (const row of failedAttemptRows) {
    const code = attemptFailureCode(row.document_json);
    increment(conversionFailureCodes, code);
    const perSource = failuresBySource.get(row.source_id) ?? {};
    increment(perSource, code, 1);
    failuresBySource.set(row.source_id, perSource);
  }

  const failedVerificationRows = database
    .prepare(
      `SELECT r.source_id, v.document_json
       FROM staging_document_verifications v
       JOIN conversion_runs r ON r.id = v.conversion_run_id
       JOIN raw_artifacts raw ON raw.id = r.raw_artifact_id
       WHERE r.conversion_profile_id IN (${placeholders(profileIds)})
         AND raw.run_id IN (${placeholders(runIds)})
         AND v.outcome = 'FAIL'`,
    )
    .all(...profileIds, ...runIds) as unknown as VerificationDocumentRow[];
  const stagingVerificationFailureCodeCounts: Record<string, number> = {};
  const stagingFailuresBySource = new Map<string, Record<string, number>>();
  for (const row of failedVerificationRows) {
    const perSource = stagingFailuresBySource.get(row.source_id) ?? {};
    for (const code of stagingVerificationFailureCodes(row.document_json)) {
      increment(stagingVerificationFailureCodeCounts, code);
      increment(perSource, code);
    }
    stagingFailuresBySource.set(row.source_id, perSource);
  }

  const failedCollectionAttemptRows = database
    .prepare(
      `SELECT r.source_id, a.document_json
       FROM execution_attempts a
       JOIN collection_runs r ON r.id = a.run_id
       WHERE a.run_id IN (${placeholders(runIds)}) AND a.status = 'FAILED'`,
    )
    .all(...runIds) as unknown as AttemptDocumentRow[];
  const collectionFailureCodes: Record<string, number> = {};
  const collectionFailuresBySource = new Map<string, Record<string, number>>();
  for (const row of failedCollectionAttemptRows) {
    const code = attemptFailureCode(row.document_json);
    increment(collectionFailureCodes, code);
    const perSource = collectionFailuresBySource.get(row.source_id) ?? {};
    increment(perSource, code);
    collectionFailuresBySource.set(row.source_id, perSource);
  }

  const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
  const sources = campaign.sources.map((source) => ({
    sourceKey: source.sourceKey,
    runStatus: runBySource.get(source.sourceId)?.status ?? "MISSING",
    markdownPages: markdownBySource.get(source.sourceId) ?? 0,
    rawMarkdownArtifacts: rawMarkdownBySource.get(source.sourceId) ?? 0,
    retrievalDocuments: retrievalBySource.get(source.sourceId) ?? 0,
    conversionRuns: conversionBySource.get(source.sourceId) ?? {},
    conversionFailureCodes: failuresBySource.get(source.sourceId) ?? {},
    stagingVerificationFailureCodes: stagingFailuresBySource.get(source.sourceId) ?? {},
    collectionFailureCodes: collectionFailuresBySource.get(source.sourceId) ?? {},
    backgroundConversionRuns: backgroundBySource.get(source.sourceId) ?? {},
  }));
  const statuses = sources.map((source) => source.runStatus);
  return {
    campaignId: campaign.campaignId,
    workspaceId: campaign.workspaceId,
    observedAt: new Date().toISOString(),
    terminalRuns: statuses.filter((status) => terminal.has(status)).length,
    completedRuns: statuses.filter((status) => status === "COMPLETED").length,
    failedRuns: statuses.filter((status) => status === "FAILED").length,
    cancelledRuns: statuses.filter((status) => status === "CANCELLED").length,
    domainsWithPages: sources.filter((source) => source.markdownPages > 0).length,
    markdownPages: sources.reduce((total, source) => total + source.markdownPages, 0),
    rawMarkdownArtifacts: sources.reduce((total, source) => total + source.rawMarkdownArtifacts, 0),
    duplicateMarkdownArtifacts: sources.reduce(
      (total, source) => total + Math.max(0, source.rawMarkdownArtifacts - source.markdownPages),
      0,
    ),
    currentRetrievalDocuments: sources.reduce(
      (total, source) => total + source.retrievalDocuments,
      0,
    ),
    conversionRuns,
    conversionFailureCodes,
    stagingVerificationFailureCodes: stagingVerificationFailureCodeCounts,
    collectionFailureCodes,
    backgroundConversionRuns,
    sources,
  };
}

function activeConversionCount(value: CampaignVerification): number {
  return ["PENDING", "RUNNING", "VERIFYING"].reduce(
    (total, status) => total + (value.conversionRuns[status] ?? 0),
    0,
  );
}
async function main(): Promise<void> {
  const resultPath = argument("--result");
  if (!resultPath) throw new Error("--result=<campaign-result.json> is required");
  const dbPath = process.env.MARKORBIT_KNOWLEDGE_DB_PATH?.trim();
  if (!dbPath) throw new Error("MARKORBIT_KNOWLEDGE_DB_PATH is required");
  const timeoutSeconds = positiveInteger("--timeout-seconds", 2_400);
  const minPages = positiveInteger("--min-pages", 1_000);
  const minDomains = positiveInteger("--min-domains", 10);
  const outputPath = argument("--output");

  const campaign = JSON.parse(await readFile(resolve(resultPath), "utf8")) as CampaignResult;
  const database = new DatabaseSync(resolve(dbPath));
  const deadline = Date.now() + timeoutSeconds * 1_000;
  let last: CampaignVerification | null = null;

  try {
    while (Date.now() < deadline) {
      last = observeWebAcquisitionCampaign(database, campaign);
      const runsSettled = last.terminalRuns === campaign.sources.length;
      const conversionsSettled = activeConversionCount(last) === 0;
      const accepted =
        runsSettled &&
        conversionsSettled &&
        last.domainsWithPages >= minDomains &&
        last.currentRetrievalDocuments >= minPages;
      if (accepted) break;
      if (runsSettled && conversionsSettled) break;
      await delay(5_000);
    }
  } finally {
    database.close();
  }
  if (!last) throw new Error("Campaign verification produced no observation");
  const output = `${JSON.stringify(last, null, 2)}\n`;
  if (outputPath) await writeFile(resolve(outputPath), output, "utf8");
  process.stdout.write(output);

  const failures: string[] = [];
  if (last.terminalRuns !== campaign.sources.length) {
    failures.push(`terminal runs ${last.terminalRuns}/${campaign.sources.length}`);
  }
  if (activeConversionCount(last) > 0) {
    failures.push(`active conversions ${activeConversionCount(last)}`);
  }
  if (last.domainsWithPages < minDomains) {
    failures.push(`domains with pages ${last.domainsWithPages}/${minDomains}`);
  }
  if (last.currentRetrievalDocuments < minPages) {
    failures.push(`current retrieval documents ${last.currentRetrievalDocuments}/${minPages}`);
  }
  if (failures.length > 0) {
    throw new Error(`Bulk Web campaign acceptance not reached: ${failures.join(", ")}`);
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
