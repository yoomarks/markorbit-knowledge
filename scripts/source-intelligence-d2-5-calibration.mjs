import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_BASE_URL = process.env.MARKORBIT_CONTROL_PLANE_URL ?? "http://127.0.0.1:3000";
const DEFAULT_MANIFEST = "config/source-intelligence-d2-5-cohort.json";
const DEFAULT_OUTPUT = "source-intelligence-d2-5-calibration.json";
const DEFAULT_EVIDENCE_KEYS = "uspto-trademarks,finnegan,inta";

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    manifest: DEFAULT_MANIFEST,
    output: DEFAULT_OUTPUT,
    mode: "value",
    limit: 12,
    minSuccess: 1,
    keys: DEFAULT_EVIDENCE_KEYS,
    timeoutMs: 300_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--base-url" && value) {
      options.baseUrl = value;
      index += 1;
    } else if (key === "--manifest" && value) {
      options.manifest = value;
      index += 1;
    } else if (key === "--output" && value) {
      options.output = value;
      index += 1;
    } else if (key === "--mode" && value) {
      options.mode = value;
      index += 1;
    } else if (key === "--limit" && value) {
      options.limit = Number(value);
      index += 1;
    } else if (key === "--min-success" && value) {
      options.minSuccess = Number(value);
      index += 1;
    } else if (key === "--keys" && value) {
      options.keys = value;
      index += 1;
    } else if (key === "--timeout-ms" && value) {
      options.timeoutMs = Number(value);
      index += 1;
    } else if (key === "--help") {
      process.stdout.write(
        "Usage: node scripts/source-intelligence-d2-5-calibration.mjs --mode value|evidence [options]\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${key}`);
    }
  }
  if (!new Set(["value", "evidence"]).has(options.mode)) {
    throw new Error("--mode must be value or evidence");
  }
  if (!Number.isFinite(options.limit) || options.limit <= 0)
    throw new Error("--limit must be positive");
  if (!Number.isFinite(options.minSuccess) || options.minSuccess <= 0) {
    throw new Error("--min-success must be positive");
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be positive");
  }
  return options;
}

