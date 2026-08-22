import {
  buildAcquisitionRunEvidenceFromProfile,
  type AcquisitionRunEvidence,
  type ExecutionReceipt,
  type Job,
} from "@markorbit/worker-runtime";
import { ACQUISITION_LEARNING_PROFILES } from "./acquisition-learning-profiles";
import type { IpAustraliaManualArtifactAcquirerDiagnostics } from "./ip-australia-manual-artifact-acquirer";

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

  return buildAcquisitionRunEvidenceFromProfile({
    profile: ACQUISITION_LEARNING_PROFILES["static-index-html-v1"],
    observation: {
      runId: input.job.runId,
      sourceId: input.job.sourceId,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      counts: {
        discovered: knownCorpus,
        attempted: knownCorpus,
        fetched,
        accepted,
        duplicates: 0,
        retries: 0,
      },
      knownCorpus,
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
      bytes: input.receipt.bytesPrepared,
      evidenceRefs: [
        `collection-run:${input.job.runId}`,
        `collection-plan:${input.job.planId}`,
        `executor:${input.receipt.executor.executorId}@${input.receipt.executor.version}`,
        `authoritative-inventory:${knownCorpus}`,
        ...sourceGapEvidenceRefs(input.diagnostics),
      ],
    },
  });
}
