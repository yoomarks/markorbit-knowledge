import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteSourceCompatibilityObservationRepository } from "./source-compatibility-observations";

describe("source compatibility observations", () => {
  it("records observations idempotently for the same target and observation time", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteSourceCompatibilityObservationRepository(database);
    const first = repository.record({
      targetId: "cn-cnipa-trademark-search",
      jurisdiction: "CN",
      state: "DEGRADED",
      observedAt: "2026-08-18T00:00:00.000Z",
      primaryUri: "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
      renderJavascript: true,
      errorCode: "CANARY_ADAPTER_REQUIRED",
      baselineTargetId: "cn-cnipa-trademark-filing-guide",
      baselineState: "PASS",
    });
    const second = repository.record({
      targetId: "cn-cnipa-trademark-search",
      jurisdiction: "CN",
      state: "BLOCKED",
      observedAt: "2026-08-18T00:00:00.000Z",
      primaryUri: "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
      renderJavascript: true,
      errorCode: "CANARY_AUTHORITY_BASELINE_FAILED",
      baselineTargetId: "cn-cnipa-trademark-filing-guide",
      baselineState: "FAIL",
    });

    expect(second.id).toBe(first.id);
    expect(second.state).toBe("BLOCKED");
    expect(second.baselineState).toBe("FAIL");
    expect(repository.latest([first.targetId]).get(first.targetId)?.state).toBe("BLOCKED");
  });

  it("returns the latest observation per target", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteSourceCompatibilityObservationRepository(database);
    repository.recordMany([
      {
        targetId: "us-uspto-trademarks-root",
        jurisdiction: "US",
        state: "BLOCKED",
        observedAt: "2026-08-17T00:00:00.000Z",
        primaryUri: "https://www.uspto.gov/trademarks",
        renderJavascript: false,
      },
      {
        targetId: "us-uspto-trademarks-root",
        jurisdiction: "US",
        state: "PASS",
        observedAt: "2026-08-18T00:00:00.000Z",
        primaryUri: "https://www.uspto.gov/trademarks",
        renderJavascript: false,
      },
      {
        targetId: "jp-jpo-trademark-search",
        jurisdiction: "JP",
        state: "PASS",
        observedAt: "2026-08-18T00:00:00.000Z",
        primaryUri: "https://www.j-platpat.inpit.go.jp/",
        renderJavascript: true,
      },
    ]);

    const latest = repository.latest([
      "us-uspto-trademarks-root",
      "jp-jpo-trademark-search",
      "missing",
    ]);
    expect(latest.get("us-uspto-trademarks-root")?.state).toBe("PASS");
    expect(latest.get("jp-jpo-trademark-search")?.state).toBe("PASS");
    expect(latest.has("missing")).toBe(false);
  });
});
