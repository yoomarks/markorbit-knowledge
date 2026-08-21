import { reconcileUsptoCorpus } from "./uspto-corpus-reconciliation";

async function main(): Promise<void> {
  const report = await reconcileUsptoCorpus();
  process.stdout.write(
    `${JSON.stringify(
      {
        event: "uspto.trademark.corpus.reconciliation",
        ...report,
      },
      null,
      2,
    )}\n`,
  );

  if (report.failedSeedCount > 0) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
