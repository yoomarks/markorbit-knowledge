import { describe, expect, it } from "vitest";
import { loadWorkerProcessConfig } from "../src/config";

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
  it("normalizes defaults without exposing secrets", () => {
    const config = loadWorkerProcessConfig(env());
    expect(config.controlPlaneUrl).toBe("http://localhost:3000");
    expect(config.workerId).toBe("wrk_test");
    expect(config.pollIntervalMs).toBe(2_000);
    expect(config.keepAliveIntervalMs).toBe(30_000);
    expect(config.maxCollectionRuntimeMs).toBe(12 * 60_000);
    expect(config.requireEgressProxy).toBe(true);
    expect(config.conversionEnabled).toBe(false);
    expect(config.workspaceId).toBeUndefined();
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

  it("allows direct egress only outside production", () => {
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
  });

  it("rejects missing credentials and unsafe timing limits", () => {
    expect(() => loadWorkerProcessConfig(env({ MARKORBIT_WORKER_CREDENTIAL: "" }))).toThrow(
      /MARKORBIT_WORKER_CREDENTIAL/,
    );
    expect(() =>
      loadWorkerProcessConfig(env({ MARKORBIT_WORKER_KEEPALIVE_INTERVAL_MS: "10" })),
    ).toThrow(/KEEPALIVE/);
    expect(() =>
      loadWorkerProcessConfig(env({ MARKORBIT_WORKER_MAX_COLLECTION_RUNTIME_MS: "900000" })),
    ).toThrow(/MAX_COLLECTION_RUNTIME/);
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
