import { describe, expect, it } from "vitest";
import type {
  CanonicalDownstreamDocumentV1,
  CanonicalDownstreamVaultImportOriginV1,
  ReadyPackageV2,
  VaultOriginStagingDocumentV1,
  VaultOriginStagingFinalizationV1,
  VaultOriginStagingVerificationEvidenceV1,
} from "@markorbit/contracts";
import type { ReadyPackageV2DeliveryAuditEvent } from "./ready-package-v2-delivery-audit";
import type { ReadyPackageV2DeliverySubmission } from "./ready-package-v2-delivery-submission";
import {
  buildProducerCoreReliabilityScorecard,
  projectReadyPackageV2DeliveryAsOf,
  summarizeProducerCoreLatency,
  type ProducerCoreReliabilityDeliveryEvidence,
  type ProducerCoreReliabilityEvidenceV1,
} from "./producer-core-reliability-scorecard";

const WORKSPACE = "wsp_scorecard";
const BINDING = "vbd_scorecard";
const SHA = "a".repeat(64);
const REQUEST_SHA = "b".repeat(64);

function origin(
  overrides: Partial<CanonicalDownstreamVaultImportOriginV1> = {},
): CanonicalDownstreamVaultImportOriginV1 {
  return {
    kind: "VAULT_IMPORT",
    inspectionRunId: "vin_1",
    importIntentId: "vmi_1",
    importExecutionId: "vme_1",
    vaultStagingDocumentId: "vst_1",
    verificationId: "vsv_1",
    verificationOutcome: "PASS",
    finalizationId: "vsf_1",
    rootFingerprintSha256: SHA,
    binding: { bindingId: BINDING, revision: 1, relativeRoot: "knowledge" },
    vaultRelativePath: "knowledge/a.md",
    bindingRelativePath: "a.md",
    observedAt: "2026-09-01T00:00:00.000Z",
    reviewedAt: "2026-09-01T00:05:00.000Z",
    importedAt: "2026-09-01T00:10:00.000Z",
    verifiedAt: "2026-09-01T00:20:00.000Z",
    ...overrides,
  };
}

function staging(
  overrides: Partial<VaultOriginStagingDocumentV1> = {},
): VaultOriginStagingDocumentV1 {
  return {
    contractVersion: "1.0",
    objectType: "VAULT_ORIGIN_STAGING_DOCUMENT",
    id: "vst_1",
    workspaceId: WORKSPACE,
    importIntentId: "vmi_1",
    inspectionRunId: "vin_1",
    binding: { bindingId: BINDING, revision: 1, relativeRoot: "knowledge" },
    vaultRelativePath: "knowledge/a.md",
    bindingRelativePath: "a.md",
    contentHash: { algorithm: "SHA-256", value: SHA },
    sizeBytes: 10,
    contentAddressedRef: `cas:sha256:${SHA}`,
    mediaType: "text/markdown",
    encoding: "utf-8",
    status: "IMPORTED_UNVERIFIED",
    importedAt: "2026-09-01T00:10:00.000Z",
    ...overrides,
  };
}

function verification(
  overrides: Partial<VaultOriginStagingVerificationEvidenceV1> = {},
): VaultOriginStagingVerificationEvidenceV1 {
  return {
    contractVersion: "1.0",
    objectType: "VAULT_ORIGIN_STAGING_VERIFICATION",
    id: "vsv_1",
    workspaceId: WORKSPACE,
    vaultStagingDocumentId: "vst_1",
    importIntentId: "vmi_1",
    verifier: { verifierId: "builtin-vault-origin-staging-verifier", version: "1.0.0" },
    contentSha256: SHA,
    sizeBytes: 10,
    outcome: "PASS",
    checks: [],
    warnings: [],
    createdAt: "2026-09-01T00:20:00.000Z",
    ...overrides,
  };
}

function finalization(
  overrides: Partial<VaultOriginStagingFinalizationV1> = {},
): VaultOriginStagingFinalizationV1 {
  return {
    contractVersion: "1.0",
    objectType: "VAULT_ORIGIN_STAGING_FINALIZATION",
    id: "vsf_1",
    workspaceId: WORKSPACE,
    vaultStagingDocumentId: "vst_1",
    importIntentId: "vmi_1",
    verificationId: "vsv_1",
    contentSha256: SHA,
    state: "VERIFIED",
    finalizedAt: "2026-09-01T00:25:00.000Z",
    ...overrides,
  };
}

