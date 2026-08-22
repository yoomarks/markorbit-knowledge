import { describe, expect, it } from "vitest";
import {
  isAllowedAcquisitionPromotionTransition,
  nextAcquisitionPromotionStage,
} from "../src/acquisition-strategy-governance-v1";

describe("acquisition strategy governance v1", () => {
  it("keeps the promotion lifecycle sequential and explicit", () => {
    expect(nextAcquisitionPromotionStage("OBSERVED")).toBe("CANDIDATE");
    expect(nextAcquisitionPromotionStage("CANDIDATE")).toBe("VALIDATED");
    expect(nextAcquisitionPromotionStage("VALIDATED")).toBe("PROMOTED");
    expect(nextAcquisitionPromotionStage("PROMOTED")).toBe("ACTIVE");
    expect(nextAcquisitionPromotionStage("ACTIVE")).toBe("DEPRECATED");
    expect(nextAcquisitionPromotionStage("DEPRECATED")).toBeNull();

    expect(isAllowedAcquisitionPromotionTransition("OBSERVED", "CANDIDATE")).toBe(true);
    expect(isAllowedAcquisitionPromotionTransition("OBSERVED", "VALIDATED")).toBe(false);
    expect(isAllowedAcquisitionPromotionTransition("CANDIDATE", "ACTIVE")).toBe(false);
  });
});
