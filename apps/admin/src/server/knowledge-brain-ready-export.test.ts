import { describe, expect, it, vi } from "vitest";
import type { ReadyPackage, ReadyPackageContentExportV1_1 } from "@markorbit/contracts";
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

function exported(workspaceId: string) {
  return { knowledgeWorkspaceId: workspaceId } as ReadyPackageContentExportV1_1;
}
function dependencies(workspaceId: string, current = true) {
  const exportContent = vi.fn(async () => exported(workspaceId));
  return {
    exportContent,
    value: {
      readyPackages: {
        getById: (id: string, requestedWorkspaceId: string) =>
          id === PACKAGE && requestedWorkspaceId === workspaceId ? readyPackage(workspaceId) : null,
      },
      isCurrentStaging: () => current,
      exportContent,
    },
  };
}

describe("Brain-ready ReadyPackage export", () => {
  it("allows a Workspace to export its own current Knowledge", async () => {
    const deps = dependencies(A);
    const result = await buildBrainReadyPackageExport(
      { viewerWorkspaceId: A, knowledgeWorkspaceId: A, readyPackageId: PACKAGE },
      deps.value,
    );
    expect(result.knowledgeWorkspaceId).toBe(A);
    expect(deps.exportContent).toHaveBeenCalledWith({ workspaceId: A, readyPackageId: PACKAGE });
  });
  it("allows a private Workspace to export current Global Knowledge", async () => {
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

  it("rejects another private Workspace and private Knowledge from Global", async () => {
    await expect(
      buildBrainReadyPackageExport(
        { viewerWorkspaceId: A, knowledgeWorkspaceId: B, readyPackageId: PACKAGE },
        dependencies(B).value,
      ),
    ).rejects.toMatchObject({ code: "BRAIN_READY_EXPORT_WORKSPACE_NOT_VISIBLE" });
    await expect(
      buildBrainReadyPackageExport(
        {
          viewerWorkspaceId: DEFAULT_WORKSPACE.id,
          knowledgeWorkspaceId: A,
          readyPackageId: PACKAGE,
        },
        dependencies(A).value,
      ),
    ).rejects.toMatchObject({ code: "BRAIN_READY_EXPORT_WORKSPACE_NOT_VISIBLE" });
  });
  it("fails closed when the ReadyPackage is no longer current Knowledge", async () => {
    const deps = dependencies(A, false);
    await expect(
      buildBrainReadyPackageExport(
        { viewerWorkspaceId: A, knowledgeWorkspaceId: A, readyPackageId: PACKAGE },
        deps.value,
      ),
    ).rejects.toMatchObject({ code: "BRAIN_READY_EXPORT_NOT_CURRENT" });
    expect(deps.exportContent).not.toHaveBeenCalled();
  });
});
