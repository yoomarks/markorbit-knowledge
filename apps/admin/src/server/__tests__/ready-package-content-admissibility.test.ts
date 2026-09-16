import { describe, expect, it } from "vitest";
import type {
  CurrentGovernedKnowledgeV1,
  KnowledgeAdmissibilityReasonCode,
} from "@markorbit/contracts";
import { assertReadyPackageContentConsumerAdmissible } from "../ready-package-content-export";

const READY_PACKAGE_ID = "rdp_current";

function projection(
  reasonCodes: KnowledgeAdmissibilityReasonCode[] = [],
): CurrentGovernedKnowledgeV1 {
  const consumerAdmissible = reasonCodes.length === 0;
  return {
    protocolVersion: "1.0",
    objectType: "CURRENT_GOVERNED_KNOWLEDGE",
    workspaceId: "wsp_private",
    stagingDocumentId: "std_current",
    sourceId: "src_current",
    readyPackageId: READY_PACKAGE_ID,
    states: {
      current: !reasonCodes.includes("CONTENT_NOT_CURRENT"),
      verified: !reasonCodes.some((code) => code.startsWith("VERIFICATION_")),
      consumerAdmissible,
      delivered: false,
    },
    reasonCodes,
  };
}

describe("ReadyPackage Content Export governed-current gate", () => {
  it("accepts only the exact consumer-admissible ReadyPackage", () => {
    expect(() =>
      assertReadyPackageContentConsumerAdmissible(projection(), READY_PACKAGE_ID),
    ).not.toThrow();
  });

  it.each([
    "CONTENT_NOT_CURRENT",
    "WORKSPACE_INACTIVE",
    "SOURCE_ARCHIVED",
    "VERIFICATION_NOT_ACCEPTABLE",
    "CORPUS_NOT_VISIBLE",
  ] as const)("fails closed with exact reason code %s", (code) => {
    expect(() =>
      assertReadyPackageContentConsumerAdmissible(projection([code]), READY_PACKAGE_ID),
    ).toThrowError(expect.objectContaining({ code }));
  });

  it("fails closed when an admissible projection points at a different ReadyPackage", () => {
    expect(() =>
      assertReadyPackageContentConsumerAdmissible(projection(), "rdp_other"),
    ).toThrowError(expect.objectContaining({ code: "CONTENT_NOT_CURRENT" }));
  });
});
