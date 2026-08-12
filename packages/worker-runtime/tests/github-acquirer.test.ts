import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ArtifactBackedExecutionContext } from "../src/artifact-backed-collection-executor";
import {
  CollectionAcquisitionError,
  GitHubArtifactAcquirer,
  type ApiTransportRequest,
} from "../src/index";

const COMMIT_SHA = "1".repeat(40);
const TREE_SHA = "2".repeat(40);

function gitBlobSha(content: string | Uint8Array): string {
  const body = typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
  return createHash("sha1")
    .update(Buffer.from(`blob ${body.byteLength}\0`))
    .update(body)
    .digest("hex");
}

function context(
  config: Record<string, unknown> = {
    owner: "openai",
    repository: "example",
    ref: "main",
    pathPrefix: "docs",
  },
  overrides: Record<string, unknown> = {},
): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_00000000000000000000000000",
    leaseToken: "lease-token",
    lease: { id: "lse_00000000000000000000000000" },
    job: {
      jobType: "WEB_CRAWL",
      connector: { connectorId: "github-worker", version: "1.0.0" },
      sourceSnapshot: { sourceType: "GITHUB", connectorConfig: config },
      planSnapshot: {
        policy: {
          includePatterns: [],
          excludePatterns: [],
          maxDepth: 5,
          maxItems: 10,
        },
        output: { artifactKinds: ["JSON", "MARKDOWN", "TEXT"] },
      },
      ...overrides,
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function commitBody(commitSha = COMMIT_SHA, treeSha = TREE_SHA): string {
  return JSON.stringify({ sha: commitSha, commit: { tree: { sha: treeSha } } });
}

function treeBody(entries: unknown[], truncated = false): string {
  return JSON.stringify({ sha: TREE_SHA, truncated, tree: entries });
}

function blobBody(content: string | Uint8Array): { sha: string; body: string; size: number } {
  const bytes = typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
  const sha = gitBlobSha(bytes);
  return {
    sha,
    size: bytes.byteLength,
    body: JSON.stringify({ encoding: "base64", content: bytes.toString("base64") }),
  };
}

function response(body: string, statusCode = 200, headers: Record<string, string> = {}) {
  return { statusCode, headers, body: Buffer.from(body) };
}

function acquirerFor(
  entries: Array<{
    path: string;
    content?: string;
    mode?: string;
    type?: string;
    sha?: string;
    size?: number;
  }>,
  options: {
    environment?: NodeJS.ProcessEnv;
    capture?: ApiTransportRequest[];
    truncated?: boolean;
  } = {},
): GitHubArtifactAcquirer {
  const blobs = new Map<string, string>();
  const tree = entries.map((entry) => {
    if (entry.type === "commit") {
      return {
        path: entry.path,
        mode: entry.mode ?? "160000",
        type: "commit",
        sha: entry.sha ?? "3".repeat(40),
      };
    }
    const blob = entry.content === undefined ? null : blobBody(entry.content);
    const sha = entry.sha ?? blob?.sha ?? "4".repeat(40);
    if (blob) blobs.set(sha, blob.body);
    return {
      path: entry.path,
      mode: entry.mode ?? "100644",
      type: entry.type ?? "blob",
      sha,
      size: entry.size ?? blob?.size,
    };
  });
  return new GitHubArtifactAcquirer({
    environment: options.environment,
    resolver: async () => [{ address: "140.82.112.6", family: 4 }],
    transport: async (request) => {
      options.capture?.push(request);
      if (request.path === "/repos/openai/example/commits/main") return response(commitBody());
      if (request.path === `/repos/openai/example/git/trees/${TREE_SHA}?recursive=1`) {
        return response(treeBody(tree, options.truncated));
      }
      const match = /\/git\/blobs\/([a-f0-9]+)$/.exec(request.path);
      if (match && blobs.has(match[1]!)) return response(blobs.get(match[1]!)!);
      throw new Error(`Unexpected request ${request.path}`);
    },
  });
}

async function acquisitionError(promise: Promise<unknown>): Promise<CollectionAcquisitionError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CollectionAcquisitionError);
    return error as CollectionAcquisitionError;
  }
  throw new Error("Expected CollectionAcquisitionError");
}

