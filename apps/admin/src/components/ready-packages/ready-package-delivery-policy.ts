import type { ReadyPackage } from "@markorbit/contracts";

export type TransportStatus =
  | "NOT_SUBMITTED"
  | "SUBMISSION_PENDING_RESULT"
  | "SUBMISSION_FINALIZATION_PENDING"
  | "ACKNOWLEDGED"
  | "REJECTED"
  | "HANDED_OFF_WITHOUT_RECEIPT";

export function isCoreIntakeActionable(
  readyPackageStatus: ReadyPackage["status"],
  transportStatus: TransportStatus,
): boolean {
  if (
    transportStatus === "SUBMISSION_PENDING_RESULT" ||
    transportStatus === "SUBMISSION_FINALIZATION_PENDING"
  ) {
    return readyPackageStatus === "VERIFIED" || readyPackageStatus === "HANDED_OFF";
  }
  return (
    readyPackageStatus === "VERIFIED" &&
    (transportStatus === "NOT_SUBMITTED" || transportStatus === "REJECTED")
  );
}
