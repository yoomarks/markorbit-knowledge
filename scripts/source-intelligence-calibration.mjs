#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const VALID_CATEGORIES = new Set([
  "OFFICIAL_AUTHORITY",
  "OFFICIAL_GUIDANCE",
  "LAW_FIRM",
  "NEWS",
  "RESEARCH",
  "TECHNICAL",
  "INTERNAL",
  "USER_PROVIDED",
  "OTHER",
]);
const VALID_AUTHORITIES = new Set([
  "PRIMARY_OFFICIAL",
  "SECONDARY_OFFICIAL",
  "PROFESSIONAL",
  "INDUSTRY",
  "COMMUNITY",
  "INTERNAL",
  "UNKNOWN",
]);

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.MARKORBIT_CONTROL_PLANE_URL ?? "http://127.0.0.1:3000",
    manifest: "config/source-intelligence-calibration-cohort.json",
    output: process.env.RUNNER_TEMP
      ? `${process.env.RUNNER_TEMP}/source-intelligence-calibration.json`
      : "source-intelligence-calibration.json",
    limit: Number.POSITIVE_INFINITY,
    minSuccess: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--base-url" && next) options.baseUrl = next;
    else if (token === "--manifest" && next) options.manifest = next;
    else if (token === "--output" && next) options.output = next;
    else if (token === "--limit" && next) options.limit = Number(next);
    else if (token === "--min-success" && next) options.minSuccess = Number(next);
    else continue;
    index += 1;
  }
  if (!Number.isInteger(options.limit) && options.limit !== Number.POSITIVE_INFINITY) {
    throw new Error("--limit must be an integer");
  }
  if (options.limit <= 0) throw new Error("--limit must be positive");
  if (!Number.isInteger(options.minSuccess) || options.minSuccess < 0) {
    throw new Error("--min-success must be a non-negative integer");
  }
  return options;
}

function assertManifest(manifest) {
  if (!manifest || manifest.version !== "1.0" || !Array.isArray(manifest.sources)) {
    throw new Error("Calibration manifest must be version 1.0 with a sources array");
  }
  const keys = new Set();
  for (const source of manifest.sources) {
    if (!source || typeof source !== "object")
      throw new Error("Each calibration source must be an object");
    for (const field of ["key", "name", "locator", "category", "authorityLevel"]) {
      if (typeof source[field] !== "string" || source[field].trim() === "") {
        throw new Error(`Calibration source is missing ${field}`);
      }
    }
    if (keys.has(source.key)) throw new Error(`Duplicate calibration key: ${source.key}`);
    keys.add(source.key);
    const locator = new URL(source.locator);
    if (locator.protocol !== "https:") throw new Error(`${source.key} must use https`);
    if (!VALID_CATEGORIES.has(source.category)) {
      throw new Error(`${source.key} has unsupported category ${source.category}`);
    }
    if (!VALID_AUTHORITIES.has(source.authorityLevel)) {
      throw new Error(`${source.key} has unsupported authority ${source.authorityLevel}`);
    }
    if (!Array.isArray(source.jurisdictions) || source.jurisdictions.length === 0) {
      throw new Error(`${source.key} must declare jurisdictions`);
    }
    if (!Array.isArray(source.languages) || source.languages.length === 0) {
      throw new Error(`${source.key} must declare languages`);
    }
    if (
      !Number.isInteger(source.humanPriority) ||
      source.humanPriority < 1 ||
      source.humanPriority > 5
    ) {
      throw new Error(`${source.key} humanPriority must be an integer from 1 to 5`);
    }
  }
}

function normalizedHost(value) {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
}

function candidatePriority(candidate) {
  const priority = candidate?.priority ?? candidate?.relevancePriority;
  const priorityScore = { HIGH: 3, MEDIUM: 2, LOW: 1 }[priority] ?? 0;
  const relevanceScore = Number.isFinite(candidate?.relevanceScore) ? candidate.relevanceScore : 0;
  return priorityScore * 1000 + relevanceScore;
}

