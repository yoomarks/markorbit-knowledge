import { describe, expect, it } from "vitest";
import { loadCnipaBrowserSessionConfig, loadWorkerProcessConfig } from "./config";

const cnipaEnv = {
  MARKORBIT_CNIPA_BASE_URL: "https://cnipa.example",
  MARKORBIT_CNIPA_SESSION_ENTRY_URL: "https://cnipa.example/portal",
  MARKORBIT_CNIPA_USER_DATA_DIR: "/runtime-secret/cnipa-profile",
  MARKORBIT_CNIPA_BROWSER_EXECUTABLE_PATH: "/opt/chrome/chrome",
};

describe("CNIPA worker configuration", () => {
  it("loads browser-session metadata without exposing any credential value", () => {
    const config = loadCnipaBrowserSessionConfig({
      ...cnipaEnv,
      MARKORBIT_CNIPA_BEARER_STORAGE: JSON.stringify({
        area: "localStorage",
        key: "operator-observed-key",
        valuePath: ["accessToken"],
      }),
    });
    expect(config).toMatchObject({
      baseUrl: "https://cnipa.example",
      sessionEntryUrl: "https://cnipa.example/portal",
      headless: true,
      minRequestIntervalMs: 2_000,
      maxRequestsPerRun: 50,
      bearerStorage: {
        area: "localStorage",
        key: "operator-observed-key",
        valuePath: ["accessToken"],
      },
    });
    expect(JSON.stringify(config)).not.toContain("Bearer ey");
  });

  it("requires the dedicated browser configuration when CNIPA provider is selected", () => {
    expect(() =>
      loadWorkerProcessConfig({
        MARKORBIT_CONTROL_PLANE_URL: "https://knowledge.example",
        MARKORBIT_WORKER_ID: "worker-1",
        MARKORBIT_WORKER_CREDENTIAL: "secret",
        MARKORBIT_COLLECTION_PROVIDER: "cnipa",
      }),
    ).toThrow(/MARKORBIT_CNIPA_BASE_URL is required/);
  });

  it("accepts cnipa as a governed collection provider", () => {
    const config = loadWorkerProcessConfig({
      MARKORBIT_CONTROL_PLANE_URL: "https://knowledge.example",
      MARKORBIT_WORKER_ID: "worker-1",
      MARKORBIT_WORKER_CREDENTIAL: "secret",
      MARKORBIT_COLLECTION_PROVIDER: "cnipa",
      ...cnipaEnv,
    });
    expect(config.collectionProvider).toBe("cnipa");
    expect(config.cnipaSession?.baseUrl).toBe("https://cnipa.example");
  });
});
