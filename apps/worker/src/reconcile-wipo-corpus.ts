import { reconcileWipoCorpus } from "./wipo-corpus-reconciliation";

async function main(): Promise<void> {
  const report = await reconcileWipoCorpus();
  process.stdout.write(
    `${JSON.stringify(
      {
        event: "wipo.trademark.corpus.reconciliation",
        ...report,
      },
      null,
      2,
    )}\n`,
  );

  if (report.failedSeedCount > 0 || report.integrationChain.some((stage) => stage.state === "GAP")) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
