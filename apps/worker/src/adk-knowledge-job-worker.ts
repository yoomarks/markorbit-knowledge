import { createHash } from "node:crypto";
import {
  ingestAiDistilledKnowledgeAsRawArtifacts,
  type AiRawArtifactExecutionContext,
  type AiRawArtifactIngestionRepository,
} from "@markorbit/persistence/ai-distilled-knowledge-ingestion";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
} from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import {
  isAiProductionPilotPlanV1,
  type AiKnowledgeProvider,
  type AiProductionPilotPlanV1,
} from "@markorbit/worker-runtime/ai-production-pilot";
import {
  blockJobForRecovery,
  completeJob,
  failJob,
  markCredentialBlocked,
  markRunning,
  recoverClaimedJob,
  requeueCredentialBlockedJob,
  requeueJob,
  type AiKnowledgeJob,
} from "./adk-knowledge-job-queue";
import type { AiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";

export type AdkAssignment = AiKnowledgeAcquisition["assignment"];

export interface AdkAssignmentRepository {
  getAssignment(assignmentId: string): AdkAssignment | null;
}

export type AdkPersistedLineage = {
  rawProviderArtifactId: string;
  markdownRawArtifactId: string;
};

export type AdkAcquisitionSink = (input: {
  job: AiKnowledgeJob;
  acquisition: AiKnowledgeAcquisition;
}) => Promise<AdkPersistedLineage>;

export type AdkKnowledgeJobWorkerInput = {
  store: AiKnowledgeJobStore;
  assignments: AdkAssignmentRepository;
  adapters: ReadonlyMap<AiKnowledgeProvider, AiKnowledgeProviderAdapter>;
  sink: AdkAcquisitionSink;
};

export type EnqueueAdkKnowledgeJobsInput = {
  store: AiKnowledgeJobStore;
  assignmentIds: readonly string[];
  providers: readonly AiKnowledgeProvider[];
  executionScope?: string;
  executionRevision?: number;
  maxAttempts?: number;
  now?: () => Date;
};

export type EnqueueAdkProductionPilotInput = {
  store: AiKnowledgeJobStore;
  assignments: AdkAssignmentRepository;
  plan: AiProductionPilotPlanV1;
  maxAttempts?: number;
  now?: () => Date;
};

export type RecoverAdkKnowledgeJobsInput = {
  store: AiKnowledgeJobStore;
  staleBefore: Date;
  requeueRetryPending?: boolean;
  requeueCredentialBlocked?: boolean;
};

export type RecoverAdkKnowledgeJobsResult = {
  requeuedRetryPending: string[];
  requeuedCredentialBlocked: string[];
  requeuedStaleClaimed: string[];
  blockedStaleRunning: string[];
};

function jobId(executionKey: string): string {
  return `akj_${createHash("sha256").update(executionKey).digest("hex").slice(0, 32)}`;
}

export function isSupportedAdkQueueProvider(value: string): value is AiKnowledgeProvider {
  return value === "DEEPSEEK" || value === "OPENAI";
}

function providerFromJob(job: AiKnowledgeJob): AiKnowledgeProvider | null {
  return isSupportedAdkQueueProvider(job.provider) ? job.provider : null;
}

function failureMessage(error: unknown): string {
  if (error instanceof AiKnowledgeAcquisitionError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function persistFailure(
  store: AiKnowledgeJobStore,
  running: AiKnowledgeJob,
  error: string,
  retryable: boolean,
): AiKnowledgeJob {
  return store.save(failJob(running, error, { retryable }));
}

function resolveExecutionScope(input: EnqueueAdkKnowledgeJobsInput): string {
  const explicit = input.executionScope?.trim();
  if (explicit) {
    if (input.executionRevision !== undefined) {
      throw new Error("ADK executionScope and executionRevision cannot both be supplied");
    }
    if (explicit.length > 128) {
      throw new Error("ADK executionScope must contain at most 128 characters");
    }
    return explicit;
  }

  const revision = input.executionRevision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("ADK execution revision must be a positive integer");
  }
  return `r${revision}`;
}

function isStale(job: AiKnowledgeJob, staleBefore: Date): boolean {
  const updatedAt = Date.parse(job.updatedAt);
  if (Number.isNaN(updatedAt)) {
    throw new Error(`AI knowledge job ${job.id} has an invalid updatedAt timestamp`);
  }
  return updatedAt < staleBefore.getTime();
}

export function enqueueAdkKnowledgeJobs(input: EnqueueAdkKnowledgeJobsInput): AiKnowledgeJob[] {
  const executionScope = resolveExecutionScope(input);
  const maxAttempts = input.maxAttempts ?? 3;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("ADK maxAttempts must be a positive integer");
  }

  const now = input.now ?? (() => new Date());
  const queued: AiKnowledgeJob[] = [];
  for (const assignmentId of input.assignmentIds) {
    for (const provider of input.providers) {
      const executionKey = `${assignmentId}:${provider}:${executionScope}`;
      const existing = input.store.getByExecutionKey(executionKey);
      if (existing) {
        queued.push(existing);
        continue;
      }
      const timestamp = now().toISOString();
      queued.push(
        input.store.put({
          id: jobId(executionKey),
          assignmentId,
          provider,
          status: "QUEUED",
          attempts: 0,
          maxAttempts,
          executionKey,
          createdAt: timestamp,
          updatedAt: timestamp,
          artifactIds: [],
        }),
      );
    }
  }
  return queued;
}

export function enqueueAdkProductionPilot(input: EnqueueAdkProductionPilotInput): AiKnowledgeJob[] {
  if (!isAiProductionPilotPlanV1(input.plan)) {
    throw new Error("Invalid AiProductionPilotPlanV1");
  }
  const unsupported = input.plan.providers.filter(
    (provider) => !isSupportedAdkQueueProvider(provider),
  );
  if (unsupported.length > 0) {
    throw new Error(`ADK queue runtime does not support providers: ${unsupported.join(", ")}`);
  }
  for (const assignmentId of input.plan.assignmentIds) {
    if (!input.assignments.getAssignment(assignmentId)) {
      throw new Error(`ADK production pilot assignment ${assignmentId} was not found`);
    }
  }

  return enqueueAdkKnowledgeJobs({
    store: input.store,
    assignmentIds: input.plan.assignmentIds,
    providers: input.plan.providers,
    executionScope: `pilot:${input.plan.pilotId}`,
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    ...(input.now === undefined ? {} : { now: input.now }),
  });
}

export function recoverAdkKnowledgeJobs(
  input: RecoverAdkKnowledgeJobsInput,
): RecoverAdkKnowledgeJobsResult {
  if (Number.isNaN(input.staleBefore.getTime())) {
    throw new Error("ADK staleBefore must be a valid Date");
  }

  const result: RecoverAdkKnowledgeJobsResult = {
    requeuedRetryPending: [],
    requeuedCredentialBlocked: [],
    requeuedStaleClaimed: [],
    blockedStaleRunning: [],
  };

  for (const job of input.store.list()) {
    if (job.status === "RETRY_PENDING" && input.requeueRetryPending === true) {
      const saved = input.store.saveIfStatus(requeueJob(job), "RETRY_PENDING");
      if (saved) result.requeuedRetryPending.push(job.id);
      continue;
    }

    if (
      job.status === "BLOCKED_CREDENTIAL" &&
      input.requeueCredentialBlocked === true
    ) {
      const saved = input.store.saveIfStatus(
        requeueCredentialBlockedJob(job),
        "BLOCKED_CREDENTIAL",
      );
      if (saved) result.requeuedCredentialBlocked.push(job.id);
      continue;
    }

    if (job.status === "CLAIMED" && isStale(job, input.staleBefore)) {
      const saved = input.store.saveIfStatus(recoverClaimedJob(job), "CLAIMED");
      if (saved) result.requeuedStaleClaimed.push(job.id);
      continue;
    }

    if (job.status === "RUNNING" && isStale(job, input.staleBefore)) {
      const saved = input.store.saveIfStatus(
        blockJobForRecovery(job, "AI_STALE_RUNNING_REQUIRES_RECONCILIATION"),
        "RUNNING",
      );
      if (saved) result.blockedStaleRunning.push(job.id);
    }
  }

  return result;
}

export function createRawArtifactAdkAcquisitionSink(input: {
  repository: AiRawArtifactIngestionRepository;
  execution: AiRawArtifactExecutionContext;
}): AdkAcquisitionSink {
  return async ({ acquisition }) => {
    const ingested = await ingestAiDistilledKnowledgeAsRawArtifacts({
      repository: input.repository,
      execution: input.execution,
      acquisition,
    });
    return {
      rawProviderArtifactId: ingested.rawProviderArtifact.artifact.id,
      markdownRawArtifactId: ingested.markdownArtifact.artifact.id,
    };
  };
}

export async function processNextAdkKnowledgeJob(
  input: AdkKnowledgeJobWorkerInput,
): Promise<AiKnowledgeJob | undefined> {
  const claimed = input.store.claimNext();
  if (!claimed) return undefined;

  const running = input.store.save(markRunning(claimed));
  const provider = providerFromJob(running);
  if (!provider) {
    return persistFailure(
      input.store,
      running,
      `AI_PROVIDER_UNSUPPORTED: ${running.provider}`,
      false,
    );
  }

  const assignment = input.assignments.getAssignment(running.assignmentId);
  if (!assignment) {
    return persistFailure(
      input.store,
      running,
      `AI_ASSIGNMENT_NOT_FOUND: ${running.assignmentId}`,
      false,
    );
  }

  const adapter = input.adapters.get(provider);
  if (!adapter) {
    return persistFailure(input.store, running, `AI_PROVIDER_ADAPTER_MISSING: ${provider}`, false);
  }
  if (adapter.provider !== provider) {
    return persistFailure(input.store, running, `AI_PROVIDER_ADAPTER_MISMATCH: ${provider}`, false);
  }

  let acquisition: AiKnowledgeAcquisition;
  try {
    acquisition = await adapter.acquire({ assignment });
  } catch (error) {
    if (
      error instanceof AiKnowledgeAcquisitionError &&
      error.code === "AI_PROVIDER_CREDENTIAL_MISSING"
    ) {
      return input.store.save(markCredentialBlocked(running, failureMessage(error)));
    }
    const retryable = error instanceof AiKnowledgeAcquisitionError ? error.retryable : true;
    return persistFailure(input.store, running, failureMessage(error), retryable);
  }

  if (
    acquisition.assignment.assignmentId !== running.assignmentId ||
    acquisition.submission.provider !== provider ||
    acquisition.artifact.provider !== provider
  ) {
    return persistFailure(input.store, running, "AI_ACQUISITION_LINEAGE_MISMATCH", false);
  }

  let lineage: AdkPersistedLineage;
  try {
    lineage = await input.sink({ job: running, acquisition });
  } catch (error) {
    return input.store.save(
      blockJobForRecovery(
        running,
        `AI_ARTIFACT_PERSISTENCE_UNCERTAIN: ${failureMessage(error)}`,
      ),
    );
  }

  const artifactIds = [
    acquisition.artifact.artifactId,
    lineage.rawProviderArtifactId,
    lineage.markdownRawArtifactId,
  ];
  if (new Set(artifactIds).size !== 3) {
    return input.store.save(
      blockJobForRecovery(
        running,
        "AI_ACQUISITION_LINEAGE_REQUIRES_RECONCILIATION",
      ),
    );
  }
  return input.store.save(completeJob(running, artifactIds));
}
