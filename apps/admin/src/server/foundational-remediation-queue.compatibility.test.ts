import {
  SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
  type SourceSupplyHealthRecord,
} from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import {
  SOURCE_COMPATIBILITY_REPROBE_REASON,
  toFoundationalSupplyHealthItem,
} from "./foundational-remediation-queue";

function supplyRecord(): SourceSupplyHealthRecord {
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
      status: "COMPLETED",
      requestedAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:01:00.000Z",
    },
    acquisition: {
      artifactCount: 2,
      artifactKinds: ["HTML", "MARKDOWN"],
      latestArtifactAt: "2026-08-17T00:01:00.000Z",
    },
    normalization: {
      stagingDocumentCount: 1,
      readyDocumentCount: 1,
      latestDocumentAt: "2026-08-17T00:02:00.000Z",
      latestStatus: "READY",
    },
    retrieval: {
      indexedDocumentCount: 1,
      currentDocumentCount: 1,
      currentArtifactVersion: 1,
      currentChunkCount: 3,
      latestIndexedAt: "2026-08-17T00:03:00.000Z",
    },
    freshness: {
      state: "FRESH",
      lastObservedAt: "2026-08-17T00:01:00.000Z",
      ageHours: 1,
      maxAgeHours: 48,
    },
    compatibility: {
      state: "DEGRADED",
      freshness: "STALE",
      observedAt: "2026-08-14T00:00:00.000Z",
      ageHours: 72,
      maxAgeHours: 48,
      primaryUri: "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
      renderJavascript: true,
      errorCode: "CANARY_ADAPTER_REQUIRED",
      errorMessage: "primary interaction timed out",
      baselineTargetId: "cn-cnipa-trademark-filing-guide",
      baselineState: "PASS",
    },
    gaps: [],
    state: "READY",
    observedAt: "2026-08-17T01:00:00.000Z",
  };
}

describe("foundational compatibility readiness mapping", () => {
  it("adds a readiness-only re-probe reason for stale compatibility history", () => {
    const result = toFoundationalSupplyHealthItem(supplyRecord());
    expect(result.state).toBe("READY");
    expect(result.gaps).toEqual([SOURCE_COMPATIBILITY_REPROBE_REASON]);
  });

  it("does not invent a stale re-probe reason for a fresh observation", () => {
    const record = supplyRecord();
    record.compatibility = { ...record.compatibility!, freshness: "FRESH", ageHours: 1 };
    const result = toFoundationalSupplyHealthItem(record);
    expect(result.gaps).not.toContain(SOURCE_COMPATIBILITY_REPROBE_REASON);
  });
});
