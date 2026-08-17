import { describe, expect, it } from "vitest";
import {
  asFullOperatorJurisdiction,
  foundationalAdvancedCapabilities,
  hasFoundationalAdvancedCapability,
} from "./foundational-advanced-capabilities";

describe("foundational Advanced jurisdiction capability gates", () => {
  it("keeps US and WIPO on the full governed operator surface", () => {
    for (const jurisdiction of ["US", "WO"] as const) {
      expect(asFullOperatorJurisdiction(jurisdiction)).toBe(jurisdiction);
      expect(hasFoundationalAdvancedCapability(jurisdiction, "COLLECTION_OPERATOR")).toBe(true);
      expect(hasFoundationalAdvancedCapability(jurisdiction, "COMPATIBILITY_REPROBE")).toBe(true);
      expect(hasFoundationalAdvancedCapability(jurisdiction, "RETRIEVAL_QUALITY_REMEDIATION")).toBe(
        true,
      );
    }
  });

  it("promotes only EU compatibility re-probe while keeping content mutation paths fail-closed", () => {
    expect(asFullOperatorJurisdiction("EU")).toBeNull();
    expect(foundationalAdvancedCapabilities("EU")).toEqual([
      "READINESS_DIAGNOSTICS",
      "RELEVANCE_AUDIT",
      "SUPPLY_HEALTH",
      "COMPATIBILITY_REPROBE",
    ]);
    expect(hasFoundationalAdvancedCapability("EU", "COMPATIBILITY_REPROBE")).toBe(true);
    expect(hasFoundationalAdvancedCapability("EU", "COLLECTION_OPERATOR")).toBe(false);
    expect(hasFoundationalAdvancedCapability("EU", "CONVERSION_RECOVERY")).toBe(false);
    expect(hasFoundationalAdvancedCapability("EU", "VERIFIED_CANONICAL_REINDEX")).toBe(false);
    expect(hasFoundationalAdvancedCapability("EU", "RETRIEVAL_QUALITY_REMEDIATION")).toBe(false);
  });
});
