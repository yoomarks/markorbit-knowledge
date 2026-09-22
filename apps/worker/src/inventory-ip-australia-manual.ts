import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inventoryIpAustraliaManual } from "./ip-australia-manual-inventory";

export function parseInventoryOutputPath(args: string[]): string | null {
  const index = args.indexOf("--output");
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--output requires a file path");
  }
  return path.resolve(value);
}

export function serializeIpAustraliaManualInventory(
  report: Awaited<ReturnType<typeof inventoryIpAustraliaManual>>,
): string {
  return `${JSON.stringify(
    {
      event: "ip_australia.trademark.manual.inventory",
      ...report,
    },
    null,
    2,
  )}\n`;
}

async function main(): Promise<void> {
  const report = await inventoryIpAustraliaManual();
  const outputPath = parseInventoryOutputPath(process.argv.slice(2));
  const serialized = serializeIpAustraliaManualInventory(report);

  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }

  if (report.failedUpdateHistoryPageCount > 0 || report.currentNavigationPageCount === 0) {
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
