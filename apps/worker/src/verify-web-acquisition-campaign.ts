import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

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
};

type CampaignResult = {
  campaignId: string;
  workspaceId: string;
  sources: CampaignSourceResult[];
};

type CountRow = { source_id: string; count: number };
type StatusRow = { id: string; source_id: string; status: string };

type CampaignVerification = {
  campaignId: string;
  workspaceId: string;
  observedAt: string;
  terminalRuns: number;
  completedRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  domainsWithPages: number;
  markdownPages: number;
  currentRetrievalDocuments: number;
  conversionRuns: Record<string, number>;
  sources: Array<{
    sourceKey: string;
    runStatus: string;
    markdownPages: number;
    retrievalDocuments: number;
  }>;
};
function placeholders(values: readonly string[]): string {
  if (values.length === 0) throw new Error("Campaign has no source identifiers");
  return values.map(() => "?").join(",");
}

function countMap(rows: readonly CountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.source_id, Number(row.count)]));
}

function observe(database: DatabaseSync, campaign: CampaignResult): CampaignVerification {
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
       WHERE source_id IN (${placeholders(sourceIds)})
         AND artifact_kind = 'MARKDOWN'
         AND canonical_uri IS NOT NULL
       GROUP BY source_id`,
    )
    .all(...sourceIds) as unknown as CountRow[];
  const retrievalRows = database
    .prepare(
      `SELECT source_id, COUNT(*) AS count
       FROM retrieval_documents
       WHERE source_id IN (${placeholders(sourceIds)}) AND is_current = 1
       GROUP BY source_id`,
    )
    .all(...sourceIds) as unknown as CountRow[];
  const markdownBySource = countMap(markdownRows);
  const retrievalBySource = countMap(retrievalRows);
  const conversionRows = database
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM conversion_runs
       WHERE source_id IN (${placeholders(sourceIds)})
       GROUP BY status`,
    )
    .all(...sourceIds) as unknown as Array<{ status: string; count: number }>;
  const conversionRuns = Object.fromEntries(
    conversionRows.map((row) => [row.status, Number(row.count)]),
  );

  const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
  const sources = campaign.sources.map((source) => ({
    sourceKey: source.sourceKey,
    runStatus: runBySource.get(source.sourceId)?.status ?? "MISSING",
    markdownPages: markdownBySource.get(source.sourceId) ?? 0,
    retrievalDocuments: retrievalBySource.get(source.sourceId) ?? 0,
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
    currentRetrievalDocuments: sources.reduce(
      (total, source) => total + source.retrievalDocuments,
      0,
    ),
    conversionRuns,
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
      last = observe(database, campaign);
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

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
