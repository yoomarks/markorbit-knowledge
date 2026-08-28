import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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

const baseline = readReport(requirePath("--baseline"));
const current = readReport(requirePath("--current"));
const output = requirePath("--output");

const result = evaluateAcquisitionRecurringRegression({
  baseline: baseline.acquisitionLearning?.evidence as never,
  current: current.acquisitionLearning?.evidence as never,
  baselineFingerprint: baseline.acquisitionLearning?.fingerprint as never,
  currentFingerprint: current.acquisitionLearning?.fingerprint as never,
});

writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (result.state === "INSUFFICIENT_EVIDENCE") {
  throw new Error(`Recurring acquisition canary lacks comparable evidence: ${result.reasonCodes.join(",")}`);
}
if (["COVERAGE_DEGRADED", "SOURCE_IDENTITY_DRIFT", "PLAYBOOK_BEHAVIOR_DRIFT"].includes(result.state)) {
  throw new Error(`Recurring acquisition canary detected ${result.state}: ${result.reasonCodes.join(",")}`);
}
