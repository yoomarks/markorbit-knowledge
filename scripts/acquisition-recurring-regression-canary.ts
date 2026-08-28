import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isAcquisitionRunEvidence, isSourceFingerprint } from "@markorbit/contracts";
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

function readReport(path: string): LearningReport {
  return JSON.parse(readFileSync(path, "utf8")) as LearningReport;
}

function requireLearningEvidence(report: LearningReport, label: string) {
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

const baseline = requireLearningEvidence(readReport(requirePath("--baseline")), "baseline");
const current = requireLearningEvidence(readReport(requirePath("--current")), "current");
const output = requirePath("--output");

const result = evaluateAcquisitionRecurringRegression({
  baseline: baseline.evidence,
  current: current.evidence,
  baselineFingerprint: baseline.fingerprint,
  currentFingerprint: current.fingerprint,
});

writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (result.state === "INSUFFICIENT_EVIDENCE") {
  throw new Error(
    `Recurring acquisition canary lacks comparable evidence: ${result.reasonCodes.join(",")}`,
  );
}
if (
  ["COVERAGE_DEGRADED", "SOURCE_IDENTITY_DRIFT", "PLAYBOOK_BEHAVIOR_DRIFT"].includes(result.state)
) {
  throw new Error(
    `Recurring acquisition canary detected ${result.state}: ${result.reasonCodes.join(",")}`,
  );
}
if (result.reevaluationRequest !== null) {
  throw new Error(
    `Stable recurring acquisition canary must not emit reevaluation evidence: ${result.reevaluationRequest.id}`,
  );
}
