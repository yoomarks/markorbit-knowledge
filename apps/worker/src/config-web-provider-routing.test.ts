import { describe, expect, it } from "vitest";
import { loadWorkerProcessConfig } from "./config";

function baseEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    MARKORBIT_CONTROL_PLANE_URL: "https://control.example.test",
    MARKORBIT_WORKER_ID: "worker-1",
    MARKORBIT_WORKER_CREDENTIAL: "credential",
    MARKORBIT_COLLECTION_PROVIDER: "crawl4ai",
  };
}

describe("web provider routing config", () => {
  it("keeps Bright Data disabled and credential-free by default", () => {
    const config = loadWorkerProcessConfig(baseEnv());
    expect(config.brightDataFallbackEnabled).toBe(false);
    expect(config.brightDataApiToken).toBeUndefined();
    expect(config.brightDataZone).toBeUndefined();
    expect(config.brightDataMaxRequestsPerRun).toBe(5);
  });

  it("fails closed when Bright Data is enabled without runtime credentials", () => {
    expect(() =>
      loadWorkerProcessConfig({
        ...baseEnv(),
        MARKORBIT_BRIGHTDATA_FALLBACK_ENABLED: "1",
      }),
    ).toThrow(/BRIGHTDATA_API_TOKEN and BRIGHTDATA_WEB_UNLOCKER_ZONE/);
  });

  it("accepts bounded Bright Data runtime configuration without exposing it elsewhere", () => {
    const config = loadWorkerProcessConfig({
      ...baseEnv(),
      MARKORBIT_BRIGHTDATA_FALLBACK_ENABLED: "1",
      BRIGHTDATA_API_TOKEN: "runtime-only-token",
      BRIGHTDATA_WEB_UNLOCKER_ZONE: "web-unlocker-free",
      MARKORBIT_BRIGHTDATA_MAX_REQUESTS_PER_RUN: "3",
    });
    expect(config.brightDataFallbackEnabled).toBe(true);
    expect(config.brightDataApiToken).toBe("runtime-only-token");
    expect(config.brightDataZone).toBe("web-unlocker-free");
    expect(config.brightDataMaxRequestsPerRun).toBe(3);
  });

  it("rejects Bright Data fallback for non-Crawl4AI collection providers", () => {
    expect(() =>
      loadWorkerProcessConfig({
        ...baseEnv(),
        MARKORBIT_COLLECTION_PROVIDER: "rss",
        MARKORBIT_BRIGHTDATA_FALLBACK_ENABLED: "1",
        BRIGHTDATA_API_TOKEN: "runtime-only-token",
        BRIGHTDATA_WEB_UNLOCKER_ZONE: "web-unlocker-free",
      }),
    ).toThrow(/only be enabled.*crawl4ai/);
  });
});
