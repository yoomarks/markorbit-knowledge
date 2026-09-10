import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  discoverWebAcquisitionInventory,
  parseWebAcquisitionCampaignManifest,
  runWebAcquisitionCampaign,
} from "./web-acquisition-campaign";
import {
  OFFICIAL_SCALE_DOMAIN_COUNT,
  buildOfficialScaleCampaignManifest,
} from "./web-acquisition-official-scale-campaign";

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

async function writeText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const manifestPath = argument("--manifest");
  const officialScale = process.argv.includes("--official-scale");
  if (Boolean(manifestPath) === officialScale) {
    throw new Error("Provide exactly one of --manifest=<path> or --official-scale");
  }
  const invocationRoot = process.env.INIT_CWD?.trim() || process.cwd();
  const manifest = officialScale
    ? buildOfficialScaleCampaignManifest(
        argument("--workspace") ?? "",
        Number(argument("--domain-count") ?? OFFICIAL_SCALE_DOMAIN_COUNT),
      )
    : parseWebAcquisitionCampaignManifest(
        JSON.parse(await readFile(resolve(invocationRoot, manifestPath!), "utf8")),
      );
  const outputPath = argument("--output");
  const credentialOutput = argument("--credential-output");
  const discoverOnly = process.argv.includes("--discover-only");

  if (discoverOnly) {
    const inventories = await Promise.all(
      manifest.sources.map((source) => discoverWebAcquisitionInventory(source)),
    );
    const report = {
      campaignId: manifest.campaignId,
      workspaceId: manifest.workspaceId,
      inventories,
    };
    if (outputPath) {
      await writeJson(resolve(invocationRoot, outputPath), report);
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const controlPlaneUrl =
    argument("--control-plane") ||
    process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() ||
    "http://127.0.0.1:3000";
  const result = await runWebAcquisitionCampaign(manifest, {
    controlPlaneUrl,
    dispatch: process.argv.includes("--dispatch"),
    runKey: argument("--run-key"),
  });

  if (result.workerCredential) {
    if (credentialOutput) {
      const credentialPath = resolve(invocationRoot, credentialOutput);
      await writeText(credentialPath, `${result.workerCredential}\n`);
      process.stderr.write(
        `Bulk Web Worker credential written to local credential output: ${credentialPath}\n`,
      );
    } else {
      process.stderr.write(
        "Bulk Web Worker credential was created but was not persisted; rerun with --credential-output=<gitignored-path> if the Worker must be started locally.\n",
      );
    }
  }

  const durable = {
    ...result,
    workerCredential: result.workerCredential ? "<one-time-credential-redacted>" : null,
  };
  if (outputPath) {
    await writeJson(resolve(invocationRoot, outputPath), durable);
  }
  process.stdout.write(`${JSON.stringify(durable, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
