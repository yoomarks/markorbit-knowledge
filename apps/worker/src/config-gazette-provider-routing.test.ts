import { describe, expect, it } from "vitest";
import { loadWorkerProcessConfig } from "./config";

const baseEnv = {
  MARKORBIT_CONTROL_PLANE_URL: "https://knowledge.example",
  MARKORBIT_WORKER_ID: "worker-1",
  MARKORBIT_WORKER_CREDENTIAL: "worker-secret",
};

describe("CNIPA Gazette provider routing", () => {
  it("fails closed on the obsolete Worker-launched Gazette browser provider", () => {
    expect(() =>
      loadWorkerProcessConfig({
        ...baseEnv,
        MARKORBIT_COLLECTION_PROVIDER: "cnipa-gazette",
      }),
    ).toThrow(/disabled.*capture-import/i);
  });

  it("routes Gazette capture import without any CNIPA browser-session credentials", () => {
    const config = loadWorkerProcessConfig({
      ...baseEnv,
      MARKORBIT_COLLECTION_PROVIDER: "cnipa-gazette-capture-import",
    });
    expect(config.collectionProvider).toBe("cnipa-gazette-capture-import");
    expect(config.cnipaSession).toBeUndefined();
    expect(config.dataEngineUrl).toBeUndefined();
    expect(config.dataEngineFactAdmissionKey).toBeUndefined();
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
