import { describe, expect, it, vi } from "vitest";
import { runRepresentativeSourceActivationWave } from "../src/representative-source-activation-runner";

function result(
  overrides: Partial<
    Awaited<
      ReturnType<
        NonNullable<
          Parameters<typeof runRepresentativeSourceActivationWave>[0]["activateJurisdiction"]
        >
      >
    >
  > = {},
) {
  return {
    targetCount: 5,
    registeredCount: 5,
    sourcesCreated: 5,
    sourcesReused: 0,
    plansCreated: 5,
    plansReused: 0,
    conversionProfilesCreated: 5,
    conversionProfilesReused: 0,
    capabilityGapCount: 0,
    apiBindingRequirementCount: 0,
    webAttachmentRequirementCount: 0,
    unsupportedArtifactKindCount: 0,
    ...overrides,
  };
}

describe("representative source activation wave", () => {
  it("defaults to a no-mutation plan for the full representative wave", async () => {
    const activateJurisdiction = vi.fn();
    const run = await runRepresentativeSourceActivationWave({
      baseUrl: "http://127.0.0.1:3000/",
      workspaceId: "workspace-1",
      apply: false,
      activateJurisdiction,
    });

    expect(run.mode).toBe("PLAN");
    expect(run.collectionAuthorization).toBe("NONE");
    expect(run.selectedJurisdictions).toEqual([
      "CN",
      "US",
      "IN",
      "JP",
      "KR",
      "GB",
      "CA",
      "AU",
      "BR",
      "AE",
      "EU",
      "CI",
    ]);
    expect(run.summary).toMatchObject({
      planned: 12,
      completed: 0,
      failed: 0,
      capabilityGapCount: 0,
      apiBindingRequirementCount: 0,
      webAttachmentRequirementCount: 0,
      unsupportedArtifactKindCount: 0,
    });
    expect(activateJurisdiction).not.toHaveBeenCalled();
  });

  it("applies selected jurisdictions, aggregates remediation debt and never grants collection authorization", async () => {
    const activateJurisdiction = vi.fn(async ({ jurisdiction }: { jurisdiction: string }) => {
      if (jurisdiction === "EU") throw new Error("EU activation failed");
      return result({
        sourcesCreated: 2,
        plansCreated: 3,
        conversionProfilesCreated: 4,
        capabilityGapCount: 3,
        apiBindingRequirementCount: 2,
        webAttachmentRequirementCount: 1,
        unsupportedArtifactKindCount: 1,
      });
    });

    const run = await runRepresentativeSourceActivationWave({
      baseUrl: "https://knowledge.example.com/control/",
      workspaceId: "workspace-1",
      apply: true,
      jurisdictions: ["EU", "CN", "EU"],
      activateJurisdiction,
    });

    expect(run.controlPlaneUrl).toBe("https://knowledge.example.com/control");
    expect(run.selectedJurisdictions).toEqual(["CN", "EU"]);
    expect(run.entries.map((entry) => [entry.jurisdiction, entry.state])).toEqual([
      ["CN", "COMPLETED"],
      ["EU", "FAILED"],
    ]);
    expect(run.collectionAuthorization).toBe("NONE");
    expect(run.summary).toEqual({
      planned: 0,
      completed: 1,
      failed: 1,
      sourcesCreated: 2,
      plansCreated: 3,
      conversionProfilesCreated: 4,
      capabilityGapCount: 3,
      apiBindingRequirementCount: 2,
      webAttachmentRequirementCount: 1,
      unsupportedArtifactKindCount: 1,
    });
    expect(activateJurisdiction).toHaveBeenCalledTimes(2);
  });

  it("rejects jurisdictions outside the representative activation wave before mutation", async () => {
    const activateJurisdiction = vi.fn();
    await expect(
      runRepresentativeSourceActivationWave({
        baseUrl: "http://127.0.0.1:3000",
        workspaceId: "workspace-1",
        apply: true,
        jurisdictions: ["FR"],
        activateJurisdiction,
      }),
    ).rejects.toThrow("Unsupported representative jurisdiction: FR");
    expect(activateJurisdiction).not.toHaveBeenCalled();
  });
});
