import { DEFAULT_WORKSPACE_ID } from "./source-coverage-bootstrap";
import { runRepresentativeSupplyProof } from "./representative-supply-proof";

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function argumentsFor(name: string): string[] {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .filter((value) => value.startsWith(prefix))
    .map((value) => value.slice(prefix.length).trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const baseUrl =
    process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() ||
    argument("--control-plane") ||
    "http://127.0.0.1:3000";
  const workspaceId = argument("--workspace") || DEFAULT_WORKSPACE_ID;
  const jurisdictions = argumentsFor("--jurisdiction");
  const strict = process.argv.includes("--strict");

  const result = await runRepresentativeSupplyProof({
    baseUrl,
    workspaceId,
    ...(jurisdictions.length > 0 ? { jurisdictions } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (strict && (result.summary.incomplete > 0 || result.summary.failed > 0)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
