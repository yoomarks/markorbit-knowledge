import { DEFAULT_WORKSPACE, RegistryNotFoundError } from "@markorbit/persistence";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
  type AdminBrowserApiAccess,
} from "./admin-browser-api-access";
import { getSourceRepository } from "./source-registry";

function normalizedSourceIds(sourceIds: readonly string[]): string[] {
  return [...new Set(sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))];
}

async function resolveSourceIntelligenceBrowserAccess(
  request: Request,
  sourceIds: readonly string[],
  mutation: boolean,
): Promise<AdminBrowserApiAccess> {
  const ids = normalizedSourceIds(sourceIds);
  if (ids.length === 0) {
    return mutation
      ? resolveAdminBrowserApiMutationAccess(request, DEFAULT_WORKSPACE.id)
      : resolveAdminBrowserApiReadAccess(request, DEFAULT_WORKSPACE.id);
  }

  const sources = getSourceRepository();
  const first = sources.getById(ids[0]!);
  if (!first) throw new RegistryNotFoundError(ids[0]!);
  const access = mutation
    ? await resolveAdminBrowserApiMutationAccess(request, first.workspaceId)
    : await resolveAdminBrowserApiReadAccess(request, first.workspaceId);

  for (const sourceId of ids) {
    const source = sourceId === first.id ? first : sources.getById(sourceId);
    if (!source) throw new RegistryNotFoundError(sourceId);
    assertAdminBrowserResourceWorkspace(access.principal, source.workspaceId);
  }
  return access;
}

export function resolveSourceIntelligenceBrowserReadAccess(
  request: Request,
  sourceIds: readonly string[] = [],
): Promise<AdminBrowserApiAccess> {
  return resolveSourceIntelligenceBrowserAccess(request, sourceIds, false);
}

export function resolveSourceIntelligenceBrowserMutationAccess(
  request: Request,
  sourceIds: readonly string[] = [],
): Promise<AdminBrowserApiAccess> {
  return resolveSourceIntelligenceBrowserAccess(request, sourceIds, true);
}
