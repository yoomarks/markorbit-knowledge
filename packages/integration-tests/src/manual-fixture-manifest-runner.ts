import { DatabaseSync } from "node:sqlite";
import { SqliteConversionPipelineInspectionRepository } from "@markorbit/persistence/conversion-pipeline-inspection";
import { exportEvidenceBundle } from "./evidence-bundle";
import {
  runManualFixturePipeline,
  type ManualFixtureRunnerInput,
  type ManualFixtureRunnerSummary,
} from "./manual-fixture-runner";
import { writeRunEvidenceManifest } from "./run-evidence-manifest";

type RawArtifactSnapshot = {
  id: string;
  status: string;
  artifactKind: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

type RawArtifactRow = { document_json: string };

export type ManualFixtureManifestSummary = ManualFixtureRunnerSummary & {
  output: ManualFixtureRunnerSummary["output"] & {
    manifestPath: string;
    manifestSha256: string;
    evidenceBundlePath: string;
    evidenceBundleSha256: string;
  };
};

export async function runManualFixturePipelineWithManifest(
  input: ManualFixtureRunnerInput,
): Promise<ManualFixtureManifestSummary> {
  const summary = await runManualFixturePipeline(input);
  const database = new DatabaseSync(summary.output.databasePath);
  try {
    const inspection = new SqliteConversionPipelineInspectionRepository(database).getByRun(
      summary.workspaceId,
      summary.conversionRunId,
    );
    if (!inspection?.stagingDocument || !inspection.verification) {
      throw new Error("Terminal inspection evidence is incomplete");
    }
    const row = database
      .prepare("SELECT document_json FROM raw_artifacts WHERE id = ?")
      .get(inspection.conversionRun.rawArtifactId) as RawArtifactRow | undefined;
    if (!row) throw new Error("RawArtifact evidence is missing");
    const artifact = JSON.parse(row.document_json) as RawArtifactSnapshot;
    const clock = input.clock ?? (() => new Date());
    const written = writeRunEvidenceManifest(summary.output.rootDirectory, {
      generatedAt: clock().toISOString(),
      executionKey: input.executionKey ?? "manual-fixture-run",
      workspaceId: summary.workspaceId,
      sourceId: inspection.conversionRun.sourceId,
      rawArtifact: {
        id: artifact.id,
        status: artifact.status,
        artifactKind: artifact.artifactKind,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        sha256: artifact.sha256,
      },
      conversion: {
        runId: inspection.conversionRun.id,
        runStatus: inspection.conversionRun.status,
        attemptId: inspection.latestAttempt?.id ?? null,
        attemptStatus: inspection.latestAttempt?.status ?? null,
        leaseId: inspection.latestLease?.id ?? null,
        leaseStatus: inspection.latestLease?.status ?? null,
        converterId: inspection.conversionRun.converter.converterId,
        converterVersion: inspection.conversionRun.converter.version,
      },
      staging: {
        documentId: inspection.stagingDocument.id,
        status: inspection.stagingDocument.status,
        targetPath: inspection.stagingDocument.targetPath,
        sizeBytes: inspection.stagingDocument.sizeBytes,
        sha256: inspection.stagingDocument.contentHash.value,
      },
      verification: {
        id: inspection.verification.id,
        verifierId: inspection.verification.verifier.verifierId,
        verifierVersion: inspection.verification.verifier.version,
        outcome: inspection.verification.outcome,
        checks: inspection.verification.checks.length,
        warnings: inspection.verification.warnings.length,
      },
      terminal: {
        status: summary.status,
        observedPhase: summary.observedPhase,
      },
      files: {
        databasePath: summary.output.databasePath,
        casDirectory: summary.output.casDirectory,
      },
    });
    const evidenceBundle = exportEvidenceBundle(
      summary.output.rootDirectory,
      clock().toISOString(),
    );

    return {
      ...summary,
      output: {
        ...summary.output,
        manifestPath: written.path,
        manifestSha256: written.manifest.digest.value,
        evidenceBundlePath: evidenceBundle.path,
        evidenceBundleSha256: evidenceBundle.bundle.digest.value,
      },
    };
  } finally {
    database.close();
  }
}
