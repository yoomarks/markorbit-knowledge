import {
  isArtifactIngestionReceipt,
  isArtifactIngestionSession,
  isExecutionAttempt,
  isJob,
  isJobLease,
  type ArtifactIngestionReceipt,
  type ArtifactIngestionSession,
  type ArtifactUploadDescriptor,
  type ExecutionAttempt,
  type ExecutionExecutor,
  type ExecutionReceipt,
  type Job,
  type JobLease,
} from "@markorbit/contracts";
import type {
  ArtifactBackedExecutionClient,
  ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";

export type ControlledWorkerClaim = {
  job: Job | null;
  lease: JobLease | null;
  leaseToken: string | null;
};

export class WorkerControlPlaneHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "WorkerControlPlaneHttpError";
  }
}

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Worker control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export class HttpControlledCollectionClient implements ArtifactBackedExecutionClient {
  readonly workerId: string;
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    workerId: string,
    private readonly credential: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = normalizedBaseUrl(baseUrl);
    this.workerId = workerId.trim();
    if (!this.workerId) throw new Error("workerId is required");
    if (!credential.trim()) throw new Error("worker credential is required");
  }

  private authorizationHeaders(leaseToken?: string): HeadersInit {
    return {
      authorization: `Bearer ${this.credential}`,
      ...(leaseToken ? { "x-lease-token": leaseToken } : {}),
    };
  }

  private async jsonRequest(
    path: string,
    body: Record<string, unknown>,
    leaseToken?: string,
  ): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        ...this.authorizationHeaders(leaseToken),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let message = `Worker control-plane request failed (${response.status})`;
      try {
        const parsed = record(await response.json());
        const error = record(parsed?.error);
        if (typeof error?.message === "string") message = error.message;
      } catch {
        // Preserve the transport-level fallback message.
      }
      throw new WorkerControlPlaneHttpError(response.status, message);
    }
    return response.json();
  }

  async heartbeat(runtimeVersion: string, activeLeaseIds: string[] = []): Promise<void> {
    await this.jsonRequest("/api/worker/v1/heartbeat", {
      workerId: this.workerId,
      observedAt: new Date().toISOString(),
      runtimeVersion,
      health: "HEALTHY",
      activeLeaseIds,
    });
  }

  async claim(): Promise<ControlledWorkerClaim> {
    const payload = record(
      await this.jsonRequest("/api/worker/v1/claim", { workerId: this.workerId }),
    );
    if (!payload) throw new Error("Worker claim response must be an object");
    const job = payload.job === null ? null : isJob(payload.job) ? payload.job : undefined;
    const lease = payload.lease === null ? null : isJobLease(payload.lease) ? payload.lease : undefined;
    const leaseToken =
      payload.leaseToken === null
        ? null
        : typeof payload.leaseToken === "string"
          ? payload.leaseToken
          : undefined;
    if (job === undefined || lease === undefined || leaseToken === undefined) {
      throw new Error("Worker claim response does not satisfy Worker Protocol v1");
    }
    if ((job === null) !== (lease === null) || (job === null) !== (leaseToken === null)) {
      throw new Error("Worker claim response has inconsistent Job/lease/token state");
    }
    return { job, lease, leaseToken };
  }

  async start(
    context: ArtifactBackedExecutionContext,
    executor: ExecutionExecutor,
    idempotencyKey: string,
  ): Promise<ExecutionAttempt> {
    const payload = record(
      await this.jsonRequest(
        `/api/worker/v1/leases/${context.lease.id}/start`,
        { workerId: this.workerId, executor, idempotencyKey },
        context.leaseToken,
      ),
    );
    if (!payload || !isExecutionAttempt(payload.attempt)) {
      throw new Error("Worker start response does not contain a valid ExecutionAttempt");
    }
    return payload.attempt;
  }

  async uploading(context: ArtifactBackedExecutionContext, idempotencyKey: string): Promise<void> {
    await this.jsonRequest(
      `/api/worker/v1/leases/${context.lease.id}/uploading`,
      { workerId: this.workerId, idempotencyKey },
      context.leaseToken,
    );
  }

  async createArtifactSession(
    context: ArtifactBackedExecutionContext,
    descriptor: ArtifactUploadDescriptor,
    idempotencyKey: string,
  ): Promise<ArtifactIngestionSession> {
    const payload = record(
      await this.jsonRequest(
        "/api/worker/v1/artifacts/sessions",
        {
          workerId: this.workerId,
          leaseId: context.lease.id,
          descriptor,
          idempotencyKey,
        },
        context.leaseToken,
      ),
    );
    const sessionRecord = record(payload?.record);
    if (!sessionRecord || !isArtifactIngestionSession(sessionRecord.session)) {
      throw new Error("Artifact session response does not satisfy Artifact Ingestion Protocol v1");
    }
    return sessionRecord.session;
  }

  async uploadArtifactContent(
    context: ArtifactBackedExecutionContext,
    sessionId: string,
    content: Uint8Array,
  ): Promise<void> {
    const response = await this.fetcher(
      `${this.baseUrl}/api/worker/v1/artifacts/sessions/${sessionId}/content`,
      {
        method: "PUT",
        headers: {
          ...this.authorizationHeaders(context.leaseToken),
          "x-worker-id": this.workerId,
          "x-lease-id": context.lease.id,
          "content-type": "application/octet-stream",
        },
        body: Buffer.from(content),
      },
    );
    if (!response.ok) {
      throw new WorkerControlPlaneHttpError(
        response.status,
        `Artifact content upload failed (${response.status})`,
      );
    }
  }

  async finalizeArtifact(
    context: ArtifactBackedExecutionContext,
    sessionId: string,
  ): Promise<ArtifactIngestionReceipt> {
    const response = await this.fetcher(
      `${this.baseUrl}/api/worker/v1/artifacts/sessions/${sessionId}/finalize`,
      {
        method: "POST",
        headers: {
          ...this.authorizationHeaders(context.leaseToken),
          "x-worker-id": this.workerId,
          "x-lease-id": context.lease.id,
        },
      },
    );
    if (!response.ok) {
      throw new WorkerControlPlaneHttpError(
        response.status,
        `Artifact finalize failed (${response.status})`,
      );
    }
    const payload = record(await response.json());
    if (!payload || !isArtifactIngestionReceipt(payload.receipt)) {
      throw new Error("Artifact finalize response does not contain a valid receipt");
    }
    return payload.receipt;
  }

  async verifying(context: ArtifactBackedExecutionContext, idempotencyKey: string): Promise<void> {
    await this.jsonRequest(
      `/api/worker/v1/leases/${context.lease.id}/verifying`,
      { workerId: this.workerId, idempotencyKey },
      context.leaseToken,
    );
  }

  async complete(
    context: ArtifactBackedExecutionContext,
    receipt: ExecutionReceipt,
    idempotencyKey: string,
  ): Promise<void> {
    await this.jsonRequest(
      `/api/worker/v1/leases/${context.lease.id}/complete`,
      { workerId: this.workerId, receipt, idempotencyKey },
      context.leaseToken,
    );
  }

  async fail(
    context: ArtifactBackedExecutionContext,
    failure: { code: string; message: string; retryable: boolean },
    idempotencyKey: string,
  ): Promise<void> {
    await this.jsonRequest(
      `/api/worker/v1/leases/${context.lease.id}/fail`,
      { workerId: this.workerId, ...failure, idempotencyKey },
      context.leaseToken,
    );
  }
}
