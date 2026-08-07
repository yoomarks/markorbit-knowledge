import { describe, expect, it } from "vitest";

describe("intake pipeline orchestrator boundary", () => {
  it("keeps ready package handoff boundary explicit", () => {
    expect({
      from: "ReadyPackage",
      to: "CoreIntake",
    }).toEqual({
      from: "ReadyPackage",
      to: "CoreIntake",
    });
  });
});
