import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import {
  parseProductionValidationManifest,
  resolveProductionValidationWorkspaceId,
} from "../production-validation-wave";

const manifest = {
  manifestVersion: "1.0",
  waveId: "official-wave-1",
  governance: {
    collectionAuthorizationRequired: true,
    discoveryDoesNotActivateSource: true,
    noAutomaticProductionScheduling: true,
    realObservationsOnly: true,
  },
  targets: [
    {
      id: "wo-wipo-trademarks",
      jurisdiction: "WO",
      authority: "World Intellectual Property Organization",
      canonicalUri: "https://www.wipo.int/en/web/trademarks",
      sourceClass: "OFFICIAL_AUTHORITY",
      priority: "P0",
      validationState: "PENDING_REAL_RUN",
    },
  ],
};

describe("production validation audit guards", () => {
  it("defaults to the only supported production validation workspace", () => {
    expect(resolveProductionValidationWorkspaceId(undefined)).toBe(DEFAULT_WORKSPACE.id);
    expect(resolveProductionValidationWorkspaceId(DEFAULT_WORKSPACE.id)).toBe(DEFAULT_WORKSPACE.id);
  });

  it("rejects unsupported workspaces instead of pretending discovery is workspace-aware", () => {
    expect(() => resolveProductionValidationWorkspaceId("wsp_other")).toThrow(
      /currently supports only workspace/,
    );
  });

  it("runs the complete manifest validator on GET-side parsing", () => {
    expect(parseProductionValidationManifest(manifest).targets[0]?.priority).toBe("P0");
    expect(() =>
      parseProductionValidationManifest({
        ...manifest,
        governance: { ...manifest.governance, realObservationsOnly: false },
      }),
    ).toThrow(/governance boundaries are required/);
  });
});
