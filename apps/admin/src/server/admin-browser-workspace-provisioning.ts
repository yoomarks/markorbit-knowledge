import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Workspace } from "@markorbit/contracts";
import { RegistryConflictError } from "@markorbit/persistence";
import {
  SqliteCoreWorkspaceBindingRepository,
  type CoreWorkspaceBindingRepository,
} from "@markorbit/persistence/core-workspace-bindings";
import {
  SqliteWorkspaceRepository,
  type WorkspaceRepository,
} from "@markorbit/persistence/workspaces";
import {
  resolveAdminBrowserWorkspacePrincipal,
  validateAdminBrowserMutation,
  type AdminBrowserSessionOptions,
} from "./admin-browser-session";
import {
  CaseProducerAccessError,
  type CaseProducerWorkspacePrincipalV1,
} from "./case-producer-auth";
import { getRegistryDatabase } from "./source-registry";

export type AdminBrowserWorkspaceProvisioningOptions = AdminBrowserSessionOptions & {
  database?: DatabaseSync;
  workspaceRepository?: WorkspaceRepository;
  bindingRepository?: CoreWorkspaceBindingRepository;
};
export type AdminBrowserWorkspaceProvisioningResult = {
  workspace: Workspace;
  created: boolean;
};

function provisioningSlug(coreWorkspaceId: string): string {
  return `core-${createHash("sha256").update(coreWorkspaceId, "utf8").digest("hex").slice(0, 20)}`;
}

function assertPrivateActive(workspace: Workspace): Workspace {
  if (workspace.status !== "ACTIVE" || workspace.dataDomain !== "WORKSPACE_PRIVATE") {
    throw new RegistryConflictError(
      "KNOWLEDGE_WORKSPACE_PROVISIONING_CONFLICT",
      "The Core workspace maps to a Knowledge workspace that is not active and private.",
    );
  }
  return workspace;
}

function repositories(options: AdminBrowserWorkspaceProvisioningOptions) {
  const database = options.database ?? getRegistryDatabase();
  return {
    workspaces: options.workspaceRepository ?? new SqliteWorkspaceRepository(database),
    bindings: options.bindingRepository ?? new SqliteCoreWorkspaceBindingRepository(database),
  };
}
export function ensureKnowledgeWorkspaceForPrincipal(
  principal: CaseProducerWorkspacePrincipalV1,
  options: AdminBrowserWorkspaceProvisioningOptions = {},
): AdminBrowserWorkspaceProvisioningResult {
  if (principal.role === "READ_ONLY") {
    throw new CaseProducerAccessError(
      "PERMISSION_DENIED",
      403,
      "Read-only Workspace membership cannot provision Knowledge workspace state.",
    );
  }

  const { workspaces, bindings } = repositories(options);
  const existingBinding = bindings.getByCoreWorkspaceId(principal.workspaceId);
  if (existingBinding) {
    const existing = workspaces.getById(existingBinding.knowledgeWorkspaceId);
    if (!existing) {
      throw new RegistryConflictError(
        "KNOWLEDGE_WORKSPACE_PROVISIONING_CONFLICT",
        "The persisted Core workspace binding references a missing Knowledge workspace.",
      );
    }
    return { workspace: assertPrivateActive(existing), created: false };
  }

  const slug = provisioningSlug(principal.workspaceId);
  let workspace = workspaces.getBySlug(slug);
  let created = false;
  if (!workspace) {
    try {
      workspace = workspaces.create({
        slug,
        name: "Core-bound Knowledge Workspace",
        dataDomain: "WORKSPACE_PRIVATE",
      });
      created = true;
    } catch (error) {
      if (!(error instanceof RegistryConflictError) || error.code !== "WORKSPACE_SLUG_CONFLICT") {
        throw error;
      }
      workspace = workspaces.getBySlug(slug);
      if (!workspace) throw error;
    }
  }
  assertPrivateActive(workspace);

  const binding = bindings.bind(workspace.id, principal.workspaceId);
  if (binding.knowledgeWorkspaceId !== workspace.id) {
    throw new RegistryConflictError(
      "KNOWLEDGE_WORKSPACE_PROVISIONING_CONFLICT",
      "Knowledge workspace binding did not preserve the provisioned workspace identity.",
    );
  }
  return { workspace: assertPrivateActive(workspace), created };
}

export async function provisionAdminBrowserKnowledgeWorkspace(
  request: Request,
  options: AdminBrowserWorkspaceProvisioningOptions = {},
): Promise<AdminBrowserWorkspaceProvisioningResult> {
  const principal = await resolveAdminBrowserWorkspacePrincipal(request, options);
  validateAdminBrowserMutation(request, principal, options);
  return ensureKnowledgeWorkspaceForPrincipal(principal, options);
}
