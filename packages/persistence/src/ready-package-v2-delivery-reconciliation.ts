import type { ReadyPackageV2DeliveryAuditEvent } from "./ready-package-v2-delivery-audit";
import type { ReadyPackageV2DeliverySubmission } from "./ready-package-v2-delivery-submission";

export const READY_PACKAGE_V2_DELIVERY_DIAGNOSIS_STATES = [
  "SAFE_TO_SUBMIT",
  "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST",
  "LOCAL_FINALIZATION_REQUIRED",
  "DELIVERED",
  "CONSUMER_REJECTED",
  "EVIDENCE_INCONSISTENT",
] as const;

export type ReadyPackageV2DeliveryDiagnosisState =
  (typeof READY_PACKAGE_V2_DELIVERY_DIAGNOSIS_STATES)[number];

export type ReadyPackageV2DeliveryRecommendedAction =
  | "SUBMIT_FROZEN_REQUEST"
  | "RETRY_EXACT_FROZEN_REQUEST"
  | "FINALIZE_LOCALLY_NO_NETWORK"
  | "NONE_DELIVERED"
  | "OPERATOR_REVIEW_CONSUMER_REJECTION"
  | "BLOCK_AND_REVIEW_EVIDENCE";

export type ReadyPackageV2DeliveryDiagnosisIssue = {
  code: string;
  message: string;
  sequence?: number;
};

export type ReadyPackageV2DeliveryDiagnosis = {
  state: ReadyPackageV2DeliveryDiagnosisState;
  recommendedAction: ReadyPackageV2DeliveryRecommendedAction;
  issues: ReadyPackageV2DeliveryDiagnosisIssue[];
  evidence: {
    auditEventCount: number;
    transportAttemptCount: number;
    lastAttemptNumber: number | null;
    consumerResultStatus: "RECEIVED" | "ACCEPTED" | "REJECTED" | null;
    finalizedResultStatus: "RECEIVED" | "ACCEPTED" | "REJECTED" | null;
  };
};

function issue(
  issues: ReadyPackageV2DeliveryDiagnosisIssue[],
  code: string,
  message: string,
  sequence?: number,
): void {
  issues.push({ code, message, ...(sequence === undefined ? {} : { sequence }) });
}

function evidence(
  auditEvents: ReadyPackageV2DeliveryAuditEvent[],
  transportAttemptCount: number,
  lastAttemptNumber: number | null,
  consumerResultStatus: ReadyPackageV2DeliveryDiagnosis["evidence"]["consumerResultStatus"],
  finalizedResultStatus: ReadyPackageV2DeliveryDiagnosis["evidence"]["finalizedResultStatus"],
): ReadyPackageV2DeliveryDiagnosis["evidence"] {
  return {
    auditEventCount: auditEvents.length,
    transportAttemptCount,
    lastAttemptNumber,
    consumerResultStatus,
    finalizedResultStatus,
  };
}

function inconsistent(
  auditEvents: ReadyPackageV2DeliveryAuditEvent[],
  issues: ReadyPackageV2DeliveryDiagnosisIssue[],
  transportAttemptCount: number,
  lastAttemptNumber: number | null,
  consumerResultStatus: ReadyPackageV2DeliveryDiagnosis["evidence"]["consumerResultStatus"],
  finalizedResultStatus: ReadyPackageV2DeliveryDiagnosis["evidence"]["finalizedResultStatus"],
): ReadyPackageV2DeliveryDiagnosis {
  return {
    state: "EVIDENCE_INCONSISTENT",
    recommendedAction: "BLOCK_AND_REVIEW_EVIDENCE",
    issues,
    evidence: evidence(
      auditEvents,
      transportAttemptCount,
      lastAttemptNumber,
      consumerResultStatus,
      finalizedResultStatus,
    ),
  };
}

function sameResultEvidence(
  event: ReadyPackageV2DeliveryAuditEvent,
  result: ReadyPackageV2DeliverySubmission["transportResult"] | ReadyPackageV2DeliverySubmission["result"],
): boolean {
  return Boolean(
    result &&
      result.deliveryId === event.submissionId &&
      result.readyPackageId === event.readyPackageId &&
      result.requestSha256 === event.requestSha256 &&
      result.status === event.resultStatus &&
      result.recordedAt === event.recordedAt,
  );
}

