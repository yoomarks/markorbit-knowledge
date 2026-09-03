#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const DEFAULT_KEYS = ["uspto-trademarks", "finnegan", "inta"];
const TERMINAL_RUN_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.MARKORBIT_CONTROL_PLANE_URL ?? "http://127.0.0.1:3000",
    manifest: "config/source-intelligence-calibration-cohort.json",
    output: process.env.RUNNER_TEMP
      ? `${process.env.RUNNER_TEMP}/source-intelligence-evidence-calibration.json`
      : "source-intelligence-evidence-calibration.json",
    keys: [...DEFAULT_KEYS],
    minSuccess: 2,
    timeoutMs: 300_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--base-url" && next) options.baseUrl = next;
    else if (token === "--manifest" && next) options.manifest = next;
    else if (token === "--output" && next) options.output = next;
    else if (token === "--keys" && next)
      options.keys = next
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    else if (token === "--min-success" && next) options.minSuccess = Number(next);
    else if (token === "--timeout-ms" && next) options.timeoutMs = Number(next);
    else continue;
    index += 1;
  }
  const normalized = new URL(options.baseUrl);
  if (!new Set(["http:", "https:"]).has(normalized.protocol)) {
    throw new Error("--base-url must use http or https");
  }
  options.baseUrl = normalized.toString().replace(/\/$/, "");
  if (options.keys.length === 0)
    throw new Error("--keys must contain at least one calibration key");
  if (!Number.isInteger(options.minSuccess) || options.minSuccess < 1) {
    throw new Error("--min-success must be a positive integer");
  }
  if (
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 30_000 ||
    options.timeoutMs > 900_000
  ) {
    throw new Error("--timeout-ms must be an integer from 30000 to 900000");
  }
  return options;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing ${field}`);
  return value;
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

async function requestJson(baseUrl, path, init = {}, timeoutMs = 60_000) {
  const response = await fetch(`${baseUrl}${path}`, {
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
    const message = body?.error?.message ?? body?.message ?? text ?? `HTTP ${response.status}`;
    throw new Error(`${response.status} ${path}: ${message}`);
  }
  return body;
}

function postJson(body) {
  return { method: "POST", body: JSON.stringify(body) };
}

function patchJson(body) {
  return { method: "PATCH", body: JSON.stringify(body) };
}

function assertManifest(manifest, keys) {
  if (!manifest || manifest.version !== "1.0" || !Array.isArray(manifest.sources)) {
    throw new Error("Calibration manifest must be version 1.0 with a sources array");
  }
  const byKey = new Map(manifest.sources.map((source) => [source.key, source]));
  return keys.map((key) => {
    const source = byKey.get(key);
    if (!source) throw new Error(`Calibration manifest does not contain ${key}`);
    for (const field of ["key", "name", "locator", "category", "authorityLevel"]) {
      requiredString(source[field], `${key}.${field}`);
    }
    return source;
  });
}

function assessmentEvidence(assessment) {
  return {
    graphNodeCount: assessment.input.graphNodeCount,
    contentNodeCount: assessment.input.contentNodeCount,
    relevantContentNodeCount: assessment.input.relevantContentNodeCount,
    retainedNodeCount: assessment.input.retainedNodeCount,
    rawProvenanceNodeCount: assessment.input.rawProvenanceNodeCount,
    rawArtifactCount: assessment.input.rawArtifactCount,
    distinctArtifactHashCount: assessment.input.distinctArtifactHashCount,
    rawArtifactBytes: assessment.input.rawArtifactBytes,
    latestCapturedAt: assessment.input.latestCapturedAt ?? null,
  };
}

function dimensionDelta(before, after) {
  const result = {};
  for (const key of [
    "RELEVANCE",
    "AUTHORITY_SIGNAL",
    "FRESHNESS",
    "EVIDENCEABILITY",
    "NOVELTY",
    "ACQUISITION_COST",
  ]) {
    const beforeScore = before?.[key]?.score ?? null;
    const afterScore = after?.[key]?.score ?? null;
    result[key] = {
      before: beforeScore,
      after: afterScore,
      delta:
        typeof beforeScore === "number" && typeof afterScore === "number"
          ? afterScore - beforeScore
          : null,
      beforeReasons: before?.[key]?.reasonCodes ?? [],
      afterReasons: after?.[key]?.reasonCodes ?? [],
    };
  }
  return result;
}

async function prepareSource(baseUrl, source) {
  const discovery = await requestJson(
    baseUrl,
    "/api/discovery",
    postJson({
      locator: source.locator,
      maxDepth: 1,
      maxCandidates: 40,
      maxFetches: 8,
      deniedUrlPatterns: ["/login", "/signin", "/logout", "/account"],
    }),
    180_000,
  );
  const candidates = array(discovery?.candidates);
  const selected = chooseCandidate(source.locator, candidates);
  if (!selected)
    throw new Error(
      `No governed DISCOVERED candidate remained on ${normalizedHost(source.locator)}`,
    );

  const review = await requestJson(
    baseUrl,
    `/api/discovery/candidates/${encodeURIComponent(selected.candidateId)}/review`,
    postJson({
      decision: "ACCEPTED",
      reviewer: "source-intelligence-evidence-calibration-v1",
      note: "Explicit isolated D2.3 calibration acceptance. This is not a production auto-accept policy and does not itself authorize collection.",
    }),
  );
  if (review?.candidate?.candidate?.status !== "ACCEPTED") {
    throw new Error(`${source.key} review did not reach ACCEPTED`);
  }
  if (
    review?.source?.connector?.connectorId !== "crawl4ai-web" ||
    review?.source?.connector?.version !== "1.2.0"
  ) {
    throw new Error(`${source.key} is not using crawl4ai-web@1.2.0`);
  }
  if (review?.plan?.status !== "PAUSED") {
    throw new Error(`${source.key} acceptance crossed the collection authorization boundary`);
  }

  const currentSource = review.source;
  const patchedSource = await requestJson(
    baseUrl,
    `/api/sources/${encodeURIComponent(currentSource.id)}`,
    patchJson({
      expectedUpdatedAt: currentSource.updatedAt,
      name: source.name,
      category: source.category,
      authorityLevel: source.authorityLevel,
      jurisdictions: source.jurisdictions,
      languages: source.languages,
      tags: [
        ...new Set([
          ...(currentSource.tags ?? []),
          "source-intelligence-evidence-calibration",
          `calibration:${source.key}`,
        ]),
      ],
    }),
  );

  const planPolicy = review.plan.policy ?? {};
  await requestJson(
    baseUrl,
    `/api/plans/${encodeURIComponent(review.plan.id)}`,
    patchJson({
      expectedUpdatedAt: review.plan.updatedAt,
      priority: "NORMAL",
      policy: {
        ...planPolicy,
        includePatterns: [source.locator],
        excludePatterns: ["*[?]*", "*/login*", "*/signin*", "*/account*"],
        maxDepth: 0,
        maxItems: 1,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: true,
        rateLimitPerMinute: 6,
        timeoutSeconds: 45,
        retry: { maxAttempts: 2, backoffSeconds: 10 },
      },
      output: { artifactKinds: ["HTML", "MARKDOWN"] },
    }),
  );

  const beforeResponse = await requestJson(
    baseUrl,
    "/api/source-intelligence",
    postJson({ sourceId: patchedSource.source.id }),
  );
  const before = beforeResponse?.assessment;
  if (!before) throw new Error(`${source.key} baseline assessment missing`);

  return {
    source,
    candidateId: selected.candidateId,
    sourceId: patchedSource.source.id,
    planId: review.plan.id,
    before,
    discoveryCandidateCount: candidates.length,
    selectedLocator: selected.locator,
  };
}

async function createCalibrationWorker(baseUrl) {
  const created = await requestJson(
    baseUrl,
    "/api/workers",
    postJson({
      displayName: "Source Intelligence D2.3 Calibration Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: "crawl4ai-worker", version: "1.0.0" },
      supportedJobTypes: ["WEB_CRAWL"],
      connectorBindings: [
        {
          connectorId: "crawl4ai-web",
          version: "1.2.0",
          capabilities: ["COLLECT", "DEEP_CRAWL", "RENDER_JAVASCRIPT"],
        },
      ],
      maxConcurrency: 1,
      labels: ["calibration", "source-intelligence-d2.3", "crawl4ai"],
      extensions: { "x-markorbit-isolated-calibration": true },
    }),
  );
  const worker = record(record(created?.view)?.worker);
  return {
    workerId: requiredString(worker?.id, "worker.id"),
    credential: requiredString(created?.credential, "worker.credential"),
  };
}

function startWorker(baseUrl, worker) {
  const child = spawn("pnpm", ["--filter", "@markorbit/worker", "start"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      MARKORBIT_CONTROL_PLANE_URL: baseUrl,
      MARKORBIT_WORKER_ID: worker.workerId,
      MARKORBIT_WORKER_CREDENTIAL: worker.credential,
      MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY: "0",
      MARKORBIT_CRAWL4AI_PYTHON: process.env.MARKORBIT_CRAWL4AI_PYTHON ?? "python",
      MARKORBIT_REPOSITORY_ROOT: process.env.MARKORBIT_REPOSITORY_ROOT ?? process.cwd(),
      MARKORBIT_CRAWL4AI_SCRIPT:
        process.env.MARKORBIT_CRAWL4AI_SCRIPT ?? resolve("workers/crawl4ai/acquire.py"),
      MARKORBIT_WORKER_POLL_INTERVAL_MS: "250",
      MARKORBIT_WORKER_KEEPALIVE_INTERVAL_MS: "10000",
      MARKORBIT_WORKER_MAX_COLLECTION_RUNTIME_MS: "180000",
      MARKORBIT_CONVERSION_ENABLED: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const logs = [];
  const capture = (chunk) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      if (!line) continue;
      logs.push(line);
      if (logs.length > 200) logs.shift();
    }
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  return { child, logs };
}

function signalWorkerTree(child, signal) {
  if (!child || child.pid === undefined) return;
  if (process.platform === "win32") {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function stopWorker(runtime) {
  if (!runtime) return;
  const { child } = runtime;
  if (child.exitCode === null) {
    signalWorkerTree(child, "SIGTERM");
    await Promise.race([
      new Promise((resolvePromise) => child.once("exit", resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000)),
    ]);
  }
  if (child.exitCode === null) {
    signalWorkerTree(child, "SIGKILL");
    await Promise.race([
      new Promise((resolvePromise) => child.once("exit", resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000)),
    ]);
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
}

function runStatus(payload) {
  return requiredString(record(record(payload)?.run)?.run?.status, "run.status");
}

async function waitForRun(baseUrl, runId, timeoutMs) {
  const started = Date.now();
  let last = "UNKNOWN";
  while (Date.now() - started < timeoutMs) {
    const payload = await requestJson(baseUrl, `/api/runs/${encodeURIComponent(runId)}`);
    last = runStatus(payload);
    if (TERMINAL_RUN_STATUSES.has(last)) return { status: last, payload };
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  throw new Error(`Run ${runId} timed out; last status=${last}`);
}

async function collectAndAssess(baseUrl, prepared, timeoutMs) {
  const authorization = await requestJson(
    baseUrl,
    `/api/discovery/candidates/${encodeURIComponent(prepared.candidateId)}/authorize-collection`,
    postJson({
      requestedBy: "source-intelligence-evidence-calibration-v1",
      idempotencyKey: `d2.3-${prepared.source.key}`,
    }),
  );
  const runId = requiredString(authorization?.run?.id, `${prepared.source.key}.run.id`);
  if (authorization?.plan?.status !== "ACTIVE") {
    throw new Error(`${prepared.source.key} explicit authorization did not activate its plan`);
  }

  const terminal = await waitForRun(baseUrl, runId, timeoutMs);
  if (terminal.status !== "COMPLETED") {
    const executions = await requestJson(
      baseUrl,
      `/api/runs/${encodeURIComponent(runId)}/executions`,
    );
    throw new Error(
      `${prepared.source.key} collection ended ${terminal.status}: ${JSON.stringify(executions)}`,
    );
  }

  const artifactPayload = await requestJson(
    baseUrl,
    `/api/artifacts?runId=${encodeURIComponent(runId)}&limit=100`,
  );
  const artifacts = array(artifactPayload?.items);
  const kinds = new Set();
  const htmlArtifacts = [];
  for (const view of artifacts) {
    const artifact = record(view?.artifact);
    if (!artifact) continue;
    if (artifact.sourceId !== prepared.sourceId) {
      throw new Error(`${prepared.source.key} artifact escaped source boundary`);
    }
    if (
      artifact.collector?.connectorId !== "crawl4ai-web" ||
      artifact.collector?.connectorVersion !== "1.2.0"
    ) {
      throw new Error(`${prepared.source.key} artifact collector drifted from crawl4ai-web@1.2.0`);
    }
    kinds.add(artifact.artifactKind);
    if (artifact.artifactKind === "HTML") htmlArtifacts.push(artifact);
  }
  for (const kind of ["HTML", "MARKDOWN"]) {
    if (!kinds.has(kind)) throw new Error(`${prepared.source.key} collection is missing ${kind}`);
  }
  if (htmlArtifacts.length === 0)
    throw new Error(`${prepared.source.key} produced no HTML artifact for graph extraction`);

  const extractions = [];
  for (const artifact of htmlArtifacts) {
    const response = await requestJson(
      baseUrl,
      `/api/raw-artifacts/${encodeURIComponent(artifact.id)}/source-graph`,
      { method: "POST" },
      120_000,
    );
    extractions.push({ artifactId: artifact.id, result: response?.result ?? null });
  }

  const afterResponse = await requestJson(
    baseUrl,
    "/api/source-intelligence",
    postJson({ sourceId: prepared.sourceId }),
  );
  const after = afterResponse?.assessment;
  if (!after) throw new Error(`${prepared.source.key} post-evidence assessment missing`);

  return {
    key: prepared.source.key,
    name: prepared.source.name,
    locator: prepared.source.locator,
    status: "SUCCESS",
    category: prepared.source.category,
    authorityLevel: prepared.source.authorityLevel,
    humanPriority: prepared.source.humanPriority,
    sourceId: prepared.sourceId,
    planId: prepared.planId,
    runId,
    connector: "crawl4ai-web@1.2.0",
    collectionPolicy: {
      explicitlyAuthorized: true,
      isolatedCalibrationOnly: true,
      maxDepth: 0,
      maxItems: 1,
      respectRobots: true,
      rateLimitPerMinute: 6,
    },
    discovery: {
      candidateCount: prepared.discoveryCandidateCount,
      selectedLocator: prepared.selectedLocator,
    },
    artifacts: {
      count: artifacts.length,
      kinds: [...kinds].sort(),
      htmlExtractedIntoGraph: htmlArtifacts.length,
    },
    before: {
      assessmentId: prepared.before.id,
      priorityScore: prepared.before.priorityScore,
      operationalTier: prepared.before.operationalTier,
      recommendedRescan: prepared.before.recommendedRescan,
      evidence: assessmentEvidence(prepared.before),
      dimensions: prepared.before.dimensions,
    },
    after: {
      assessmentId: after.id,
      priorityScore: after.priorityScore,
      operationalTier: after.operationalTier,
      recommendedRescan: after.recommendedRescan,
      evidence: assessmentEvidence(after),
      dimensions: after.dimensions,
    },
    delta: {
      priorityScore: after.priorityScore - prepared.before.priorityScore,
      tierChanged: after.operationalTier !== prepared.before.operationalTier,
      dimensions: dimensionDelta(prepared.before.dimensions, after.dimensions),
      rawArtifactCount: after.input.rawArtifactCount - prepared.before.input.rawArtifactCount,
      rawProvenanceNodeCount:
        after.input.rawProvenanceNodeCount - prepared.before.input.rawProvenanceNodeCount,
      graphNodeCount: after.input.graphNodeCount - prepared.before.input.graphNodeCount,
    },
    extractionCount: extractions.length,
  };
}

function summarize(results) {
  const successful = results.filter((item) => item.status === "SUCCESS");
  const failed = results.filter((item) => item.status === "FAILED");
  const average = (values) =>
    values.length === 0
      ? null
      : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  return {
    attempted: results.length,
    successful: successful.length,
    failed: failed.length,
    averageBeforeScore: average(successful.map((item) => item.before.priorityScore)),
    averageAfterScore: average(successful.map((item) => item.after.priorityScore)),
    averageScoreDelta: average(successful.map((item) => item.delta.priorityScore)),
    tierTransitions: successful.map((item) => ({
      key: item.key,
      before: item.before.operationalTier,
      after: item.after.operationalTier,
      scoreDelta: item.delta.priorityScore,
    })),
    evidenceDeltas: successful.map((item) => ({
      key: item.key,
      artifacts: item.delta.rawArtifactCount,
      rawProvenanceNodes: item.delta.rawProvenanceNodeCount,
      graphNodes: item.delta.graphNodeCount,
      evidenceability: item.delta.dimensions.EVIDENCEABILITY.delta,
      freshness: item.delta.dimensions.FRESHNESS.delta,
      novelty: item.delta.dimensions.NOVELTY.delta,
    })),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(resolve(options.manifest), "utf8"));
  const cohort = assertManifest(manifest, options.keys);
  const prepared = [];
  const results = [];
  let runtime = null;

  try {
    for (const source of cohort) {
      process.stdout.write(`evidence-calibration.prepare ${source.key} ${source.locator}\n`);
      try {
        const value = await prepareSource(options.baseUrl, source);
        prepared.push(value);
        process.stdout.write(
          `evidence-calibration.before ${source.key} tier=${value.before.operationalTier} score=${value.before.priorityScore}\n`,
        );
      } catch (error) {
        results.push({
          key: source.key,
          name: source.name,
          locator: source.locator,
          status: "FAILED",
          stage: "PREPARE",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (prepared.length > 0) {
      const worker = await createCalibrationWorker(options.baseUrl);
      runtime = startWorker(options.baseUrl, worker);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));

      for (const value of prepared) {
        process.stdout.write(`evidence-calibration.collect ${value.source.key}\n`);
        try {
          const result = await collectAndAssess(options.baseUrl, value, options.timeoutMs);
          results.push(result);
          process.stdout.write(
            `evidence-calibration.after ${result.key} tier=${result.after.operationalTier} score=${result.after.priorityScore} delta=${result.delta.priorityScore}\n`,
          );
        } catch (error) {
          results.push({
            key: value.source.key,
            name: value.source.name,
            locator: value.source.locator,
            status: "FAILED",
            stage: "COLLECT_OR_ASSESS",
            before: {
              priorityScore: value.before.priorityScore,
              operationalTier: value.before.operationalTier,
            },
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } finally {
    await stopWorker(runtime);
  }

  const report = {
    reportVersion: "1.0",
    calibrationMode: "BEFORE_AFTER_BOUNDED_RAW_EVIDENCE",
    observedAt: new Date().toISOString(),
    manifestVersion: manifest.version,
    selectedKeys: options.keys,
    boundaries: {
      isolatedRegistryRequired: true,
      humanAcceptanceExplicit: true,
      collectionAuthorizationExplicit: true,
      collectionIsCalibrationOnly: true,
      collectionMaxDepth: 0,
      collectionMaxItemsPerSource: 1,
      robotsRespected: true,
      tierIsOperationalPriorityNotAuthority: true,
      evidenceDoesNotVerifyLegalTruth: true,
      noCrossSourceEntityResolution: true,
      noAutomaticProductionScheduling: true,
    },
    summary: summarize(results),
    results,
    workerLogTail: runtime?.logs?.slice(-40) ?? [],
  };

  await writeFile(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  process.stdout.write(`evidence-calibration.report ${resolve(options.output)}\n`);

  if (report.summary.successful < options.minSuccess) {
    throw new Error(
      `Evidence calibration produced ${report.summary.successful} successful sources; minimum is ${options.minSuccess}`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
