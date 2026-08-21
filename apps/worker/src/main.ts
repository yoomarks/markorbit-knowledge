import {
  ApiArtifactAcquirer,
  ControlledCollectionWorkerRuntime,
  Crawl4AiSubprocessAcquirer,
  GitHubArtifactAcquirer,
  HttpControlledCollectionClient,
  HttpProductionConversionClient,
  HttpValidatorControlPlaneClient,
  LocalFolderArtifactAcquirer,
  ProductionConversionWorkerRuntime,
  RssArtifactAcquirer,
  createConditionalHttpChangeWatch,
  defaultApiTransport,
} from "@markorbit/worker-runtime";
import { loadWorkerProcessConfig } from "./config";
import { IpAustraliaManualArtifactAcquirer } from "./ip-australia-manual-artifact-acquirer";

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
  const collectionClient = new HttpControlledCollectionClient(
    config.controlPlaneUrl,
    config.workerId,
    config.workerCredential,
  );
  const conditionalHttp = createConditionalHttpChangeWatch(
    defaultApiTransport,
    new HttpValidatorControlPlaneClient(
      config.controlPlaneUrl,
      config.workerId,
      config.workerCredential,
    ),
  );
  const acquirer =
    config.collectionProvider === "local-folder"
      ? new LocalFolderArtifactAcquirer({
          roots: config.localFolderRoots,
          maxArtifactBytes: config.localFolderMaxArtifactBytes,
          maxTotalBytes: config.localFolderMaxTotalBytes,
          maxItems: config.localFolderMaxItems,
          maxDepth: config.localFolderMaxDepth,
        })
      : config.collectionProvider === "api"
        ? conditionalHttp.wrap(new ApiArtifactAcquirer({ transport: conditionalHttp.transport }))
        : config.collectionProvider === "rss"
          ? conditionalHttp.wrap(new RssArtifactAcquirer({ transport: conditionalHttp.transport }))
          : config.collectionProvider === "github"
            ? new GitHubArtifactAcquirer({
                maxFileBytes: config.githubMaxFileBytes,
                maxTotalBytes: config.githubMaxTotalBytes,
                maxTreeEntries: config.githubMaxTreeEntries,
                maxItems: config.githubMaxItems,
                maxDepth: config.githubMaxDepth,
              })
            : config.collectionProvider === "ip-australia-manual"
              ? new IpAustraliaManualArtifactAcquirer()
              : new Crawl4AiSubprocessAcquirer({
                  requireEgressProxy: config.requireEgressProxy,
                  maxProcessTimeoutMs: config.maxCollectionRuntimeMs,
                });
  const collectionRuntime = new ControlledCollectionWorkerRuntime(collectionClient, acquirer, {
    runtimeVersion: config.runtimeVersion,
    keepAliveIntervalMs: config.keepAliveIntervalMs,
    onBackgroundError(error) {
      log("worker.keepalive.error", { message: errorMessage(error) });
    },
  });
  const conversionRuntime =
    config.conversionEnabled && config.workspaceId
      ? new ProductionConversionWorkerRuntime(
          new HttpProductionConversionClient(
            config.controlPlaneUrl,
            config.workerId,
            config.workerCredential,
          ),
          config.workspaceId,
          {
            capabilityRevision: config.conversionCapabilityRevision,
            requestedLeaseDurationSeconds: config.conversionLeaseDurationSeconds,
            onResult(result) {
              if (!result) {
                log("worker.conversion.failed");
                return;
              }
              log("worker.conversion.completed", {
                stagingDocumentId: result.commit.stagingDocumentId,
                decision: result.commit.finalizationDecision,
                readyPackageId: result.commit.readyPackageId ?? null,
              });
            },
          },
        )
      : null;

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
    collectionProvider: config.collectionProvider,
    requireEgressProxy: config.requireEgressProxy,
    localFolderRootIds: Object.keys(config.localFolderRoots),
    maxCollectionRuntimeMs: config.maxCollectionRuntimeMs,
    conversionEnabled: config.conversionEnabled,
  });

  while (!stopping) {
    try {
      const collectionProcessed = await collectionRuntime.runOnce();
      const conversionProcessed =
        !collectionProcessed && conversionRuntime ? await conversionRuntime.runOnce() : false;
      consecutiveFailures = 0;
      if (!collectionProcessed && !conversionProcessed) await delay(config.pollIntervalMs);
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
