import { describe, expect, it } from "vitest";
import type { ReadyPackage } from "@markorbit/contracts";
import {
  createCoreIntakeRequest,
  createCoreIntakeRequestPreview,
} from "../src/core-intake-adapter";

const DIGEST = "a".repeat(64);

function readyPackage(): ReadyPackage {
  return {
    id: "rdp_test",
    workspaceId: "wsp_test",
    status: "VERIFIED",
    evidence: {
      artifactIds: ["art_test"],
      stagingDocumentId: "stg_test",
      digest: DIGEST,
      legalTruthVerified: false,
    },
    createdAt: "2026-08-10T00:00:00.000Z",
    verifiedAt: "2026-08-10T00:01:00.000Z",
  };
}

describe("Core intake request boundary", () => {
  it("previews the handoff envelope without inventing a submission timestamp", () => {
    const preview = createCoreIntakeRequestPreview(readyPackage());

    expect(preview).toEqual({
      readyPackageId: "rdp_test",
      workspaceId: "wsp_test",
      digest: DIGEST,
      evidence: {
        artifactIds: ["art_test"],
        stagingDocumentId: "stg_test",
      },
    });
    expect(preview).not.toHaveProperty("submittedAt");
  });

  it("uses only an explicit submission timestamp for a real Core intake request", () => {
    const submittedAt = "2026-08-10T00:05:00.000Z";
    const request = createCoreIntakeRequest(readyPackage(), submittedAt);

    expect(request.submittedAt).toBe(submittedAt);
    expect(request.submittedAt).not.toBe(readyPackage().createdAt);
  });
});
