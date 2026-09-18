import type {
  CnipaDetailQueueRecord,
  PersistCnipaDetailAttemptTransitionInput,
} from "@markorbit/persistence/cnipa-detail-enrichment-queue";
import type {
  CnipaDetailRawArtifactInput,
  CnipaDetailRawArtifactIngestionResult,
} from "@markorbit/persistence/cnipa-detail-ingestion";
import {
  CnipaAcquisitionError,
  assertCnipaSessionResponse,
  buildCnipaCandidateDetailRequest,
  cnipaTransientBusinessCode,
  parseCnipaJson,
} from "@markorbit/worker-runtime";
import {
  applyCnipaDetailAttemptOutcome,
  type CnipaDetailAttemptOutcome,
  type CnipaDetailEnrichmentItemV1,
  type CnipaDetailRetryPolicy,
} from "@markorbit/worker-runtime/cnipa-detail-enrichment-state";
import type {
  CnipaAuthenticatedSessionExecutorFactory,
} from "@markorbit/worker-runtime/cnipa-artifact-acquirer";

export interface CnipaDetailQueuePort {
  claimNext(input: {
    workspaceId: string;
    leaseId: string;
    now?: string;
    leaseMs?: number;
  }): CnipaDetailQueueRecord | null;
  persistAttemptTransition(
    input: PersistCnipaDetailAttemptTransitionInput,
  ): CnipaDetailQueueRecord;
}

export type CnipaDetailRawArtifactSink = (
  input: CnipaDetailRawArtifactInput,
) => Promise<CnipaDetailRawArtifactIngestionResult>;

export type ProcessNextCnipaDetailInput = {
  queue: CnipaDetailQueuePort;
  workspaceId: string;
  queueLeaseId: string;
  sessionFactory: CnipaAuthenticatedSessionExecutorFactory;
  rawArtifactSink: CnipaDetailRawArtifactSink;
  now?: () => Date;
  queueLeaseMs?: number;
  retryPolicy?: Partial<CnipaDetailRetryPolicy>;
};

export type ProcessNextCnipaDetailResult = {
  record: CnipaDetailQueueRecord;
  pauseLane: boolean;
  outcome:
    | "FETCHED"
    | "RETRYABLE"
    | "PERMANENTLY_UNAVAILABLE"
    | "AUTH_SECURITY_HOLD";
};

function queueState(record: CnipaDetailQueueRecord): CnipaDetailEnrichmentItemV1 {
  if (
    record.lifecycle !== "LEASED" ||
    !record.leaseId ||
    !record.leasedAt ||
    !record.leaseExpiresAt
  ) {
    throw new Error("Claimed CNIPA DETAIL queue item must carry an active lease");
  }
  return {
    schemaVersion: "cnipa-detail-enrichment-v1",
    documentKind: record.documentKind,
    sourceRecordId: record.sourceRecordId,
    detailCanonicalUri: record.detailCanonicalUri,
    discoveredAt: record.discoveredAt,
    lifecycle: record.lifecycle,
    holdReason: record.holdReason,
    lease: {
      leaseId: record.leaseId,
      leasedAt: record.leasedAt,
      leaseExpiresAt: record.leaseExpiresAt,
    },
    attemptCount: record.attemptCount,
    lastAttemptAt: record.lastAttemptAt,
    nextAttemptAt: record.nextAttemptAt,
    lastErrorCode: record.lastErrorCode,
    lastHttpStatus: record.lastHttpStatus,
    lastBusinessCode: record.lastBusinessCode,
    lastSuccessAt: record.lastSuccessAt,
    detailArtifactRef: record.detailArtifactRef,
    detailSha256: record.detailSha256,
  };
}

function transitionInput(
  workspaceId: string,
  leaseId: string,
  item: CnipaDetailEnrichmentItemV1,
): PersistCnipaDetailAttemptTransitionInput {
  if (item.lifecycle === "LEASED") {
    throw new Error("Completed CNIPA DETAIL transition cannot remain LEASED");
  }
  return {
    workspaceId,
    documentKind: item.documentKind,
    sourceRecordId: item.sourceRecordId,
    expectedLeaseId: leaseId,
    lifecycle: item.lifecycle,
    holdReason: item.holdReason,
    attemptCount: item.attemptCount,
    lastAttemptAt: item.lastAttemptAt,
    nextAttemptAt: item.nextAttemptAt,
    lastErrorCode: item.lastErrorCode,
    lastHttpStatus: item.lastHttpStatus,
    lastBusinessCode: item.lastBusinessCode,
    lastSuccessAt: item.lastSuccessAt,
    detailArtifactRef: item.detailArtifactRef,
    detailSha256: item.detailSha256,
  };
}

function businessCode(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = (value as Record<string, unknown>).code;
  if (typeof raw === "number" && Number.isSafeInteger(raw)) return raw;
  if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) return Number(raw.trim());
  return undefined;
}

