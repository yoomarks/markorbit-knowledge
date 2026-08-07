import { resolve } from "node:path";
import { inspectVaultHandoff } from "./vault-handoff-inspection";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

try {
  const root = resolve(argument("--root"));
  const vault = resolve(argument("--vault"));
  const prefixIndex = process.argv.indexOf("--prefix");
  const prefix = prefixIndex >= 0 ? process.argv[prefixIndex + 1] : undefined;
  const result = inspectVaultHandoff(root, vault, prefix);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "INVALID") process.exitCode = 2;
  else if (result.status === "DRIFTED") process.exitCode = 3;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
