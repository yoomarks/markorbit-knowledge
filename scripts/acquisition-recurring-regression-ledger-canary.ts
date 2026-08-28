import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isAcquisitionRunEvidence, isSourceFingerprint } from "@markorbit/contracts";
import { SqliteAcquisitionRecurringRegressionLedger } from "../packages/persistence/src/acquisition-recurring-regression-ledger";
import { evaluateAcquisitionRecurringRegression } from "../apps/admin/src/server/acquisition-recurring-regression";

type LearningReport = {
  acquisitionLearning?: {
    evidence?: unknown;
    fingerprint?: unknown;
  };
};

function requirePath(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${flag} is required`);
  return resolve(value);
}

function requireLearningEvidence(path: string, label: string) {
  const report = JSON.parse(readFileSync(path, "utf8")) as LearningReport;
  const evidence = report.acquisitionLearning?.evidence;
  const fingerprint = report.acquisitionLearning?.fingerprint;
  if (!isAcquisitionRunEvidence(evidence)) {
    throw new Error(`${label} report is missing valid AcquisitionRunEvidence`);
  }
  if (!isSourceFingerprint(fingerprint)) {
    throw new Error(`${label} report is missing valid SourceFingerprint`);
  }
  return { evidence, fingerprint };
}

const databasePath = process.env.MARKORBIT_KNOWLEDGE_DB_PATH;
if (!databasePath) throw new Error("MARKORBIT_KNOWLEDGE_DB_PATH is required");

const baseline = requireLearningEvidence(requirePath("--baseline"), "baseline");
const current = requireLearningEvidence(requirePath("--current"), "current");
const output = requirePath("--output");
const workflowRunId = process.env.GITHUB_RUN_ID ?? "local-canary";

const comparison = evaluateAcquisitionRecurringRegression({
  baseline: baseline.evidence,
  current: current.evidence,
  baselineFingerprint: baseline.fingerprint,
  currentFingerprint: current.fingerprint,
});
if (!["UNCHANGED", "EXPECTED_CHANGE"].includes(comparison.state)) {
  throw new Error(`Live ledger canary requires a non-regressed pair, got ${comparison.state}`);
}
if (comparison.reevaluationRequest !== null) {
  throw new Error("Stable live ledger canary unexpectedly emitted re-evaluation evidence");
}

let database = new DatabaseSync(databasePath);
let ledger = new SqliteAcquisitionRecurringRegressionLedger(database);
const snapshot = ledger.recordSnapshot(comparison);
const replay = ledger.recordSnapshot(comparison);
if (snapshot.id !== replay.id) throw new Error("Regression snapshot replay was not idempotent");
if (ledger.getAcceptedBaseline(comparison) !== null) {
  throw new Error("Recording a recurring regression snapshot silently advanced the baseline");
}

const advancement = ledger.advanceBaseline(snapshot.id, {
  decision: "APPROVED",
  authorizationRef: `workflow:${workflowRunId}:country-index-baseline-advancement`,
  actor: {
    actorType: "SYSTEM",
    actorId: "country-index-regression-ledger-live-canary",
  },
  rationale:
    "Bounded exact-head live canary explicitly accepts the second real Country Index acquisition as the test baseline.",
  advancedAt: new Date().toISOString(),
  evidenceRefs: [`github-actions-run:${workflowRunId}`],
});
if (advancement.event.boundaries.autoDispatchApplied !== false) {
  throw new Error("Baseline advancement crossed auto-dispatch boundary");
}
if (advancement.event.boundaries.autoPromotionApplied !== false) {
  throw new Error("Baseline advancement crossed auto-promotion boundary");
}
if (advancement.event.boundaries.activePlaybookRewritten !== false) {
  throw new Error("Baseline advancement rewrote active playbook state");
}

database.close();
database = new DatabaseSync(databasePath);
ledger = new SqliteAcquisitionRecurringRegressionLedger(database);
const history = ledger.listHistory(comparison);
const acceptedBaseline = ledger.getAcceptedBaseline(comparison);
const advancementHistory = ledger.listBaselineAdvancements(comparison);
if (history.length !== 1 || history[0]?.id !== snapshot.id) {
  throw new Error("Regression snapshot did not survive SQLite restart");
}
if (acceptedBaseline?.runId !== comparison.currentRunId || acceptedBaseline.version !== 1) {
  throw new Error("Accepted baseline pointer did not survive SQLite restart");
}
if (advancementHistory.length !== 1 || advancementHistory[0]?.id !== advancement.event.id) {
  throw new Error("Baseline advancement history did not survive SQLite restart");
}

database.close();

const accepted = {
  event: "country-index.recurring-regression-ledger.accepted",
  workflowRunId,
  snapshotId: snapshot.id,
  comparisonState: comparison.state,
  baselineRunId: comparison.baselineRunId,
  currentRunId: comparison.currentRunId,
  replayIdentical: replay.id === snapshot.id,
  acceptedBaseline,
  advancementEvent: advancement.event,
  historyCount: history.length,
  advancementHistoryCount: advancementHistory.length,
};
writeFileSync(output, `${JSON.stringify(accepted, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(accepted, null, 2)}\n`);
