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
import type { AiKnowledgeProvider } from "@markorbit/worker-runtime/ai-production-pilot";
import {
  completeJob,
  failJob,
  markCredentialBlocked,
  markRunning,
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
  executionRevision?: number;
  maxAttempts?: number;
  now?: () => Date;
};

function jobId(executionKey: string): string {
  return `akj_${createHash("sha256").update(executionKey).digest("hex").slice(0, 32)}`;
}

function providerFromJob(job: AiKnowledgeJob): AiKnowledgeProvider | null {
  if (job.provider === "DEEPSEEK" || job.provider === "OPENAI") {
    return job.provider;
  }
  return null;
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

export function enqueueAdkKnowledgeJobs(input: EnqueueAdkKnowledgeJobsInput): AiKnowledgeJob[] {
  const revision = input.executionRevision ?? 1;
  const maxAttempts = input.maxAttempts ?? 3;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("ADK execution revision must be a positive integer");
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("ADK maxAttempts must be a positive integer");
  }

  const now = input.now ?? (() => new Date());
  const queued: AiKnowledgeJob[] = [];
  for (const assignmentId of input.assignmentIds) {
    for (const provider of input.providers) {
      const executionKey = `${assignmentId}:${provider}:r${revision}`;
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

  try {
    const acquisition = await adapter.acquire({ assignment });
    if (
      acquisition.assignment.assignmentId !== running.assignmentId ||
      acquisition.submission.provider !== provider ||
      acquisition.artifact.provider !== provider
    ) {
      return persistFailure(input.store, running, "AI_ACQUISITION_LINEAGE_MISMATCH", false);
    }

    const lineage = await input.sink({ job: running, acquisition });
    const artifactIds = [
      acquisition.artifact.artifactId,
      lineage.rawProviderArtifactId,
      lineage.markdownRawArtifactId,
    ];
    if (new Set(artifactIds).size !== 3) {
      return persistFailure(input.store, running, "AI_ACQUISITION_LINEAGE_NOT_UNIQUE", false);
    }
    return input.store.save(completeJob(running, artifactIds));
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
}