describe("GitHubArtifactAcquirer", () => {
  it("collects exact commit/tree evidence plus sorted authorized UTF-8 repository files", async () => {
    const capture: ApiTransportRequest[] = [];
    const acquirer = acquirerFor(
      [
        { path: "docs/z.txt", content: "zeta\n" },
        { path: "README.md", content: "outside prefix\n" },
        { path: "docs/a.md", content: "# Alpha\n" },
        { path: "docs/image.png", content: "not-supported" },
      ],
      { capture },
    );

    const artifacts = await acquirer.acquire(context());

    expect(capture[0]?.hostname).toBe("api.github.com");
    expect(capture[0]?.resolvedAddress).toBe("140.82.112.6");
    expect(capture[0]?.servername).toBe("api.github.com");
    expect(capture[0]?.headers["x-github-api-version"]).toBe("2022-11-28");
    expect(artifacts).toHaveLength(4);
    expect(artifacts.slice(0, 2).map((item) => item.artifactKind)).toEqual(["JSON", "JSON"]);
    expect(artifacts.slice(2).map((item) => item.originalName)).toEqual(["a.md", "z.txt"]);
    expect(artifacts[2]?.canonicalUri).toBe("github://openai/example/file/docs/a.md");
    expect(artifacts[2]?.sourceUri).toBe(`github://openai/example/blob/${COMMIT_SHA}/docs/a.md`);
    expect(Buffer.from(artifacts[2]!.content).toString("utf8")).toBe("# Alpha\n");
    expect(artifacts[0]?.canonicalUri).toBe("github://openai/example/snapshot");
    expect(artifacts[1]?.canonicalUri).toBe("github://openai/example/tree");
  });

  it("keeps file canonical identity stable while immutable source commit evidence advances", async () => {
    const first = acquirerFor([{ path: "docs/guide.md", content: "one\n" }]);
    const firstArtifacts = await first.acquire(context());

    const secondContent = "two\n";
    const secondBlob = blobBody(secondContent);
    const secondCommit = "5".repeat(40);
    const secondTree = "6".repeat(40);
    const second = new GitHubArtifactAcquirer({
      resolver: async () => [{ address: "140.82.112.6", family: 4 }],
      transport: async (request) => {
        if (request.path.endsWith("/commits/main"))
          return response(commitBody(secondCommit, secondTree));
        if (request.path.endsWith(`/git/trees/${secondTree}?recursive=1`)) {
          return response(
            JSON.stringify({
              sha: secondTree,
              truncated: false,
              tree: [
                {
                  path: "docs/guide.md",
                  mode: "100644",
                  type: "blob",
                  sha: secondBlob.sha,
                  size: secondBlob.size,
                },
              ],
            }),
          );
        }
        if (request.path.endsWith(`/git/blobs/${secondBlob.sha}`)) return response(secondBlob.body);
        throw new Error(`Unexpected request ${request.path}`);
      },
    });
    const secondArtifacts = await second.acquire(context());

    expect(firstArtifacts[2]?.canonicalUri).toBe(secondArtifacts[2]?.canonicalUri);
    expect(firstArtifacts[2]?.sourceUri).not.toBe(secondArtifacts[2]?.sourceUri);
    expect(secondArtifacts[2]?.sourceUri).toContain(secondCommit);
    expect(Buffer.from(secondArtifacts[2]!.content).toString("utf8")).toBe(secondContent);
  });

  it("injects an optional Worker token only into outbound GitHub requests", async () => {
    const secret = "github_pat_super-sensitive";
    const capture: ApiTransportRequest[] = [];
    const acquirer = acquirerFor([{ path: "docs/a.md", content: "hello" }], {
      environment: { MARKORBIT_GITHUB_TOKEN: secret },
      capture,
    });

    const artifacts = await acquirer.acquire(context());
    expect(capture.every((request) => request.headers.authorization === `Bearer ${secret}`)).toBe(
      true,
    );
    expect(JSON.stringify(artifacts)).not.toContain(secret);
    expect(JSON.stringify(artifacts)).not.toContain("MARKORBIT_GITHUB_TOKEN");
  });

  it("rejects an invalid Worker token before DNS or transport", async () => {
    const resolver = vi.fn(async () => [{ address: "140.82.112.6", family: 4 as const }]);
    const transport = vi.fn(async () => response("{}"));
    const acquirer = new GitHubArtifactAcquirer({
      environment: { MARKORBIT_GITHUB_TOKEN: "bad\nsecret" },
      resolver,
      transport,
    });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("GITHUB_CREDENTIAL_INVALID");
    expect(resolver).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("maps shared API transport failures into the GitHub error domain", async () => {
    const acquirer = new GitHubArtifactAcquirer({
      resolver: async () => [{ address: "140.82.112.6", family: 4 }],
      transport: async () => {
        throw new CollectionAcquisitionError("API_TIMEOUT", "shared timeout", true);
      },
    });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("GITHUB_TIMEOUT");
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain("API_");
  });

  it("fails immediately when immutable commit/tree evidence exceeds the aggregate bound", async () => {
    const blob = blobBody("a");
    const oversizedTree = treeBody([
      { path: "docs/a.md", mode: "100644", type: "blob", sha: blob.sha, size: blob.size },
    ]);
    const acquirer = new GitHubArtifactAcquirer({
      maxFileBytes: 32,
      maxTotalBytes: 64,
      resolver: async () => [{ address: "140.82.112.6", family: 4 }],
      transport: async (request) => {
        if (request.path.endsWith("/commits/main")) return response(commitBody());
        if (request.path.includes("/git/trees/")) return response(oversizedTree);
        throw new Error("blob request must not occur after metadata overflow");
      },
    });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("GITHUB_TOTAL_BYTES_EXCEEDED");
  });

  it("rejects mixed or private GitHub API DNS answers before transport", async () => {
    const transport = vi.fn(async () => response("{}"));
    const acquirer = new GitHubArtifactAcquirer({
      resolver: async () => [
        { address: "140.82.112.6", family: 4 },
        { address: "10.0.0.4", family: 4 },
      ],
      transport,
    });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("GITHUB_NETWORK_TARGET_REJECTED");
    expect(transport).not.toHaveBeenCalled();
  });

  it("fails closed when GitHub reports a truncated recursive tree", async () => {
    const acquirer = acquirerFor([{ path: "docs/a.md", content: "hello" }], { truncated: true });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("GITHUB_TREE_TRUNCATED");
    expect(error.retryable).toBe(false);
  });

  it("rejects matched submodules and symbolic links", async () => {
    const submodule = acquirerFor([{ path: "docs/vendor", type: "commit" }]);
    expect((await acquisitionError(submodule.acquire(context()))).code).toBe(
      "GITHUB_SUBMODULE_UNSUPPORTED",
    );

    const target = "guide.md";
    const symlink = acquirerFor([{ path: "docs/link.md", content: target, mode: "120000" }]);
    expect((await acquisitionError(symlink.acquire(context()))).code).toBe(
      "GITHUB_SYMLINK_UNSUPPORTED",
    );
  });

  it("verifies blob size and Git object hash against immutable tree evidence", async () => {
    const sizeMismatch = acquirerFor([{ path: "docs/a.md", content: "hello", size: 99 }]);
    expect((await acquisitionError(sizeMismatch.acquire(context()))).code).toBe(
      "GITHUB_BLOB_SIZE_MISMATCH",
    );

    const content = "hello";
    const wrongSha = "7".repeat(40);
    const hashMismatch = new GitHubArtifactAcquirer({
      resolver: async () => [{ address: "140.82.112.6", family: 4 }],
      transport: async (request) => {
        if (request.path.endsWith("/commits/main")) return response(commitBody());
        if (request.path.includes("/git/trees/")) {
          return response(
            treeBody([
              {
                path: "docs/a.md",
                mode: "100644",
                type: "blob",
                sha: wrongSha,
                size: content.length,
              },
            ]),
          );
        }
        if (request.path.endsWith(`/git/blobs/${wrongSha}`))
          return response(blobBody(content).body);
        throw new Error(`Unexpected request ${request.path}`);
      },
    });
    expect((await acquisitionError(hashMismatch.acquire(context()))).code).toBe(
      "GITHUB_BLOB_HASH_MISMATCH",
    );
  });

  it("rejects non-UTF8 or NUL-bearing matched text blobs", async () => {
    const bytes = Buffer.from([0xff, 0x00, 0xfe]);
    const blob = blobBody(bytes);
    const acquirer = new GitHubArtifactAcquirer({
      resolver: async () => [{ address: "140.82.112.6", family: 4 }],
      transport: async (request) => {
        if (request.path.endsWith("/commits/main")) return response(commitBody());
        if (request.path.includes("/git/trees/")) {
          return response(
            treeBody([
              { path: "docs/a.txt", mode: "100644", type: "blob", sha: blob.sha, size: blob.size },
            ]),
          );
        }
        return response(blob.body);
      },
    });
    expect((await acquisitionError(acquirer.acquire(context()))).code).toBe("GITHUB_NON_TEXT_BLOB");
  });

  it("enforces plan item/depth authorization and include/exclude patterns", async () => {
    const acquirer = acquirerFor([
      { path: "docs/a.md", content: "a" },
      { path: "docs/private/b.md", content: "b" },
      { path: "docs/deep/nested/c.md", content: "c" },
    ]);
    const filtered = context();
    filtered.job.planSnapshot.policy.includePatterns = ["**/*.md", "*.md"];
    filtered.job.planSnapshot.policy.excludePatterns = ["private/**"];
    filtered.job.planSnapshot.policy.maxDepth = 1;
    const artifacts = await acquirer.acquire(filtered);
    expect(artifacts.slice(2).map((item) => item.originalName)).toEqual(["a.md"]);

    const tooMany = context();
    tooMany.job.planSnapshot.policy.maxItems = 1;
    const error = await acquisitionError(
      acquirerFor([
        { path: "docs/a.md", content: "a" },
        { path: "docs/b.md", content: "b" },
      ]).acquire(tooMany),
    );
    expect(error.code).toBe("GITHUB_ITEM_LIMIT_EXCEEDED");
  });

  it("classifies GitHub rate-limit responses as retryable without exposing response bodies", async () => {
    const acquirer = new GitHubArtifactAcquirer({
      resolver: async () => [{ address: "140.82.112.6", family: 4 }],
      transport: async () =>
        response('{"message":"token secret should not surface"}', 403, {
          "x-ratelimit-remaining": "0",
        }),
    });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("GITHUB_AUTH_OR_RATE_LIMIT_REJECTED");
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain("secret");
  });

  it("rejects invalid Source configuration and missing JSON evidence authorization", async () => {
    const acquirer = acquirerFor([{ path: "docs/a.md", content: "a" }]);
    expect(
      (
        await acquisitionError(
          acquirer.acquire(
            context({ owner: "openai", repository: "example", ref: "../main", pathPrefix: "docs" }),
          ),
        )
      ).code,
    ).toBe("GITHUB_REF_INVALID");

    const noJson = context();
    noJson.job.planSnapshot.output.artifactKinds = ["MARKDOWN"];
    expect((await acquisitionError(acquirer.acquire(noJson))).code).toBe(
      "GITHUB_JSON_EVIDENCE_REQUIRED",
    );
  });
});
