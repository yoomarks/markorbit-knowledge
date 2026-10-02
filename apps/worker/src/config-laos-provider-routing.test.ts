import { describe, expect, it } from "vitest";
import { loadWorkerProcessConfig } from "./config";

const env = {
  MARKORBIT_CONTROL_PLANE_URL: "https://knowledge.example",
  MARKORBIT_WORKER_ID: "wrk_la_pilot",
  MARKORBIT_WORKER_CREDENTIAL: "fixture-worker-secret",
};
describe("WoPublish worker provider activation", () => {
  it("is opt-in and does not configure a Data Engine handoff", () => {
    const defaultConfig = loadWorkerProcessConfig(env);
    expect(defaultConfig.collectionProvider).toBe("crawl4ai");
    const pilot = loadWorkerProcessConfig({
      ...env,
      MARKORBIT_COLLECTION_PROVIDER: "laos-wopublish",
      MARKORBIT_COLLECTION_ENABLED: "1",
    });
    expect(pilot.collectionProvider).toBe("laos-wopublish");
    expect(pilot.laosFullIndexCollectionEnabled).toBe(false);
    expect(pilot.laosFullDetailCollectionEnabled).toBe(false);
    expect(pilot.laosRequestIntervalMs).toBe(2_500);
    expect(pilot.dataEngineUrl).toBeUndefined();
    expect(pilot.dataEngineFactAdmissionKey).toBeUndefined();
  });
  it("enables the separate generic Data Engine publisher only with its own URL and secret", () => {
    expect(() =>
      loadWorkerProcessConfig({
        ...env,
        MARKORBIT_COLLECTION_PROVIDER: "global-trademark-publisher",
      }),
    ).toThrowError(/MARKORBIT_DATA_ENGINE_URL/);
    expect(() =>
      loadWorkerProcessConfig({
        ...env,
        MARKORBIT_COLLECTION_PROVIDER: "global-trademark-publisher",
        MARKORBIT_DATA_ENGINE_URL: "https://data-engine.example.test",
      }),
    ).toThrowError(/FACT_ADMISSION/);
    const publisher = loadWorkerProcessConfig({
      ...env,
      MARKORBIT_COLLECTION_PROVIDER: "global-trademark-publisher",
      MARKORBIT_DATA_ENGINE_URL: "https://data-engine.example.test",
      MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY: "a".repeat(64),
    });
    expect(publisher.collectionProvider).toBe("global-trademark-publisher");
    expect(publisher.dataEngineUrl).toBe("https://data-engine.example.test");
    expect(publisher.dataEngineFactAdmissionKey).toBe("a".repeat(64));
    expect(publisher.globalTrademarkFullBaselinePublisherEnabled).toBe(false);
    const fullPublisher = loadWorkerProcessConfig({
      ...env,
      MARKORBIT_COLLECTION_PROVIDER: "global-trademark-publisher",
      MARKORBIT_DATA_ENGINE_URL: "https://data-engine.example.test",
      MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY: "a".repeat(64),
      MARKORBIT_LA_FULL_BASELINE_PUBLISH_ENABLED: "true",
    });
    expect(fullPublisher.globalTrademarkFullBaselinePublisherEnabled).toBe(true);
  });
  it("refuses V2 publisher activation on a crawler or unrelated Worker", () => {
    expect(() =>
      loadWorkerProcessConfig({
        ...env,
        MARKORBIT_COLLECTION_PROVIDER: "laos-wopublish",
        MARKORBIT_LA_FULL_BASELINE_PUBLISH_ENABLED: "true",
      }),
    ).toThrowError(/global-trademark-publisher/);
  });
  it("requires an independent default-off source Work switch and bounded interval", () => {
    const fullSource = loadWorkerProcessConfig({
      ...env,
      MARKORBIT_COLLECTION_PROVIDER: "laos-wopublish",
      MARKORBIT_LA_FULL_INDEX_COLLECTION_ENABLED: "true",
      MARKORBIT_LA_FULL_DETAIL_COLLECTION_ENABLED: "true",
      MARKORBIT_LA_MIN_REQUEST_INTERVAL_MS: "6000",
    });
    expect(fullSource.laosFullIndexCollectionEnabled).toBe(true);
    expect(fullSource.laosFullDetailCollectionEnabled).toBe(true);
    expect(fullSource.laosRequestIntervalMs).toBe(6_000);
    expect(fullSource.globalTrademarkFullBaselinePublisherEnabled).toBe(false);
    expect(() =>
      loadWorkerProcessConfig({
        ...env,
        MARKORBIT_COLLECTION_PROVIDER: "crawl4ai",
        MARKORBIT_LA_FULL_INDEX_COLLECTION_ENABLED: "true",
      }),
    ).toThrowError(/laos-wopublish/);
    expect(() =>
      loadWorkerProcessConfig({
        ...env,
        MARKORBIT_COLLECTION_PROVIDER: "crawl4ai",
        MARKORBIT_LA_FULL_DETAIL_COLLECTION_ENABLED: "true",
      }),
    ).toThrowError(/laos-wopublish/);
    expect(() =>
      loadWorkerProcessConfig({
        ...env,
        MARKORBIT_COLLECTION_PROVIDER: "laos-wopublish",
        MARKORBIT_LA_MIN_REQUEST_INTERVAL_MS: "1250",
      }),
    ).toThrowError(/MARKORBIT_LA_MIN_REQUEST_INTERVAL_MS/);
  });
  it("rejects arbitrary providers even when the pilot Worker is enabled", () => {
    expect(() =>
      loadWorkerProcessConfig({
        ...env,
        MARKORBIT_COLLECTION_PROVIDER: "laos-wopublish-bulk",
      }),
    ).toThrowError(/MARKORBIT_COLLECTION_PROVIDER/);
  });
});
