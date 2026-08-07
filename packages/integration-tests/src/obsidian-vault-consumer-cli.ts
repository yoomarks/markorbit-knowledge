import { consumeReadyPackageToVault, verifyVaultConsumption } from "./obsidian-vault-consumer";

function value(args: string[], name: string): string {
  const index = args.indexOf(name);
  const result = index >= 0 ? args[index + 1] : undefined;
  if (!result) throw new Error(`Missing ${name}`);
  return result;
}

const args = process.argv.slice(2);
const command = args[0];
const root = value(args, "--root");
const vault = value(args, "--vault");
const result =
  command === "consume"
    ? consumeReadyPackageToVault(root, vault)
    : command === "verify"
      ? verifyVaultConsumption(root, vault)
      : (() => {
          throw new Error("Expected consume or verify command");
        })();

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
