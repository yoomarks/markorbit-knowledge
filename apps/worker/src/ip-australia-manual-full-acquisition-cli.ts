import { rename, writeFile } from "node:fs/promises";
import type {
  IpAustraliaManualAcquisitionOptions,
  IpAustraliaManualFullAcquisitionReport,
} from "./ip-australia-manual-full-acquisition";

export type IpAustraliaManualFullAcquisitionCliOptions = IpAustraliaManualAcquisitionOptions & {
  outputPath?: string;
};

function argumentValue(argv: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function numberArgument(argv: readonly string[], name: string): number | undefined {
  const raw = argumentValue(argv, name);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseIpAustraliaManualFullAcquisitionCliOptions(
  argv: readonly string[],
): IpAustraliaManualFullAcquisitionCliOptions {
  const concurrency = numberArgument(argv, "--concurrency");
  const interBatchDelayMs = numberArgument(argv, "--delay-ms");
  const outputPath = argumentValue(argv, "--output");
  if (outputPath !== undefined && outputPath.trim().length === 0) {
    throw new Error("--output requires a non-empty path");
  }

  return {
    ...(concurrency !== undefined ? { concurrency } : {}),
    ...(interBatchDelayMs !== undefined ? { interBatchDelayMs } : {}),
    ...(outputPath !== undefined ? { outputPath } : {}),
  };
}

export function serializeIpAustraliaManualFullAcquisitionReport(
  report: IpAustraliaManualFullAcquisitionReport,
): string {
  return `${JSON.stringify(
    {
      event: "ip_australia.trademark.manual.full_acquisition",
      ...report,
    },
    null,
    2,
  )}\n`;
}

export function ipAustraliaManualFullAcquisitionExitCode(
  report: IpAustraliaManualFullAcquisitionReport,
): 0 | 2 {
  return report.inventoryFailures > 0 || report.incompleteEvidencePageCount > 0 ? 2 : 0;
}

export async function emitIpAustraliaManualFullAcquisitionReport(
  report: IpAustraliaManualFullAcquisitionReport,
  options: {
    outputPath?: string;
    stdout?: (value: string) => void;
  } = {},
): Promise<void> {
  const serialized = serializeIpAustraliaManualFullAcquisitionReport(report);
  if (options.outputPath) {
    const temporaryPath = `${options.outputPath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, serialized, "utf8");
    await rename(temporaryPath, options.outputPath);
    return;
  }

  (options.stdout ?? ((value) => process.stdout.write(value)))(serialized);
}
