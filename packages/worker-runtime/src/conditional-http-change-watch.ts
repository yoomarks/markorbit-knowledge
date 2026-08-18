import { AsyncLocalStorage } from "node:async_hooks";
import type {
  ArtifactBackedExecutionContext,
  CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { CollectionNotModifiedSignal } from "./artifact-backed-collection-executor";
import type { ApiTransport, ApiTransportRequest, ApiTransportResponse } from "./api-acquirer";

export type HttpValidatorCheckpoint = {
  etag: string | null;
  lastModified: string | null;
};

export interface HttpValidatorClient {
  read(
    context: ArtifactBackedExecutionContext,
    canonicalUri: string,
  ): Promise<HttpValidatorCheckpoint | null>;
  write(
    context: ArtifactBackedExecutionContext,
    canonicalUri: string,
    checkpoint: HttpValidatorCheckpoint,
  ): Promise<void>;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function canonicalRequestUri(request: ApiTransportRequest): string {
  const url = new URL(`https://${request.hostHeader}${request.path}`);
  url.hash = "";
  return url.toString();
}

function safeHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

function responseHeader(
  response: ApiTransportResponse,
  name: "etag" | "last-modified",
): string | null {
  const raw = response.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? safeHeaderValue(value) : null;
}

function isChangeWatch(context: ArtifactBackedExecutionContext): boolean {
  return context.job.planSnapshot.schedule?.mode === "CHANGE_WATCH";
}

export type ConditionalHttpChangeWatch = {
  transport: ApiTransport;
  wrap(acquirer: CollectionArtifactAcquirer): CollectionArtifactAcquirer;
};

export function createConditionalHttpChangeWatch(
  baseTransport: ApiTransport,
  validators: HttpValidatorClient,
): ConditionalHttpChangeWatch {
  const activeContext = new AsyncLocalStorage<ArtifactBackedExecutionContext>();

  const transport: ApiTransport = async (request) => {
    const context = activeContext.getStore();
    if (!context || !isChangeWatch(context)) return baseTransport(request);

    const canonicalUri = canonicalRequestUri(request);
    let checkpoint: HttpValidatorCheckpoint | null = null;
    try {
      checkpoint = await validators.read(context, canonicalUri);
    } catch {
      // Validator lookup is an optimization. Collection evidence must not depend on it.
    }

    const etag = safeHeaderValue(checkpoint?.etag ?? null);
    const lastModified = safeHeaderValue(checkpoint?.lastModified ?? null);
    const conditional = Boolean(etag || lastModified);
    const response = await baseTransport({
      ...request,
      headers: {
        ...request.headers,
        ...(etag ? { "if-none-match": etag } : {}),
        ...(lastModified ? { "if-modified-since": lastModified } : {}),
      },
    });

    if (response.statusCode === 304 && conditional) {
      try {
        await validators.write(context, canonicalUri, {
          etag: responseHeader(response, "etag") ?? etag,
          lastModified: responseHeader(response, "last-modified") ?? lastModified,
        });
      } catch {
        // The remote 304 is authoritative for this request. A checkpoint refresh
        // failure must not turn a no-change observation into acquisition failure.
      }
      throw new CollectionNotModifiedSignal(
        canonicalUri,
        "HTTP conditional request confirmed the remote representation is unchanged",
      );
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      const next = {
        etag: responseHeader(response, "etag"),
        lastModified: responseHeader(response, "last-modified"),
      };
      if (next.etag || next.lastModified || checkpoint) {
        try {
          await validators.write(context, canonicalUri, next);
        } catch {
          // Persisting or clearing validators is an optimization. Preserve acquired evidence.
        }
      }
    }
    return response;
  };

  return {
    transport,
    wrap(acquirer) {
      return {
        executor: acquirer.executor,
        acquire(context) {
          return activeContext.run(context, () => acquirer.acquire(context));
        },
      };
    },
  };
}

export class HttpValidatorControlPlaneClient implements HttpValidatorClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly workerId: string,
    private readonly credential: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Worker control-plane URL must use http or https");
    }
    this.baseUrl = url.toString().replace(/\/$/, "");
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
      body: JSON.stringify({ workerId: this.workerId, leaseId: context.lease.id, ...body }),
    });
    if (!response.ok) {
      throw new Error(`HTTP validator control-plane request failed (${response.status})`);
    }
    const payload = record(await response.json());
    if (!payload) throw new Error("HTTP validator control-plane response is invalid");
    return payload;
  }

  async read(
    context: ArtifactBackedExecutionContext,
    canonicalUri: string,
  ): Promise<HttpValidatorCheckpoint | null> {
    const payload = await this.request(context, { operation: "READ", canonicalUri });
    if (payload.checkpoint === null) return null;
    const checkpoint = record(payload.checkpoint);
    if (!checkpoint) throw new Error("HTTP validator checkpoint is invalid");
    return {
      etag: typeof checkpoint.etag === "string" ? checkpoint.etag : null,
      lastModified: typeof checkpoint.lastModified === "string" ? checkpoint.lastModified : null,
    };
  }

  async write(
    context: ArtifactBackedExecutionContext,
    canonicalUri: string,
    checkpoint: HttpValidatorCheckpoint,
  ): Promise<void> {
    if (!checkpoint.etag && !checkpoint.lastModified) {
      await this.request(context, { operation: "CLEAR", canonicalUri });
      return;
    }
    await this.request(context, {
      operation: "WRITE",
      canonicalUri,
      etag: checkpoint.etag,
      lastModified: checkpoint.lastModified,
      observedAt: new Date().toISOString(),
    });
  }
}
