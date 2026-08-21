import { auditIpAustraliaManualFidelity } from "./ip-australia-manual-article-fidelity";

async function main(): Promise<void> {
  const outcomes = await auditIpAustraliaManualFidelity();
  const failed = outcomes.filter((outcome) => !outcome.ok);

  process.stdout.write(
    `${JSON.stringify(
      {
        event: "ip_australia.trademark.manual.fidelity",
        sampleCount: outcomes.length,
        passedSampleCount: outcomes.length - failed.length,
        failedSampleCount: failed.length,
        outcomes,
        acceptanceBoundary:
          "Representative article fidelity only. Full corpus readiness additionally requires acquisition of all inventoried manual pages, version/change evidence, and freshness checks.",
      },
      null,
      2,
    )}\n`,
  );

  if (failed.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
