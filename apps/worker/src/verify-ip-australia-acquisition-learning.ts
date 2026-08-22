import { DatabaseSync } from "node:sqlite";
import type { AcquisitionRunEvidence, RunLesson } from "@markorbit/worker-runtime";
import {
  resolveAcquisitionOutcome,
  sourceGapObservationsFromEvidenceRefs,
} from "./source-gap-accounting";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseJson<T>(value: unknown, label: string): T {
  if (typeof value !== "string") throw new Error(`${label} is missing JSON`);
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} contains invalid JSON`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertClose(actual: number | null, expected: number, label: string): void {
  if (actual === null || !Number.isFinite(actual) || Math.abs(actual - expected) > 1e-12) {
    throw new Error(`${label}: expected ${expected}, got ${String(actual)}`);
  }
}

const databasePath = required("MARKORBIT_KNOWLEDGE_DB_PATH");
const runId = required("MARKORBIT_COLLECTION_RUN_ID");
const sourceId = required("MARKORBIT_IP_AU_SOURCE_ID");
const expectedCount = Number(required("MARKORBIT_IP_AU_EXPECTED_COUNT"));
if (!Number.isInteger(expectedCount) || expectedCount <= 0) {
  throw new Error("MARKORBIT_IP_AU_EXPECTED_COUNT must be a positive integer");
}

const database = new DatabaseSync(databasePath, { readOnly: true });
try {
  const row = database
    .prepare(
      `SELECT source_id, playbook_id, playbook_revision, outcome, coverage_ratio,
              duration_ms, document_json
       FROM acquisition_run_evidence
       WHERE run_id = ?`,
    )
    .get(runId) as
    | {
        source_id: string;
        playbook_id: string;
        playbook_revision: number;
        outcome: string;
        coverage_ratio: number | null;
        duration_ms: number;
        document_json: string;
      }
    | undefined;
  if (!row) throw new Error(`No acquisition learning evidence found for run ${runId}`);

  assertEqual(row.source_id, sourceId, "persisted source boundary");
  assertEqual(row.playbook_id, "official-static-index-tree", "playbook id");
  assertEqual(row.playbook_revision, 1, "playbook revision");
  if (!Number.isFinite(row.duration_ms) || row.duration_ms <= 0) {
    throw new Error(`control-plane duration must be positive, got ${row.duration_ms}`);
  }

  const evidence = parseJson<AcquisitionRunEvidence>(row.document_json, "AcquisitionRunEvidence");
  assertEqual(evidence.runId, runId, "evidence run id");
  assertEqual(evidence.sourceId, sourceId, "evidence source id");
  assertEqual(evidence.counts.discovered, expectedCount, "discovered corpus count");
  assertEqual(evidence.counts.attempted, expectedCount, "attempted corpus count");
  assertEqual(evidence.coverage.knownCorpus, expectedCount, "known corpus count");
  if (evidence.counts.accepted <= 0 || evidence.counts.accepted > expectedCount) {
    throw new Error(`accepted corpus count is invalid: ${evidence.counts.accepted}/${expectedCount}`);
  }

  const sourceGaps = sourceGapObservationsFromEvidenceRefs(
    evidence.evidenceRefs,
    evidence.finishedAt,
  );
  const resolution = resolveAcquisitionOutcome({
    discovered: expectedCount,
    accepted: evidence.counts.accepted,
    gaps: sourceGaps,
  });
  if (resolution.resolution === "FAILED") {
    throw new Error(
      `Unexplained IP Australia corpus gap: ${JSON.stringify({
        expectedCount,
        accepted: evidence.counts.accepted,
        sourceGaps,
      })}`,
    );
  }

  const expectedOutcome = sourceGaps.length === 0 ? "SUCCESS" : "DEGRADED";
  assertEqual(row.outcome, expectedOutcome, "production learning outcome");
  assertEqual(evidence.outcome, expectedOutcome, "evidence outcome");
  assertClose(row.coverage_ratio, resolution.artifactCoverage, "persisted corpus coverage");
  assertClose(evidence.coverage.ratio, resolution.artifactCoverage, "evidence coverage ratio");

  if (sourceGaps.length === 0) {
    assertEqual(evidence.counts.fetched, expectedCount, "fetched corpus count");
  } else {
    assertEqual(
      resolution.explainableGapCount,
      expectedCount - evidence.counts.accepted,
      "explained source gap count",
    );
    const unavailable = evidence.failureSignatures
      .filter((failure) => failure.code === "SOURCE_UNAVAILABLE")
      .reduce((total, failure) => total + failure.count, 0);
    assertEqual(unavailable, sourceGaps.length, "SOURCE_UNAVAILABLE signature count");
    assertEqual(Number(evidence.httpStatusCounts["404"] ?? 0), sourceGaps.length, "HTTP 404 count");
    if (sourceGaps.some((gap) => gap.gapType !== "HTTP_404" || gap.statusCode !== 404)) {
      throw new Error(`Production source gaps are not fully classified as authoritative HTTP 404s`);
    }
  }

  if (evidence.performance.bytes <= 0) {
    throw new Error("trusted execution bytes must be positive");
  }
  if (
    typeof evidence.changeDetection.etagObserved !== "boolean" ||
    typeof evidence.changeDetection.lastModifiedObserved !== "boolean"
  ) {
    throw new Error("HTTP validator observations must be explicit booleans");
  }
  if (!evidence.evidenceRefs.some((reference) => reference.startsWith("worker:"))) {
    throw new Error("learning evidence is missing authenticated Worker provenance");
  }
  if (!evidence.evidenceRefs.some((reference) => reference.startsWith("execution-attempt:"))) {
    throw new Error("learning evidence is missing trusted execution-attempt provenance");
  }
  if (
    evidence.boundaries.legalTruthVerified !== false ||
    evidence.boundaries.autoPromotionApplied !== false ||
    evidence.boundaries.collectionAuthorityGranted !== false
  ) {
    throw new Error("acquisition learning crossed a governance boundary");
  }

  const lessons = database
    .prepare(
      `SELECT document_json FROM acquisition_run_lessons
       WHERE run_id = ?
       ORDER BY lesson_type, id`,
    )
    .all(runId)
    .map((lesson) =>
      parseJson<RunLesson>(
        (lesson as { document_json: string }).document_json,
        "AcquisitionRunLesson",
      ),
    );
  const lessonTypes = new Set(lessons.map((lesson) => lesson.lessonType));
  if (!lessonTypes.has("AUTHORITATIVE_ENUMERATOR")) {
    throw new Error("Expected production learning lesson AUTHORITATIVE_ENUMERATOR");
  }
  if (sourceGaps.length > 0 && !lessonTypes.has("FAILURE_SIGNATURE")) {
    throw new Error("Expected production source-gap FAILURE_SIGNATURE lesson");
  }
  if (sourceGaps.length > 0 && lessonTypes.has("PLAYBOOK_SUCCESS")) {
    throw new Error("Source-gap run must not fabricate PLAYBOOK_SUCCESS");
  }
  if (sourceGaps.length === 0 && !lessonTypes.has("PLAYBOOK_SUCCESS")) {
    throw new Error("Complete source run should retain PLAYBOOK_SUCCESS");
  }
  if (lessons.some((lesson) => lesson.sourceId !== sourceId || lesson.runId !== runId)) {
    throw new Error("Persisted lessons crossed the governed run/source boundary");
  }

  const history = database
    .prepare(
      `SELECT COUNT(*) AS runs,
              AVG(CASE WHEN outcome = 'SUCCESS' THEN 1.0 ELSE 0.0 END) AS success_rate,
              AVG(coverage_ratio) AS average_coverage
       FROM acquisition_run_evidence
       WHERE playbook_id = ? AND playbook_revision = ?`,
    )
    .get("official-static-index-tree", 1) as {
    runs: number;
    success_rate: number;
    average_coverage: number | null;
  };
  assertEqual(Number(history.runs), 1, "isolated playbook history run count");
  assertEqual(
    Number(history.success_rate),
    sourceGaps.length === 0 ? 1 : 0,
    "isolated playbook strict success rate",
  );
  assertClose(
    history.average_coverage === null ? null : Number(history.average_coverage),
    resolution.artifactCoverage,
    "isolated playbook average coverage",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        version: "IP_AUSTRALIA_ACQUISITION_LEARNING_LIVE_V2",
        runId,
        sourceId,
        authoritativeInventory: expectedCount,
        accepted: evidence.counts.accepted,
        sourceGapCount: sourceGaps.length,
        sourceGaps,
        resolution: resolution.resolution,
        coverage: resolution.artifactCoverage,
        trustedDurationMs: evidence.performance.durationMs,
        trustedBytes: evidence.performance.bytes,
        etagObserved: evidence.changeDetection.etagObserved,
        lastModifiedObserved: evidence.changeDetection.lastModifiedObserved,
        lessonTypes: [...lessonTypes].sort(),
        playbookHistory: {
          runs: Number(history.runs),
          strictSuccessRate: Number(history.success_rate),
          averageCoverage: Number(history.average_coverage),
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
