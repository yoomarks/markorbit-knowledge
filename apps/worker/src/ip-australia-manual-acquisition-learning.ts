import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  type AcquisitionRunEvidence,
  type ExecutionReceipt,
  type Job,
} from "@markorbit/worker-runtime";
import type { IpAustraliaManualArtifactAcquirerDiagnostics } from "./ip-australia-manual-artifact-acquirer";

const PLAYBOOK_ID = "official-static-index-tree";
const PLAYBOOK_REVISION = 1;

function failureSignatures(
  diagnostics: IpAustraliaManualArtifactAcquirerDiagnostics,
): AcquisitionRunEvidence["failureSignatures"] {
  const counts = new Map<string, { code: string; count: number; sample?: string }>();
  for (const gap of diagnostics.sourceGaps) {
    const key = `${gap.reason}:${gap.status ?? "NO_STATUS"}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, {
        code: gap.reason,
        count: 1,
        sample: gap.error,
      });
    }
  }
  return [...counts.values()].sort((left, right) => left.code.localeCompare(right.code));
}

function httpStatusCounts(
  diagnostics: IpAustraliaManualArtifactAcquirerDiagnostics,
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (diagnostics.emittedArtifactCount > 0) {
    counts["200"] = diagnostics.emittedArtifactCount;
  }
  for (const gap of diagnostics.sourceGaps) {
    if (gap.status === undefined) continue;
    const key = String(gap.status);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function sourceGapEvidenceRefs(
  diagnostics: IpAustraliaManualArtifactAcquirerDiagnostics,
): string[] {
  return diagnostics.sourceGaps
    .map(
      (gap) =>
        `source-gap:${gap.reason}:${gap.status ?? "NO_STATUS"}:${encodeURIComponent(gap.uri)}`,
    )
    .sort();
}

export function buildIpAustraliaManualAcquisitionRunEvidence(input: {
  job: Job;
  receipt: ExecutionReceipt;
  diagnostics: IpAustraliaManualArtifactAcquirerDiagnostics;
  startedAt: string;
  finishedAt: string;
}): AcquisitionRunEvidence {
  const knownCorpus = input.diagnostics.inventoryPageCount;
  const accepted = input.diagnostics.emittedArtifactCount;
  const fetched =
    accepted +
    input.diagnostics.sourceGaps.filter(
      (gap) => gap.status !== undefined && gap.status >= 200 && gap.status < 300,
    ).length;
  const ratio = knownCorpus > 0 ? accepted / knownCorpus : null;
  const outcome: AcquisitionRunEvidence["outcome"] =
    knownCorpus > 0 && accepted === knownCorpus && input.diagnostics.sourceGaps.length === 0
      ? "SUCCESS"
      : accepted > 0
        ? "DEGRADED"
        : "FAILED";
  const durationMs = Math.max(0, Date.parse(input.finishedAt) - Date.parse(input.startedAt));

  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_RUN_EVIDENCE",
    runId: input.job.runId,
    sourceId: input.job.sourceId,
    playbookId: PLAYBOOK_ID,
    playbookRevision: PLAYBOOK_REVISION,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    outcome,
    counts: {
      discovered: knownCorpus,
      attempted: knownCorpus,
      fetched,
      accepted,
      duplicates: 0,
      retries: 0,
    },
    coverage: {
      knownCorpus,
      ratio,
      previousRatio: null,
    },
    httpStatusCounts: httpStatusCounts(input.diagnostics),
    failureSignatures: failureSignatures(input.diagnostics),
    surfaceOutcomes: [
      {
        surface: "INDEX_PAGE",
        discovered: knownCorpus,
        accepted,
        knownCorpus,
      },
    ],
    rendering: {
      used: false,
    },
    changeDetection: {
      etagObserved: input.diagnostics.etagObserved,
      lastModifiedObserved: input.diagnostics.lastModifiedObserved,
      validator304Count: 0,
      digestChanges: 0,
    },
    performance: {
      durationMs,
      bytes: input.receipt.bytesPrepared,
    },
    evidenceRefs: [
      `collection-run:${input.job.runId}`,
      `collection-plan:${input.job.planId}`,
      `executor:${input.receipt.executor.executorId}@${input.receipt.executor.version}`,
      `ip-australia-manual-inventory:${knownCorpus}`,
      ...sourceGapEvidenceRefs(input.diagnostics),
    ],
    boundaries: {
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
  };
}
