#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const VALIDATION_STATES = new Set(["PENDING_REAL_RUN", "VALIDATED", "BLOCKED"]);
const PRIORITIES = new Set(["P0", "P1", "P2"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    manifest: "config/production-validation-wave-1.json",
    report: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--manifest" && value) options.manifest = value;
    else if (token === "--report" && value) options.report = value;
    else continue;
    index += 1;
  }
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

function validateManifest(manifest) {
  assert(manifest.manifestVersion === "1.0", "Unsupported manifestVersion");
  assert(typeof manifest.waveId === "string" && manifest.waveId.length > 0, "waveId is required");
  assert(
    manifest.governance?.collectionAuthorizationRequired === true,
    "Collection authorization boundary must remain explicit",
  );
  assert(
    manifest.governance?.discoveryDoesNotActivateSource === true,
    "Discovery must not activate a source",
  );
  assert(
    manifest.governance?.noAutomaticProductionScheduling === true,
    "Wave manifest must not authorize automatic production scheduling",
  );
  assert(
    manifest.governance?.realObservationsOnly === true,
    "Production observations must be real",
  );
  assert(
    Array.isArray(manifest.targets) && manifest.targets.length >= 10,
    "Wave requires >= 10 targets",
  );

  const ids = new Set();
  const uris = new Set();
  for (const target of manifest.targets) {
    assert(typeof target.id === "string" && target.id.length > 0, "Target id is required");
    assert(!ids.has(target.id), `Duplicate target id: ${target.id}`);
    ids.add(target.id);
    assert(
      typeof target.canonicalUri === "string" && target.canonicalUri.startsWith("https://"),
      `${target.id}: canonicalUri must use https`,
    );
    assert(!uris.has(target.canonicalUri), `Duplicate canonicalUri: ${target.canonicalUri}`);
    uris.add(target.canonicalUri);
    assert(target.sourceClass === "OFFICIAL_AUTHORITY", `${target.id}: Wave 1 is official-only`);
    assert(PRIORITIES.has(target.priority), `${target.id}: unsupported priority`);
    assert(
      VALIDATION_STATES.has(target.validationState),
      `${target.id}: unsupported validationState`,
    );
  }
  return ids;
}

function validateReport(report, manifest, targetIds) {
  assert(report.reportVersion === "1.0", "Unsupported reportVersion");
  assert(report.waveId === manifest.waveId, "Report waveId does not match manifest");
  assert(Array.isArray(report.results), "Report results must be an array");

  const resultIds = new Set();
  for (const result of report.results) {
    assert(targetIds.has(result.targetId), `Unknown report targetId: ${result.targetId}`);
    assert(!resultIds.has(result.targetId), `Duplicate report targetId: ${result.targetId}`);
    resultIds.add(result.targetId);

    for (const key of [
      "discovery",
      "onboarding",
      "collection",
      "artifact",
      "conversion",
      "knowledge",
    ]) {
      assert(
        result[key] && typeof result[key].status === "string",
        `${result.targetId}: ${key}.status required`,
      );
    }
    assert(
      result.secondRun && typeof result.secondRun.status === "string",
      `${result.targetId}: secondRun.status required`,
    );
    assert(
      result.http && typeof result.http === "object",
      `${result.targetId}: http metrics required`,
    );
    assert(
      result.runtime && typeof result.runtime === "object",
      `${result.targetId}: runtime metrics required`,
    );
    assert(
      typeof result.runtime.manualInterventionRequired === "boolean",
      `${result.targetId}: manualInterventionRequired must be boolean`,
    );
    assert(
      typeof result.runtime.adapterRequired === "boolean",
      `${result.targetId}: adapterRequired must be boolean`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await readJson(options.manifest);
  const targetIds = validateManifest(manifest);

  const summary = {
    waveId: manifest.waveId,
    targets: manifest.targets.length,
    p0: manifest.targets.filter((target) => target.priority === "P0").length,
    p1: manifest.targets.filter((target) => target.priority === "P1").length,
    reportChecked: false,
  };

  if (options.report) {
    const report = await readJson(options.report);
    validateReport(report, manifest, targetIds);
    summary.reportChecked = true;
    summary.reportResults = report.results.length;
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
