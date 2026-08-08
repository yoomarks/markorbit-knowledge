import {
  ControlledCollectionWorkerRuntime,
  Crawl4AiSubprocessAcquirer,
  HttpControlledCollectionClient,
} from "@markorbit/worker-runtime";
import { loadWorkerProcessConfig } from "./config";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields })}\n`,
  );
}

async function main(): Promise<void> {
  const config = loadWorkerProcessConfig();
  const client = new HttpControlledCollectionClient(
    config.controlPlaneUrl,
    config.workerId,
    config.workerCredential,
  );
  const acquirer = new Crawl4AiSubprocessAcquirer({
    requireEgressProxy: config.requireEgressProxy,
    maxProcessTimeoutMs: config.maxCollectionRuntimeMs,
  });
  const runtime = new ControlledCollectionWorkerRuntime(client, acquirer, {
    runtimeVersion: config.runtimeVersion,
    keepAliveIntervalMs: config.keepAliveIntervalMs,
    onBackgroundError(error) {
      log("worker.keepalive.error", { message: errorMessage(error) });
    },
  });

  let stopping = false;
  let consecutiveFailures = 0;
  const stop = (signal: string) => {
    stopping = true;
    log("worker.stop.requested", { signal });
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));

  log("worker.started", {
    workerId: config.workerId,
    runtimeVersion: config.runtimeVersion,
    requireEgressProxy: config.requireEgressProxy,
    maxCollectionRuntimeMs: config.maxCollectionRuntimeMs,
  });

  while (!stopping) {
    try {
      const processed = await runtime.runOnce();
      consecutiveFailures = 0;
      if (!processed) await delay(config.pollIntervalMs);
    } catch (error) {
      consecutiveFailures += 1;
      const backoff = Math.min(
        config.errorBackoffMaxMs,
        config.errorBackoffMinMs * 2 ** Math.min(consecutiveFailures - 1, 10),
      );
      log("worker.iteration.error", {
        message: errorMessage(error),
        consecutiveFailures,
        retryInMs: backoff,
      });
      await delay(backoff);
    }
  }

  log("worker.stopped", { workerId: config.workerId });
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "worker.fatal",
      message: errorMessage(error),
    })}\n`,
  );
  process.exitCode = 1;
});
