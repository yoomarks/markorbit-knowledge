import { describe, expect, it } from "vitest";
import {
  coreContentActionRequiresOutboundTransport,
  coreIntakeActionRequiresOutboundTransport,
  isCoreContentActionable,
  isCoreIntakeActionable,
} from "./ready-package-delivery-policy";

describe("ReadyPackage delivery workbench Core intake eligibility", () => {
  it("keeps configured VERIFIED delivery actions available", () => {
    expect(isCoreIntakeActionable("VERIFIED", "NOT_SUBMITTED", true)).toBe(true);
    expect(isCoreIntakeActionable("VERIFIED", "REJECTED", true)).toBe(true);
    expect(isCoreIntakeActionable("VERIFIED", "SUBMISSION_PENDING_RESULT", true)).toBe(true);
    expect(isCoreIntakeActionable("VERIFIED", "SUBMISSION_FINALIZATION_PENDING", true)).toBe(true);
  });

  it("allows a HANDED_OFF package to recover an existing pending submission", () => {
    expect(isCoreIntakeActionable("HANDED_OFF", "SUBMISSION_PENDING_RESULT", true)).toBe(true);
    expect(isCoreIntakeActionable("HANDED_OFF", "SUBMISSION_FINALIZATION_PENDING", true)).toBe(
      true,
    );
  });

  it("blocks only HTTP-dependent actions when outbound transport is not configured", () => {
    expect(coreIntakeActionRequiresOutboundTransport("NOT_SUBMITTED")).toBe(true);
    expect(coreIntakeActionRequiresOutboundTransport("REJECTED")).toBe(true);
    expect(coreIntakeActionRequiresOutboundTransport("SUBMISSION_PENDING_RESULT")).toBe(true);
    expect(coreIntakeActionRequiresOutboundTransport("SUBMISSION_FINALIZATION_PENDING")).toBe(
      false,
    );

    expect(isCoreIntakeActionable("VERIFIED", "NOT_SUBMITTED", false)).toBe(false);
    expect(isCoreIntakeActionable("VERIFIED", "REJECTED", false)).toBe(false);
    expect(isCoreIntakeActionable("VERIFIED", "SUBMISSION_PENDING_RESULT", false)).toBe(false);
    expect(isCoreIntakeActionable("HANDED_OFF", "SUBMISSION_PENDING_RESULT", false)).toBe(false);
    expect(isCoreIntakeActionable("VERIFIED", "SUBMISSION_FINALIZATION_PENDING", false)).toBe(true);
    expect(isCoreIntakeActionable("HANDED_OFF", "SUBMISSION_FINALIZATION_PENDING", false)).toBe(
      true,
    );
  });

  it("does not reopen completed or legacy handoffs", () => {
    expect(isCoreIntakeActionable("HANDED_OFF", "ACKNOWLEDGED", true)).toBe(false);
    expect(isCoreIntakeActionable("HANDED_OFF", "HANDED_OFF_WITHOUT_RECEIPT", true)).toBe(false);
    expect(isCoreIntakeActionable("HANDED_OFF", "NOT_SUBMITTED", true)).toBe(false);
  });
});

describe("ReadyPackage delivery workbench Core content eligibility", () => {
  it("allows explicit content delivery only after durable handoff", () => {
    expect(isCoreContentActionable("HANDED_OFF", "READY_TO_DELIVER", true)).toBe(true);
    expect(isCoreContentActionable("VERIFIED", "READY_TO_DELIVER", true)).toBe(false);
    expect(isCoreContentActionable("HANDED_OFF", "WAITING_FOR_INTAKE", true)).toBe(false);
    expect(isCoreContentActionable("HANDED_OFF", "BLOCKED_REJECTED", true)).toBe(false);
    expect(isCoreContentActionable("HANDED_OFF", "ACCEPTED", true)).toBe(false);
  });

  it("retries an uncertain frozen content request only when outbound config is available", () => {
    expect(coreContentActionRequiresOutboundTransport("CONTENT_PENDING_RESULT")).toBe(true);
    expect(isCoreContentActionable("HANDED_OFF", "CONTENT_PENDING_RESULT", true)).toBe(true);
    expect(isCoreContentActionable("HANDED_OFF", "CONTENT_PENDING_RESULT", false)).toBe(false);
  });

  it("allows local content finalization without current outbound configuration", () => {
    expect(coreContentActionRequiresOutboundTransport("CONTENT_FINALIZATION_PENDING")).toBe(false);
    expect(isCoreContentActionable("HANDED_OFF", "CONTENT_FINALIZATION_PENDING", false)).toBe(true);
  });
});
