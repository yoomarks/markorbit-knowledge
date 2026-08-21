import { inventoryIpAustraliaManual } from "./ip-australia-manual-inventory";

async function main(): Promise<void> {
  const report = await inventoryIpAustraliaManual();
  process.stdout.write(
    `${JSON.stringify(
      {
        event: "ip_australia.trademark.manual.inventory",
        ...report,
      },
      null,
      2,
    )}\n`,
  );

  if (report.failedListingPageCount > 0 || report.uniqueManualPageCount === 0) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
