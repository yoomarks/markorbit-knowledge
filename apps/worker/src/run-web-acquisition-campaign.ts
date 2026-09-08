import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  discoverWebAcquisitionInventory,
  parseWebAcquisitionCampaignManifest,
  runWebAcquisitionCampaign,
} from "./web-acquisition-campaign";

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
  if (!manifestPath) throw new Error("--manifest=<path> is required");
  const invocationRoot = process.env.INIT_CWD?.trim() || process.cwd();
  const raw = await readFile(resolve(invocationRoot, manifestPath), "utf8");
  const manifest = parseWebAcquisitionCampaignManifest(JSON.parse(raw));
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