function canonical(
  overrides: Partial<CanonicalDownstreamDocumentV1> = {},
): CanonicalDownstreamDocumentV1 {
  return {
    contractVersion: "1.0",
    objectType: "CANONICAL_DOWNSTREAM_DOCUMENT",
    id: "cdn_1",
    workspaceId: WORKSPACE,
    status: "READY",
    origin: origin(),
    content: {
      sha256: SHA,
      sizeBytes: 10,
      contentAddressedRef: `cas:sha256:${SHA}`,
      mediaType: "text/markdown",
      encoding: "utf-8",
    },
    legalTruthVerified: false,
    promotedAt: "2026-09-01T00:30:00.000Z",
    ...overrides,
  };
}

function readyPackage(overrides: Partial<ReadyPackageV2> = {}): ReadyPackageV2 {
  const document = canonical();
  return {
    contractVersion: "2.0",
    objectType: "READY_PACKAGE",
    id: "rdp_1",
    workspaceId: WORKSPACE,
    status: "VERIFIED",
    evidence: {
      canonicalDocumentId: document.id,
      canonicalPromotedAt: document.promotedAt,
      origin: document.origin,
      content: document.content,
      digest: SHA,
      legalTruthVerified: false,
    },
    createdAt: "2026-09-01T00:40:00.000Z",
    ...overrides,
  };
}

function submission(
  overrides: Partial<ReadyPackageV2DeliverySubmission> = {},
): ReadyPackageV2DeliverySubmission {
  return {
    submissionId: "rvd_1",
    workspaceId: WORKSPACE,
    readyPackageId: "rdp_1",
    readyPackageDigest: SHA,
    coreWorkspaceId: "11111111-1111-1111-1111-111111111111",
    idempotencyKey: "key-1",
    requestJson: "{}",
    requestSha256: REQUEST_SHA,
    contentExportSha256: SHA,
    state: "PENDING",
    transportAttempts: 0,
    createdAt: "2026-09-01T00:50:00.000Z",
    updatedAt: "2026-09-01T00:50:00.000Z",
    ...overrides,
  };
}

function audit(
  sequence: number,
  type: ReadyPackageV2DeliveryAuditEvent["type"],
  recordedAt: string,
  extras: Partial<ReadyPackageV2DeliveryAuditEvent> = {},
): ReadyPackageV2DeliveryAuditEvent {
  return {
    workspaceId: WORKSPACE,
    submissionId: "rvd_1",
    readyPackageId: "rdp_1",
    sequence,
    type,
    requestSha256: REQUEST_SHA,
    recordedAt,
    ...extras,
  };
}

function delivery(
  events: ReadyPackageV2DeliveryAuditEvent[],
): ProducerCoreReliabilityDeliveryEvidence {
  return { submission: submission(), auditEvents: events };
}

function baseEvidence(
  events: ReadyPackageV2DeliveryAuditEvent[] = [],
): ProducerCoreReliabilityEvidenceV1 {
  return {
    stagingDocuments: [staging()],
    verifications: [verification()],
    finalizations: [finalization()],
    canonicalDocuments: [canonical()],
    readyPackages: [readyPackage()],
    deliveries: events.length > 0 ? [delivery(events)] : [],
  };
}

const WINDOW = {
  from: "2026-09-01T00:00:00.000Z",
  to: "2026-09-02T00:00:00.000Z",
};

