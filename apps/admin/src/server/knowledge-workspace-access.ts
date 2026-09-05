import { RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiReadAccess,
  type AdminBrowserApiAccess,
} from "./admin-browser-api-access";
import type { AdminBrowserSessionOptions } from "./admin-browser-session";

export function requiredKnowledgeWorkspaceId(request: Request): string {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
  if (!workspaceId) {
    throw new RegistryValidationError("workspaceId query parameter is required");
  }
  return workspaceId;
}

export function resolveKnowledgeWorkspaceReadAccess(
  request: Request,
  options: AdminBrowserSessionOptions = {},
): Promise<AdminBrowserApiAccess> {
  return resolveAdminBrowserApiReadAccess(request, requiredKnowledgeWorkspaceId(request), options);
}
