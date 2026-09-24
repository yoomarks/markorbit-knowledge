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
    expect(pilot.dataEngineUrl).toBeUndefined();
    expect(pilot.dataEngineFactAdmissionKey).toBeUndefined();
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
