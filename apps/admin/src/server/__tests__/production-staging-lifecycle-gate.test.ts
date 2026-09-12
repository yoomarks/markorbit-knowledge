import { describe, expect, it, vi } from "vitest";
import {
  commitProductionStagingWithDependencies,
  type ProductionStagingCommitDependencies,
  type ProductionStagingCommitInput,
} from "../production-conversion-worker-service";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const sourceId = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const artifactId = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";

const input: ProductionStagingCommitInput = {
  workspaceId,
  workerId: "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  conversionRunId: "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  conversionAttemptId: "cva_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  uploadGrantId: "sug_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  idempotencyKey: "workspace-file-lifecycle-gate",
  content: new TextEncoder().encode("# blocked before staging"),
};
describe("Production staging lifecycle gate", () => {
  it("rejects an in-flight conversion when the Workspace is no longer ACTIVE", () => {
    const stagingIngest = vi.fn();
    const dependencies = {
      workers: { verifyCredential: () => ({ workspaceId }) },
      workspaces: {
        getById: () => ({ id: workspaceId, status: "SUSPENDED" }),
      },
      staging: { ingestGenerated: stagingIngest },
    } as unknown as ProductionStagingCommitDependencies;

    expect(() =>
      commitProductionStagingWithDependencies(dependencies, input, "worker-secret"),
    ).toThrow(/SUSPENDED/);
    expect(stagingIngest).not.toHaveBeenCalled();
  });

  it("does not treat a PAUSED Source as revoked current Knowledge", () => {
    const artifactRead = vi.fn(() => null);
    const dependencies = {
      workers: { verifyCredential: () => ({ workspaceId }) },
      workspaces: { getById: () => ({ id: workspaceId, status: "ACTIVE" }) },
      conversionRuns: {
        getById: () => ({ run: { sourceId, rawArtifactId: artifactId } }),
      },
      sources: { getById: () => ({ id: sourceId, status: "PAUSED" }) },
      artifacts: { getArtifact: artifactRead },
    } as unknown as ProductionStagingCommitDependencies;

    expect(() =>
      commitProductionStagingWithDependencies(dependencies, input, "worker-secret"),
    ).toThrow(/RawArtifact/);
    expect(artifactRead).toHaveBeenCalledOnce();
  });

  it("rejects an in-flight conversion when its Source was archived", () => {
    const artifactRead = vi.fn();
    const stagingIngest = vi.fn();
    const dependencies = {
      workers: { verifyCredential: () => ({ workspaceId }) },
      workspaces: { getById: () => ({ id: workspaceId, status: "ACTIVE" }) },
      conversionRuns: {
        getById: () => ({ run: { sourceId, rawArtifactId: artifactId } }),
      },
      sources: { getById: () => ({ id: sourceId, status: "ARCHIVED" }) },
      artifacts: { getArtifact: artifactRead },
      staging: { ingestGenerated: stagingIngest },
    } as unknown as ProductionStagingCommitDependencies;

    expect(() =>
      commitProductionStagingWithDependencies(dependencies, input, "worker-secret"),
    ).toThrow(/archived and cannot produce current Knowledge/);
    expect(artifactRead).not.toHaveBeenCalled();
    expect(stagingIngest).not.toHaveBeenCalled();
  });
});
