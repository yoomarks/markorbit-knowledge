import { acquireIpAustraliaManualCorpus } from "./ip-australia-manual-full-acquisition";
import {
  emitIpAustraliaManualFullAcquisitionReport,
  ipAustraliaManualFullAcquisitionExitCode,
  parseIpAustraliaManualFullAcquisitionCliOptions,
} from "./ip-australia-manual-full-acquisition-cli";

async function main(): Promise<void> {
  const options = parseIpAustraliaManualFullAcquisitionCliOptions(process.argv.slice(2));
  const report = await acquireIpAustraliaManualCorpus(fetch, options);

  await emitIpAustraliaManualFullAcquisitionReport(
    report,
    options.outputPath ? { outputPath: options.outputPath } : {},
  );
  process.exitCode = ipAustraliaManualFullAcquisitionExitCode(report);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
