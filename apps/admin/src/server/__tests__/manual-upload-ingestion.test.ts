import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import {
  artifactKindForManualUploadMime,
  deriveManualSourceName,
  ingestManualUpload,
  manualUploadMaxBytes,
  normalizeManualUploadFilename,
} from "../manual-upload-ingestion";
import {
  getCollectionPlanRepository,
  getExecutionLedgerRepository,
  getRawArtifactRepository,
  getSourceRepository,
} from "../source-registry";

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function* chunks(value: Uint8Array): AsyncIterable<Uint8Array> {
  yield value;
}

async function* delayedChunks(value: Uint8Array): AsyncIterable<Uint8Array> {
  await new Promise((resolve) => setTimeout(resolve, 5));
  yield value;
}

async function* maliciousOversizeChunks(): AsyncIterable<Uint8Array> {
  yield Buffer.alloc(700 * 1024, 1);
  yield Buffer.alloc(400 * 1024, 2);
}

const tempRoot = mkdtempSync(join(tmpdir(), "markorbit-manual-upload-"));

beforeAll(() => {
  process.env.MARKORBIT_KNOWLEDGE_DB_PATH = join(tempRoot, "knowledge.sqlite");
  process.env.MARKORBIT_ARTIFACT_STORE_PATH = join(tempRoot, "artifacts");
  process.env.MARKORBIT_STAGING_STORE_PATH = join(tempRoot, "staging");
  process.env.MARKORBIT_ARTIFACT_MAX_BYTES = String(1024 * 1024);
  process.env.MARKORBIT_MANUAL_UPLOAD_MAX_BYTES = String(1024 * 1024);
});