function chooseCandidate(locator, candidates) {
  const seed = new URL(locator);
  const host = normalizedHost(locator);
  const sameHost = candidates.filter((candidate) => {
    if (
      !candidate ||
      candidate.status !== "DISCOVERED" ||
      typeof candidate.candidateId !== "string"
    ) {
      return false;
    }
    try {
      return normalizedHost(candidate.locator) === host;
    } catch {
      return false;
    }
  });
  if (sameHost.length === 0) return null;
  const seedPrefix = seed.pathname === "/" ? null : seed.pathname.replace(/\/$/, "");
  return [...sameHost].sort((left, right) => {
    if (seedPrefix) {
      const leftMatches = new URL(left.locator).pathname.startsWith(seedPrefix) ? 1 : 0;
      const rightMatches = new URL(right.locator).pathname.startsWith(seedPrefix) ? 1 : 0;
      if (leftMatches !== rightMatches) return rightMatches - leftMatches;
    }
    return candidatePriority(right) - candidatePriority(left);
  })[0];
}

async function requestJson(baseUrl, path, init = {}, timeoutMs = 30000) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message = body?.error?.message ?? body?.message ?? text ?? `${response.status}`;
    throw new Error(`${response.status} ${path}: ${message}`);
  }
  return body;
}

function average(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rank(values) {
  const indexed = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  let position = 0;
  while (position < indexed.length) {
    let end = position + 1;
    while (end < indexed.length && indexed[end].value === indexed[position].value) end += 1;
    const averageRank = (position + 1 + end) / 2;
    for (let cursor = position; cursor < end; cursor += 1)
      ranks[indexed[cursor].index] = averageRank;
    position = end;
  }
  return ranks;
}

function pearson(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = average(left);
  const rightMean = average(right);
  let numerator = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const x = left[index] - leftMean;
    const y = right[index] - rightMean;
    numerator += x * y;
    leftSquared += x * x;
    rightSquared += y * y;
  }
  const denominator = Math.sqrt(leftSquared * rightSquared);
  return denominator === 0 ? null : numerator / denominator;
}

function spearman(rows) {
  if (rows.length < 3) return null;
  return pearson(
    rank(rows.map((row) => row.humanPriority)),
    rank(rows.map((row) => row.priorityScore)),
  );
}

function summarize(results) {
  const successful = results.filter((result) => result.status === "SUCCESS");
  const failed = results.filter((result) => result.status === "FAILED");
  const tierCounts = { A: 0, B: 0, C: 0, D: 0 };
  const authorityScores = {};
  for (const result of successful) {
    tierCounts[result.operationalTier] += 1;
    authorityScores[result.authorityLevel] ??= [];
    authorityScores[result.authorityLevel].push(result.priorityScore);
  }
  const authorityAverages = Object.fromEntries(
    Object.entries(authorityScores).map(([authority, scores]) => [
      authority,
      Number(average(scores).toFixed(2)),
    ]),
  );
  const ordered = [...successful].sort((left, right) => right.priorityScore - left.priorityScore);
  return {
    attempted: results.length,
    successful: successful.length,
    failed: failed.length,
    tierCounts,
    authorityAverages,
    spearmanHumanVsMachine:
      successful.length >= 3 ? Number(spearman(successful)?.toFixed(4) ?? "NaN") : null,
    machineOrder: ordered.map((item) => ({
      key: item.key,
      score: item.priorityScore,
      tier: item.operationalTier,
      humanPriority: item.humanPriority,
    })),
  };
}

