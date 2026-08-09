import { bootstrapUsFoundationalCoverage, DEFAULT_WORKSPACE_ID } from "./source-coverage-bootstrap";
import { prepareUsFoundationalAutoConversion } from "./source-supply-conversion";
import { prepareUsFoundationalSupply } from "./source-coverage-operations";

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
  const dispatchRepresentative = process.argv.includes("--dispatch-representative");
  const sourcesOnly = process.argv.includes("--sources-only");
  const dispatchTargetIds = argumentsFor("--dispatch-target");

  const bootstrap = await bootstrapUsFoundationalCoverage({
    baseUrl,
    workspaceId,
    dispatchRepresentative,
  });

  const supply = sourcesOnly
    ? null
    : await prepareUsFoundationalSupply({
        baseUrl,
        workspaceId,
        dispatchTargetIds,
      });
  const conversion = sourcesOnly
    ? null
    : await prepareUsFoundationalAutoConversion({
        baseUrl,
        workspaceId,
      });

  process.stdout.write(
    `${JSON.stringify(
      {
        bootstrap,
        supply,
        conversion,
        mode: sourcesOnly ? "SOURCES_ONLY" : "SOURCES_SUPPLY_PLANS_AND_AUTO_CONVERSION_PROFILES",
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
