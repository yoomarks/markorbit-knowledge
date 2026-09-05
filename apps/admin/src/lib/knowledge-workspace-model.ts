export type KnowledgeWorkspaceOption = {
  workspaceId: string;
  name: string;
  role: string;
};

export type KnowledgeWorkspaceSelection =
  | {
      kind: "SELECTED";
      workspace: KnowledgeWorkspaceOption;
      needsExplicitUrl: boolean;
    }
  | { kind: "NO_WORKSPACE" }
  | { kind: "FORBIDDEN"; requestedWorkspaceId: string };

function normalizedWorkspaceId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function selectKnowledgeWorkspace(
  workspaces: readonly KnowledgeWorkspaceOption[],
  requestedWorkspaceId: string | null | undefined,
): KnowledgeWorkspaceSelection {
  const requested = normalizedWorkspaceId(requestedWorkspaceId);
  if (!requested) {
    const workspace = workspaces[0];
    return workspace
      ? { kind: "SELECTED", workspace, needsExplicitUrl: true }
      : { kind: "NO_WORKSPACE" };
  }

  const workspace = workspaces.find((candidate) => candidate.workspaceId === requested);
  return workspace
    ? { kind: "SELECTED", workspace, needsExplicitUrl: false }
    : { kind: "FORBIDDEN", requestedWorkspaceId: requested };
}

export function knowledgeWorkspaceHref(
  href: string,
  workspaceId: string,
  options: { resetOffset?: boolean } = {},
): string {
  const normalizedWorkspace = normalizedWorkspaceId(workspaceId);
  if (!normalizedWorkspace) throw new Error("Knowledge workspaceId is required");

  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const params = new URLSearchParams(queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "");

  params.set("workspaceId", normalizedWorkspace);
  if (options.resetOffset) params.delete("offset");

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}
