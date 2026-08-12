import { describe, expect, it } from "vitest";
import { loadWorkerProcessConfig } from "../src/config";

const API_BINDINGS = '{"public-api":{"baseUrl":"https://api.example.test","auth":{"kind":"NONE"}}}';

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    MARKORBIT_CONTROL_PLANE_URL: "http://localhost:3000/",
    MARKORBIT_WORKER_ID: "wrk_test",
    MARKORBIT_WORKER_CREDENTIAL: "mwk_secret",
    ...overrides,
  };
}

describe("loadWorkerProcessConfig", () => {
  it("normalizes Crawl4AI defaults without exposing secrets", () => {
    const config = loadWorkerProcessConfig(env());
    expect(config.controlPlaneUrl).toBe("http://localhost:3000");
    expect(config.workerId).toBe("wrk_test");
    expect(config.pollIntervalMs).toBe(2_000);
    expect(config.keepAliveIntervalMs).toBe(30_000);
    expect(config.maxCollectionRuntimeMs).toBe(12 * 60_000);
    expect(config.collectionProvider).toBe("crawl4ai");
    expect(config.requireEgressProxy).toBe(true);
    expect(config.localFolderRoots).toEqual({});
    expect(config.githubMaxFileBytes).toBe(2 * 1024 * 1024);
    expect(config.githubMaxTotalBytes).toBe(50 * 1024 * 1024);
    expect(config.githubMaxTreeEntries).toBe(20_000);
    expect(config.githubMaxItems).toBe(500);
    expect(config.githubMaxDepth).toBe(30);
    expect(config.conversionEnabled).toBe(false);
    expect(config.workspaceId).toBeUndefined();
  });

  it("loads a bounded local-folder provider only with explicit absolute root aliases", () => {
    const config = loadWorkerProcessConfig(
      env({
        MARKORBIT_COLLECTION_PROVIDER: "local-folder",
        MARKORBIT_LOCAL_FOLDER_ROOTS: JSON.stringify({ legal: "/srv/markorbit/legal" }),
        MARKORBIT_LOCAL_FOLDER_MAX_ARTIFACT_BYTES: "1024",
        MARKORBIT_LOCAL_FOLDER_MAX_TOTAL_BYTES: "4096",
        MARKORBIT_LOCAL_FOLDER_MAX_ITEMS: "12",
        MARKORBIT_LOCAL_FOLDER_MAX_DEPTH: "6",
      }),
    );
    expect(config.collectionProvider).toBe("local-folder");
    expect(config.localFolderRoots).toEqual({ legal: "/srv/markorbit/legal" });
    expect(config.localFolderMaxArtifactBytes).toBe(1024);
    expect(config.localFolderMaxTotalBytes).toBe(4096);
    expect(config.localFolderMaxItems).toBe(12);
    expect(config.localFolderMaxDepth).toBe(6);

    expect(() =>
      loadWorkerProcessConfig(env({ MARKORBIT_COLLECTION_PROVIDER: "local-folder" })),
    ).toThrow(/LOCAL_FOLDER_ROOTS/);
    expect(() =>
      loadWorkerProcessConfig(
        env({
          MARKORBIT_COLLECTION_PROVIDER: "local-folder",
          MARKORBIT_LOCAL_FOLDER_ROOTS: '{"legal":"relative"}',
        }),
      ),
    ).toThrow(/absolute path/i);
  });

  it("enables the API provider only with runtime endpoint bindings and does not persist them", () => {
    const config = loadWorkerProcessConfig(
      env({
        MARKORBIT_COLLECTION_PROVIDER: "api",
        MARKORBIT_API_ENDPOINT_BINDINGS: API_BINDINGS,
      }),
    );
    expect(config.collectionProvider).toBe("api");
    expect(config).not.toHaveProperty("apiEndpointBindings");

    expect(() => loadWorkerProcessConfig(env({ MARKORBIT_COLLECTION_PROVIDER: "api" }))).toThrow(
      /API_ENDPOINT_BINDINGS/,
    );
  });

  it("enables the RSS provider without unrelated endpoint or local-folder configuration", () => {
    const config = loadWorkerProcessConfig(
      env({
        NODE_ENV: "production",
        MARKORBIT_COLLECTION_PROVIDER: "rss",
        MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY: "0",
      }),
    );
    expect(config.collectionProvider).toBe("rss");
    expect(config.localFolderRoots).toEqual({});
    expect(config).not.toHaveProperty("apiEndpointBindings");
  });

  it("enables a bounded GitHub provider without persisting its optional token", () => {
    const config = loadWorkerProcessConfig(
      env({
        NODE_ENV: "production",
        MARKORBIT_COLLECTION_PROVIDER: "github",
        MARKORBIT_GITHUB_TOKEN: "github_pat_runtime_only",
        MARKORBIT_GITHUB_MAX_FILE_BYTES: "4096",
        MARKORBIT_GITHUB_MAX_TOTAL_BYTES: "16384",
        MARKORBIT_GITHUB_MAX_TREE_ENTRIES: "1234",
        MARKORBIT_GITHUB_MAX_ITEMS: "77",
        MARKORBIT_GITHUB_MAX_DEPTH: "12",
      }),
    );
    expect(config.collectionProvider).toBe("github");
    expect(config.githubMaxFileBytes).toBe(4096);
    expect(config.githubMaxTotalBytes).toBe(16384);
    expect(config.githubMaxTreeEntries).toBe(1234);
    expect(config.githubMaxItems).toBe(77);
    expect(config.githubMaxDepth).toBe(12);
    expect(config).not.toHaveProperty("githubToken");

    expect(() =>
      loadWorkerProcessConfig(
        env({
          MARKORBIT_COLLECTION_PROVIDER: "github",
          MARKORBIT_GITHUB_MAX_FILE_BYTES: "8192",
          MARKORBIT_GITHUB_MAX_TOTAL_BYTES: "4096",
        }),
      ),
    ).toThrow(/MAX_TOTAL_BYTES/);
  });

  it("enables production conversion only with an explicit Workspace", () => {
    const config = loadWorkerProcessConfig(
      env({
        MARKORBIT_CONVERSION_ENABLED: "1",
        MARKORBIT_WORKSPACE_ID: "wsp_01H00000000000000000000000",
        MARKORBIT_CONVERSION_CAPABILITY_REVISION: "7",
        MARKORBIT_CONVERSION_LEASE_DURATION_SECONDS: "240",
      }),
    );
    expect(config.conversionEnabled).toBe(true);
    expect(config.workspaceId).toBe("wsp_01H00000000000000000000000");
    expect(config.conversionCapabilityRevision).toBe(7);
    expect(config.conversionLeaseDurationSeconds).toBe(240);

    expect(() => loadWorkerProcessConfig(env({ MARKORBIT_CONVERSION_ENABLED: "true" }))).toThrow(
      /MARKORBIT_WORKSPACE_ID/,
    );
  });

  it("allows direct Crawl4AI egress only outside production and does not impose it on other providers", () => {
    expect(
      loadWorkerProcessConfig(
        env({
          NODE_ENV: "development",
          MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY: "0",
        }),
      ).requireEgressProxy,
    ).toBe(false);

    expect(() =>
      loadWorkerProcessConfig(
        env({
          NODE_ENV: "production",
          MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY: "0",
        }),
      ),
    ).toThrow(/cannot disable/i);

    expect(
      loadWorkerProcessConfig(
        env({
          NODE_ENV: "production",
          MARKORBIT_COLLECTION_PROVIDER: "local-folder",
          MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY: "0",
          MARKORBIT_LOCAL_FOLDER_ROOTS: JSON.stringify({ legal: "/srv/legal" }),
        }),
      ).collectionProvider,
    ).toBe("local-folder");

    expect(
      loadWorkerProcessConfig(
        env({
          NODE_ENV: "production",
          MARKORBIT_COLLECTION_PROVIDER: "api",
          MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY: "0",
          MARKORBIT_API_ENDPOINT_BINDINGS: API_BINDINGS,
        }),
      ).collectionProvider,
    ).toBe("api");

    expect(
      loadWorkerProcessConfig(
        env({
          NODE_ENV: "production",
          MARKORBIT_COLLECTION_PROVIDER: "rss",
          MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY: "0",
        }),
      ).collectionProvider,
    ).toBe("rss");

    expect(
      loadWorkerProcessConfig(
        env({
          NODE_ENV: "production",
          MARKORBIT_COLLECTION_PROVIDER: "github",
          MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY: "0",
        }),
      ).collectionProvider,
    ).toBe("github");
  });

  it("rejects missing credentials, unknown providers, and unsafe timing limits", () => {
    expect(() => loadWorkerProcessConfig(env({ MARKORBIT_WORKER_CREDENTIAL: "" }))).toThrow(
      /MARKORBIT_WORKER_CREDENTIAL/,
    );
    expect(() =>
      loadWorkerProcessConfig(env({ MARKORBIT_COLLECTION_PROVIDER: "filesystem" })),
    ).toThrow(/COLLECTION_PROVIDER/);
    expect(() =>
      loadWorkerProcessConfig(env({ MARKORBIT_WORKER_KEEPALIVE_INTERVAL_MS: "10" })),
    ).toThrow(/KEEPALIVE/);
    expect(() =>
      loadWorkerProcessConfig(env({ MARKORBIT_WORKER_MAX_COLLECTION_RUNTIME_MS: "900000" })),
    ).toThrow(/MAX_COLLECTION_RUNTIME/);
    expect(() =>
      loadWorkerProcessConfig(
        env({ MARKORBIT_GITHUB_MAX_TREE_ENTRIES: "100001" }),
      ),
    ).toThrow(/GITHUB_MAX_TREE_ENTRIES/);
    expect(() =>
      loadWorkerProcessConfig(
        env({
          MARKORBIT_CONVERSION_ENABLED: "1",
          MARKORBIT_WORKSPACE_ID: "wsp_01H00000000000000000000000",
          MARKORBIT_CONVERSION_LEASE_DURATION_SECONDS: "5",
        }),
      ),
    ).toThrow(/CONVERSION_LEASE_DURATION/);
  });
});
