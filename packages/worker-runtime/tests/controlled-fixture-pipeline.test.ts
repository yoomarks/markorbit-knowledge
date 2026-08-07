import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ConversionClaimRequest, ConversionClaimResult } from "@markorbit/contracts";
import {
  ControlledFixturePipeline,
  type ControlledFixturePipelineControlPlane,
} from "../src/controlled-fixture-pipeline";
import type {
  FixtureConversionRuntimeClient,
  FixtureRawArtifactReader,
  FixtureStagingUploader,
} from "../src/conversion-fixture";

const input = new TextEncoder().encode("Hello pipeline.\n");
const digest = createHash("sha256").update(input).digest("hex");
const ids = {
  workspace: "wsp_test",
  worker: "wrk_test",
  run: "cvr_test",
  attempt: "cva_test",
  lease: "cvl_test",
  document: "std_test",
};
const request = {
  contractVersion: "1.0",
  objectType: "CONVERSION_CLAIM_REQUEST",
  id: "ccr_test",
  workspaceId: ids.workspace,
  workerId: ids.worker,
  workerCredentialId: "wcd_test",
  capabilityRevision: 1,
  supportedConverters: [{ converterId: "builtin-text-markdown", versions: ["1.0.0"] }],
  maxAcceptedWork: 1,
  idempotencyKey: "claim-1",
  requestedLeaseDurationSeconds: 120,
} as ConversionClaimRequest;

function claim(result: "CLAIMED" | "NO_COMPATIBLE_WORK" = "CLAIMED"): ConversionClaimResult {
  const base = {
    contractVersion: "1.0",
    objectType: "CONVERSION_CLAIM_RESULT",
    id: "ccs_test",
    workspaceId: ids.workspace,
    workerId: ids.worker,
    result,
    idempotencyKey: "claim-1",
  } as ConversionClaimResult;
  if (result === "NO_COMPATIBLE_WORK") return base;
  return {
    ...base,
    lease: {
      contractVersion: "1.0",
      objectType: "CONVERSION_LEASE",
      id: ids.lease,
      workspaceId: ids.workspace,
      conversionRunId: ids.run,
      workerId: ids.worker,
      conversionAttemptId: ids.attempt,
      converter: { converterId: "builtin-text-markdown", version: "1.0.0" },
      generation: 1,
      tokenReference: "lease-ref",
      tokenDigest: "a".repeat(64),
      status: "ACTIVE",
      issuedAt: "2026-07-18T13:00:00Z",
      expiresAt: "2026-07-18T13:10:00Z",
      renewableUntil: "2026-07-18T13:20:00Z",
    },
    executionSummary: {
      conversionRunId: ids.run,
      rawArtifactId: "art_test",
      artifactKind: "TEXT",
      mimeType: "text/plain",
      sha256: digest,
      sizeBytes: input.byteLength,
      requestedOutputFormat: "MARKDOWN",
      targetPathTemplate: "00_Inbox/{artifactId}.md",
    },
    converter: { converterId: "builtin-text-markdown", version: "1.0.0" },
    rawArtifactReadGrant: {
      contractVersion: "1.0",
      objectType: "RAW_ARTIFACT_READ_GRANT",
      id: "crg_test",
      workspaceId: ids.workspace,
      rawArtifactId: "art_test",
      conversionRunId: ids.run,
      conversionAttemptId: ids.attempt,
      workerId: ids.worker,
      expectedSha256: digest,
      expectedBytes: input.byteLength,
      expectedMime: "text/plain",
      accessRef: "raw-ref",
      issuedAt: "2026-07-18T13:00:00Z",
      expiresAt: "2026-07-18T13:10:00Z",
      maximumReads: 1,
      readsUsed: 0,
      usagePolicy: "CONVERSION_INPUT_ONLY",
      tokenReference: "read-ref",
      tokenDigest: "b".repeat(64),
    },
    stagingOutputUploadGrant: {
      contractVersion: "1.0",
      objectType: "STAGING_OUTPUT_UPLOAD_GRANT",
      id: "cug_test",
      workspaceId: ids.workspace,
      conversionRunId: ids.run,
      conversionAttemptId: ids.attempt,
      workerId: ids.worker,
      normalizedTargetPath: "00_Inbox/art_test.md",
      allowedMediaType: "text/markdown",
      maximumBytes: 100000,
      requiredDigestAlgorithm: "SHA-256",
      uploadSessionRef: "upload-ref",
      issuedAt: "2026-07-18T13:00:00Z",
      expiresAt: "2026-07-18T13:10:00Z",
      tokenReference: "upload-ref",
      tokenDigest: "c".repeat(64),
      allowedContentCount: 1,
      expectedProvenancePolicy: "CONVERSION_ATTEMPT_BOUND",
    },
  };
}

