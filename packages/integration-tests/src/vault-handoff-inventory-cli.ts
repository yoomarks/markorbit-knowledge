import { inspectVaultHandoffInventory } from "./vault-handoff-inventory";
import type { VaultHandoffInspectionStatus } from "./vault-handoff-inspection";

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const runsRoot = value("--runs-root");
const vault = value("--vault");
if (!runsRoot || !vault) {
  process.stderr.write(
    "Usage: --runs-root <directory> --vault <directory> [--status <status>] [--limit <n>] [--prefix <path>]\n",
  );
  process.exitCode = 1;
} else {
  const status = value("--status") as VaultHandoffInspectionStatus | undefined;
  const allowedStatuses: VaultHandoffInspectionStatus[] = [
    "PENDING",
    "CONSUMED",
    "DRIFTED",
    "INVALID",
  ];
  if (status && !allowedStatuses.includes(status)) {
    process.stderr.write("Invalid --status value\n");
    process.exitCode = 1;
  } else {
    const rawLimit = value("--limit");
    const result = inspectVaultHandoffInventory(runsRoot, vault, {
      status,
      limit: rawLimit ? Number(rawLimit) : undefined,
      allowedPrefix: value("--prefix"),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.counts.INVALID > 0 ? 2 : result.counts.DRIFTED > 0 ? 3 : 0;
  }
}
