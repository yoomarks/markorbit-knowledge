import type { SourceDefinition } from "@markorbit/contracts";
import type { SourceRepository } from "./index";
import { RegistryError } from "./index";
import type { ProductionValidationManifest } from "./production-validation-discovery-intake";
import type { SourceDiscoveryRepository } from "./source-discovery-registry";

export type ProductionValidationOnboardingState = "NOT_QUEUED" | "IN_DISCOVERY" | "REGISTERED";

export type ProductionValidationOnboardingItem = {
  targetId: string;
  jurisdiction: string;
  authority: string;
  canonicalUri: string;
  state: ProductionValidationOnboardingState;
  candidateId?: string;
  candidateStatus?: string;
  sourceId?: string;
};

export type ProductionValidationOnboardingStatus = {
  workspaceId: string;
  waveId: string;
  items: ProductionValidationOnboardingItem[];
  summary: Record<ProductionValidationOnboardingState, number> & { total: number };
};

export type ProductionValidationOnboardingDependencies = {
  sources: SourceRepository;
  discovery: SourceDiscoveryRepository;
};

function canonicalUri(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function listWorkspaceSources(
  repository: SourceRepository,
  workspaceId: string,
): SourceDefinition[] {
  const sources: SourceDefinition[] = [];
  let offset = 0;
  while (true) {
    const page = repository.list({ workspaceId, limit: 100, offset });
    sources.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) return sources;
  }
}

function findRegisteredSource(
  sources: SourceDefinition[],
  targetUri: string,
): SourceDefinition | undefined {
  return sources.find((source) => {
    const uris = [
      source.canonicalUri,
      ...source.entrypoints.map((entrypoint) => entrypoint.uri),
    ].filter((uri): uri is string => Boolean(uri));
    return uris.some((uri) => {
      try {
        return canonicalUri(uri) === targetUri;
      } catch {
        return false;
      }
    });
  });
}

export function inspectProductionValidationOnboarding(
  input: { workspaceId: string; manifest: ProductionValidationManifest },
  dependencies: ProductionValidationOnboardingDependencies,
): ProductionValidationOnboardingStatus {
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) throw new RegistryError("WORKSPACE_ID_REQUIRED", "workspaceId is required");
  const sources = listWorkspaceSources(dependencies.sources, workspaceId);
  const items = input.manifest.targets.map((target): ProductionValidationOnboardingItem => {
    const targetUri = canonicalUri(target.canonicalUri);
    const source = findRegisteredSource(sources, targetUri);
    if (source) {
      return {
        targetId: target.id,
        jurisdiction: target.jurisdiction,
        authority: target.authority,
        canonicalUri: targetUri,
        state: "REGISTERED",
        sourceId: source.id,
      };
    }
    const candidate = dependencies.discovery.getCandidateByLocator(targetUri);
    if (candidate) {
      return {
        targetId: target.id,
        jurisdiction: target.jurisdiction,
        authority: target.authority,
        canonicalUri: targetUri,
        state: "IN_DISCOVERY",
        candidateId: candidate.candidate.candidateId,
        candidateStatus: candidate.candidate.status,
      };
    }
    return {
      targetId: target.id,
      jurisdiction: target.jurisdiction,
      authority: target.authority,
      canonicalUri: targetUri,
      state: "NOT_QUEUED",
    };
  });
  return {
    workspaceId,
    waveId: input.manifest.waveId,
    items,
    summary: {
      NOT_QUEUED: items.filter((item) => item.state === "NOT_QUEUED").length,
      IN_DISCOVERY: items.filter((item) => item.state === "IN_DISCOVERY").length,
      REGISTERED: items.filter((item) => item.state === "REGISTERED").length,
      total: items.length,
    },
  };
}
