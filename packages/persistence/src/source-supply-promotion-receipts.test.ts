import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { SourceSupplyHealthRecord } from "@markorbit/contracts";
import {
  evaluateSourceSupplyPromotionProof,
  SqliteSourceSupplyPromotionReceiptLedger,
} from "./source-supply-promotion-receipts";

function health(overrides: Partial<SourceSupplyHealthRecord> = {}): SourceSupplyHealthRecord {
  return {
    protocolVersion: "SOURCE_SUPPLY_HEALTH_V1",
    objectType: "SOURCE_SUPPLY_HEALTH_RECORD",
    workspaceId: "workspace-1",
    targetId: "cn-target",
    jurisdiction: "CN",
    family: "PORTAL",
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    changeSensitivity: "HIGH",
    registrationState: "REGISTERED",
    sourceIds: ["source-1"],
    latestRun: { runId: "run-1", status: "COMPLETE", requestedAt: "2026-08-18T00:00:00Z", updatedAt: "2026-08-18T00:02:00Z" },
    acquisition: { artifactCount: 2, artifactKinds: ["HTML", "MARKDOWN"], latestArtifactAt: "2026-08-18T00:02:00Z" },
    normalization: { stagingDocumentCount: 1, readyDocumentCount: 1, latestDocumentAt: "2026-08-18T00:03:00Z", latestStatus: "READY" },
    retrieval: { indexedDocumentCount: 1, currentDocumentCount: 1, currentArtifactVersion: 1, currentChunkCount: 2, latestIndexedAt: "2026-08-18T00:04:00Z" },
    freshness: { state: "FRESH", latestEvidenceAt: "2026-08-18T00:04:00Z", ageHours: 1, maxAgeHours: 48 },
    compatibility: { state: "PASS", freshness: "FRESH", observedAt: "2026-08-18T00:00:00Z", ageHours: 1, maxAgeHours: 48, primaryUri: "https://example.com", renderJavascript: false, errorCode: null, errorMessage: null, baselineTargetId: null, baselineState: null },
    gaps: [],
    state: "READY",
    observedAt: "2026-08-18T01:00:00Z",
    ...overrides,
  };
}

function ledger() {
  return new SqliteSourceSupplyPromotionReceiptLedger(
    new DatabaseSync(":memory:"),
    () => new Date("2026-08-18T01:00:00.000Z"),
  );
}

describe("source supply promotion receipt ledger", () => {
  it("creates one replay-safe receipt per dispatched CollectionRun", () => {
    const repository = ledger();
    const input = {
      workspaceId: "workspace-1",
      jurisdiction: "CN",
      targetId: "cn-target",
      sourceId: "source-1",
      planId: "plan-1",
      collectionRunId: "run-1",
      operatorActor: "operator:local-admin",
    };
    const first = repository.start(input);
    const replay = repository.start(input);

    expect(first.replayed).toBe(false);
    expect(first.receipt).toMatchObject({
      status: "DISPATCHED",
      lastProofStatus: "UNCHECKED",
      collectionRunId: "run-1",
      targetId: "cn-target",
    });
    expect(replay.replayed).toBe(true);
    expect(replay.receipt.id).toBe(first.receipt.id);
  });

  it("keeps incomplete proof dispatched and promotes only proven supply", () => {
    const repository = ledger();
    const receipt = repository.start({
      workspaceId: "workspace-1",
      jurisdiction: "CN",
      targetId: "cn-target",
      sourceId: "source-1",
      planId: "plan-1",
      collectionRunId: "run-1",
      operatorActor: "operator:local-admin",
    }).receipt;

    const incomplete = repository.recordProof({
      receiptId: receipt.id,
      checkedAt: "2026-08-18T01:05:00Z",
      proof: evaluateSourceSupplyPromotionProof(
        health({ retrieval: { ...health().retrieval, currentDocumentCount: 0 } }),
      ),
    });
    expect(incomplete.status).toBe("DISPATCHED");
    expect(incomplete.lastProofStatus).toBe("INCOMPLETE");
    expect(incomplete.proofBlockers).toContain("NO_CURRENT_RETRIEVAL_DOCUMENT");

    const proven = repository.recordProof({
      receiptId: receipt.id,
      checkedAt: "2026-08-18T01:10:00Z",
      proof: evaluateSourceSupplyPromotionProof(health()),
    });
    expect(proven.status).toBe("PROVEN");
    expect(proven.lastProofStatus).toBe("PROVEN");
    expect(proven.provenAt).toBe("2026-08-18T01:10:00Z");

    const noRegression = repository.recordProof({
      receiptId: receipt.id,
      checkedAt: "2026-08-18T01:15:00Z",
      error: "later transient read failed",
    });
    expect(noRegression.status).toBe("PROVEN");
    expect(noRegression.lastProofStatus).toBe("PROVEN");
  });

  it("records proof-read failures without turning them into terminal supply failures", () => {
    const repository = ledger();
    const receipt = repository.start({
      workspaceId: "workspace-1",
      jurisdiction: "JP",
      targetId: "jp-target",
      sourceId: "source-jp",
      planId: "plan-jp",
      collectionRunId: "run-jp",
      operatorActor: "operator:local-admin",
    }).receipt;
    const failedCheck = repository.recordProof({
      receiptId: receipt.id,
      checkedAt: "2026-08-18T01:05:00Z",
      error: "health read unavailable",
    });
    expect(failedCheck).toMatchObject({
      status: "DISPATCHED",
      lastProofStatus: "FAILED",
      proofError: "health read unavailable",
    });
  });
});
