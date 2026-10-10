import { describe, expect, it } from "vitest";
import { loadWorkerProcessConfig } from "./config";

const baseEnv = {
  MARKORBIT_CONTROL_PLANE_URL: "https://knowledge.example",
  MARKORBIT_WORKER_ID: "worker-1",
  MARKORBIT_WORKER_CREDENTIAL: "worker-secret",
  MARKORBIT_COLLECTION_PROVIDER: "tmclass-publisher",
};

describe("TMclass publisher routing", () => {
  it("requires the dedicated Data Engine fact-admission authority", () => {
    expect(() => loadWorkerProcessConfig(baseEnv)).toThrow(/MARKORBIT_DATA_ENGINE_URL/);
    expect(() =>
      loadWorkerProcessConfig({
        ...baseEnv,
        MARKORBIT_DATA_ENGINE_URL: "https://data.example",
      }),
    ).toThrow(/MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY/);

    const config = loadWorkerProcessConfig({
      ...baseEnv,
      MARKORBIT_DATA_ENGINE_URL: "https://data.example/",
      MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY: "k".repeat(32),
    });
    expect(config.collectionProvider).toBe("tmclass-publisher");
    expect(config.dataEngineUrl).toBe("https://data.example");
    expect(config.dataEngineFactAdmissionKey).toBe("k".repeat(32));
  });
});
