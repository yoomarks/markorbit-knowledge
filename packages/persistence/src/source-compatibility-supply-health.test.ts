import {
  SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
  type SourceSupplyCompatibilityHealth,
  type SourceSupplyHealthRecord,
} from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import { applySourceCompatibilityHealth } from "./source-compatibility-supply-health";

function readySupply(): SourceSupplyHealthRecord {
  return {
    protocolVersion: SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
    objectType: "SOURCE_SUPPLY_HEALTH",
    targetId: "cn-cnipa-trademark-search",
    workspaceId: "default",
    jurisdiction: "CN",
    family: "SEARCH",
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    changeSensitivity: "HIGH",
    displayName: "CNIPA Trademark Search",
    canonicalUri: "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
    registrationState: "REGISTERED",
    sourceIds: ["source-cnipa-search"],
    latestRun: {
      runId: "run-1",
      status: "SUCCEEDED",
      requestedAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:01:00.000Z",
    },
    acquisition: {
      artifactCount: 2,
      artifactKinds: ["HTML", "MARKDOWN"],
      latestArtifactAt: "2026-08-18T00:01:00.000Z",
    },
    normalization: {
      stagingDocumentCount: 1,
      readyDocumentCount: 1,
      latestDocumentAt: "2026-08-18T00:02:00.000Z",
      latestStatus: "READY",
    },
    retrieval: {
      indexedDocumentCount: 1,
      currentDocumentCount: 1,
      currentArtifactVersion: 1,
      currentChunkCount: 3,
      latestIndexedAt: "2026-08-18T00:03:00.000Z",
    },
    freshness: {
      state: "FRESH",
      lastObservedAt: "2026-08-18T00:01:00.000Z",
      ageHours: 0,
      maxAgeHours: 48,
    },
    gaps: [],
    state: "READY",
    observedAt: "2026-08-18T00:05:00.000Z",
  };
}

function compatibility(
  state: SourceSupplyCompatibilityHealth["state"],
): SourceSupplyCompatibilityHealth {
  return {
    state,
    observedAt: state === "UNOBSERVED" ? null : "2026-08-18T00:04:00.000Z",
    primaryUri: state === "UNOBSERVED" ? null : "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
    renderJavascript: state === "UNOBSERVED" ? null : true,
    errorCode: state === "DEGRADED" ? "CANARY_ADAPTER_REQUIRED" : null,
    errorMessage: null,
    baselineTargetId: state === "DEGRADED" ? "cn-cnipa-trademark-filing-guide" : null,
    baselineState: state === "DEGRADED" ? "PASS" : null,
  };
}

describe("compatibility-aware supply health", () => {
  it("keeps unobserved and passing compatibility neutral", () => {
    const unobserved = applySourceCompatibilityHealth(readySupply(), compatibility("UNOBSERVED"));
    const passing = applySourceCompatibilityHealth(readySupply(), compatibility("PASS"));
    expect(unobserved.state).toBe("READY");
    expect(unobserved.gaps).toEqual([]);
    expect(passing.state).toBe("READY");
    expect(passing.gaps).toEqual([]);
  });

  it("downgrades ready supply when the primary external path needs an adapter", () => {
    const result = applySourceCompatibilityHealth(readySupply(), compatibility("DEGRADED"));
    expect(result.state).toBe("DEGRADED");
    expect(result.gaps).toContain("PRIMARY_PATH_DEGRADED");
    expect(result.compatibility?.baselineState).toBe("PASS");
  });

  it("blocks supply when external compatibility is blocked", () => {
    const result = applySourceCompatibilityHealth(readySupply(), compatibility("BLOCKED"));
    expect(result.state).toBe("BLOCKED");
    expect(result.gaps).toContain("EXTERNAL_COMPATIBILITY_BLOCKED");
  });
});