afterAll(() => {
  delete process.env.MARKORBIT_KNOWLEDGE_DB_PATH;
  delete process.env.MARKORBIT_ARTIFACT_STORE_PATH;
  delete process.env.MARKORBIT_STAGING_STORE_PATH;
  delete process.env.MARKORBIT_ARTIFACT_MAX_BYTES;
  delete process.env.MARKORBIT_MANUAL_UPLOAD_MAX_BYTES;
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("Manual Upload policy", () => {
  it("accepts converter-backed media and maps it to the canonical ArtifactKind", () => {
    expect(artifactKindForManualUploadMime("application/pdf")).toBe("PDF");
    expect(artifactKindForManualUploadMime("text/plain")).toBe("TEXT");
    expect(artifactKindForManualUploadMime("image/png")).toBe("IMAGE");
    expect(() => artifactKindForManualUploadMime("application/x-msdownload")).toThrow(
      RegistryValidationError,
    );
  });

  it("rejects path-like, control-character, and empty filenames", () => {
    expect(normalizeManualUploadFilename("evidence.pdf")).toBe("evidence.pdf");
    expect(() => normalizeManualUploadFilename("../evidence.pdf")).toThrow(RegistryValidationError);
    expect(() => normalizeManualUploadFilename("folder\\evidence.pdf")).toThrow(
      RegistryValidationError,
    );
    expect(() => normalizeManualUploadFilename("bad\u0000name.pdf")).toThrow(
      RegistryValidationError,
    );
    expect(() => normalizeManualUploadFilename("  ")).toThrow(RegistryValidationError);
  });

  it("derives a human source title instead of exposing the filename extension", () => {
    expect(deriveManualSourceName("cn410zh_1-中国商标法.pdf")).toBe("cn410zh 1 中国商标法");
    expect(deriveManualSourceName("Trademark Act.docx")).toBe("Trademark Act");
  });

  it("keeps the Manual Upload byte limit independently bounded", () => {
    expect(manualUploadMaxBytes()).toBe(1024 * 1024);
  });
});

describe("governed Manual Upload ingestion", () => {
  it("creates a real per-material Source, default plan and immutable RawArtifact", async () => {
    const body = Buffer.from("hello manual upload", "utf8");
    const result = await ingestManualUpload({
      workspaceId: DEFAULT_WORKSPACE.id,
      originalName: "evidence.txt",
      sourceName: "Trademark Evidence Note",
      jurisdictions: ["us"],
      languages: ["en-US"],
      mimeType: "text/plain",
      expectedSizeBytes: body.byteLength,
      expectedSha256: sha256(body),
      idempotencyKey: "manual-upload-success-1",
      chunks: chunks(body),
    });

    expect(result.replayed).toBe(false);
    expect(result.sourceName).toBe("Trademark Evidence Note");
    expect(result.artifact.workspaceId).toBe(DEFAULT_WORKSPACE.id);
    expect(result.artifact.artifactKind).toBe("TEXT");
    expect(result.artifact.mimeType).toBe("text/plain");
    expect(result.artifact.originalName).toBe("evidence.txt");
    expect(result.artifact.binaryHash.value).toBe(sha256(body));
    expect(result.artifact.provenance.sourceUri).toContain(`/${result.sourceId}/`);

    const source = getSourceRepository().getById(result.sourceId);
    expect(source?.name).toBe("Trademark Evidence Note");
    expect(source?.sourceType).toBe("MANUAL_UPLOAD");
    expect(source?.category).toBe("USER_PROVIDED");
    expect(source?.jurisdictions).toEqual(["US"]);
    expect(source?.languages).toEqual(["en-US"]);
    expect(source?.slug).not.toBe("manual-uploads");
    expect(source?.extensions?.["x-markorbit-ingress"]).toBe("manual-file");
    expect(source?.defaultCollectionPlanId).toBeTruthy();
    expect(getCollectionPlanRepository().listForSource(result.sourceId)).toHaveLength(1);

    const run = getExecutionLedgerRepository().getById(result.runId);
    expect(run?.run.status).toBe("COMPLETED");
    expect(run?.jobs).toHaveLength(1);
    expect(run?.jobs[0]?.jobType).toBe("LOCAL_FILE_SCAN");
    expect(run?.jobs[0]?.status).toBe("COMPLETED");

    const stored = getRawArtifactRepository().contentPath(result.artifact.id);
    expect(readFileSync(stored.path, "utf8")).toBe(body.toString("utf8"));
  });

  it("creates different Sources for independent uploaded materials", async () => {
    const firstBody = Buffer.from("first source", "utf8");
    const secondBody = Buffer.from("second source", "utf8");
    const first = await ingestManualUpload({
      workspaceId: DEFAULT_WORKSPACE.id,
      originalName: "first.txt",
      mimeType: "text/plain",
      expectedSizeBytes: firstBody.byteLength,
      expectedSha256: sha256(firstBody),
      idempotencyKey: "manual-source-one",
      chunks: chunks(firstBody),
    });
    const second = await ingestManualUpload({
      workspaceId: DEFAULT_WORKSPACE.id,
      originalName: "second.txt",
      mimeType: "text/plain",
      expectedSizeBytes: secondBody.byteLength,
      expectedSha256: sha256(secondBody),
      idempotencyKey: "manual-source-two",
      chunks: chunks(secondBody),
    });

    expect(first.sourceId).not.toBe(second.sourceId);
    expect(getSourceRepository().getById(first.sourceId)?.name).toBe("first");
    expect(getSourceRepository().getById(second.sourceId)?.name).toBe("second");
    expect(
      getSourceRepository()
        .list({ workspaceId: DEFAULT_WORKSPACE.id, sourceType: "MANUAL_UPLOAD", limit: 100 })
        .items.some((source) => source.slug === "manual-uploads"),
    ).toBe(false);
  });

  it("can add a later file revision to an existing compatible Manual Upload Source", async () => {
    const firstBody = Buffer.from("revision one", "utf8");
    const first = await ingestManualUpload({
      workspaceId: DEFAULT_WORKSPACE.id,
      originalName: "law-v1.txt",
      sourceName: "Trademark Law",
      mimeType: "text/plain",
      expectedSizeBytes: firstBody.byteLength,
      expectedSha256: sha256(firstBody),
      idempotencyKey: "manual-revision-one",
      chunks: chunks(firstBody),
    });
    const secondBody = Buffer.from("revision two", "utf8");
    const second = await ingestManualUpload({
      workspaceId: DEFAULT_WORKSPACE.id,
      sourceId: first.sourceId,
      originalName: "law-v2.txt",
      mimeType: "text/plain",
      expectedSizeBytes: secondBody.byteLength,
      expectedSha256: sha256(secondBody),
      idempotencyKey: "manual-revision-two",
      chunks: chunks(secondBody),
    });

    expect(second.sourceId).toBe(first.sourceId);
    expect(getCollectionPlanRepository().listForSource(first.sourceId)).toHaveLength(1);
  });

  it("stores an optional governed relationship to an existing Source", async () => {
    const parent = getSourceRepository().create({
      workspaceId: DEFAULT_WORKSPACE.id,
      name: "Official Office",
      slug: "manual-related-official-office",
      sourceType: "WEB",
      category: "OFFICIAL_AUTHORITY",
      authorityLevel: "PRIMARY_OFFICIAL",
      status: "ACTIVE",
      jurisdictions: ["CN"],
      languages: ["zh-CN"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      connectorConfig: {},
      entrypoints: [{ uri: "https://example.invalid/office" }],
      tags: [],
    });
    const body = Buffer.from("related publication", "utf8");
    const result = await ingestManualUpload({
      workspaceId: DEFAULT_WORKSPACE.id,
      originalName: "publication.txt",
      relatedSourceId: parent.id,
      mimeType: "text/plain",
      expectedSizeBytes: body.byteLength,
      expectedSha256: sha256(body),
      idempotencyKey: "manual-related-publication",
      chunks: chunks(body),
    });
    const source = getSourceRepository().getById(result.sourceId);
    expect(source?.extensions?.["x-markorbit-related-source-id"]).toBe(parent.id);
    expect(source?.extensions?.["x-markorbit-source-relationship"]).toBe("RELATED_PUBLICATION");
  });

  it("replays the same finalized upload without creating another Source or artifact", async () => {
    const body = Buffer.from("restart-safe evidence", "utf8");
    const input = {
      workspaceId: DEFAULT_WORKSPACE.id,
      originalName: "restart.txt",
      mimeType: "text/plain",
      expectedSizeBytes: body.byteLength,
      expectedSha256: sha256(body),
      idempotencyKey: "manual-upload-replay-1",
    };
    const first = await ingestManualUpload({ ...input, chunks: chunks(body) });
    const second = await ingestManualUpload({ ...input, chunks: chunks(body) });

    expect(second.replayed).toBe(true);
    expect(second.sourceId).toBe(first.sourceId);
    expect(second.artifact.id).toBe(first.artifact.id);
    expect(second.runId).toBe(first.runId);
    expect(
      getRawArtifactRepository().list({ workspaceId: DEFAULT_WORKSPACE.id, runId: first.runId })
        .total,
    ).toBe(1);
  });

  it("fails closed when an idempotency key is reused with different content", async () => {
    const firstBody = Buffer.from("first", "utf8");
    const secondBody = Buffer.from("second", "utf8");
    const idempotencyKey = "manual-upload-conflict-1";

    await ingestManualUpload({
      workspaceId: DEFAULT_WORKSPACE.id,
      originalName: "conflict.txt",
      mimeType: "text/plain",
      expectedSizeBytes: firstBody.byteLength,
      expectedSha256: sha256(firstBody),
      idempotencyKey,
      chunks: chunks(firstBody),
    });

    await expect(
      ingestManualUpload({
        workspaceId: DEFAULT_WORKSPACE.id,
        originalName: "conflict.txt",
        mimeType: "text/plain",
        expectedSizeBytes: secondBody.byteLength,
        expectedSha256: sha256(secondBody),
        idempotencyKey,
        chunks: chunks(secondBody),
      }),
    ).rejects.toMatchObject({
      code: "MANUAL_UPLOAD_IDEMPOTENCY_CONFLICT",
    });
  });

  it("rejects an upload larger than the Manual Upload policy before execution dispatch", async () => {
    const body = Buffer.alloc(1024 * 1024 + 1, 1);
    await expect(
      ingestManualUpload({
        workspaceId: DEFAULT_WORKSPACE.id,
        originalName: "oversize.txt",
        mimeType: "text/plain",
        expectedSizeBytes: body.byteLength,
        expectedSha256: sha256(body),
        idempotencyKey: "manual-upload-oversize-1",
        chunks: chunks(body),
      }),
    ).rejects.toBeInstanceOf(RegistryValidationError);
  });

  it("enforces the actual streamed byte limit even when declared metadata is smaller", async () => {
    const declared = Buffer.from("x", "utf8");
    await expect(
      ingestManualUpload({
        workspaceId: DEFAULT_WORKSPACE.id,
        originalName: "malicious-stream.txt",
        mimeType: "text/plain",
        expectedSizeBytes: declared.byteLength,
        expectedSha256: sha256(declared),
        idempotencyKey: "manual-upload-malicious-stream-1",
        chunks: maliciousOversizeChunks(),
      }),
    ).rejects.toBeInstanceOf(RegistryValidationError);
  });

  it("rejects a valid-looking Workspace ID that is not registered", async () => {
    const body = Buffer.from("isolated", "utf8");
    await expect(
      ingestManualUpload({
        workspaceId: "wsp_00000000000000000000000000",
        originalName: "isolated.txt",
        mimeType: "text/plain",
        expectedSizeBytes: body.byteLength,
        expectedSha256: sha256(body),
        idempotencyKey: "manual-upload-missing-workspace-1",
        chunks: chunks(body),
      }),
    ).rejects.toMatchObject({
      code: "WORKSPACE_NOT_FOUND",
    });
  });

  it("keeps simultaneous uploads bound to their own Source, Run and Job", async () => {
    const firstBody = Buffer.from("concurrent first", "utf8");
    const secondBody = Buffer.from("concurrent second", "utf8");

    const [first, second] = await Promise.all([
      ingestManualUpload({
        workspaceId: DEFAULT_WORKSPACE.id,
        originalName: "concurrent-first.txt",
        mimeType: "text/plain",
        expectedSizeBytes: firstBody.byteLength,
        expectedSha256: sha256(firstBody),
        idempotencyKey: "manual-upload-concurrent-first",
        chunks: delayedChunks(firstBody),
      }),
      ingestManualUpload({
        workspaceId: DEFAULT_WORKSPACE.id,
        originalName: "concurrent-second.txt",
        mimeType: "text/plain",
        expectedSizeBytes: secondBody.byteLength,
        expectedSha256: sha256(secondBody),
        idempotencyKey: "manual-upload-concurrent-second",
        chunks: delayedChunks(secondBody),
      }),
    ]);

    expect(first.sourceId).not.toBe(second.sourceId);
    expect(first.runId).not.toBe(second.runId);
    expect(first.artifact.collectionRunId).toBe(first.runId);
    expect(second.artifact.collectionRunId).toBe(second.runId);
    expect(first.artifact.originalName).toBe("concurrent-first.txt");
    expect(second.artifact.originalName).toBe("concurrent-second.txt");
    expect(getExecutionLedgerRepository().getById(first.runId)?.jobs[0]?.status).toBe("COMPLETED");
    expect(getExecutionLedgerRepository().getById(second.runId)?.jobs[0]?.status).toBe("COMPLETED");
  });
});
