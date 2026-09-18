import { describe, expect, it } from "vitest";
import {
  CNIPA_FAST_QUERY_TEMPLATE_EXTENSION_KEY,
  CNIPA_FAST_SOURCE_SPECS,
  CNIPA_FAST_TIMEZONE,
  cnipaConnectorManifest,
  cnipaFastCron,
  cnipaFastPlanPayload,
  cnipaFastWorkerPayload,
  cnipaSourceConnectorConfig,
} from "./cnipa-fast-bootstrap-spec";

describe("CNIPA FAST production bootstrap topology", () => {
  it("freezes exactly three CNIPA public judgment source families", () => {
    expect(CNIPA_FAST_SOURCE_SPECS).toHaveLength(3);
    expect(
      CNIPA_FAST_SOURCE_SPECS.map((spec) => [spec.documentKind, spec.sourceRecordIdField]),
    ).toEqual([
      ["REGISTRATION_EXAMINATION", "adjuOpenId"],
      ["OPPOSITION_DECISION", "adjuOpenId"],
      ["REVIEW_ADJUDICATION", "pubId"],
    ]);
    expect(new Set(CNIPA_FAST_SOURCE_SPECS.map((spec) => spec.slug)).size).toBe(3);
  });

  it("omits a static fallback query so missing plan templates fail closed", () => {
    for (const spec of CNIPA_FAST_SOURCE_SPECS) {
      const config = cnipaSourceConnectorConfig(spec);
      expect(config).not.toHaveProperty("query");
      expect(config.responseSchema.list).toEqual({
        recordsPath: ["data", "list"],
        sourceRecordIdField: spec.sourceRecordIdField,
      });
      expect(config.limits).toEqual({
        pageSize: 100,
        maxPagesPerLibrary: 50,
        maxDetailRequestsPerRun: 1,
      });
    }
  });

  it("uses weekday Asia/Shanghai plans with the merged weekend policy", () => {
    for (const spec of CNIPA_FAST_SOURCE_SPECS) {
      const plan = cnipaFastPlanPayload("src_example", spec);
      expect(plan.schedule).toEqual({
        mode: "CRON",
        expression: "30 8 * * 1-5",
        timezone: CNIPA_FAST_TIMEZONE,
      });
      expect(plan.extensions[CNIPA_FAST_QUERY_TEMPLATE_EXTENSION_KEY]).toEqual({
        mode: "WEEKDAY_INCREMENTAL_DATE_RANGE",
        documentKinds: [spec.documentKind],
        timezone: CNIPA_FAST_TIMEZONE,
      });
      expect(plan.extensions["x-markorbit.cnipa-detail-fanout"]).toBe(false);
      expect(plan.output.artifactKinds).toEqual(["JSON", "MARKDOWN"]);
    }
  });

  it("keeps the exact clock configurable without changing weekday semantics", () => {
    expect(cnipaFastCron(9, 5)).toBe("5 9 * * 1-5");
    expect(() => cnipaFastCron(24, 0)).toThrow(/hour/i);
    expect(() => cnipaFastCron(8, 60)).toThrow(/minute/i);
  });

  it("registers CNIPA as API collection even though Playwright implements auth", () => {
    const manifest = cnipaConnectorManifest();
    expect(manifest.sourceTypes).toEqual(["API"]);
    expect(manifest.runtime).toBe("NODE");
    expect(manifest.supportedJobTypes).toEqual(["API_COLLECTION"]);
    expect(manifest.capabilities).toEqual(["COLLECT"]);
    expect(manifest.outputArtifactKinds).toEqual(["JSON", "MARKDOWN"]);
    expect(manifest.extensions["x-markorbit-detail-lane"]).toBe("SEPARATE_SLOW_ENRICHMENT");
  });

  it("keeps the production CNIPA worker serialized", () => {
    const worker = cnipaFastWorkerPayload();
    expect(worker.supportedJobTypes).toEqual(["API_COLLECTION"]);
    expect(worker.maxConcurrency).toBe(1);
    expect(worker.connectorBindings).toHaveLength(1);
    expect(worker.connectorBindings[0]).toMatchObject({
      capabilities: ["COLLECT"],
    });
    expect(worker.extensions["x-markorbit-detail-lane"]).toBe("excluded");
  });
});
