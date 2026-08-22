import { buildLiveAcquisitionProfileEvidence } from "./live-acquisition-profile-evidence";
import { reconcileWipoCorpus } from "./wipo-corpus-reconciliation";

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const report = await reconcileWipoCorpus();
  const finishedAt = new Date().toISOString();
  const failureCounts = new Map<string, { code: string; count: number; sample?: string }>();
  for (const outcome of report.outcomes.filter((item) => !item.ok)) {
    const code = outcome.status === undefined ? "FETCH_FAILURE" : `HTTP_${outcome.status}`;
    const existing = failureCounts.get(code);
    if (existing) existing.count += 1;
    else failureCounts.set(code, { code, count: 1, sample: outcome.error });
  }
  const learning = buildLiveAcquisitionProfileEvidence({
    profileId: "toc-graph-html-v1",
    runId: `canary_wipo_corpus_${Date.parse(finishedAt)}`,
    sourceId: "wipo-public-trademark-corpus",
    startedAt,
    finishedAt,
    discovered: report.seedCount,
    attempted: report.seedCount,
    fetched: report.successfulSeedCount,
    accepted: report.successfulSeedCount,
    knownCorpus: report.seedCount,
    bytes: report.totalFetchedBytes,
    httpStatusCounts: report.httpStatusCounts,
    failureSignatures: [...failureCounts.values()].sort((left, right) =>
      left.code.localeCompare(right.code),
    ),
    surfaceOutcomes: [
      {
        surface: "TOC",
        discovered: report.discoveredLinkCount,
        accepted: report.discoveredLinkCount,
        knownCorpus: null,
      },
    ],
    rendering: { used: false },
    changeDetection: {
      etagObserved: report.etagObserved,
      lastModifiedObserved: report.lastModifiedObserved,
      validator304Count: 0,
      digestChanges: 0,
    },
    evidenceRefs: report.outcomes.map((outcome) => `wipo-seed:${outcome.seed.uri}`),
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        event: "wipo.trademark.corpus.reconciliation",
        ...report,
        acquisitionLearning: learning,
      },
      null,
      2,
    )}\n`,
  );

  if (
    report.failedSeedCount > 0 ||
    report.integrationChain.some((stage) => stage.state === "GAP")
  ) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
