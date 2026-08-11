import type { ReadyPackage } from "@markorbit/contracts";

export type TransportStatus =
  | "NOT_SUBMITTED"
  | "SUBMISSION_PENDING_RESULT"
  | "SUBMISSION_FINALIZATION_PENDING"
  | "ACKNOWLEDGED"
  | "REJECTED"
  | "HANDED_OFF_WITHOUT_RECEIPT";

export type ContentTransportStatus =
  | "WAITING_FOR_INTAKE"
  | "BLOCKED_REJECTED"
  | "READY_TO_DELIVER"
  | "CONTENT_PENDING_RESULT"
  | "CONTENT_FINALIZATION_PENDING"
  | "ACCEPTED";

export function coreIntakeActionRequiresOutboundTransport(
  transportStatus: TransportStatus,
): boolean {
  return (
    transportStatus === "NOT_SUBMITTED" ||
    transportStatus === "REJECTED" ||
    transportStatus === "SUBMISSION_PENDING_RESULT"
  );
}

export function isCoreIntakeActionable(
  readyPackageStatus: ReadyPackage["status"],
  transportStatus: TransportStatus,
  outboundTransportConfigured: boolean,
): boolean {
  const stateActionable =
    transportStatus === "SUBMISSION_PENDING_RESULT" ||
    transportStatus === "SUBMISSION_FINALIZATION_PENDING"
      ? readyPackageStatus === "VERIFIED" || readyPackageStatus === "HANDED_OFF"
      : readyPackageStatus === "VERIFIED" &&
        (transportStatus === "NOT_SUBMITTED" || transportStatus === "REJECTED");

  if (!stateActionable) return false;
  if (!coreIntakeActionRequiresOutboundTransport(transportStatus)) return true;
  return outboundTransportConfigured;
}

export function coreContentActionRequiresOutboundTransport(
  contentStatus: ContentTransportStatus,
): boolean {
  return contentStatus === "READY_TO_DELIVER" || contentStatus === "CONTENT_PENDING_RESULT";
}

export function isCoreContentActionable(
  readyPackageStatus: ReadyPackage["status"],
  contentStatus: ContentTransportStatus,
  outboundTransportConfigured: boolean,
): boolean {
  if (readyPackageStatus !== "HANDED_OFF") return false;
  const stateActionable =
    contentStatus === "READY_TO_DELIVER" ||
    contentStatus === "CONTENT_PENDING_RESULT" ||
    contentStatus === "CONTENT_FINALIZATION_PENDING";
  if (!stateActionable) return false;
  if (!coreContentActionRequiresOutboundTransport(contentStatus)) return true;
  return outboundTransportConfigured;
}
