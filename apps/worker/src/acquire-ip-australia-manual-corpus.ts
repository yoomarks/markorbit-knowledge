import { acquireIpAustraliaManualCorpus } from "./ip-australia-manual-full-acquisition";

function numberArgument(name: string): number | undefined {
  const prefix = `${name}=`;
  const raw = process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function main(): Promise<void> {
  const report = await acquireIpAustraliaManualCorpus(fetch, {
    concurrency: numberArgument("--concurrency"),
    interBatchDelayMs: numberArgument("--delay-ms"),
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        event: "ip_australia.trademark.manual.full_acquisition",
        ...report,
      },
      null,
      2,
    )}\n`,
  );

  if (report.inventoryFailures > 0 || report.failedPageCount > 0) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
