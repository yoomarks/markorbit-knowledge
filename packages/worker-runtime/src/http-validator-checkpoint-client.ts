import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";

export type HttpValidatorCheckpointRecord = {
  workspaceId: string;
  sourceId: string;
  canonicalUri: string;
  etag: string | null;
  lastModified: string | null;
  observedAt: string;
  updatedAt: string;
};

export interface HttpValidatorCheckpointPort {
  read(
    context: ArtifactBackedExecutionContext,
    canonicalUri: string,
  ): Promise<HttpValidatorCheckpointRecord | null>;
  write(
    context: ArtifactBackedExecutionContext,
    input: {
      canonicalUri: string;
      etag: string | null;
      lastModified: string | null;
      observedAt?: string;
    },
  ): Promise<void>;
  clear(context: ArtifactBackedExecutionContext, canonicalUri: string): Promise<void>;
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

function checkpoint(value: unknown): HttpValidatorCheckpointRecord | null {
  if (value === null) return null;
  const item = record(value);
  if (
    !item ||
    typeof item.workspaceId !== "string" ||
    typeof item.sourceId !== "string" ||
    typeof item.canonicalUri !== "string" ||
    (item.etag !== null && typeof item.etag !== "string") ||
    (item.lastModified !== null && typeof item.lastModified !== "string") ||
    typeof item.observedAt !== "string" ||
    typeof item.updatedAt !== "string"
  ) {
    throw new Error("HTTP validator checkpoint response is invalid");
  }
  return {
    workspaceId: item.workspaceId,
    sourceId: item.sourceId,
    canonicalUri: item.canonicalUri,
    etag: item.etag,
    lastModified: item.lastModified,
    observedAt: item.observedAt,
    updatedAt: item.updatedAt,
  };
}

export class HttpValidatorCheckpointClient implements HttpValidatorCheckpointPort {
  private readonly baseUrl: string;
  private readonly workerId: string;

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

  private async request(
    context: ArtifactBackedExecutionContext,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`${this.baseUrl}/api/worker/v1/http-validators`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.credential}`,
        "x-lease-token": context.leaseToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workerId: this.workerId,
        leaseId: context.lease.id,
        ...body,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP validator checkpoint request failed (${response.status})`);
    }
    const payload = record(await response.json());
    if (!payload) throw new Error("HTTP validator checkpoint response must be an object");
    return payload;
  }

  async read(
    context: ArtifactBackedExecutionContext,
    canonicalUri: string,
  ): Promise<HttpValidatorCheckpointRecord | null> {
    const payload = await this.request(context, { operation: "READ", canonicalUri });
    return checkpoint(payload.checkpoint);
  }

  async write(
    context: ArtifactBackedExecutionContext,
    input: {
      canonicalUri: string;
      etag: string | null;
      lastModified: string | null;
      observedAt?: string;
    },
  ): Promise<void> {
    await this.request(context, {
      operation: "WRITE",
      canonicalUri: input.canonicalUri,
      etag: input.etag,
      lastModified: input.lastModified,
      ...(input.observedAt ? { observedAt: input.observedAt } : {}),
    });
  }

  async clear(context: ArtifactBackedExecutionContext, canonicalUri: string): Promise<void> {
    await this.request(context, { operation: "CLEAR", canonicalUri });
  }
}
