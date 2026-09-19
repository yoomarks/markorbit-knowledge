import { createHash } from "node:crypto";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
} from "./artifact-backed-collection-executor";
import type { CnipaGazetteDurableArtifactReader } from "./cnipa-gazette-fact-admission-job-acquirer";

const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Worker control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/u, "");
}

function decodedHeader(response: Response, name: string): string {
  const value = response.headers.get(name)?.trim();
  if (!value) {
    throw new CollectionAcquisitionError(
      "KNOWLEDGE_ARTIFACT_READ_RESPONSE_INVALID",
      `Durable artifact response is missing ${name}`,
      false,
    );
  }
  try {
    return decodeURIComponent(value);
  } catch {
    throw new CollectionAcquisitionError(
      "KNOWLEDGE_ARTIFACT_READ_RESPONSE_INVALID",
      `Durable artifact response contains invalid ${name}`,
      false,
    );
  }
}

export class HttpCnipaGazetteDurableArtifactReader implements CnipaGazetteDurableArtifactReader {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly workerId: string,
    private readonly credential: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = normalizedBaseUrl(baseUrl);
    if (!workerId.trim()) throw new Error("workerId is required");
    if (!credential.trim()) throw new Error("worker credential is required");
  }

  async read(
    artifactId: string,
    context: ArtifactBackedExecutionContext,
  ): Promise<AcquiredCollectionArtifact> {
    if (!ARTIFACT_ID.test(artifactId)) {
      throw new CollectionAcquisitionError(
        "KNOWLEDGE_ARTIFACT_READ_REFERENCE_INVALID",
        "Durable artifact read requires a RawArtifact id",
        false,
      );
    }
    if (context.workerId !== this.workerId || !context.leaseToken) {
      throw new CollectionAcquisitionError(
        "KNOWLEDGE_ARTIFACT_READ_AUTHORITY_INVALID",
        "Durable artifact reader must run under its configured Worker and active lease token",
        false,
      );
    }

    let response: Response;
    try {
      response = await this.fetcher(
        `${this.baseUrl}/api/worker/v1/cnipa-gazette/artifacts/${encodeURIComponent(artifactId)}/content`,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${this.credential}`,
            "x-worker-id": this.workerId,
            "x-lease-id": context.lease.id,
            "x-lease-token": context.leaseToken,
          },
        },
      );
    } catch (error) {
      throw new CollectionAcquisitionError(
        "KNOWLEDGE_ARTIFACT_READ_TRANSPORT_FAILED",
        error instanceof Error ? error.message : "Durable artifact read transport failed",
        true,
      );
    }
    if (!response.ok) {
      throw new CollectionAcquisitionError(
        "KNOWLEDGE_ARTIFACT_READ_HTTP_ERROR",
        `Durable artifact read failed with HTTP ${response.status}`,
        RETRYABLE_STATUSES.has(response.status),
      );
    }

    const artifactKind = response.headers.get("x-markorbit-artifact-kind")?.trim();
    if (artifactKind !== "JSON") {
      throw new CollectionAcquisitionError(
        "KNOWLEDGE_ARTIFACT_READ_RESPONSE_INVALID",
        "Gazette durable artifact must be JSON",
        false,
      );
    }
    const mimeType = response.headers.get("x-markorbit-original-mime")?.trim();
    if (!mimeType) {
      throw new CollectionAcquisitionError(
        "KNOWLEDGE_ARTIFACT_READ_RESPONSE_INVALID",
        "Durable artifact response is missing original MIME type",
        false,
      );
    }
    const canonicalUri = decodedHeader(response, "x-markorbit-canonical-uri");
    const originalName = decodedHeader(response, "x-markorbit-original-name");
    const expectedSha = response.headers.get("x-markorbit-content-sha256")?.trim().toLowerCase();
    if (!expectedSha || !SHA256.test(expectedSha)) {
      throw new CollectionAcquisitionError(
        "KNOWLEDGE_ARTIFACT_READ_RESPONSE_INVALID",
        "Durable artifact response is missing a valid SHA-256",
        false,
      );
    }
    const expectedLength = Number(response.headers.get("content-length"));
    if (!Number.isSafeInteger(expectedLength) || expectedLength < 1) {
      throw new CollectionAcquisitionError(
        "KNOWLEDGE_ARTIFACT_READ_RESPONSE_INVALID",
        "Durable artifact response is missing a valid content length",
        false,
      );
    }

    const content = new Uint8Array(await response.arrayBuffer());
    const observedSha = createHash("sha256").update(content).digest("hex");
    if (content.byteLength !== expectedLength || observedSha !== expectedSha) {
      throw new CollectionAcquisitionError(
        "KNOWLEDGE_ARTIFACT_READ_INTEGRITY_FAILED",
        "Durable artifact bytes do not match control-plane integrity metadata",
        false,
      );
    }
    return {
      artifactKind: "JSON",
      mimeType,
      originalName,
      sourceUri: `markorbit://raw-artifact/${artifactId}`,
      canonicalUri,
      content,
    };
  }
}

export function httpCnipaGazetteDurableArtifactReaderDescriptor() {
  return Object.freeze({
    endpointScope: "/api/worker/v1/cnipa-gazette/artifacts/:id/content" as const,
    workerCredentialRequired: true as const,
    activeLeaseRequired: true as const,
    jobSnapshotArtifactAuthorizationRequired: true as const,
    workspaceBoundaryRequired: true as const,
    responseSha256Verified: true as const,
  });
}
