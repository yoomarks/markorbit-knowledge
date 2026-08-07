import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { RawArtifactReadGrant, StagingOutputUploadGrant } from "@markorbit/contracts";
import {
  LocalRawArtifactMemoryReader,
  LocalSingleOutputUploader,
  PersistenceControlledFixtureControlPlane,
} from "../src/local-pipeline-adapter";

const content = new TextEncoder().encode("local pipeline adapter\n");
const digest = createHash("sha256").update(content).digest("hex");

const readGrant = {
  rawArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  expectedBytes: content.byteLength,
  expectedSha256: digest,
} as RawArtifactReadGrant;

const uploadGrant = {
  id: "cug_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  normalizedTargetPath: "00_Inbox/local.md",
  maximumBytes: 100_000,
} as StagingOutputUploadGrant;

describe("local pipeline I/O", () => {
  it("reads only bytes bound to the grant evidence", async () => {
    const reader = new LocalRawArtifactMemoryReader();
    reader.register(readGrant.rawArtifactId, content);
    expect(await reader.read(readGrant)).toEqual(content);
    await expect(reader.read({ ...readGrant, expectedSha256: "a".repeat(64) })).rejects.toThrow(
      "LOCAL_RAW_ARTIFACT_DIGEST_MISMATCH",
    );
  });

  it("accepts one immutable output per upload grant", async () => {
    const uploader = new LocalSingleOutputUploader();
    const evidence = await uploader.upload(uploadGrant, content);
    expect(evidence).toMatchObject({
      uploadGrantId: uploadGrant.id,
      targetPath: uploadGrant.normalizedTargetPath,
      sha256: digest,
      sizeBytes: content.byteLength,
      mediaType: "text/markdown",
    });
    expect(uploader.get(uploadGrant.id)).toEqual(content);
    await expect(uploader.upload(uploadGrant, content)).rejects.toThrow(
      "LOCAL_OUTPUT_GRANT_ALREADY_USED",
    );
  });
});

describe("PersistenceControlledFixtureControlPlane", () => {
  it("delegates each phase to the existing repositories", async () => {
    const claims = {
      claim: vi.fn(() => ({ result: { result: "NO_COMPATIBLE_WORK" }, replayed: true })),
    };
    const runs = { getById: vi.fn(() => ({ run: { sourceId: "src_01" } })) };
    const staging = {
      ingestGenerated: vi.fn(() => ({
        record: { descriptor: { id: "std_01", status: "GENERATED" } },
        replayed: false,
      })),
    };
    const verifications = {
      verifyGenerated: vi.fn(() => ({
        record: { descriptor: { id: "std_01", status: "READY" } },
        evidence: { outcome: "PASS" },
        replayed: true,
      })),
    };
    const finalizer = {
      finalize: vi.fn(() => ({
        decision: "COMPLETED",
        transition: { run: { id: "cvr_01" }, replayed: false },
      })),
    };

    const adapter = new PersistenceControlledFixtureControlPlane(
      claims as never,
      runs as never,
      staging as never,
      verifications as never,
      finalizer as never,
    );

    expect(await adapter.sourceIdForRun("wsp_01", "cvr_01")).toBe("src_01");
    expect(
      await adapter.verifyGenerated({
        workspaceId: "wsp_01",
        stagingDocumentId: "std_01",
        idempotencyKey: "verify-1",
      }),
    ).toEqual({
      stagingDocumentId: "std_01",
      status: "READY",
      outcome: "PASS",
      replayed: true,
    });
    expect(
      await adapter.finalizeVerified({
        workspaceId: "wsp_01",
        stagingDocumentId: "std_01",
        idempotencyKey: "finish-1",
      }),
    ).toEqual({ conversionRunId: "cvr_01", decision: "COMPLETED", replayed: false });
  });

  it("rejects missing ConversionRun source binding", async () => {
    const adapter = new PersistenceControlledFixtureControlPlane(
      { claim: vi.fn() } as never,
      { getById: vi.fn(() => null) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(adapter.sourceIdForRun("wsp_01", "cvr_missing")).rejects.toThrow(
      "LOCAL_PIPELINE_CONVERSION_RUN_NOT_FOUND",
    );
  });
});
