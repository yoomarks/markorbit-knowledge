import {
  DEFAULT_WORKSPACE,
  RegistryConflictError,
  assertWorkspaceActive,
} from "@markorbit/persistence";
import {
  SqliteCoreWorkspaceBindingRepository,
  isCanonicalCoreWorkspaceId,
  type CoreWorkspaceBindingRepository,
} from "@markorbit/persistence/core-workspace-bindings";
import {
  CaseProducerAccessError,
  type CaseProducerWorkspacePrincipalV1,
} from "./case-producer-auth";
import { getRegistryDatabase } from "./source-registry";

export type KnowledgeWorkspaceAuthority = {
  principal: CaseProducerWorkspacePrincipalV1;
  coreWorkspaceId: string;
  workspaceId: string;
};

type CoreWorkspaceBindingReader = Pick<
  CoreWorkspaceBindingRepository,
  "getByCoreWorkspaceId" | "getByKnowledgeWorkspaceId"
>;

export type KnowledgeWorkspaceAuthorityOptions = {
  workspaceBindings?: CoreWorkspaceBindingReader;
  assertKnowledgeWorkspaceActive?: (workspaceId: string) => void;
  allowExplicitGlobalPublicScope?: boolean;
};

function bindings(options: KnowledgeWorkspaceAuthorityOptions): CoreWorkspaceBindingReader {
  return (
    options.workspaceBindings ?? new SqliteCoreWorkspaceBindingRepository(getRegistryDatabase())
  );
}

function assertLocalWorkspaceActive(
  workspaceId: string,
  options: KnowledgeWorkspaceAuthorityOptions,
): void {
  if (options.assertKnowledgeWorkspaceActive) {
    options.assertKnowledgeWorkspaceActive(workspaceId);
    return;
  }
  assertWorkspaceActive(getRegistryDatabase(), workspaceId);
}

function canonicalCoreWorkspaceId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isCanonicalCoreWorkspaceId(normalized)) {
    throw new CaseProducerAccessError(
      "CORE_WORKSPACE_ID_INVALID",
      503,
      "Core Workspace Principal returned a non-canonical workspace identity.",
    );
  }
  return normalized;
}

export function resolveCoreWorkspaceIdForKnowledgeWorkspace(
  knowledgeWorkspaceId: string,
  options: KnowledgeWorkspaceAuthorityOptions = {},
): string {
  const normalized = knowledgeWorkspaceId.trim();
  if (!normalized || normalized === DEFAULT_WORKSPACE.id) {
    throw new RegistryConflictError(
      "KNOWLEDGE_WORKSPACE_BINDING_REQUIRED",
      "Private Knowledge workspace binding is required for Core workspace routing.",
    );
  }
  const binding = bindings(options).getByKnowledgeWorkspaceId(normalized);
  if (!binding) {
    throw new RegistryConflictError(
      "KNOWLEDGE_WORKSPACE_BINDING_REQUIRED",
      `Knowledge workspace ${normalized} has no Core workspace binding`,
    );
  }
  return canonicalCoreWorkspaceId(binding.coreWorkspaceId);
}

export function resolveKnowledgeWorkspaceAuthority(
  principal: CaseProducerWorkspacePrincipalV1,
  assertedWorkspaceId?: string | null,
  options: KnowledgeWorkspaceAuthorityOptions = {},
): KnowledgeWorkspaceAuthority {
  const coreWorkspaceId = canonicalCoreWorkspaceId(principal.workspaceId);
  const assertion = assertedWorkspaceId?.trim();

  if (assertion === DEFAULT_WORKSPACE.id && options.allowExplicitGlobalPublicScope === true) {
    assertLocalWorkspaceActive(DEFAULT_WORKSPACE.id, options);
    return {
      principal,
      coreWorkspaceId,
      workspaceId: DEFAULT_WORKSPACE.id,
    };
  }

  const binding = bindings(options).getByCoreWorkspaceId(coreWorkspaceId);
  if (!binding) {
    throw new RegistryConflictError(
      "KNOWLEDGE_WORKSPACE_BINDING_REQUIRED",
      `Core workspace ${coreWorkspaceId} has no Knowledge workspace binding`,
    );
  }
  if (binding.knowledgeWorkspaceId === DEFAULT_WORKSPACE.id) {
    throw new RegistryConflictError(
      "GLOBAL_WORKSPACE_CORE_BINDING_FORBIDDEN",
      "Core Workspace authority cannot resolve to Global Public Knowledge.",
    );
  }
  assertLocalWorkspaceActive(binding.knowledgeWorkspaceId, options);

  if (assertion) {
    const matches = isCanonicalCoreWorkspaceId(assertion)
      ? assertion.toLowerCase() === coreWorkspaceId
      : assertion === binding.knowledgeWorkspaceId;
    if (!matches) {
      throw new CaseProducerAccessError(
        "WORKSPACE_MISMATCH",
        403,
        "Workspace assertion does not match the resolved Knowledge workspace.",
      );
    }
  }

  return {
    principal,
    coreWorkspaceId,
    workspaceId: binding.knowledgeWorkspaceId,
  };
}

export function assertKnowledgeWorkspaceResource(
  authority: KnowledgeWorkspaceAuthority,
  resourceWorkspaceId: string,
): void {
  if (resourceWorkspaceId.trim() !== authority.workspaceId) {
    throw new CaseProducerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "Workspace Principal does not match the requested Knowledge resource.",
    );
  }
}
