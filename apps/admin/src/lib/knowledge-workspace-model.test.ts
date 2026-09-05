import { describe, expect, it } from "vitest";
import { knowledgeWorkspaceHref, selectKnowledgeWorkspace } from "./knowledge-workspace-model";

const WORKSPACE_A = {
  workspaceId: "wsp-a",
  name: "Workspace A",
  role: "WORKSPACE_ADMIN",
};
const WORKSPACE_B = {
  workspaceId: "wsp-b",
  name: "Workspace B",
  role: "READ_ONLY",
};

describe("Knowledge workspace navigation", () => {
  it("uses the first authenticated workspace only when the URL has no workspace yet", () => {
    expect(selectKnowledgeWorkspace([WORKSPACE_A, WORKSPACE_B], null)).toEqual({
      kind: "SELECTED",
      workspace: WORKSPACE_A,
      needsExplicitUrl: true,
    });
  });

  it("accepts an explicitly requested authenticated workspace", () => {
    expect(selectKnowledgeWorkspace([WORKSPACE_A, WORKSPACE_B], "wsp-b")).toEqual({
      kind: "SELECTED",
      workspace: WORKSPACE_B,
      needsExplicitUrl: false,
    });
  });

  it("fails closed instead of silently falling back for an unauthorized workspace", () => {
    expect(selectKnowledgeWorkspace([WORKSPACE_A], "wsp-other")).toEqual({
      kind: "FORBIDDEN",
      requestedWorkspaceId: "wsp-other",
    });
  });

  it("preserves investigation state and hash while making deep links workspace-explicit", () => {
    expect(
      knowledgeWorkspaceHref("/knowledge/doc-1?q=alpha&offset=25#knowledge-graph", "wsp-b"),
    ).toBe("/knowledge/doc-1?q=alpha&offset=25&workspaceId=wsp-b#knowledge-graph");
  });

  it("can reset pagination when switching workspace without dropping other search state", () => {
    expect(
      knowledgeWorkspaceHref("/knowledge/search?q=alpha&status=READY&offset=50", "wsp-b", {
        resetOffset: true,
      }),
    ).toBe("/knowledge/search?q=alpha&status=READY&workspaceId=wsp-b");
  });
});
