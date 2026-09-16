import { describe, expect, it, vi } from "vitest";
import type {
  CurrentGovernedKnowledgeV1,
  KnowledgeAdmissibilityReasonCode,
  ReadyPackage,
  ReadyPackageContentExportV1_1,
} from "@markorbit/contracts";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { buildBrainReadyPackageExport } from "./knowledge-brain-ready-export";

const A = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAA";
const B = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAB";
const PACKAGE = "rdp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const STAGING = "std_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function readyPackage(workspaceId: string): ReadyPackage {
  return {
    id: PACKAGE,
    workspaceId,
    status: "VERIFIED",
    evidence: { artifactIds: [], stagingDocumentId: STAGING, digest: "a".repeat(64) },
    createdAt: "2026-09-13T00:00:00.000Z",
  };
}
function governed(
  workspaceId: string,
  reasonCodes: readonly KnowledgeAdmissibilityReasonCode[] = [],
): CurrentGovernedKnowledgeV1 {
  const admissible = reasonCodes.length === 0;
  return {
    protocolVersion: "1.0",
    objectType: "CURRENT_GOVERNED_KNOWLEDGE",
    workspaceId,
    stagingDocumentId: STAGING,
    sourceId: "src_test",
    readyPackageId: PACKAGE,
    states: {
      current: !reasonCodes.includes("CONTENT_NOT_CURRENT"),
      verified: !reasonCodes.some((code) => code.startsWith("VERIFICATION_")),
      consumerAdmissible: admissible,
      delivered: false,
    },
    reasonCodes,
  };
}

function exported(workspaceId: string) {
  return { knowledgeWorkspaceId: workspaceId } as ReadyPackageContentExportV1_1;
}
function dependencies(
  workspaceId: string,
  reasonCodes: readonly KnowledgeAdmissibilityReasonCode[] = [],
) {
  const exportContent = vi.fn(async () => exported(workspaceId));
  return {
    exportContent,
    value: {
      readyPackages: {
        getById: (id: string, requestedWorkspaceId: string) =>
          id === PACKAGE && requestedWorkspaceId === workspaceId ? readyPackage(workspaceId) : null,
      },
      projectGovernance: () => governed(workspaceId, reasonCodes),
      exportContent,
    },
  };
}

describe("Brain-ready ReadyPackage export", () => {
  it("allows a Workspace to export its own governed Knowledge", async () => {
    const deps = dependencies(A);
    const result = await buildBrainReadyPackageExport(
      { viewerWorkspaceId: A, knowledgeWorkspaceId: A, readyPackageId: PACKAGE },
      deps.value,
    );
    expect(result.knowledgeWorkspaceId).toBe(A);
    expect(deps.exportContent).toHaveBeenCalledWith({ workspaceId: A, readyPackageId: PACKAGE });
  });

  it("allows a private Workspace to export governed Global Knowledge", async () => {
    const deps = dependencies(DEFAULT_WORKSPACE.id);
    const result = await buildBrainReadyPackageExport(
      {
        viewerWorkspaceId: A,
        knowledgeWorkspaceId: DEFAULT_WORKSPACE.id,
        readyPackageId: PACKAGE,
      },
      deps.value,
    );
    expect(result.knowledgeWorkspaceId).toBe(DEFAULT_WORKSPACE.id);
  });

  it("fails with the canonical visibility reason code", async () => {
    const deps = dependencies(B, ["CORPUS_NOT_VISIBLE"]);
    await expect(
      buildBrainReadyPackageExport(
        { viewerWorkspaceId: A, knowledgeWorkspaceId: B, readyPackageId: PACKAGE },
        deps.value,
      ),
    ).rejects.toMatchObject({ code: "CORPUS_NOT_VISIBLE" });
    expect(deps.exportContent).not.toHaveBeenCalled();
  });
  it("fails stale and unverified exports with bounded reason codes", async () => {
    for (const reason of [
      "CONTENT_NOT_CURRENT",
      "WORKSPACE_INACTIVE",
      "SOURCE_ARCHIVED",
      "VERIFICATION_MISSING",
      "VERIFICATION_NOT_ACCEPTABLE",
    ] as const) {
      const deps = dependencies(A, [reason]);
      await expect(
        buildBrainReadyPackageExport(
          { viewerWorkspaceId: A, knowledgeWorkspaceId: A, readyPackageId: PACKAGE },
          deps.value,
        ),
      ).rejects.toMatchObject({ code: reason });
      expect(deps.exportContent).not.toHaveBeenCalled();
    }
  });
});
