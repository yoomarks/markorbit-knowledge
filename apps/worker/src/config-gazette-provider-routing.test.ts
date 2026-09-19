import { describe, expect, it } from "vitest";
import { loadWorkerProcessConfig } from "./config";

const baseEnv = {
  MARKORBIT_CONTROL_PLANE_URL: "https://knowledge.example",
  MARKORBIT_WORKER_ID: "worker-1",
  MARKORBIT_WORKER_CREDENTIAL: "worker-secret",
};

const cnipaEnv = {
  MARKORBIT_CNIPA_BASE_URL: "https://pub.sbj.cnipa.gov.cn",
  MARKORBIT_CNIPA_SESSION_ENTRY_URL:
    "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/portalui-pub-prod/",
  MARKORBIT_CNIPA_USER_DATA_DIR: "/runtime-secret/cnipa-profile",
  MARKORBIT_CNIPA_BROWSER_EXECUTABLE_PATH: "/opt/chrome/chrome",
};

describe("CNIPA Gazette provider routing", () => {
  it("fails closed for the deprecated Playwright Gazette acquisition provider", () => {
    expect(() =>
      loadWorkerProcessConfig({
        ...baseEnv,
        ...cnipaEnv,
        MARKORBIT_COLLECTION_PROVIDER: "cnipa-gazette",
      }),
    ).toThrow(/normal browser \+ MO CNIPA Network Capture bridge/);
  });

  it("requires explicit Data Engine authority only for the durable-request publisher", () => {
    expect(() =>
      loadWorkerProcessConfig({
        ...baseEnv,
        MARKORBIT_COLLECTION_PROVIDER: "cnipa-gazette-publisher",
      }),
    ).toThrow(/MARKORBIT_DATA_ENGINE_URL/);

    expect(() =>
      loadWorkerProcessConfig({
        ...baseEnv,
        MARKORBIT_COLLECTION_PROVIDER: "cnipa-gazette-publisher",
        MARKORBIT_DATA_ENGINE_URL: "https://data.example",
      }),
    ).toThrow(/MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY/);

    expect(() =>
      loadWorkerProcessConfig({
        ...baseEnv,
        MARKORBIT_COLLECTION_PROVIDER: "cnipa-gazette-publisher",
        MARKORBIT_DATA_ENGINE_URL: "https://data.example",
        MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY: "too-short",
      }),
    ).toThrow(/at least 32 characters/);

    const config = loadWorkerProcessConfig({
      ...baseEnv,
      MARKORBIT_COLLECTION_PROVIDER: "cnipa-gazette-publisher",
      MARKORBIT_DATA_ENGINE_URL: "https://data.example/",
      MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY: "k".repeat(32),
    });
    expect(config.collectionProvider).toBe("cnipa-gazette-publisher");
    expect(config.dataEngineUrl).toBe("https://data.example");
    expect(config.dataEngineFactAdmissionKey).toBe("k".repeat(32));
    expect(config.cnipaSession).toBeUndefined();
  });

  it("keeps finalize readiness isolated from CNIPA and Data Engine credentials", () => {
    const config = loadWorkerProcessConfig({
      ...baseEnv,
      MARKORBIT_COLLECTION_PROVIDER: "cnipa-gazette-finalize",
    });
    expect(config.collectionProvider).toBe("cnipa-gazette-finalize");
    expect(config.cnipaSession).toBeUndefined();
    expect(config.dataEngineUrl).toBeUndefined();
    expect(config.dataEngineFactAdmissionKey).toBeUndefined();
  });
});
