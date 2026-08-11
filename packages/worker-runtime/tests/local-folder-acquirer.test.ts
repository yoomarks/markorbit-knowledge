import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Job } from "@markorbit/contracts";
import {
  LocalFolderArtifactAcquirer,
  normalizeLocalFolderRelativePath,
  parseLocalFolderRoots,
} from "../src/local-folder-acquirer";
import type { ArtifactBackedExecutionContext } from "../src/artifact-backed-collection-executor";

const tempRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "markorbit-local-folder-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function context(
  connectorConfig: Record<string, unknown> = {
    rootId: "legal",
    relativePath: "",
    recursive: true,
    includeHidden: false,
  },
): ArtifactBackedExecutionContext {
  const job = {
    jobType: "LOCAL_FILE_SCAN",
    connector: { connectorId: "local-folder", version: "1.0.0" },
    sourceSnapshot: {
      sourceType: "LOCAL_FOLDER",
      connectorConfig,
    },
    planSnapshot: {
      policy: {
        includePatterns: [],
        excludePatterns: [],
        maxDepth: 4,
        maxItems: 20,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: false,
        rateLimitPerMinute: 60,
        timeoutSeconds: 60,
        retry: { maxAttempts: 1, backoffSeconds: 0 },
      },
      output: {
        artifactKinds: [
          "MARKDOWN",
          "HTML",
          "PDF",
          "DOCX",
          "XLSX",
          "CSV",
          "JSON",
          "XML",
          "EMAIL",
          "TEXT",
          "IMAGE",
        ],
      },
    },
  } as unknown as Job;
  return { job } as ArtifactBackedExecutionContext;
}

describe("LocalFolderArtifactAcquirer", () => {
  it("reads a deterministic governed snapshot without leaking the absolute root", async () => {
    const root = await tempRoot();
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "z.txt"), "zeta");
    await writeFile(join(root, "nested", "a.md"), "# alpha");
    await writeFile(join(root, ".secret.txt"), "hidden");

    const acquirer = new LocalFolderArtifactAcquirer({ roots: { legal: root } });
    const artifacts = await acquirer.acquire(context());

    expect(artifacts.map((artifact) => artifact.canonicalUri)).toEqual([
      "local-folder://legal/nested/a.md",
      "local-folder://legal/z.txt",
    ]);
    expect(artifacts.map((artifact) => artifact.originalName)).toEqual(["a.md", "z.txt"]);
    expect(artifacts.every((artifact) => !artifact.sourceUri.includes(root))).toBe(true);
    expect(artifacts[0]?.sourceUri).toMatch(/sha256=[a-f0-9]{64}/);
    expect(artifacts[0]?.sourceUri).toMatch(/snapshot=[a-f0-9]{64}/);
  });

  it("keeps canonical identity stable while content snapshot evidence changes", async () => {
    const root = await tempRoot();
    const path = join(root, "evidence.txt");
    await writeFile(path, "version one");
    const acquirer = new LocalFolderArtifactAcquirer({ roots: { legal: root } });

    const first = (await acquirer.acquire(context()))[0]!;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await writeFile(path, "version two with changed bytes");
    const second = (await acquirer.acquire(context()))[0]!;

    expect(second.canonicalUri).toBe(first.canonicalUri);
    expect(second.sourceUri).not.toBe(first.sourceUri);
    expect(new TextDecoder().decode(second.content)).toContain("version two");
  });

  it("honors include and exclude patterns and the plan item boundary", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "keep.txt"), "keep");
    await writeFile(join(root, "skip.txt"), "skip");
    await writeFile(join(root, "ignore.json"), "{}");
    const ctx = context();
    ctx.job.planSnapshot.policy.includePatterns = ["*.txt"];
    ctx.job.planSnapshot.policy.excludePatterns = ["skip*"];
    ctx.job.planSnapshot.policy.maxItems = 1;

    const artifacts = await new LocalFolderArtifactAcquirer({ roots: { legal: root } }).acquire(ctx);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.originalName).toBe("keep.txt");
  });

  it("rejects traversal, drive-like paths, and backslash paths before filesystem access", () => {
    expect(normalizeLocalFolderRelativePath("nested/legal")).toBe("nested/legal");
    expect(() => normalizeLocalFolderRelativePath("../secret")).toThrow(/relativePath/i);
    expect(() => normalizeLocalFolderRelativePath("C:/secret")).toThrow(/relativePath/i);
    expect(() => normalizeLocalFolderRelativePath("nested\\secret")).toThrow(/relativePath/i);
  });

  it("fails closed when a scan encounters a symbolic link", async () => {
    const root = await tempRoot();
    const outside = await tempRoot();
    await writeFile(join(outside, "secret.txt"), "outside");
    await symlink(join(outside, "secret.txt"), join(root, "linked.txt"));

    const acquirer = new LocalFolderArtifactAcquirer({ roots: { legal: root } });
    await expect(acquirer.acquire(context())).rejects.toMatchObject({
      code: "LOCAL_FOLDER_SYMLINK_FORBIDDEN",
    });
  });

  it("enforces per-file and total-byte limits", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "one.txt"), "12345");
    await writeFile(join(root, "two.txt"), "67890");

    await expect(
      new LocalFolderArtifactAcquirer({ roots: { legal: root }, maxArtifactBytes: 4 }).acquire(
        context(),
      ),
    ).rejects.toMatchObject({ code: "LOCAL_FOLDER_ARTIFACT_TOO_LARGE" });

    await expect(
      new LocalFolderArtifactAcquirer({
        roots: { legal: root },
        maxArtifactBytes: 10,
        maxTotalBytes: 9,
      }).acquire(context()),
    ).rejects.toMatchObject({ code: "LOCAL_FOLDER_TOTAL_BYTES_EXCEEDED" });
  });
});

describe("Local Folder root configuration", () => {
  it("requires explicit absolute allowlisted roots", async () => {
    const root = await tempRoot();
    expect(parseLocalFolderRoots(JSON.stringify({ legal: root }))).toEqual({ legal: root });
    expect(() => parseLocalFolderRoots('{"Legal":"/tmp"}')).toThrow(/root id/i);
    expect(() => parseLocalFolderRoots('{"legal":"relative"}')).toThrow(/absolute path/i);
    expect(() => parseLocalFolderRoots("[]")).toThrow(/JSON object/i);
  });
});