function classifyError(
  error: CnipaAcquisitionError,
  observedAt: string,
): CnipaDetailAttemptOutcome | null {
  if (error.code === "CNIPA_REAUTH_REQUIRED" || error.code === "CNIPA_ACCESS_DENIED") {
    return {
      kind: "AUTH_SECURITY_HOLD",
      observedAt,
      errorCode: error.code,
      ...(error.status !== undefined ? { httpStatus: error.status } : {}),
    };
  }
  if (
    error.code === "CNIPA_SOURCE_REJECTED" &&
    (error.status === 404 || error.status === 410)
  ) {
    return {
      kind: "PERMANENTLY_UNAVAILABLE",
      observedAt,
      errorCode: error.code,
      httpStatus: error.status,
    };
  }
  if (error.retryable) {
    return {
      kind: "RETRYABLE",
      observedAt,
      errorCode: error.code,
      ...(error.status !== undefined ? { httpStatus: error.status } : {}),
    };
  }
  return null;
}

function persistOutcome(input: {
  queue: CnipaDetailQueuePort;
  workspaceId: string;
  leaseId: string;
  state: CnipaDetailEnrichmentItemV1;
  outcome: CnipaDetailAttemptOutcome;
  retryPolicy?: Partial<CnipaDetailRetryPolicy>;
}): ProcessNextCnipaDetailResult {
  const transition = applyCnipaDetailAttemptOutcome({
    item: input.state,
    leaseId: input.leaseId,
    outcome: input.outcome,
    ...(input.retryPolicy ? { policy: input.retryPolicy } : {}),
  });
  const record = input.queue.persistAttemptTransition(
    transitionInput(input.workspaceId, input.leaseId, transition.item),
  );
  return {
    record,
    pauseLane: transition.laneAction === "PAUSE_AUTH_SECURITY",
    outcome: input.outcome.kind,
  };
}

export async function processNextCnipaDetail(
  input: ProcessNextCnipaDetailInput,
): Promise<ProcessNextCnipaDetailResult | null> {
  const now = input.now ?? (() => new Date());
  const claimAt = now().toISOString();
  const claimed = input.queue.claimNext({
    workspaceId: input.workspaceId,
    leaseId: input.queueLeaseId,
    now: claimAt,
    ...(input.queueLeaseMs ? { leaseMs: input.queueLeaseMs } : {}),
  });
  if (!claimed) return null;

  const state = queueState(claimed);
  const leaseId = claimed.leaseId!;
  let session:
    | Awaited<ReturnType<CnipaAuthenticatedSessionExecutorFactory["create"]>>
    | undefined;
  try {
    session = await input.sessionFactory.create();
    const request = buildCnipaCandidateDetailRequest(claimed.documentKind, claimed.sourceRecordId);
    const response = assertCnipaSessionResponse(await session.execute(request));
    const value = parseCnipaJson(response);
    const transientCode = cnipaTransientBusinessCode(value);
    if (transientCode !== undefined) {
      const observedAt = response.observedAt || now().toISOString();
      return persistOutcome({
        queue: input.queue,
        workspaceId: input.workspaceId,
        leaseId,
        state,
        outcome: {
          kind: "RETRYABLE",
          observedAt,
          errorCode: "CNIPA_SOURCE_TEMPORARY_FAILURE",
          httpStatus: response.status,
          businessCode: transientCode,
        },
        retryPolicy: input.retryPolicy,
      });
    }
    const code = businessCode(value);
    if (code !== undefined && code !== 0) {
      throw new CnipaAcquisitionError(
        "CNIPA_SOURCE_REJECTED",
        `CNIPA DETAIL returned unclassified business code ${code}`,
        false,
        response.status,
      );
    }

    const detail: CnipaDetailRawArtifactInput = {
      documentKind: claimed.documentKind,
      sourceRecordId: claimed.sourceRecordId,
      detailCanonicalUri: claimed.detailCanonicalUri,
      sourceUri: response.sourceUri,
      observedAt: response.observedAt,
      mimeType: response.contentType,
      content: response.body,
    };

    const completedSession = session;
    session = undefined;
    try {
      await completedSession.close();
    } catch {
      // Source bytes are already sealed in memory. Browser cleanup must not
      // rewrite the deterministic result or trigger another source request.
    }

    const ingested = await input.rawArtifactSink(detail);
    return persistOutcome({
      queue: input.queue,
      workspaceId: input.workspaceId,
      leaseId,
      state,
      outcome: {
        kind: "FETCHED",
        observedAt: response.observedAt,
        detailArtifactRef: ingested.artifact.artifact.id,
        detailSha256: ingested.sha256,
      },
      retryPolicy: input.retryPolicy,
    });
  } catch (error) {
    const observedAt = now().toISOString();
    if (error instanceof CnipaAcquisitionError) {
      const outcome = classifyError(error, observedAt);
      if (outcome) {
        return persistOutcome({
          queue: input.queue,
          workspaceId: input.workspaceId,
          leaseId,
          state,
          outcome,
          retryPolicy: input.retryPolicy,
        });
      }
    }
    throw error;
  } finally {
    if (session) {
      try {
        await session.close();
      } catch {
        // Preserve the acquisition/transition result.
      }
    }
  }
}