describe("Producer/Core reliability scorecard", () => {
  it("uses null rather than false 100% rates for empty cohorts", () => {
    const scorecard = buildProducerCoreReliabilityScorecard(
      { workspaceId: WORKSPACE, window: WINDOW },
      {
        stagingDocuments: [],
        verifications: [],
        finalizations: [],
        canonicalDocuments: [],
        readyPackages: [],
        deliveries: [],
      },
    );

    expect(scorecard.progression.canonicalPromotionToReadyPackage).toEqual({
      numerator: 0,
      denominator: 0,
      value: null,
    });
    expect(scorecard.progression.attemptedDeliveryDeliveredSuccess.value).toBeNull();
    expect(scorecard.latency.promotedToReadyPackage).toEqual({
      sampleSize: 0,
      p50Ms: null,
      p95Ms: null,
      maxMs: null,
    });
  });

  it("counts a fully finalized accepted delivery as delivered success", () => {
    const events = [
      audit(1, "PREPARED", "2026-09-01T00:50:00.000Z"),
      audit(2, "TRANSPORT_ATTEMPT_STARTED", "2026-09-01T01:00:00.000Z", {
        attemptNumber: 1,
      }),
      audit(3, "TRANSPORT_RESULT_RECORDED", "2026-09-01T01:05:00.000Z", {
        attemptNumber: 1,
        resultStatus: "ACCEPTED",
      }),
      audit(4, "FINALIZED", "2026-09-01T01:06:00.000Z", {
        attemptNumber: 1,
        resultStatus: "ACCEPTED",
      }),
    ];

    const scorecard = buildProducerCoreReliabilityScorecard(
      { workspaceId: WORKSPACE, window: WINDOW },
      baseEvidence(events),
    );

    expect(scorecard.funnel).toMatchObject({
      imported: 1,
      verified: 1,
      finalizationVerified: 1,
      promoted: 1,
      readyPackageCreated: 1,
      deliveryPrepared: 1,
      deliveryResultRecorded: 1,
      deliveryFinalized: 1,
    });
    expect(scorecard.delivery.resultStatus.ACCEPTED).toBe(1);
    expect(scorecard.delivery.state.DELIVERED).toBe(1);
    expect(scorecard.progression.attemptedDeliveryDeliveredSuccess).toEqual({
      numerator: 1,
      denominator: 1,
      value: 1,
    });
    expect(scorecard.progression.canonicalPromotionToReadyPackage.value).toBe(1);
    expect(scorecard.latency.promotedToReadyPackage).toMatchObject({
      sampleSize: 1,
      p50Ms: 600_000,
      p95Ms: 600_000,
    });
  });

  it("never counts REJECTED as delivered success", () => {
    const events = [
      audit(1, "PREPARED", "2026-09-01T00:50:00.000Z"),
      audit(2, "TRANSPORT_ATTEMPT_STARTED", "2026-09-01T01:00:00.000Z", {
        attemptNumber: 1,
      }),
      audit(3, "TRANSPORT_RESULT_RECORDED", "2026-09-01T01:01:00.000Z", {
        attemptNumber: 1,
        resultStatus: "REJECTED",
      }),
      audit(4, "FINALIZED", "2026-09-01T01:02:00.000Z", {
        attemptNumber: 1,
        resultStatus: "REJECTED",
      }),
    ];
    const scorecard = buildProducerCoreReliabilityScorecard(
      { workspaceId: WORKSPACE, window: WINDOW },
      baseEvidence(events),
    );

    expect(scorecard.delivery.resultStatus.REJECTED).toBe(1);
    expect(scorecard.delivery.state.CONSUMER_REJECTED).toBe(1);
    expect(scorecard.delivery.state.DELIVERED).toBe(0);
    expect(scorecard.progression.attemptedDeliveryDeliveredSuccess.value).toBe(0);
    expect(scorecard.drillThrough.reconciliation[0]).toMatchObject({
      submissionId: "rvd_1",
      state: "CONSUMER_REJECTED",
      resultStatus: "REJECTED",
    });
  });

  it("keeps future durable results out of historical windows", () => {
    const events = [
      audit(1, "PREPARED", "2026-09-01T00:50:00.000Z"),
      audit(2, "TRANSPORT_ATTEMPT_STARTED", "2026-09-01T01:00:00.000Z", {
        attemptNumber: 1,
      }),
      audit(3, "TRANSPORT_RESULT_RECORDED", "2026-09-03T01:00:00.000Z", {
        attemptNumber: 1,
        resultStatus: "ACCEPTED",
      }),
      audit(4, "FINALIZED", "2026-09-03T01:01:00.000Z", {
        attemptNumber: 1,
        resultStatus: "ACCEPTED",
      }),
    ];

    const projection = projectReadyPackageV2DeliveryAsOf(delivery(events), WINDOW.to);
    expect(projection.state).toBe("OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST");
    expect(projection.resultStatus).toBeNull();

    const scorecard = buildProducerCoreReliabilityScorecard(
      { workspaceId: WORKSPACE, window: WINDOW },
      baseEvidence(events),
    );
    expect(scorecard.delivery.outcomeUnknown).toBe(1);
    expect(scorecard.delivery.resultStatus.noDurableResult).toBe(1);
    expect(scorecard.progression.attemptedDeliveryKnownResult.value).toBe(0);
  });

  it("records unknown outcome recovery only after a distinct retry resolves", () => {
    const events = [
      audit(1, "PREPARED", "2026-09-01T00:50:00.000Z"),
      audit(2, "TRANSPORT_ATTEMPT_STARTED", "2026-09-01T01:00:00.000Z", {
        attemptNumber: 1,
      }),
      audit(3, "TRANSPORT_OUTCOME_UNKNOWN", "2026-09-01T01:01:00.000Z", {
        attemptNumber: 1,
        issueCode: "CORE_TIMEOUT",
        httpStatus: 504,
      }),
      audit(4, "TRANSPORT_ATTEMPT_STARTED", "2026-09-01T01:10:00.000Z", {
        attemptNumber: 2,
      }),
      audit(5, "TRANSPORT_RESULT_RECORDED", "2026-09-01T01:11:00.000Z", {
        attemptNumber: 2,
        resultStatus: "RECEIVED",
      }),
      audit(6, "FINALIZED", "2026-09-01T01:12:00.000Z", {
        attemptNumber: 2,
        resultStatus: "RECEIVED",
      }),
    ];

    const scorecard = buildProducerCoreReliabilityScorecard(
      { workspaceId: WORKSPACE, window: WINDOW },
      baseEvidence(events),
    );
    expect(scorecard.delivery.retrying).toBe(1);
    expect(scorecard.delivery.resolvedAfterRetry).toBe(1);
    expect(scorecard.delivery.recoveredAfterUnknown).toBe(1);
    expect(scorecard.delivery.state.DELIVERED).toBe(1);
  });

  it("uses deterministic nearest-rank P50/P95 and excludes invalid samples", () => {
    expect(summarizeProducerCoreLatency([100, 500, null, -1, 300, 200, 400])).toEqual({
      sampleSize: 5,
      p50Ms: 300,
      p95Ms: 500,
      maxMs: 500,
    });
  });

  it("applies factual binding cohorts without inventing source or legal-quality labels", () => {
    const evidence = baseEvidence();
    evidence.stagingDocuments.push(
      staging({
        id: "vst_other",
        binding: { bindingId: "vbd_other", revision: 1, relativeRoot: "other" },
      }),
    );

    const scorecard = buildProducerCoreReliabilityScorecard(
      { workspaceId: WORKSPACE, window: WINDOW, bindingId: BINDING },
      evidence,
    );
    expect(scorecard.filters.bindingId).toBe(BINDING);
    expect(scorecard.funnel.imported).toBe(1);
    expect(scorecard.cohorts.byBinding.map((item) => item.bindingId)).toEqual([BINDING]);
  });

  it("excludes evidence that first becomes durable after the historical cutoff", () => {
    const evidence = baseEvidence();
    evidence.canonicalDocuments = [canonical({ promotedAt: "2026-09-03T00:30:00.000Z" })];
    evidence.readyPackages = [readyPackage({ createdAt: "2026-09-03T00:40:00.000Z" })];
    evidence.deliveries = [
      delivery([
        audit(1, "PREPARED", "2026-09-03T00:50:00.000Z"),
        audit(2, "TRANSPORT_ATTEMPT_STARTED", "2026-09-03T01:00:00.000Z", {
          attemptNumber: 1,
        }),
      ]),
    ];

    const scorecard = buildProducerCoreReliabilityScorecard(
      { workspaceId: WORKSPACE, window: WINDOW },
      evidence,
    );

    expect(scorecard.funnel.observed).toBe(0);
    expect(scorecard.funnel.promoted).toBe(0);
    expect(scorecard.funnel.readyPackageCreated).toBe(0);
    expect(scorecard.funnel.deliveryPrepared).toBe(0);
    expect(scorecard.delivery.attemptedCohortSize).toBe(0);
    expect(scorecard.cohorts.byBinding).toEqual([]);
  });

  it("anchors binding delivery outcomes to the same first-attempt window as the top-level cohort", () => {
    const events = [
      audit(1, "PREPARED", "2026-09-01T00:50:00.000Z"),
      audit(2, "TRANSPORT_ATTEMPT_STARTED", "2026-09-01T00:55:00.000Z", {
        attemptNumber: 1,
      }),
      audit(3, "TRANSPORT_RESULT_RECORDED", "2026-09-01T01:05:00.000Z", {
        attemptNumber: 1,
        resultStatus: "ACCEPTED",
      }),
      audit(4, "FINALIZED", "2026-09-01T01:06:00.000Z", {
        attemptNumber: 1,
        resultStatus: "ACCEPTED",
      }),
    ];
    const scorecard = buildProducerCoreReliabilityScorecard(
      {
        workspaceId: WORKSPACE,
        window: {
          from: "2026-09-01T01:00:00.000Z",
          to: "2026-09-02T00:00:00.000Z",
        },
      },
      baseEvidence(events),
    );

    expect(scorecard.delivery.attemptedCohortSize).toBe(0);
    expect(scorecard.cohorts.byBinding[0]).toMatchObject({
      bindingId: BINDING,
      deliveryAttempted: 0,
      delivered: 0,
      consumerRejected: 0,
      outcomeUnknown: 0,
    });
  });
});
