import { AsyncLocalStorage } from "node:async_hooks";
import {
  defaultApiTransport,
  type ApiTransport,
  type ApiTransportRequest,
  type ApiTransportResponse,
} from "./api-acquirer";
import {
  CollectionNotModifiedError,
  type ArtifactBackedExecutionContext,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import type {
  HttpValidatorCheckpointPort,
  HttpValidatorCheckpointRecord,
} from "./http-validator-checkpoint-client";

function firstHeader(
  headers: ApiTransportResponse["headers"],
  name: string,
): string | null {
  const raw = headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function canonicalUriFor(input: ApiTransportRequest): string {
  const url = new URL(`https://${input.hostHeader}${input.path}`);
  url.hash = "";
  return url.toString();
}

function conditionalHeaders(checkpoint: HttpValidatorCheckpointRecord | null): Record<string, string> {
  if (!checkpoint) return {};
  return {
    ...(checkpoint.etag ? { "if-none-match": checkpoint.etag } : {}),
    ...(checkpoint.lastModified ? { "if-modified-since": checkpoint.lastModified } : {}),
  };
}

function hasValidator(checkpoint: HttpValidatorCheckpointRecord | null): boolean {
  return Boolean(checkpoint?.etag || checkpoint?.lastModified);
}

/**
 * Adds durable, lease-scoped conditional HTTP requests without coupling RSS/API
 * parsing code to control-plane persistence.
 *
 * Checkpoint access is deliberately best-effort: it is an acquisition optimization,
 * never an evidence gate. A checkpoint read/write/clear failure falls back to the
 * existing body acquisition behavior or preserves already-acquired evidence.
 */
export class HttpConditionalTransportCoordinator {
  private readonly contextStorage = new AsyncLocalStorage<ArtifactBackedExecutionContext>();
  private readonly delegate: ApiTransport;

  constructor(
    private readonly checkpoints: HttpValidatorCheckpointPort,
    delegate: ApiTransport = defaultApiTransport,
  ) {
    this.delegate = delegate;
  }

  readonly transport: ApiTransport = async (input) => {
    const context = this.contextStorage.getStore();
    if (!context) return this.delegate(input);

    const canonicalUri = canonicalUriFor(input);
    let stored: HttpValidatorCheckpointRecord | null = null;
    try {
      stored = await this.checkpoints.read(context, canonicalUri);
    } catch {
      // Checkpoint lookup is an optimization. Preserve unconditional acquisition.
    }

    const validators = conditionalHeaders(stored);
    const conditional = hasValidator(stored);
    const response = await this.delegate({
      ...input,
      headers: { ...input.headers, ...validators },
    });

    const responseEtag = firstHeader(response.headers, "etag");
    const responseLastModified = firstHeader(response.headers, "last-modified");

    if (response.statusCode === 304 && conditional) {
      try {
        await this.checkpoints.write(context, {
          canonicalUri,
          etag: responseEtag ?? stored!.etag,
          lastModified: responseLastModified ?? stored!.lastModified,
          observedAt: new Date().toISOString(),
        });
      } catch {
        // The 304 itself is authoritative for this request. Checkpoint refresh failure
        // must not turn a successful no-change observation into acquisition failure.
      }
      throw new CollectionNotModifiedError(
        canonicalUri,
        context.job.planSnapshot.output.artifactKinds,
      );
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      try {
        if (responseEtag || responseLastModified) {
          await this.checkpoints.write(context, {
            canonicalUri,
            etag: responseEtag,
            lastModified: responseLastModified,
            observedAt: new Date().toISOString(),
          });
        } else if (stored) {
          await this.checkpoints.clear(context, canonicalUri);
        }
      } catch {
        // Artifact evidence is primary. Validator persistence never invalidates a
        // successful external acquisition.
      }
    }

    return response;
  };

  wrap(acquirer: CollectionArtifactAcquirer): CollectionArtifactAcquirer {
    return {
      executor: acquirer.executor,
      acquire: (context) => this.contextStorage.run(context, () => acquirer.acquire(context)),
    };
  }
}
