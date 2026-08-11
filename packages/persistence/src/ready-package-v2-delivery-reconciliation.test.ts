import { describe, expect, it } from "vitest";
import type { ReadyPackageV2DeliveryAuditEvent } from "./ready-package-v2-delivery-audit";
import type { ReadyPackageV2DeliverySubmission } from "./ready-package-v2-delivery-submission";
import { diagnoseReadyPackageV2Delivery } from "./ready-package-v2-delivery-reconciliation";

const WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SUBMISSION = "rvd_01K16TEST000000000000000001";
const PACKAGE = "rdp_01K16TEST000000000000000001";
const REQUEST_SHA = "a".repeat(64);
const CREATED_AT = "2026-08-12T01:00:00.000Z";

function submission(
  overrides: Partial<ReadyPackageV2DeliverySubmission> = {},
): ReadyPackageV2DeliverySubmission {
  return {
    submissionId: SUBMISSION,
    workspaceId: WORKSPACE,
    readyPackageId: PACKAGE,
    readyPackageDigest: "b".repeat(64),
    coreWorkspaceId: "123e4567-e89b-12d3-a456-426614174000",
    idempotencyKey: `ready-package-v2-delivery:${SUBMISSION}`,
    requestJson: '{"frozen":true}',
    requestSha256: REQUEST_SHA,
    contentExportSha256: "c".repeat(64),
    state: "PENDING",
    transportAttempts: 0,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function event(
  sequence: number,
  type: ReadyPackageV2DeliveryAuditEvent["type"],
  overrides: Partial<ReadyPackageV2DeliveryAuditEvent> = {},
): ReadyPackageV2DeliveryAuditEvent {
  return {
    workspaceId: WORKSPACE,
    submissionId: SUBMISSION,
    readyPackageId: PACKAGE,
    sequence,
    type,
    requestSha256: REQUEST_SHA,
    recordedAt: new Date(Date.parse(CREATED_AT) + (sequence - 1) * 60_000).toISOString(),
    ...overrides,
  };
}

function attempt(sequence = 2, attemptNumber = 1): ReadyPackageV2DeliveryAuditEvent {
  return event(sequence, "TRANSPORT_ATTEMPT_STARTED", { attemptNumber });
}

function transportResult(
  sequence = 3,
  status: "RECEIVED" | "ACCEPTED" | "REJECTED" = "ACCEPTED",
  attemptNumber = 1,
): ReadyPackageV2DeliveryAuditEvent {
  return event(sequence, "TRANSPORT_RESULT_RECORDED", { attemptNumber, resultStatus: status });
}

function finalization(
  sequence = 4,
  status: "RECEIVED" | "ACCEPTED" | "REJECTED" = "ACCEPTED",
  attemptNumber = 1,
): ReadyPackageV2DeliveryAuditEvent {
  return event(sequence, "FINALIZED", { attemptNumber, resultStatus: status });
}

function resultEvidence(
  recordedAt: string,
  status: "RECEIVED" | "ACCEPTED" | "REJECTED" = "ACCEPTED",
) {
  return {
    protocolVersion: "1.0" as const,
    objectType: "READY_PACKAGE_V2_DELIVERY_RESULT" as const,
    deliveryId: SUBMISSION,
    readyPackageId: PACKAGE,
    status,
    requestSha256: REQUEST_SHA,
    recordedAt,
  };
}

describe("ReadyPackage V2 delivery reconciliation", () => {
  it("diagnoses PREPARED-only evidence as safe to submit", () => {
    const diagnosis = diagnoseReadyPackageV2Delivery(submission(), [event(1, "PREPARED")]);
    expect(diagnosis.state).toBe("SAFE_TO_SUBMIT");
    expect(diagnosis.recommendedAction).toBe("SUBMIT_FROZEN_REQUEST");
  });

  it("diagnoses a started attempt without durable consumer result as exact-request retry", () => {
    const started = attempt();
    const diagnosis = diagnoseReadyPackageV2Delivery(
      submission({
        transportAttempts: 1,
        lastTransportAttemptedAt: started.recordedAt,
        updatedAt: started.recordedAt,
      }),
      [event(1, "PREPARED"), started],
    );
    expect(diagnosis.state).toBe("OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST");
    expect(diagnosis.recommendedAction).toBe("RETRY_EXACT_FROZEN_REQUEST");
  });

  it("diagnoses an explicit unknown outcome as exact-request retry", () => {
    const started = attempt();
    const unknown = event(3, "TRANSPORT_OUTCOME_UNKNOWN", {
      attemptNumber: 1,
      issueCode: "CORE_V2_DELIVERY_TIMEOUT",
      httpStatus: 504,
    });
    const diagnosis = diagnoseReadyPackageV2Delivery(
      submission({
        transportAttempts: 1,
        lastTransportAttemptedAt: started.recordedAt,
        updatedAt: started.recordedAt,
      }),
      [event(1, "PREPARED"), started, unknown],
    );
    expect(diagnosis.state).toBe("OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST");
  });

  it("requires local-only finalization once a durable consumer result exists", () => {
    const started = attempt();
    const recorded = transportResult();
    const durableResult = resultEvidence(recorded.recordedAt);
    const diagnosis = diagnoseReadyPackageV2Delivery(
      submission({
        transportAttempts: 1,
        lastTransportAttemptedAt: started.recordedAt,
        transportResult: durableResult,
        updatedAt: recorded.recordedAt,
      }),
      [event(1, "PREPARED"), started, recorded],
    );
    expect(diagnosis.state).toBe("LOCAL_FINALIZATION_REQUIRED");
    expect(diagnosis.recommendedAction).toBe("FINALIZE_LOCALLY_NO_NETWORK");
  });

  it("diagnoses durable FINALIZED evidence as delivered", () => {
    const started = attempt();
    const recorded = transportResult();
    const finalized = finalization();
    const diagnosis = diagnoseReadyPackageV2Delivery(
      submission({
        state: "RESULT_RECORDED",
        transportAttempts: 1,
        lastTransportAttemptedAt: started.recordedAt,
        transportResult: resultEvidence(recorded.recordedAt),
        result: resultEvidence(finalized.recordedAt),
        updatedAt: finalized.recordedAt,
      }),
      [event(1, "PREPARED"), started, recorded, finalized],
    );
    expect(diagnosis.state).toBe("DELIVERED");
    expect(diagnosis.recommendedAction).toBe("NONE_DELIVERED");
  });

  it("surfaces consumer rejection instead of retrying or auto-finalizing", () => {
    const started = attempt();
    const recorded = transportResult(3, "REJECTED");
    const finalized = finalization(4, "REJECTED");
    const diagnosis = diagnoseReadyPackageV2Delivery(
      submission({
        state: "RESULT_RECORDED",
        transportAttempts: 1,
        lastTransportAttemptedAt: started.recordedAt,
        transportResult: resultEvidence(recorded.recordedAt, "REJECTED"),
        result: resultEvidence(finalized.recordedAt, "REJECTED"),
        updatedAt: finalized.recordedAt,
      }),
      [event(1, "PREPARED"), started, recorded, finalized],
    );
    expect(diagnosis.state).toBe("CONSUMER_REJECTED");
    expect(diagnosis.recommendedAction).toBe("OPERATOR_REVIEW_CONSUMER_REJECTION");
  });

  it("fails closed on request SHA mismatch", () => {
    const diagnosis = diagnoseReadyPackageV2Delivery(submission(), [
      event(1, "PREPARED", { requestSha256: "d".repeat(64) }),
    ]);
    expect(diagnosis.state).toBe("EVIDENCE_INCONSISTENT");
    expect(diagnosis.issues.map((value) => value.code)).toContain("AUDIT_REQUEST_SHA256_MISMATCH");
  });

  it("fails closed on non-contiguous or non-monotonic audit sequence", () => {
    const started = attempt(3, 1);
    const diagnosis = diagnoseReadyPackageV2Delivery(
      submission({
        transportAttempts: 1,
        lastTransportAttemptedAt: started.recordedAt,
      }),
      [event(1, "PREPARED"), started],
    );
    expect(diagnosis.state).toBe("EVIDENCE_INCONSISTENT");
    expect(diagnosis.issues.map((value) => value.code)).toContain("AUDIT_SEQUENCE_GAP");
  });

  it("fails closed on duplicate or conflicting final evidence", () => {
    const started = attempt();
    const recorded = transportResult();
    const finalized = finalization();
    const duplicate = finalization(5, "RECEIVED", 1);
    const diagnosis = diagnoseReadyPackageV2Delivery(
      submission({
        state: "RESULT_RECORDED",
        transportAttempts: 1,
        lastTransportAttemptedAt: started.recordedAt,
        transportResult: resultEvidence(recorded.recordedAt),
        result: resultEvidence(finalized.recordedAt),
      }),
      [event(1, "PREPARED"), started, recorded, finalized, duplicate],
    );
    expect(diagnosis.state).toBe("EVIDENCE_INCONSISTENT");
    expect(diagnosis.issues.map((value) => value.code)).toContain("AUDIT_DUPLICATE_FINALIZATION");
  });

  it("fails closed rather than fabricating K15 history for legacy mutable state", () => {
    const diagnosis = diagnoseReadyPackageV2Delivery(
      submission({
        state: "RESULT_RECORDED",
        transportAttempts: 1,
        lastTransportAttemptedAt: "2026-08-11T23:59:00.000Z",
        transportResult: resultEvidence("2026-08-11T23:59:30.000Z"),
        result: resultEvidence("2026-08-12T00:00:00.000Z"),
      }),
      [event(1, "PREPARED")],
    );
    expect(diagnosis.state).toBe("EVIDENCE_INCONSISTENT");
    expect(diagnosis.issues.map((value) => value.code)).toContain("LEGACY_AUDIT_INCOMPLETE");
  });
});
