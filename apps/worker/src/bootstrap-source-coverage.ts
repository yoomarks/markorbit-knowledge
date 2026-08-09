import { bootstrapFoundationalCoverage, DEFAULT_WORKSPACE_ID } from "./source-coverage-bootstrap";
import { prepareFoundationalAutoConversion } from "./source-supply-conversion";
import { prepareFoundationalSupply } from "./source-coverage-operations";

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
  const jurisdiction = (argument("--jurisdiction") || "US").trim().toUpperCase();
  if (jurisdiction !== "US" && jurisdiction !== "WO") {
    throw new Error("--jurisdiction must be US or WO");
  }
  const dispatchRepresentative = process.argv.includes("--dispatch-representative");
  if (dispatchRepresentative && jurisdiction !== "US") {
    throw new Error("--dispatch-representative is currently supported only for US live smoke");
  }
  const sourcesOnly = process.argv.includes("--sources-only");
  const dispatchTargetIds = argumentsFor("--dispatch-target");

  const bootstrap = await bootstrapFoundationalCoverage({
    baseUrl,
    workspaceId,
    jurisdiction,
    dispatchRepresentative,
  });

  const supply = sourcesOnly
    ? null
    : await prepareFoundationalSupply({
        baseUrl,
        workspaceId,
        jurisdiction,
        dispatchTargetIds,
      });
  const conversion = sourcesOnly
    ? null
    : await prepareFoundationalAutoConversion({
        baseUrl,
        workspaceId,
        jurisdiction,
      });

  process.stdout.write(
    `${JSON.stringify(
      {
        bootstrap,
        supply,
        conversion,
        jurisdiction,
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
