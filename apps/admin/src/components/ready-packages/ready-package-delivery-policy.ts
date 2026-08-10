import type { ReadyPackage } from "@markorbit/contracts";

export type TransportStatus =
  | "NOT_SUBMITTED"
  | "SUBMISSION_PENDING_RESULT"
  | "SUBMISSION_FINALIZATION_PENDING"
  | "ACKNOWLEDGED"
  | "REJECTED"
  | "HANDED_OFF_WITHOUT_RECEIPT";

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
