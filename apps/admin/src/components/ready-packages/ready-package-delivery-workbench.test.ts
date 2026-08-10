import { describe, expect, it } from "vitest";
import { isCoreIntakeActionable } from "./ready-package-delivery-policy";

describe("ReadyPackage delivery workbench Core intake eligibility", () => {
  it("keeps normal VERIFIED delivery actions available", () => {
    expect(isCoreIntakeActionable("VERIFIED", "NOT_SUBMITTED")).toBe(true);
    expect(isCoreIntakeActionable("VERIFIED", "REJECTED")).toBe(true);
    expect(isCoreIntakeActionable("VERIFIED", "SUBMISSION_PENDING_RESULT")).toBe(true);
    expect(isCoreIntakeActionable("VERIFIED", "SUBMISSION_FINALIZATION_PENDING")).toBe(true);
  });

  it("allows a HANDED_OFF package to recover an existing pending submission", () => {
    expect(isCoreIntakeActionable("HANDED_OFF", "SUBMISSION_PENDING_RESULT")).toBe(true);
    expect(isCoreIntakeActionable("HANDED_OFF", "SUBMISSION_FINALIZATION_PENDING")).toBe(true);
  });

  it("does not reopen completed or legacy handoffs", () => {
    expect(isCoreIntakeActionable("HANDED_OFF", "ACKNOWLEDGED")).toBe(false);
    expect(isCoreIntakeActionable("HANDED_OFF", "HANDED_OFF_WITHOUT_RECEIPT")).toBe(false);
    expect(isCoreIntakeActionable("HANDED_OFF", "NOT_SUBMITTED")).toBe(false);
  });
});