function environment(result = claim(), outcome: "PASS" | "FAIL" = "PASS") {
  const events: string[] = [];
  const controlPlane = {
    claim: vi.fn(async () => ({ result, replayed: false })),
    sourceIdForRun: vi.fn(async () => "src_test"),
    ingestGenerated: vi.fn(async ({ idempotencyKey }) => {
      events.push(idempotencyKey);
      return { stagingDocumentId: ids.document, status: "GENERATED" as const, replayed: false };
    }),
    verifyGenerated: vi.fn(async ({ idempotencyKey }) => {
      events.push(idempotencyKey);
      return {
        stagingDocumentId: ids.document,
        status: outcome === "PASS" ? ("READY" as const) : ("BLOCKED" as const),
        outcome,
        replayed: false,
      };
    }),
    finalizeVerified: vi.fn(async ({ idempotencyKey }) => {
      events.push(idempotencyKey);
      return {
        conversionRunId: ids.run,
        decision: outcome === "PASS" ? ("COMPLETED" as const) : ("FAILED" as const),
        replayed: false,
      };
    }),
  } satisfies ControlledFixturePipelineControlPlane;
  const reader: FixtureRawArtifactReader = { read: vi.fn(async () => input) };
  const uploader: FixtureStagingUploader = {
    upload: vi.fn(async (grant, markdown) => ({
      uploadGrantId: grant.id,
      targetPath: grant.normalizedTargetPath,
      sha256: createHash("sha256").update(markdown).digest("hex"),
      sizeBytes: markdown.byteLength,
      mediaType: "text/markdown" as const,
    })),
  };
  const runtime: FixtureConversionRuntimeClient = {
    started: vi.fn(async () => undefined),
    progress: vi.fn(async () => undefined),
    outputReady: vi.fn(async () => undefined),
    failed: vi.fn(async () => undefined),
  };
  return {
    pipeline: new ControlledFixturePipeline(controlPlane, reader, uploader, runtime),
    controlPlane,
    runtime,
    events,
  };
}

describe("ControlledFixturePipeline", () => {
  it("returns no work without starting runtime phases", async () => {
    const env = environment(claim("NO_COMPATIBLE_WORK"));
    expect(
      (await env.pipeline.execute({ claimRequest: request, executionKey: "pipe-1" })).status,
    ).toBe("NO_COMPATIBLE_WORK");
    expect(env.runtime.started).not.toHaveBeenCalled();
  });

  it("completes through deterministic ingest, verify and finalize keys", async () => {
    const env = environment();
    const result = await env.pipeline.execute({ claimRequest: request, executionKey: "pipe-2" });
    expect(result.status).toBe("COMPLETED");
    expect(env.events).toEqual(["pipe-2:ingest", "pipe-2:verify", "pipe-2:finalize"]);
    expect(env.runtime.outputReady).toHaveBeenCalledOnce();
  });

  it("maps BLOCKED verification to failed finalization", async () => {
    const result = await environment(claim(), "FAIL").pipeline.execute({
      claimRequest: request,
      executionKey: "pipe-3",
    });
    expect(result.status).toBe("FAILED");
    if (result.status !== "FAILED") throw new Error("Expected terminal pipeline result");
    expect(result.verificationOutcome).toBe("FAIL");
  });

  it("stops after one worker failure and never auto-retries", async () => {
    const broken = claim();
    broken.rawArtifactReadGrant = {
      ...broken.rawArtifactReadGrant!,
      expectedSha256: "d".repeat(64),
    };
    const env = environment(broken);
    expect(
      (await env.pipeline.execute({ claimRequest: request, executionKey: "pipe-4" })).status,
    ).toBe("WORKER_FAILED");
    expect(env.runtime.failed).toHaveBeenCalledOnce();
    expect(env.controlPlane.ingestGenerated).not.toHaveBeenCalled();
  });

  it("rejects incomplete claims", async () => {
    const incomplete = claim();
    delete incomplete.stagingOutputUploadGrant;
    await expect(
      environment(incomplete).pipeline.execute({ claimRequest: request, executionKey: "pipe-5" }),
    ).rejects.toThrow("CONTROLLED_FIXTURE_CLAIM_INCOMPLETE");
  });
});
