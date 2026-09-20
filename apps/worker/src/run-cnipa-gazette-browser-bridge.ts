import {
  CnipaGazetteBrowserRuntime,
  HttpCnipaGazetteDurableArtifactReader,
  HttpControlledCollectionClient,
} from "@markorbit/worker-runtime";

type CliArguments = {
  jobId: string;
  extensionOrigin: string;
  port: number;
  bridgeToken?: string;
};

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export function parseCnipaGazetteBrowserBridgeArguments(args: string[]): CliArguments {
  let jobId: string | undefined;
  let extensionOrigin: string | undefined;
  let bridgeToken: string | undefined;
  let port = 0;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--") {
      continue;
    }
    if (arg === "--job") {
      jobId = valueAfter(args, index, "--job");
      index += 1;
    } else if (arg === "--extension-origin") {
      extensionOrigin = valueAfter(args, index, "--extension-origin");
      index += 1;
    } else if (arg === "--port") {
      const raw = valueAfter(args, index, "--port");
      port = Number(raw);
      if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
        throw new Error("--port must be an integer from 0 to 65535");
      }
      index += 1;
    } else if (arg === "--bridge-token") {
      bridgeToken = valueAfter(args, index, "--bridge-token");
      if (!/^[A-Za-z0-9._~-]{32,256}$/u.test(bridgeToken)) {
        throw new Error("--bridge-token must contain 32 to 256 header-safe characters");
      }
      index += 1;
    } else {
      throw new Error(`Unknown CNIPA Gazette browser bridge argument: ${arg}`);
    }
  }
  if (!jobId) throw new Error("--job is required");
  if (!extensionOrigin) throw new Error("--extension-origin is required");
  return {
    jobId,
    extensionOrigin,
    port,
    ...(bridgeToken ? { bridgeToken } : {}),
  };
}
function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function runCnipaGazetteBrowserBridge(args: string[]): Promise<void> {
  const cli = parseCnipaGazetteBrowserBridgeArguments(args);
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);

  try {
    const controlPlaneUrl = requiredEnvironment("MARKORBIT_CONTROL_PLANE_URL");
    const workerId = requiredEnvironment("MARKORBIT_WORKER_ID");
    const workerCredential = requiredEnvironment("MARKORBIT_WORKER_CREDENTIAL");
    const client = new HttpControlledCollectionClient(controlPlaneUrl, workerId, workerCredential);
    const runtime = new CnipaGazetteBrowserRuntime(client, {
      durableArtifactReader: new HttpCnipaGazetteDurableArtifactReader(
        controlPlaneUrl,
        workerId,
        workerCredential,
      ),
      extensionOrigin: cli.extensionOrigin,
      port: cli.port,
      ...(cli.bridgeToken ? { bridgeToken: cli.bridgeToken } : {}),
      signal: controller.signal,
      onBackgroundError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`browser_bridge_background_error=${message}\n`);
      },
      onListening: (details) => {
        process.stdout.write(
          [
            `bridge_protocol=MO_CNIPA_GAZETTE_LOOPBACK_V1`,
            `bridge_url=${details.baseUrl}`,
            `bridge_token=${details.bridgeToken}`,
            `extension_origin=${details.extensionOrigin}`,
            `announcement_issue=${details.announcementIssue}`,
            `job_id=${details.jobId}`,
            `max_runtime_seconds=${details.maxRuntimeSeconds}`,
            "bridge_token_persistence=NONE",
            "data_engine_mutation=DISABLED",
          ].join("\n") + "\n",
        );
      },
    });
    const result = await runtime.run(cli.jobId);
    process.stdout.write(
      [
        "browser_bridge_outcome=COMPLETED",
        `rows_seen=${result.receipt.itemsObserved}`,
        `bytes_prepared=${result.receipt.bytesPrepared}`,
      ].join("\n") + "\n",
    );
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

if (process.env.VITEST !== "true") {
  runCnipaGazetteBrowserBridge(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`browser_bridge_outcome=FAILED\nerror=${message}\n`);
    process.exitCode = 1;
  });
}
