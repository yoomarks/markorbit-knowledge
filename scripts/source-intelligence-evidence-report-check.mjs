#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const options = {
    report: "source-intelligence-evidence-calibration.json",
    minSuccess: 2,
    requirePositiveEvidenceDelta: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--report" && next) options.report = next;
    else if (token === "--min-success" && next) options.minSuccess = Number(next);
    else if (token === "--allow-zero-evidence-delta") options.requirePositiveEvidenceDelta = false;
    else continue;
    if (token !== "--allow-zero-evidence-delta") index += 1;
  }
  if (!Number.isInteger(options.minSuccess) || options.minSuccess < 1) {
    throw new Error("--min-success must be a positive integer");
  }
  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function validateBoundary(report, key) {
  assert(report.boundaries?.[key] === true, `Missing required boundary: ${key}`);
}

function validateSuccessfulResult(result, requirePositiveEvidenceDelta) {
  assert(
    typeof result.key === "string" && result.key.length > 0,
    "Successful result is missing key",
  );
  assert(result.connector === "crawl4ai-web@1.1.0", `${result.key}: connector drift`);
  assert(
    result.collectionPolicy?.explicitlyAuthorized === true,
    `${result.key}: collection was not explicitly authorized`,
  );
  assert(
    result.collectionPolicy?.isolatedCalibrationOnly === true,
    `${result.key}: calibration isolation boundary missing`,
  );
  assert(result.collectionPolicy?.maxDepth === 0, `${result.key}: maxDepth must remain 0`);
  assert(result.collectionPolicy?.maxItems === 1, `${result.key}: maxItems must remain 1`);
  assert(result.collectionPolicy?.respectRobots === true, `${result.key}: robots boundary missing`);
  assert(array(result.artifacts?.kinds).includes("HTML"), `${result.key}: HTML artifact missing`);
  assert(
    array(result.artifacts?.kinds).includes("MARKDOWN"),
    `${result.key}: MARKDOWN artifact missing`,
  );
  assert(
    (result.artifacts?.htmlExtractedIntoGraph ?? 0) > 0,
    `${result.key}: no HTML was extracted into source graph`,
  );
  assert(
    (result.after?.evidence?.rawArtifactCount ?? 0) >=
      (result.before?.evidence?.rawArtifactCount ?? 0),
    `${result.key}: raw artifact count regressed`,
  );
  assert(
    (result.after?.evidence?.graphNodeCount ?? 0) >=
      (result.before?.evidence?.graphNodeCount ?? 0),
    `${result.key}: graph node count regressed`,
  );

  const evidenceDelta = result.delta?.rawArtifactCount ?? 0;
  const provenanceDelta = result.delta?.rawProvenanceNodeCount ?? 0;
  const graphDelta = result.delta?.graphNodeCount ?? 0;
  if (requirePositiveEvidenceDelta) {
    assert(
      evidenceDelta > 0 || provenanceDelta > 0 || graphDelta > 0,
      `${result.key}: collection completed without a positive evidence delta`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportPath = resolve(options.report);
  const report = JSON.parse(await readFile(reportPath, "utf8"));

  assert(report.reportVersion === "1.0", "Unsupported evidence calibration report version");
  assert(
    report.calibrationMode === "BEFORE_AFTER_BOUNDED_RAW_EVIDENCE",
    "Unexpected calibration mode",
  );
  for (const key of [
    "isolatedRegistryRequired",
    "humanAcceptanceExplicit",
    "collectionAuthorizationExplicit",
    "collectionIsCalibrationOnly",
    "robotsRespected",
    "tierIsOperationalPriorityNotAuthority",
    "evidenceDoesNotVerifyLegalTruth",
    "noCrossSourceEntityResolution",
    "noAutomaticProductionScheduling",
  ]) {
    validateBoundary(report, key);
  }
  assert(report.boundaries?.collectionMaxDepth === 0, "collectionMaxDepth boundary drifted");
  assert(
    report.boundaries?.collectionMaxItemsPerSource === 1,
    "collectionMaxItemsPerSource boundary drifted",
  );

  const successful = array(report.results).filter((result) => result?.status === "SUCCESS");
  assert(
    successful.length >= options.minSuccess,
    `Only ${successful.length} successful sources; minimum is ${options.minSuccess}`,
  );
  for (const result of successful) {
    validateSuccessfulResult(result, options.requirePositiveEvidenceDelta);
  }

  const failed = array(report.results).filter((result) => result?.status === "FAILED");
  const summary = {
    report: reportPath,
    successful: successful.length,
    failed: failed.length,
    keys: successful.map((result) => result.key),
    scoreTransitions: successful.map((result) => ({
      key: result.key,
      before: result.before?.priorityScore ?? null,
      after: result.after?.priorityScore ?? null,
      tierBefore: result.before?.operationalTier ?? null,
      tierAfter: result.after?.operationalTier ?? null,
    })),
    evidenceDeltas: successful.map((result) => ({
      key: result.key,
      artifacts: result.delta?.rawArtifactCount ?? null,
      rawProvenanceNodes: result.delta?.rawProvenanceNodeCount ?? null,
      graphNodes: result.delta?.graphNodeCount ?? null,
    })),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
