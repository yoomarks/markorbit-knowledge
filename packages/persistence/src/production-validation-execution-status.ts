import type { CollectionRunStatus, JobStatus, SourceDefinition } from "@markorbit/contracts";
import type { ExecutionLedgerRepository, ExecutionRunRecord } from "./execution-ledger";
import type { SourceRepository } from "./index";
import { RegistryError } from "./index";
import type { ProductionValidationManifest } from "./production-validation-discovery-intake";

export type ProductionValidationExecutionState =
  | "NOT_REGISTERED"
  | "AWAITING_AUTHORIZATION"
  | "RUN_OBSERVED";

export type ProductionValidationExecutionItem = {
  targetId: string;
  jurisdiction: string;
  authority: string;
  state: ProductionValidationExecutionState;
  sourceId?: string;
  runCount: number;
  completedRunCount: number;
  failedRunCount: number;
  secondRunObserved: boolean;
  latestRunId?: string;
  latestRunStatus?: CollectionRunStatus;
  latestRequestedAt?: string;
  latestJobStatuses?: JobStatus[];
};

export type ProductionValidationExecutionStatus = {
  workspaceId: string;
  waveId: string;
  items: ProductionValidationExecutionItem[];
  summary: Record<ProductionValidationExecutionState, number> & {
    total: number;
    runsObserved: number;
    completedRuns: number;
    failedRuns: number;
    targetsWithSecondRun: number;
  };
};

export type ProductionValidationExecutionDependencies = {
  sources: SourceRepository;
  runs: ExecutionLedgerRepository;
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

function listSourceRuns(
  repository: ExecutionLedgerRepository,
  workspaceId: string,
  sourceId: string,
): ExecutionRunRecord[] {
  const records: ExecutionRunRecord[] = [];
  let offset = 0;
  while (true) {
    const page = repository.list({ workspaceId, sourceId, limit: 100, offset });
    records.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) return records;
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

function newestFirst(records: ExecutionRunRecord[]): ExecutionRunRecord[] {
  return [...records].sort((left, right) =>
    right.run.requestedAt.localeCompare(left.run.requestedAt),
  );
}

export function inspectProductionValidationExecution(
  input: { workspaceId: string; manifest: ProductionValidationManifest },
  dependencies: ProductionValidationExecutionDependencies,
): ProductionValidationExecutionStatus {
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) throw new RegistryError("WORKSPACE_ID_REQUIRED", "workspaceId is required");
  const sources = listWorkspaceSources(dependencies.sources, workspaceId);

  const items = input.manifest.targets.map((target): ProductionValidationExecutionItem => {
    const source = findRegisteredSource(sources, canonicalUri(target.canonicalUri));
    if (!source) {
      return {
        targetId: target.id,
        jurisdiction: target.jurisdiction,
        authority: target.authority,
        state: "NOT_REGISTERED",
        runCount: 0,
        completedRunCount: 0,
        failedRunCount: 0,
        secondRunObserved: false,
      };
    }

    const records = newestFirst(listSourceRuns(dependencies.runs, workspaceId, source.id));
    const completedRunCount = records.filter((record) => record.run.status === "COMPLETED").length;
    const failedRunCount = records.filter((record) => record.run.status === "FAILED").length;
    const latest = records[0];
    if (!latest) {
      return {
        targetId: target.id,
        jurisdiction: target.jurisdiction,
        authority: target.authority,
        state: "AWAITING_AUTHORIZATION",
        sourceId: source.id,
        runCount: 0,
        completedRunCount: 0,
        failedRunCount: 0,
        secondRunObserved: false,
      };
    }

    return {
      targetId: target.id,
      jurisdiction: target.jurisdiction,
      authority: target.authority,
      state: "RUN_OBSERVED",
      sourceId: source.id,
      runCount: records.length,
      completedRunCount,
      failedRunCount,
      secondRunObserved: records.length >= 2,
      latestRunId: latest.run.id,
      latestRunStatus: latest.run.status,
      latestRequestedAt: latest.run.requestedAt,
      latestJobStatuses: latest.jobs.map((job) => job.status),
    };
  });

  return {
    workspaceId,
    waveId: input.manifest.waveId,
    items,
    summary: {
      NOT_REGISTERED: items.filter((item) => item.state === "NOT_REGISTERED").length,
      AWAITING_AUTHORIZATION: items.filter((item) => item.state === "AWAITING_AUTHORIZATION")
        .length,
      RUN_OBSERVED: items.filter((item) => item.state === "RUN_OBSERVED").length,
      total: items.length,
      runsObserved: items.reduce((sum, item) => sum + item.runCount, 0),
      completedRuns: items.reduce((sum, item) => sum + item.completedRunCount, 0),
      failedRuns: items.reduce((sum, item) => sum + item.failedRunCount, 0),
      targetsWithSecondRun: items.filter((item) => item.secondRunObserved).length,
    },
  };
}
