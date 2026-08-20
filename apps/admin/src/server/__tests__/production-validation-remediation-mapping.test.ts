import { describe, expect, it } from "vitest";
import { exactFoundationalRemediationTarget } from "../production-validation-remediation-mapping";

describe("production validation remediation mapping", () => {
  it("keeps Wave 1 authority-root ids unobserved when no exact coverage target exists", () => {
    expect(
      exactFoundationalRemediationTarget({ id: "us-uspto-trademarks", jurisdiction: "US" }),
    ).toBeNull();
    expect(
      exactFoundationalRemediationTarget({ id: "wo-wipo-trademarks", jurisdiction: "WO" }),
    ).toBeNull();
  });

  it("accepts only exact active foundational coverage target ids in the same jurisdiction", () => {
    expect(
      exactFoundationalRemediationTarget({ id: "us-uspto-trademarks-root", jurisdiction: "us" }),
    ).toEqual({ id: "us-uspto-trademarks-root", jurisdiction: "US" });
    expect(
      exactFoundationalRemediationTarget({ id: "us-uspto-trademarks-root", jurisdiction: "WO" }),
    ).toBeNull();
  });
});
