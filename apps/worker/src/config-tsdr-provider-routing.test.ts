import { describe, expect, it } from "vitest";
import { loadWorkerProcessConfig } from "./config";

function baseEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    MARKORBIT_CONTROL_PLANE_URL: "https://control.example.test",
    MARKORBIT_WORKER_ID: "worker-tsdr",
    MARKORBIT_WORKER_CREDENTIAL: "credential",
    MARKORBIT_COLLECTION_PROVIDER: "uspto-tsdr",
  };
}

describe("TSDR worker provider routing config", () => {
  it("admits the dedicated uspto-tsdr collection provider without a raw API key setting", () => {
    const config = loadWorkerProcessConfig(baseEnv());

    expect(config.collectionProvider).toBe("uspto-tsdr");
    expect("USPTO_API_KEY" in config).toBe(false);
  });

  it("does not allow Bright Data fallback on the TSDR provider", () => {
    expect(() =>
      loadWorkerProcessConfig({
        ...baseEnv(),
        MARKORBIT_BRIGHTDATA_FALLBACK_ENABLED: "1",
        BRIGHTDATA_API_TOKEN: "runtime-only-token",
        BRIGHTDATA_WEB_UNLOCKER_ZONE: "zone",
      }),
    ).toThrow(/only be enabled.*crawl4ai/);
  });
});
