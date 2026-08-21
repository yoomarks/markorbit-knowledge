import { auditIpAustraliaManualCanonicalFidelity } from "./ip-australia-manual-canonical-fidelity";

async function main(): Promise<void> {
  const outcomes = await auditIpAustraliaManualCanonicalFidelity();
  const failed = outcomes.filter((outcome) => !outcome.ok);
  process.stdout.write(
    `${JSON.stringify(
      {
        event: "ip_australia.manual.canonical_fidelity",
        sampleCount: outcomes.length,
        passCount: outcomes.length - failed.length,
        failCount: failed.length,
        outcomes,
      },
      null,
      2,
    )}\n`,
  );
  if (failed.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
