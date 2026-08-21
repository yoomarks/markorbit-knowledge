import { reconcileIpAustraliaCorpus } from "./ip-australia-corpus-reconciliation";

async function main(): Promise<void> {
  const report = await reconcileIpAustraliaCorpus();
  const journeyGaps = report.journey.filter((stage) => stage.state === "GAP");

  process.stdout.write(
    `${JSON.stringify(
      {
        event: "ip_australia.trademark.corpus.reconciliation",
        ...report,
        journeyGapCount: journeyGaps.length,
        journeyGaps: journeyGaps.map((stage) => stage.domain),
      },
      null,
      2,
    )}\n`,
  );

  if (report.failedSeedCount > 0 || journeyGaps.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