async function requestJson(baseUrl, pathname) {
  const response = await fetch(new URL(pathname, baseUrl));
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(
      `GET ${pathname} -> ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }
  return body;
}

function runNode(script, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else
        rejectPromise(
          new Error(`${script} exited code=${code ?? "null"} signal=${signal ?? "none"}`),
        );
    });
  });
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function weightedScore(weighted) {
  let total = 0;
  let weight = 0;
  for (const [signal, signalWeight] of weighted) {
    if (signal?.score === null || signal?.score === undefined) continue;
    total += signal.score * signalWeight;
    weight += signalWeight;
  }
  return weight === 0 ? null : clamp(total / weight);
}

function sourceValueBand(score) {
  if (score >= 80) return "VERY_HIGH";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function categoryBaseline(category) {
  switch (category) {
    case "OFFICIAL_AUTHORITY":
      return 85;
    case "OFFICIAL_GUIDANCE":
      return 80;
    case "LAW_FIRM":
      return 70;
    case "RESEARCH":
      return 65;
    case "INTERNAL":
      return 60;
    case "NEWS":
    case "TECHNICAL":
      return 55;
    case "USER_PROVIDED":
      return 50;
    case "OTHER":
      return 45;
    default:
      throw new Error(`Unknown source category in D2.5 historical projection: ${category}`);
  }
}

function localProjection(legacy, category) {
  const relevance = { score: categoryBaseline(category) };
  const authority = legacy.dimensions.AUTHORITY_SIGNAL;
  const sourceValueScore =
    weightedScore([
      [relevance, 0.4],
      [authority, 0.6],
    ]) ?? 0;
  let stage = "CAPTURED";
  if ((legacy.evidence?.rawArtifactCount ?? 0) === 0) {
    stage = "UNOBSERVED";
  } else if (
    (legacy.evidence?.rawProvenanceNodeCount ?? 0) > 0 &&
    legacy.dimensions.FRESHNESS?.score !== null &&
    legacy.dimensions.FRESHNESS?.score >= 80 &&
    legacy.dimensions.EVIDENCEABILITY?.score !== null &&
    legacy.dimensions.EVIDENCEABILITY?.score >= 50
  ) {
    stage = "CURRENT_TRACEABLE";
  } else if (
    (legacy.evidence?.rawProvenanceNodeCount ?? 0) > 0 &&
    legacy.dimensions.EVIDENCEABILITY?.score !== null &&
    legacy.dimensions.EVIDENCEABILITY?.score >= 40
  ) {
    stage = "TRACEABLE";
  }
  const maturityScore =
    stage === "UNOBSERVED"
      ? null
      : weightedScore([
          [legacy.dimensions.FRESHNESS, 0.4],
          [legacy.dimensions.EVIDENCEABILITY, 0.4],
          [legacy.dimensions.NOVELTY, 0.2],
        ]);
  return {
    sourceValuePriority: {
      score: sourceValueScore,
      band: sourceValueBand(sourceValueScore),
    },
    evidenceMaturity: { score: maturityScore, stage },
    observedAcquisitionCost: legacy.dimensions.ACQUISITION_COST,
  };
}

function projectionMatches(local, actual) {
  return (
    local.sourceValuePriority.score === actual.sourceValuePriority?.score &&
    local.sourceValuePriority.band === actual.sourceValuePriority?.band &&
    local.evidenceMaturity.score === actual.evidenceMaturity?.score &&
    local.evidenceMaturity.stage === actual.evidenceMaturity?.stage &&
    local.observedAcquisitionCost?.score === actual.decisionContext?.observedAcquisitionCost?.score
  );
}

async function pairedLatest(baseUrl, sourceId) {
  const v1Payload = await requestJson(
    baseUrl,
    `/api/source-intelligence?sourceId=${encodeURIComponent(sourceId)}`,
  );
  const v2Payload = await requestJson(
    baseUrl,
    `/api/source-intelligence?sourceId=${encodeURIComponent(sourceId)}&protocolVersion=2.0`,
  );
  const v1 = v1Payload?.assessment;
  const v2 = v2Payload?.assessment;
  if (!v1 || v1.protocolVersion !== "1.0") throw new Error(`${sourceId} missing latest v1`);
  if (!v2 || v2.protocolVersion !== "2.0") throw new Error(`${sourceId} missing latest v2`);
  if (v2.compatibility?.legacyAssessmentId !== v1.id) {
    throw new Error(`${sourceId} v2 does not project the latest persisted v1 assessment`);
  }
  return { v1, v2 };
}

function ranks(values) {
  const indexed = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const result = Array(values.length).fill(0);
  for (let start = 0; start < indexed.length;) {
    let end = start;
    while (end + 1 < indexed.length && indexed[end + 1].value === indexed[start].value) end += 1;
    const rank = (start + end + 2) / 2;
    for (let cursor = start; cursor <= end; cursor += 1) result[indexed[cursor].index] = rank;
    start = end + 1;
  }
  return result;
}

function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function spearman(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const a = ranks(left);
  const b = ranks(right);
  const meanA = average(a);
  const meanB = average(b);
  let numerator = 0;
  let leftSq = 0;
  let rightSq = 0;
  for (let index = 0; index < a.length; index += 1) {
    const x = a[index] - meanA;
    const y = b[index] - meanB;
    numerator += x * y;
    leftSq += x * x;
    rightSq += y * y;
  }
  if (leftSq === 0 || rightSq === 0) return null;
  return Number((numerator / Math.sqrt(leftSq * rightSq)).toFixed(4));
}

function countBy(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

async function valueMode(options, rawPath) {
  await runNode("scripts/source-intelligence-calibration.mjs", [
    "--base-url",
    options.baseUrl,
    "--manifest",
    options.manifest,
    "--limit",
    String(options.limit),
    "--min-success",
    String(options.minSuccess),
    "--output",
    rawPath,
  ]);
  const raw = JSON.parse(await readFile(rawPath, "utf8"));
  const results = [];
  for (const item of raw.results ?? []) {
    if (item.status !== "SUCCESS") {
      results.push(item);
      continue;
    }
    const latest = await pairedLatest(options.baseUrl, item.sourceId);
    if (
      latest.v1.priorityScore !== item.priorityScore ||
      latest.v1.operationalTier !== item.operationalTier
    ) {
      throw new Error(`${item.key} latest v1 drifted from the D2.2 calibration result`);
    }
    results.push({
      ...item,
      sourceValuePriority: latest.v2.sourceValuePriority,
      evidenceMaturity: latest.v2.evidenceMaturity,
      observedAcquisitionCost: latest.v2.decisionContext.observedAcquisitionCost,
      scheduling: latest.v2.scheduling,
      boundaries: latest.v2.boundaries,
      compatibility: latest.v2.compatibility,
    });
  }
  const successful = results.filter((item) => item.status === "SUCCESS");
  const officials = successful.filter((item) => item.authorityLevel === "PRIMARY_OFFICIAL");
  const cohortAverage = (authorityLevel) => {
    const items = successful.filter((item) => item.authorityLevel === authorityLevel);
    return items.length
      ? Number(average(items.map((item) => item.sourceValuePriority.score)).toFixed(2))
      : null;
  };
  return {
    underlyingCalibration: "D2.2_REAL_SOURCE_COHORT",
    results,
    summary: {
      attempted: results.length,
      successful: successful.length,
      failed: results.length - successful.length,
      spearmanHumanPriorityVsSourceValue: spearman(
        successful.map((item) => item.humanPriority),
        successful.map((item) => item.sourceValuePriority.score),
      ),
      sourceValueBands: countBy(successful.map((item) => item.sourceValuePriority.band)),
      evidenceMaturityStages: countBy(successful.map((item) => item.evidenceMaturity.stage)),
      primaryOfficial: {
        count: officials.length,
        veryHigh: officials.filter((item) => item.sourceValuePriority.band === "VERY_HIGH").length,
        unobserved: officials.filter((item) => item.evidenceMaturity.stage === "UNOBSERVED").length,
        averageValue: cohortAverage("PRIMARY_OFFICIAL"),
      },
      professionalAverageValue: cohortAverage("PROFESSIONAL"),
      industryAverageValue: cohortAverage("INDUSTRY"),
    },
  };
}

async function evidenceMode(options, rawPath) {
  await runNode("scripts/source-intelligence-evidence-calibration.mjs", [
    "--base-url",
    options.baseUrl,
    "--manifest",
    options.manifest,
    "--keys",
    options.keys,
    "--min-success",
    String(options.minSuccess),
    "--timeout-ms",
    String(options.timeoutMs),
    "--output",
    rawPath,
  ]);
  const raw = JSON.parse(await readFile(rawPath, "utf8"));
  const results = [];
  for (const item of raw.results ?? []) {
    if (item.status !== "SUCCESS") {
      results.push(item);
      continue;
    }
    const latest = await pairedLatest(options.baseUrl, item.sourceId);
    if (latest.v1.id !== item.after.assessmentId) {
      throw new Error(`${item.key} latest v1 does not match D2.3 post-evidence assessment`);
    }
    const localAfter = localProjection(item.after, item.category);
    if (!projectionMatches(localAfter, latest.v2)) {
      throw new Error(`${item.key} local historical projector drifted from live v2 projection`);
    }
    const before = localProjection(item.before, item.category);
    const after = {
      sourceValuePriority: latest.v2.sourceValuePriority,
      evidenceMaturity: latest.v2.evidenceMaturity,
      observedAcquisitionCost: latest.v2.decisionContext.observedAcquisitionCost,
      scheduling: latest.v2.scheduling,
      boundaries: latest.v2.boundaries,
      compatibility: latest.v2.compatibility,
    };
    const graphRelevanceStable =
      item.before.dimensions.RELEVANCE.score === item.after.dimensions.RELEVANCE.score;
    const sourceSignalsStable =
      item.before.dimensions.AUTHORITY_SIGNAL.score ===
      item.after.dimensions.AUTHORITY_SIGNAL.score;
    const sourceValueStable =
      before.sourceValuePriority.score === after.sourceValuePriority.score &&
      before.sourceValuePriority.band === after.sourceValuePriority.band;
    const evidenceMaturityAdvanced =
      before.evidenceMaturity.stage !== after.evidenceMaturity.stage &&
      before.evidenceMaturity.stage === "UNOBSERVED";
    results.push({
      ...item,
      beforeDualAxis: before,
      afterDualAxis: after,
      invariants: {
        sourceSignalsStable,
        graphRelevanceStable,
        sourceValueStable,
        evidenceMaturityAdvanced,
        acquisitionCostSeparated:
          after.observedAcquisitionCost?.score === item.after.dimensions.ACQUISITION_COST.score,
      },
    });
  }
  const successful = results.filter((item) => item.status === "SUCCESS");
  return {
    underlyingCalibration: "D2.3_BOUNDED_BEFORE_AFTER_EVIDENCE",
    results,
    summary: {
      attempted: results.length,
      successful: successful.length,
      failed: results.length - successful.length,
      stableSourceSignals: successful.filter((item) => item.invariants.sourceSignalsStable).length,
      stableGraphRelevance: successful.filter((item) => item.invariants.graphRelevanceStable)
        .length,
      stableSourceValue: successful.filter((item) => item.invariants.sourceValueStable).length,
      advancedEvidenceMaturity: successful.filter(
        (item) => item.invariants.evidenceMaturityAdvanced,
      ).length,
      transitions: successful.map((item) => ({
        key: item.key,
        sourceValue: `${item.beforeDualAxis.sourceValuePriority.band}->${item.afterDualAxis.sourceValuePriority.band}`,
        evidenceMaturity: `${item.beforeDualAxis.evidenceMaturity.stage}->${item.afterDualAxis.evidenceMaturity.stage}`,
        acquisitionCost: `${item.beforeDualAxis.observedAcquisitionCost?.score ?? "unknown"}->${item.afterDualAxis.observedAcquisitionCost?.score ?? "unknown"}`,
      })),
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workdir = await mkdtemp(join(tmpdir(), "markorbit-d2-5-"));
  const rawPath = join(workdir, `${options.mode}-underlying.json`);
  try {
    const calibration =
      options.mode === "value"
        ? await valueMode(options, rawPath)
        : await evidenceMode(options, rawPath);
    const report = {
      reportVersion: "2.0",
      protocolVersion: "2.0",
      calibrationStage: "D2.5",
      calibrationMode:
        options.mode === "value"
          ? "DUAL_AXIS_REAL_SOURCE_VALUE"
          : "DUAL_AXIS_BOUNDED_EVIDENCE_PROGRESSION",
      observedAt: new Date().toISOString(),
      manifest: options.manifest,
      underlyingCalibration: calibration.underlyingCalibration,
      boundaries: {
        explicitAuthorityInputOnly: true,
        legalTruthVerified: false,
        professionalQualityVerified: false,
        identityVerified: false,
        noAutomaticProductionScheduling: true,
        schedulingPolicyStatus: "NOT_AUTHORIZED_UNCALIBRATED",
        collectionAuthorized: options.mode === "evidence",
        collectionOnlyAfterExplicitAuthorization: true,
        collectionMaxDepth: options.mode === "evidence" ? 0 : null,
        collectionMaxItemsPerSource: options.mode === "evidence" ? 1 : null,
      },
      summary: calibration.summary,
      results: calibration.results,
    };
    await writeFile(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    process.stdout.write(`d2.5.report ${resolve(options.output)}\n`);
    if (report.summary.successful < options.minSuccess) {
      throw new Error(
        `D2.5 ${options.mode} calibration produced ${report.summary.successful} successes; minimum is ${options.minSuccess}`,
      );
    }
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
