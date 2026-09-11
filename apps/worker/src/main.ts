import type { Job } from "@markorbit/contracts";
import {
  ApiArtifactAcquirer,
  BrightDataFallbackAcquirer,
  BrightDataWebUnlockerClient,
  CollectionAcquisitionError,
  ControlledCollectionWorkerRuntime,
  type ControlledCollectionCompletion,
  type ControlledCollectionFailure,
  Crawl4AiSubprocessAcquirer,
  GitHubArtifactAcquirer,
  HttpAcquisitionIntelligenceClient,
  HttpControlledCollectionClient,
  HttpProductionConversionClient,
  HttpValidatorControlPlaneClient,
  LocalFolderArtifactAcquirer,
  ProductionConversionWorkerRuntime,
  RssArtifactAcquirer,
  buildAcquisitionRunEvidenceFromProfile,
  buildSourceFingerprintFromAcquisitionProfile,
  createConditionalHttpChangeWatch,
  defaultApiTransport,
} from "@markorbit/worker-runtime";
import { CnipaJudgmentArtifactAcquirer } from "@markorbit/worker-runtime/cnipa-artifact-acquirer";
import {
  buildFailedAcquisitionLearningObservation,
  buildReceiptAcquisitionLearningObservation,
} from "./acquisition-learning-observation";
import { acquisitionLearningProfileForJob } from "./acquisition-learning-job-profile";
import { acquisitionLearningProfile } from "./acquisition-learning-profiles";
import { CnipaPlaywrightSessionExecutorFactory } from "./cnipa-playwright-session-executor";
import { loadWorkerProcessConfig } from "./config";
import { buildIpAustraliaManualAcquisitionRunEvidence } from "./ip-australia-manual-acquisition-learning";
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
  const configuredLearningProfileId = config.acquisitionLearningProfileId;
  if (configuredLearningProfileId && !acquisitionLearningProfile(configuredLearningProfileId)) {
    throw new Error(`Unknown acquisition learning profile: ${configuredLearningProfileId}`);
  }
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
  const ipAustraliaManualAcquirer =
    config.collectionProvider === "ip-australia-manual"
      ? new IpAustraliaManualArtifactAcquirer()
      : null;
  const cnipaAcquirer =
    config.collectionProvider === "cnipa" && config.cnipaSession
      ? new CnipaJudgmentArtifactAcquirer(
          new CnipaPlaywrightSessionExecutorFactory(config.cnipaSession),
        )
      : null;
  const crawl4AiAcquirer = new Crawl4AiSubprocessAcquirer({
    requireEgressProxy: config.requireEgressProxy,
    maxConcurrency: config.crawl4AiMaxConcurrency,
    maxProcessTimeoutMs: config.maxCollectionRuntimeMs,
  });
  const crawl4AiWithOptionalUnlock = (() => {
    if (!config.brightDataFallbackEnabled) return crawl4AiAcquirer;
    const apiToken = config.brightDataApiToken;
    const zone = config.brightDataZone;
    if (!apiToken || !zone) {
      throw new Error("Bright Data fallback configuration is incomplete");
    }
    return new BrightDataFallbackAcquirer({
      primary: crawl4AiAcquirer,
      unlocker: new BrightDataWebUnlockerClient({ apiToken, zone }),
      maxRequestsPerRun: config.brightDataMaxRequestsPerRun,
    });
  })();
  const acquisitionIntelligenceClient = new HttpAcquisitionIntelligenceClient(
    config.controlPlaneUrl,
    config.workerId,
    config.workerCredential,
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
            : config.collectionProvider === "cnipa"
              ? (cnipaAcquirer ??
                (() => {
                  throw new Error("CNIPA acquirer configuration is incomplete");
                })())
              : (ipAustraliaManualAcquirer ?? crawl4AiWithOptionalUnlock);
  const learningProfileForJob = (job: Job) =>
    acquisitionLearningProfileForJob({
      job,
      ...(configuredLearningProfileId ? { configuredProfileId: configuredLearningProfileId } : {}),
      collectionProvider: config.collectionProvider,
    });

  async function recordCompletedLearning(
    completion: ControlledCollectionCompletion,
  ): Promise<void> {
    const profile = learningProfileForJob(completion.context.job);
    if (!profile || !completion.receipt) return;
    const observation = buildReceiptAcquisitionLearningObservation(
      completion,
      config.collectionProvider === "crawl4ai" ? crawl4AiAcquirer.getDiagnostics() : null,
    );
    if (!observation) return;
    const evidence = ipAustraliaManualAcquirer
      ? buildIpAustraliaManualAcquisitionRunEvidence({
          job: completion.context.job,
          receipt: completion.receipt,
          diagnostics: ipAustraliaManualAcquirer.getDiagnostics(),
          startedAt: completion.startedAt,
          finishedAt: completion.finishedAt,
          profile,
        })
      : buildAcquisitionRunEvidenceFromProfile({ profile, observation });
    const fingerprint = buildSourceFingerprintFromAcquisitionProfile({
      profile,
      sourceId: completion.context.job.sourceId,
      observedAt: completion.finishedAt,
      evidenceRefs: evidence.evidenceRefs,
      changeDetection: evidence.changeDetection,
    });
    const learned = await acquisitionIntelligenceClient.recordRun(evidence, fingerprint);
    const manualDiagnostics = ipAustraliaManualAcquirer?.getDiagnostics();
    log("worker.acquisition.learning.recorded", {
      runId: learned.runId,
      sourceId: learned.sourceId,
      profileId: profile.profileId,
      siteFamily: profile.siteFamily ?? null,
      playbookId: profile.playbookId,
      playbookRevision: profile.playbookRevision,
      outcome: evidence.outcome,
      executionAttemptId: learned.executionAttemptId,
      replayed: learned.replayed,
      fingerprintRecorded: learned.fingerprintRecorded,
      lessonsRecorded: learned.lessonsRecorded,
      playbookRuns: learned.playbookHistory.runs,
      playbookSuccessRate: learned.playbookHistory.successRate,
      playbookAverageCoverage: learned.playbookHistory.averageCoverage,
      strategyCandidateId: learned.strategyCandidateId,
      strategyCandidateStage: learned.strategyCandidateStage,
      strategyCandidateEvidenceCount: learned.strategyCandidateEvidenceCount,
      reevaluationRequestId: learned.reevaluationRequestId,
      ...(manualDiagnostics
        ? {
            inventoryPageCount: manualDiagnostics.inventoryPageCount,
            emittedArtifactCount: manualDiagnostics.emittedArtifactCount,
            sourceGapCount: manualDiagnostics.sourceGaps.length,
            sourceGapSamples: manualDiagnostics.sourceGaps.slice(0, 10).map((gap) => ({
              uri: gap.uri,
              status: gap.status,
              reason: gap.reason,
            })),
          }
        : {}),
    });
  }

  async function recordFailedLearning(failure: ControlledCollectionFailure): Promise<void> {
    const profile = learningProfileForJob(failure.context.job);
    if (!profile) return;
    const observation = buildFailedAcquisitionLearningObservation(failure);
    const evidence = buildAcquisitionRunEvidenceFromProfile({ profile, observation });
    const fingerprint = buildSourceFingerprintFromAcquisitionProfile({
      profile,
      sourceId: failure.context.job.sourceId,
      observedAt: failure.finishedAt,
      evidenceRefs: evidence.evidenceRefs,
      changeDetection: evidence.changeDetection,
    });
    const learned = await acquisitionIntelligenceClient.recordRun(evidence, fingerprint);
    log("worker.acquisition.learning.failure.recorded", {
      runId: learned.runId,
      sourceId: learned.sourceId,
      profileId: profile.profileId,
      siteFamily: profile.siteFamily ?? null,
      playbookId: profile.playbookId,
      playbookRevision: profile.playbookRevision,
      outcome: evidence.outcome,
      lessonsRecorded: learned.lessonsRecorded,
      playbookRuns: learned.playbookHistory.runs,
      playbookSuccessRate: learned.playbookHistory.successRate,
    });
  }

  const collectionRuntime = new ControlledCollectionWorkerRuntime(collectionClient, acquirer, {
    runtimeVersion: config.runtimeVersion,
    keepAliveIntervalMs: config.keepAliveIntervalMs,
    artifactIngestionConcurrency: config.artifactIngestionConcurrency,
    onBackgroundError(error) {
      log("worker.background.error", { message: errorMessage(error) });
    },
    onCompleted: recordCompletedLearning,
    onFailed: recordFailedLearning,
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
            supportedConverters: config.conversionSupportedConverters,
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
    brightDataFallbackEnabled: config.brightDataFallbackEnabled,
    brightDataMaxRequestsPerRun: config.brightDataMaxRequestsPerRun,
    cnipaAuthenticatedRuntimeEnabled: Boolean(cnipaAcquirer),
    localFolderRootIds: Object.keys(config.localFolderRoots),
    maxCollectionRuntimeMs: config.maxCollectionRuntimeMs,
    artifactIngestionConcurrency: config.artifactIngestionConcurrency,
    crawl4AiMaxConcurrency: config.crawl4AiMaxConcurrency,
    collectionEnabled: config.collectionEnabled,
    conversionEnabled: config.conversionEnabled,
    acquisitionLearningEnabled: Boolean(acquisitionIntelligenceClient),
    acquisitionLearningProfileId: configuredLearningProfileId ?? null,
    acquisitionLearningProfileMode: configuredLearningProfileId
      ? "configured-with-job-overrides"
      : "job-derived",
  });

  while (!stopping) {
    try {
      const collectionProcessed = config.collectionEnabled
        ? await collectionRuntime.runOnce()
        : false;
      const conversionProcessed =
        !collectionProcessed && conversionRuntime ? await conversionRuntime.runOnce() : false;
      consecutiveFailures = 0;
      if (!collectionProcessed && !conversionProcessed) await delay(config.pollIntervalMs);
    } catch (error) {
      if (
        config.collectionProvider === "cnipa" &&
        error instanceof CollectionAcquisitionError &&
        error.code === "CNIPA_REAUTH_REQUIRED"
      ) {
        log("worker.cnipa.reauth_required", {
          message:
            "CNIPA collection stopped before another claim. Complete operator re-login, then restart this Worker.",
        });
        stopping = true;
        continue;
      }
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
