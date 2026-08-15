import { describe, expect, it, vi } from "vitest";
import type { SourceDefinition } from "@markorbit/contracts";
import type { SourceRepository } from "@markorbit/persistence";
import {
  evaluateSourceCoverage,
  getSourceCoverageTarget,
} from "@markorbit/persistence/source-coverage";
import { listAllWorkspaceSources } from "../source-pagination";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function source(id: string, canonicalUri: string): SourceDefinition {
  return {
    id,
    canonicalUri,
    entrypoints: [{ uri: canonicalUri }],
  } as unknown as SourceDefinition;
}

function pagedRepository(items: SourceDefinition[]) {
  const list = vi.fn((filters: { limit?: number; offset?: number }) => {
    const limit = filters.limit ?? 25;
    const offset = filters.offset ?? 0;
    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset,
      summary: {} as never,
    };
  });
  return { list } as unknown as Pick<SourceRepository, "list">;
}

describe("workspace Source pagination", () => {
  it("reads every Source page so coverage after row 100 is not reported as missing", () => {
    const target = getSourceCoverageTarget("gb-ukipo-register-trademark")!;
    const sources = Array.from({ length: 100 }, (_, index) =>
      source(`src_fixture_${index}`, `https://example.com/source-${index}`),
    );
    sources.push(source("src_coverage_match", target.canonicalUri));
    const repository = pagedRepository(sources);

    const allSources = listAllWorkspaceSources(repository, workspaceId);
    const [registration] = evaluateSourceCoverage(allSources, [target]);

    expect(allSources).toHaveLength(101);
    expect(registration).toEqual({
      targetId: target.id,
      state: "REGISTERED",
      sourceIds: ["src_coverage_match"],
    });
    expect(repository.list).toHaveBeenNthCalledWith(1, {
      workspaceId,
      limit: 100,
      offset: 0,
    });
    expect(repository.list).toHaveBeenNthCalledWith(2, {
      workspaceId,
      limit: 100,
      offset: 100,
    });
  });

  it("stops safely if a repository returns an empty page before its reported total", () => {
    const list = vi
      .fn()
      .mockReturnValueOnce({ items: [source("src_one", "https://example.com")], total: 2 })
      .mockReturnValueOnce({ items: [], total: 2 });
    const repository = { list } as unknown as Pick<SourceRepository, "list">;

    expect(listAllWorkspaceSources(repository, workspaceId)).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(2);
  });
});