async function calibrateSource(baseUrl, source) {
  const startedAt = new Date().toISOString();
  const discovery = await requestJson(
    baseUrl,
    "/api/discovery",
    {
      method: "POST",
      body: JSON.stringify({
        locator: source.locator,
        maxDepth: 1,
        maxCandidates: 40,
        maxFetches: 8,
        deniedUrlPatterns: ["/login", "/signin", "/logout", "/account"],
      }),
    },
    180000,
  );
  const candidates = Array.isArray(discovery?.candidates) ? discovery.candidates : [];
  const selected = chooseCandidate(source.locator, candidates);
  if (!selected)
    throw new Error(
      `No governed DISCOVERED candidate remained on ${normalizedHost(source.locator)}`,
    );

  const review = await requestJson(
    baseUrl,
    `/api/discovery/candidates/${selected.candidateId}/review`,
    {
      method: "POST",
      body: JSON.stringify({
        decision: "ACCEPTED",
        reviewer: "source-intelligence-calibration-v1",
        note: "Explicit isolated calibration acceptance from the human-maintained calibration manifest; never a production auto-accept policy.",
      }),
    },
  );
  if (review?.candidate?.candidate?.status !== "ACCEPTED") {
    throw new Error("Calibration review did not reach ACCEPTED");
  }
  if (
    review?.source?.connector?.connectorId !== "crawl4ai-web" ||
    review?.source?.connector?.version !== "1.2.0"
  ) {
    throw new Error(
      `Calibration Source is not on crawl4ai-web@1.2.0: ${JSON.stringify(review?.source?.connector)}`,
    );
  }
  if (review?.plan?.status !== "PAUSED") {
    throw new Error("Candidate acceptance crossed the collection authorization boundary");
  }

  const currentSource = review.source;
  const patch = await requestJson(baseUrl, `/api/sources/${currentSource.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      expectedUpdatedAt: currentSource.updatedAt,
      name: source.name,
      category: source.category,
      authorityLevel: source.authorityLevel,
      jurisdictions: source.jurisdictions,
      languages: source.languages,
      tags: [
        ...new Set([
          ...(currentSource.tags ?? []),
          "source-intelligence-calibration",
          `calibration:${source.key}`,
        ]),
      ],
    }),
  });

  const assessmentResponse = await requestJson(baseUrl, "/api/source-intelligence", {
    method: "POST",
    body: JSON.stringify({ sourceId: patch.source.id }),
  });
  const assessment = assessmentResponse?.assessment;
  if (!assessment) throw new Error("Source Intelligence did not return an assessment");
  if (assessment.input?.explicitAuthorityLevel !== source.authorityLevel) {
    throw new Error(
      `Authority drift: expected ${source.authorityLevel}, observed ${assessment.input?.explicitAuthorityLevel}`,
    );
  }

  return {
    key: source.key,
    name: source.name,
    locator: source.locator,
    status: "SUCCESS",
    humanPriority: source.humanPriority,
    category: source.category,
    authorityLevel: source.authorityLevel,
    sourceId: patch.source.id,
    planId: review.plan.id,
    planStatusAfterAcceptance: review.plan.status,
    connector: patch.source.connector,
    discovery: {
      candidateCount: candidates.length,
      selectedCandidateId: selected.candidateId,
      selectedLocator: selected.locator,
      selectedMethod: selected.discoveryMethod ?? null,
    },
    operationalTier: assessment.operationalTier,
    priorityScore: assessment.priorityScore,
    recommendedRescan: assessment.recommendedRescan,
    evidence: {
      graphNodeCount: assessment.input.graphNodeCount,
      contentNodeCount: assessment.input.contentNodeCount,
      relevantContentNodeCount: assessment.input.relevantContentNodeCount,
      retainedNodeCount: assessment.input.retainedNodeCount,
      rawProvenanceNodeCount: assessment.input.rawProvenanceNodeCount,
      rawArtifactCount: assessment.input.rawArtifactCount,
    },
    dimensions: assessment.dimensions,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(options.manifest);
  const outputPath = resolve(options.output);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assertManifest(manifest);
  const cohort = manifest.sources.slice(0, options.limit);
  const results = [];

  for (const source of cohort) {
    process.stdout.write(`calibration.start ${source.key} ${source.locator}\n`);
    try {
      const result = await calibrateSource(options.baseUrl, source);
      results.push(result);
      process.stdout.write(
        `calibration.success ${source.key} tier=${result.operationalTier} score=${result.priorityScore} candidates=${result.discovery.candidateCount}\n`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        key: source.key,
        name: source.name,
        locator: source.locator,
        status: "FAILED",
        humanPriority: source.humanPriority,
        category: source.category,
        authorityLevel: source.authorityLevel,
        error: message,
      });
      process.stderr.write(`calibration.failed ${source.key}: ${message}\n`);
    }
  }

  const report = {
    reportVersion: "1.0",
    calibrationMode: "DISCOVERY_GRAPH_ONLY",
    observedAt: new Date().toISOString(),
    manifestVersion: manifest.version,
    baseUrl: options.baseUrl,
    boundaries: {
      collectionAuthorized: false,
      collectionExecuted: false,
      tierIsOperationalPriorityNotAuthority: true,
      humanLabelsAreExplicitCalibrationInputs: true,
      failuresAreObservedNotSilentlyDropped: true,
    },
    summary: summarize(results),
    results,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  process.stdout.write(`calibration.report ${outputPath}\n`);

  if (report.summary.successful < options.minSuccess) {
    throw new Error(
      `Calibration produced ${report.summary.successful} successful sources; minimum is ${options.minSuccess}`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
