import { describe, expect, it } from "vitest";
import {
  completeSourceCompatibilityReprobe,
  failSourceCompatibilityReprobe,
  filterRepresentativeCanarySummary,
  startSourceCompatibilityReprobe,
} from "../src/source-compatibility-reprobe-operator";

const config = {
  controlPlaneUrl: "https://knowledge.example.test/",
  workerId: "worker.compatibility",
  workerCredential: "secret-worker-credential",
};

function execution(status: "STARTED" | "COMPLETED" | "FAILED" = "STARTED") {
  return {
    executionId: "scrx_0123456789abcdef0123456789abcdef",
    intentId: "fai_0123456789abcdef0123456789abcdef",
    workspaceId: "default",
    jurisdiction: "CN",
    targetId: "cn-cnipa-trademark-search",
    executedByActorId: "operator.executor",
    workerId: "worker.compatibility",
    status,
    observationObservedAt: status === "COMPLETED" ? "2026-08-18T00:05:00.000Z" : null,
    observationState: status === "COMPLETED" ? "PASS" : null,
    errorCode: status === "FAILED" ? "RUNNER_FAILED" : null,
    errorMessage: status === "FAILED" ? "runner failed" : null,
    replayed: false,
  };
}

describe("source compatibility re-probe operator", () => {
  it("starts through the authenticated worker endpoint and preserves execution scope", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return Response.json({
        version: "SOURCE_COMPATIBILITY_REPROBE_WORKER_API_V1",
        execution: execution(),
      });
    };

    const result = await startSourceCompatibilityReprobe(
      config,
      {
        intentId: "fai_0123456789abcdef0123456789abcdef",
        executedByActorId: "operator.executor",
        idempotencyKey: "reprobe-cn-search-1",
      },
      fetchImpl,
    );

    expect(result).toMatchObject({
      status: "STARTED",
      jurisdiction: "CN",
      targetId: "cn-cnipa-trademark-search",
      workerId: "worker.compatibility",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://knowledge.example.test/api/worker/v1/source-compatibility-reprobes",
    );
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(
      "Bearer secret-worker-credential",
    );
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      workerId: "worker.compatibility",
      operation: "START",
      intentId: "fai_0123456789abcdef0123456789abcdef",
      executedByActorId: "operator.executor",
      idempotencyKey: "reprobe-cn-search-1",
    });
  });

  it("filters a jurisdiction summary to exactly the approved target before recording evidence", () => {
    const result = filterRepresentativeCanarySummary(
      {
        version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
        observedAt: "2026-08-18T00:05:00.000Z",
        observations: [
          {
            targetId: "cn-cnipa-trademark-search",
            jurisdiction: "CN",
            state: "DEGRADED",
            requestedUri: "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
            renderJavascript: true,
          },
          {
            targetId: "cn-another-canary",
            jurisdiction: "CN",
            state: "PASS",
            requestedUri: "https://example.cn/",
            renderJavascript: false,
          },
        ],
      },
      "cn-cnipa-trademark-search",
    );

    expect(result.state).toBe("DEGRADED");
    expect(result.observedAt).toBe("2026-08-18T00:05:00.000Z");
    expect(result.summary.observations).toHaveLength(1);
    expect(result.summary.observations[0]?.targetId).toBe("cn-cnipa-trademark-search");
  });

  it("rejects missing or duplicate target evidence instead of recording an ambiguous result", () => {
    const summary = {
      version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
      observedAt: "2026-08-18T00:05:00.000Z",
      observations: [
        { targetId: "other", state: "PASS" },
        { targetId: "other", state: "PASS" },
      ],
    };
    expect(() => filterRepresentativeCanarySummary(summary, "expected")).toThrow(/exactly one/);
  });

  it("completes and fails through the same worker-authenticated state-machine endpoint", async () => {
    const operations: string[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as { operation: string };
      operations.push(payload.operation);
      return Response.json({
        version: "SOURCE_COMPATIBILITY_REPROBE_WORKER_API_V1",
        execution: execution(payload.operation === "COMPLETE" ? "COMPLETED" : "FAILED"),
      });
    };

    const completed = await completeSourceCompatibilityReprobe(
      config,
      {
        executionId: "scrx_0123456789abcdef0123456789abcdef",
        observedAt: "2026-08-18T00:05:00.000Z",
        state: "PASS",
      },
      fetchImpl,
    );
    const failed = await failSourceCompatibilityReprobe(
      config,
      {
        executionId: "scrx_0123456789abcdef0123456789abcdef",
        errorCode: "RUNNER_FAILED",
        errorMessage: "runner failed",
      },
      fetchImpl,
    );

    expect(completed.status).toBe("COMPLETED");
    expect(failed.status).toBe("FAILED");
    expect(operations).toEqual(["COMPLETE", "FAIL"]);
  });
});
