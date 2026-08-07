import {
  compareVaultHandoffInventorySnapshots,
  createVaultHandoffInventorySnapshot,
} from "./vault-handoff-inventory-snapshot";

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2];

if (command === "snapshot") {
  const runsRoot = value("--runs-root");
  const vault = value("--vault");
  const output = value("--output");
  if (!runsRoot || !vault || !output) {
    process.stderr.write(
      "Usage: snapshot --runs-root <directory> --vault <directory> --output <file> [--generated-at <iso>] [--prefix <path>]\n",
    );
    process.exitCode = 1;
  } else {
    const snapshot = createVaultHandoffInventorySnapshot(
      runsRoot,
      vault,
      output,
      value("--generated-at") ?? new Date().toISOString(),
      value("--prefix"),
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "SNAPSHOT_WRITTEN",
          output,
          digest: snapshot.digest.value,
          itemCount: snapshot.evidence.items.length,
          counts: snapshot.evidence.counts,
        },
        null,
        2,
      )}\n`,
    );
  }
} else if (command === "diff") {
  const before = value("--before");
  const after = value("--after");
  if (!before || !after) {
    process.stderr.write("Usage: diff --before <snapshot> --after <snapshot>\n");
    process.exitCode = 1;
  } else {
    const delta = compareVaultHandoffInventorySnapshots(before, after);
    process.stdout.write(`${JSON.stringify(delta, null, 2)}\n`);
    process.exitCode =
      delta.counts.INVALID_INTRODUCED > 0 ? 2 : delta.counts.DRIFT_INTRODUCED > 0 ? 3 : 0;
  }
} else {
  process.stderr.write("Usage: <snapshot|diff> ...\n");
  process.exitCode = 1;
}