/**
 * Derive the operator-visible V2 delivery state exclusively from frozen submission metadata
 * plus append-only audit evidence. This helper is deliberately read-only: it never repairs,
 * retries, finalizes, or infers missing history.
 */
export function diagnoseReadyPackageV2Delivery(
  submission: ReadyPackageV2DeliverySubmission,
  auditEvents: ReadyPackageV2DeliveryAuditEvent[],
): ReadyPackageV2DeliveryDiagnosis {
  const issues: ReadyPackageV2DeliveryDiagnosisIssue[] = [];
  let transportAttemptCount = 0;
  let lastAttemptNumber: number | null = null;
  let lastAttemptRecordedAt: string | null = null;
  let consumerResult: ReadyPackageV2DeliveryAuditEvent | null = null;
  let finalized: ReadyPackageV2DeliveryAuditEvent | null = null;
  const unknownAttempts = new Set<number>();

  if (auditEvents.length === 0) {
    issue(
      issues,
      "AUDIT_PREPARED_MISSING",
      "No durable PREPARED audit evidence exists for the frozen delivery request",
    );
  }

  let priorRecordedAt: string | null = null;
  for (let index = 0; index < auditEvents.length; index += 1) {
    const event = auditEvents[index]!;
    const expectedSequence = index + 1;

    if (event.sequence !== expectedSequence) {
      issue(
        issues,
        event.sequence > expectedSequence ? "AUDIT_SEQUENCE_GAP" : "AUDIT_SEQUENCE_NON_MONOTONIC",
        `Audit sequence must be contiguous from 1; expected ${expectedSequence}`,
        event.sequence,
      );
    }
    if (
      event.workspaceId !== submission.workspaceId ||
      event.submissionId !== submission.submissionId ||
      event.readyPackageId !== submission.readyPackageId
    ) {
      issue(
        issues,
        "AUDIT_IDENTITY_MISMATCH",
        "Audit evidence does not belong to the frozen delivery submission",
        event.sequence,
      );
    }
    if (event.requestSha256 !== submission.requestSha256) {
      issue(
        issues,
        "AUDIT_REQUEST_SHA256_MISMATCH",
        "Audit evidence does not reference the exact frozen request SHA-256",
        event.sequence,
      );
    }
    if (priorRecordedAt && Date.parse(event.recordedAt) < Date.parse(priorRecordedAt)) {
      issue(
        issues,
        "AUDIT_TIME_NON_MONOTONIC",
        "Audit event timestamps move backwards",
        event.sequence,
      );
    }
    priorRecordedAt = event.recordedAt;

    if (event.type === "PREPARED") {
      if (index !== 0) {
        issue(
          issues,
          "AUDIT_PREPARED_NOT_FIRST",
          "PREPARED must be the first and only preparation event",
          event.sequence,
        );
      }
      if (event.recordedAt !== submission.createdAt) {
        issue(
          issues,
          "AUDIT_PREPARED_TIMESTAMP_MISMATCH",
          "PREPARED timestamp does not match the frozen submission creation time",
          event.sequence,
        );
      }
      continue;
    }

    if (index === 0 || auditEvents[0]?.type !== "PREPARED") {
      issue(
        issues,
        "AUDIT_PREPARED_MISSING",
        "Transport evidence exists without a leading PREPARED event",
        event.sequence,
      );
    }

    if (finalized) {
      issue(
        issues,
        "AUDIT_EVENT_AFTER_FINALIZATION",
        "No delivery audit event may occur after durable FINALIZED evidence",
        event.sequence,
      );
    }

    if (event.type === "TRANSPORT_ATTEMPT_STARTED") {
      const expectedAttempt = transportAttemptCount + 1;
      if (consumerResult) {
        issue(
          issues,
          "AUDIT_ATTEMPT_AFTER_RESULT",
          "A new outbound attempt cannot start after a durable consumer result",
          event.sequence,
        );
      }
      if (event.attemptNumber !== expectedAttempt) {
        issue(
          issues,
          "AUDIT_ATTEMPT_NON_MONOTONIC",
          `Transport attempt number must advance exactly once; expected ${expectedAttempt}`,
          event.sequence,
        );
      }
      transportAttemptCount += 1;
      lastAttemptNumber = event.attemptNumber ?? null;
      lastAttemptRecordedAt = event.recordedAt;
      continue;
    }

    if (event.type === "TRANSPORT_OUTCOME_UNKNOWN") {
      if (
        lastAttemptNumber === null ||
        event.attemptNumber !== lastAttemptNumber ||
        event.attemptNumber !== transportAttemptCount
      ) {
        issue(
          issues,
          "AUDIT_UNKNOWN_WITHOUT_CURRENT_ATTEMPT",
          "Unknown transport outcome must reference the current durable attempt",
          event.sequence,
        );
      }
      if (event.attemptNumber !== undefined && unknownAttempts.has(event.attemptNumber)) {
        issue(
          issues,
          "AUDIT_DUPLICATE_UNKNOWN_OUTCOME",
          "Only one unknown-outcome event is allowed per transport attempt",
          event.sequence,
        );
      }
      if (consumerResult) {
        issue(
          issues,
          "AUDIT_UNKNOWN_AFTER_RESULT",
          "Unknown outcome cannot be recorded after a durable consumer result",
          event.sequence,
        );
      }
      if (event.attemptNumber !== undefined) unknownAttempts.add(event.attemptNumber);
      continue;
    }

    if (event.type === "TRANSPORT_RESULT_RECORDED") {
      if (consumerResult) {
        issue(
          issues,
          "AUDIT_DUPLICATE_CONSUMER_RESULT",
          "Only one durable consumer result is allowed for a delivery",
          event.sequence,
        );
      }
      if (
        lastAttemptNumber === null ||
        event.attemptNumber !== lastAttemptNumber ||
        event.attemptNumber !== transportAttemptCount
      ) {
        issue(
          issues,
          "AUDIT_RESULT_WITHOUT_CURRENT_ATTEMPT",
          "Consumer result must reference the current durable transport attempt",
          event.sequence,
        );
      }
      if (event.attemptNumber !== undefined && unknownAttempts.has(event.attemptNumber)) {
        issue(
          issues,
          "AUDIT_RESULT_AFTER_UNKNOWN_SAME_ATTEMPT",
          "A transport attempt already recorded as outcome-unknown cannot later gain a consumer result",
          event.sequence,
        );
      }
      consumerResult = event;
      continue;
    }

    if (event.type === "FINALIZED") {
      if (finalized) {
        issue(
          issues,
          "AUDIT_DUPLICATE_FINALIZATION",
          "Only one durable FINALIZED event is allowed for a delivery",
          event.sequence,
        );
      }
      if (!consumerResult) {
        issue(
          issues,
          "AUDIT_FINALIZATION_WITHOUT_RESULT",
          "FINALIZED requires a durable consumer result",
          event.sequence,
        );
      } else if (
        event.attemptNumber !== consumerResult.attemptNumber ||
        event.resultStatus !== consumerResult.resultStatus
      ) {
        issue(
          issues,
          "AUDIT_FINALIZATION_RESULT_MISMATCH",
          "FINALIZED must match the exact durable consumer result and attempt",
          event.sequence,
        );
      }
      finalized = event;
    }
  }

  if (auditEvents[0]?.type !== "PREPARED") {
    issue(
      issues,
      "AUDIT_PREPARED_MISSING",
      "The audit timeline must begin with PREPARED evidence",
      auditEvents[0]?.sequence,
    );
  }
  if (auditEvents.filter((event) => event.type === "PREPARED").length !== 1) {
    issue(
      issues,
      "AUDIT_PREPARED_CARDINALITY_INVALID",
      "Exactly one PREPARED event is required",
    );
  }

  if (submission.transportAttempts !== transportAttemptCount) {
    issue(
      issues,
      "SUBMISSION_ATTEMPT_COUNT_MISMATCH",
      "Submission transport attempt count does not match append-only audit evidence",
    );
  }
  if (transportAttemptCount === 0) {
    if (submission.lastTransportAttemptedAt !== undefined) {
      issue(
        issues,
        "SUBMISSION_LAST_ATTEMPT_WITHOUT_AUDIT",
        "Submission has a last-attempt timestamp without durable attempt evidence",
      );
    }
  } else if (submission.lastTransportAttemptedAt !== lastAttemptRecordedAt) {
    issue(
      issues,
      "SUBMISSION_LAST_ATTEMPT_TIMESTAMP_MISMATCH",
      "Submission last-attempt timestamp does not match the latest durable attempt",
    );
  }

  if (consumerResult) {
    if (!sameResultEvidence(consumerResult, submission.transportResult)) {
      issue(
        issues,
        "SUBMISSION_TRANSPORT_RESULT_MISMATCH",
        "Submission transport result does not match durable consumer-result evidence",
        consumerResult.sequence,
      );
    }
  } else if (submission.transportResult !== undefined) {
    issue(
      issues,
      "LEGACY_AUDIT_INCOMPLETE",
      "Submission contains a transport result that is absent from append-only audit evidence",
    );
  }

  if (finalized) {
    if (submission.state !== "RESULT_RECORDED" || !sameResultEvidence(finalized, submission.result)) {
      issue(
        issues,
        "SUBMISSION_FINALIZATION_MISMATCH",
        "Submission final state does not match durable FINALIZED evidence",
        finalized.sequence,
      );
    }
  } else if (submission.state === "RESULT_RECORDED" || submission.result !== undefined) {
    issue(
      issues,
      "LEGACY_AUDIT_INCOMPLETE",
      "Submission is finalized but append-only FINALIZED evidence is absent",
    );
  }

  const consumerResultStatus = consumerResult?.resultStatus ?? null;
  const finalizedResultStatus = finalized?.resultStatus ?? null;
  if (issues.length > 0) {
    return inconsistent(
      auditEvents,
      issues,
      transportAttemptCount,
      lastAttemptNumber,
      consumerResultStatus,
      finalizedResultStatus,
    );
  }

  if (consumerResultStatus === "REJECTED") {
    return {
      state: "CONSUMER_REJECTED",
      recommendedAction: "OPERATOR_REVIEW_CONSUMER_REJECTION",
      issues: [],
      evidence: evidence(
        auditEvents,
        transportAttemptCount,
        lastAttemptNumber,
        consumerResultStatus,
        finalizedResultStatus,
      ),
    };
  }
  if (finalized) {
    return {
      state: "DELIVERED",
      recommendedAction: "NONE_DELIVERED",
      issues: [],
      evidence: evidence(
        auditEvents,
        transportAttemptCount,
        lastAttemptNumber,
        consumerResultStatus,
        finalizedResultStatus,
      ),
    };
  }
  if (consumerResult) {
    return {
      state: "LOCAL_FINALIZATION_REQUIRED",
      recommendedAction: "FINALIZE_LOCALLY_NO_NETWORK",
      issues: [],
      evidence: evidence(
        auditEvents,
        transportAttemptCount,
        lastAttemptNumber,
        consumerResultStatus,
        finalizedResultStatus,
      ),
    };
  }
  if (transportAttemptCount > 0) {
    return {
      state: "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST",
      recommendedAction: "RETRY_EXACT_FROZEN_REQUEST",
      issues: [],
      evidence: evidence(
        auditEvents,
        transportAttemptCount,
        lastAttemptNumber,
        consumerResultStatus,
        finalizedResultStatus,
      ),
    };
  }
  return {
    state: "SAFE_TO_SUBMIT",
    recommendedAction: "SUBMIT_FROZEN_REQUEST",
    issues: [],
    evidence: evidence(
      auditEvents,
      transportAttemptCount,
      lastAttemptNumber,
      consumerResultStatus,
      finalizedResultStatus,
    ),
  };
}
