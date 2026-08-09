import { bootstrapUsFoundationalCoverage, DEFAULT_WORKSPACE_ID } from "./source-coverage-bootstrap";

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const baseUrl =
    process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() ||
    argument("--control-plane") ||
    "http://127.0.0.1:3000";
  const workspaceId = argument("--workspace") || DEFAULT_WORKSPACE_ID;
  const dispatchRepresentative = process.argv.includes("--dispatch-representative");

  const result = await bootstrapUsFoundationalCoverage({
    baseUrl,
    workspaceId,
    dispatchRepresentative,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
