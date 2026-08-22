import { DatabaseSync } from "node:sqlite";
import type { AcquisitionRunEvidence } from "@markorbit/worker-runtime";
import { acquisitionLearningProfile } from "./acquisition-learning-profiles";

function requiredArgument(index: number, label: string): string {
  const value = process.argv[index]?.trim();
  if (!value) throw new Error(`${label} is required`);
  return value;
}

function parseJson<T>(value: unknown, label: string): T {
  if (typeof value !== "string") throw new Error(`${label} is missing JSON`);
  return JSON.parse(value) as T;
}

const databasePath = process.env.MARKORBIT_KNOWLEDGE_DB_PATH?.trim();
if (!databasePath) throw new Error("MARKORBIT_KNOWLEDGE_DB_PATH is required");
const runId = requiredArgument(2, "runId");
const sourceId = requiredArgument(3, "sourceId");
const profileId = requiredArgument(4, "profileId");
const profile = acquisitionLearningProfile(profileId);
if (!profile) throw new Error(`Unknown acquisition learning profile ${profileId}`);

const database = new DatabaseSync(databasePath, { readOnly: true });
try {
  const evidenceRow = database
    .prepare(`SELECT document_json FROM acquisition_run_evidence WHERE run_id = ?`)
    .get(runId) as { document_json: string } | undefined;
  if (!evidenceRow) throw new Error(`No AcquisitionRunEvidence found for ${runId}`);
  const evidence = parseJson<AcquisitionRunEvidence>(
    evidenceRow.document_json,
    "AcquisitionRunEvidence",
  );
  if (evidence.sourceId !== sourceId)
    throw new Error("AcquisitionRunEvidence crossed source boundary");
  if (
    evidence.playbookId !== profile.playbookId ||
    evidence.playbookRevision !== profile.playbookRevision
  ) {
    throw new Error(
      `Unexpected playbook ${evidence.playbookId}@${evidence.playbookRevision}; expected ${profile.playbookId}@${profile.playbookRevision}`,
    );
  }
  if (!evidence.evidenceRefs.includes(`acquisition-learning-profile:${profile.profileId}`)) {
    throw new Error("AcquisitionRunEvidence is missing the structural profile reference");
  }
  const attemptRef = evidence.evidenceRefs.find((reference) =>
    reference.startsWith("execution-attempt:"),
  );
  if (!attemptRef)
    throw new Error("AcquisitionRunEvidence is missing execution-attempt provenance");
  if (!evidence.evidenceRefs.some((reference) => reference.startsWith("worker:"))) {
    throw new Error("AcquisitionRunEvidence is missing authenticated Worker provenance");
  }
  if (
    evidence.boundaries.legalTruthVerified !== false ||
    evidence.boundaries.autoPromotionApplied !== false ||
    evidence.boundaries.collectionAuthorityGranted !== false
  ) {
    throw new Error("AcquisitionRunEvidence crossed a governance boundary");
  }

  const fingerprintRow = database
    .prepare(
      `SELECT document_json FROM acquisition_source_fingerprints
       WHERE source_id = ? ORDER BY observed_at DESC, created_at DESC LIMIT 1`,
    )
    .get(sourceId) as { document_json: string } | undefined;
  if (!fingerprintRow) throw new Error(`No SourceFingerprint found for ${sourceId}`);
  const fingerprint = parseJson<{
    sourceId: string;
    architecture: string;
    discoverySurfaces: string[];
    renderRequirement: string;
    localeStructure: string;
    evidenceRefs: string[];
  }>(fingerprintRow.document_json, "SourceFingerprint");
  if (fingerprint.sourceId !== sourceId)
    throw new Error("SourceFingerprint crossed source boundary");
  if (fingerprint.architecture !== profile.fingerprint.architecture) {
    throw new Error(`Fingerprint architecture mismatch: ${fingerprint.architecture}`);
  }
  for (const surface of profile.fingerprint.discoverySurfaces) {
    if (!fingerprint.discoverySurfaces.includes(surface)) {
      throw new Error(`SourceFingerprint is missing ${surface}`);
    }
  }
  if (fingerprint.renderRequirement !== profile.fingerprint.renderRequirement) {
    throw new Error(`Fingerprint render requirement mismatch: ${fingerprint.renderRequirement}`);
  }
  if (fingerprint.localeStructure !== profile.fingerprint.localeStructure) {
    throw new Error(`Fingerprint locale structure mismatch: ${fingerprint.localeStructure}`);
  }
  if (!fingerprint.evidenceRefs.includes(attemptRef)) {
    throw new Error("SourceFingerprint is not anchored to the same terminal execution attempt");
  }
  if (!fingerprint.evidenceRefs.some((reference) => reference.startsWith("worker:"))) {
    throw new Error("SourceFingerprint is missing authenticated Worker provenance");
  }

  const lessonCount = Number(
    (
      database
        .prepare(`SELECT COUNT(*) AS count FROM acquisition_run_lessons WHERE run_id = ?`)
        .get(runId) as { count: number }
    ).count,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        version: "ACQUISITION_LEARNING_PROFILE_RUN_VERIFY_V1",
        runId,
        sourceId,
        profileId,
        playbook: `${evidence.playbookId}@${evidence.playbookRevision}`,
        outcome: evidence.outcome,
        coverage: evidence.coverage,
        lessonCount,
        fingerprint: {
          architecture: fingerprint.architecture,
          discoverySurfaces: fingerprint.discoverySurfaces,
          renderRequirement: fingerprint.renderRequirement,
          localeStructure: fingerprint.localeStructure,
        },
        boundaries: evidence.boundaries,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  database.close();
}
