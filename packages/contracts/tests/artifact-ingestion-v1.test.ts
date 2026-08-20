import { describe, expect, it } from "vitest";
import {
  isArtifactIngestionEvent,
  isArtifactIngestionReceipt,
  isArtifactIngestionSession,
  isArtifactUploadDescriptor,
  isArtifactVerificationResult,
  type ArtifactIngestionEvent,
  type ArtifactIngestionReceipt,
  type ArtifactIngestionSession,
  type ArtifactUploadDescriptor,
  type ArtifactVerificationResult,
} from "../src/artifact-ingestion-v1";

const descriptor: ArtifactUploadDescriptor = {
  artifactKind: "HTML",
  mimeType: "text/html",
  originalName: "page.html",
  expectedSizeBytes: 12,
  expectedSha256: "a".repeat(64),
  sourceUri: "https://example.com/page",
};

const session: ArtifactIngestionSession = {
  protocolVersion: "1.0",
  objectType: "ARTIFACT_INGESTION_SESSION",
  id: "ing_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  jobId: "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  jobAttempt: 1,
  executionAttemptId: "exa_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  leaseId: "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  workerId: "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  connector: { connectorId: "fixture-web", version: "1.0.0" },
  descriptor,
  status: "CREATED",
  idempotencyKey: "artifact-1",
  createdAt: "2026-07-16T19:00:00Z",
  updatedAt: "2026-07-16T19:00:00Z",
};

const verification: ArtifactVerificationResult = {
  protocolVersion: "1.0",
  objectType: "ARTIFACT_VERIFICATION_RESULT",
  sessionId: session.id,
  status: "MATCHED",
  observedSizeBytes: 12,
  observedSha256: "a".repeat(64),
  verifiedAt: "2026-07-16T19:00:01Z",
};

const receipt: ArtifactIngestionReceipt = {
  protocolVersion: "1.0",
  objectType: "ARTIFACT_INGESTION_RECEIPT",
  id: "air_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  sessionId: session.id,
  artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  executionAttemptId: session.executionAttemptId,
  contentSha256: "a".repeat(64),
  sizeBytes: 12,
  artifactKind: "HTML",
  finalizedAt: "2026-07-16T19:00:02Z",
};

const event: ArtifactIngestionEvent = {
  protocolVersion: "1.0",
  objectType: "ARTIFACT_INGESTION_EVENT",
  id: "aev_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  sessionId: session.id,
  sequence: 1,
  eventType: "SESSION_CREATED",
  recordedAt: "2026-07-16T19:00:00Z",
};

describe("Artifact Ingestion Protocol v1", () => {
  it("accepts strict transport and evidence objects", () => {
    expect(isArtifactUploadDescriptor(descriptor)).toBe(true);
    expect(isArtifactIngestionSession(session)).toBe(true);
    expect(isArtifactVerificationResult(verification)).toBe(true);
    expect(isArtifactIngestionReceipt(receipt)).toBe(true);
    expect(isArtifactIngestionEvent(event)).toBe(true);
  });

  it("accepts unique parent artifact lineage hints", () => {
    expect(
      isArtifactUploadDescriptor({
        ...descriptor,
        parentArtifactIds: [
          "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        ],
      }),
    ).toBe(true);
  });

  it("rejects duplicate parent artifact lineage hints", () => {
    const parentId = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    expect(
      isArtifactUploadDescriptor({
        ...descriptor,
        parentArtifactIds: [parentId, parentId],
      }),
    ).toBe(false);
  });

  it("rejects unknown fields, embedded content and malformed identities", () => {
    expect(isArtifactUploadDescriptor({ ...descriptor, bytes: "base64" })).toBe(false);
    expect(isArtifactIngestionSession({ ...session, temporaryPath: "/tmp/file" })).toBe(false);
    expect(isArtifactVerificationResult({ ...verification, observedSha256: "bad" })).toBe(false);
    expect(isArtifactIngestionReceipt({ ...receipt, artifactId: "artifact-1" })).toBe(false);
    expect(isArtifactIngestionEvent({ ...event, command: "cat /etc/passwd" })).toBe(false);
  });

  it("requires terminal timestamps and structured rejection evidence", () => {
    expect(
      isArtifactIngestionSession({ ...session, status: "FINALIZED", finalizedAt: undefined }),
    ).toBe(false);
    expect(
      isArtifactVerificationResult({
        ...verification,
        status: "DIGEST_MISMATCH",
        failureCode: undefined,
      }),
    ).toBe(false);
    expect(
      isArtifactIngestionEvent({ ...event, eventType: "UPLOAD_REJECTED", failure: undefined }),
    ).toBe(false);
  });
});
