import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRepresentativeSourceLiveCanaries,
  type RepresentativeSourceLiveCanary,
} from "@markorbit/persistence/representative-source-live-canaries";
import {
  assertRepresentativeCanaryArtifactContractSupported,
  assessRepresentativeCanaryArtifacts,
  REPRESENTATIVE_CANARY_PAGE_EVIDENCE_KINDS,
} from "./representative-live-canary-evidence";

type CrawlSuccess = {
  protocolVersion: string;
  ok: true;
  artifacts: Array<{
    artifactKind: string;
    mimeType: string;
    sourceUri: string;
    canonicalUri: string;
    sizeBytes: number;
    sha256: string;
  }>;
  pagesAttempted: number;
  attachmentsAttempted: number;
  totalBytes: number;
};

type CrawlFailure = {
  protocolVersion: string;
  ok: false;
  error: { code: string; message: string; retryable: boolean };
};

type CrawlResponse = CrawlSuccess | CrawlFailure;

type CanaryProbe = {
  targetId: string;
  family: string;
  canonicalUri: string;
  renderJavascript: boolean;
  locale: string;
  expectedArtifactKinds: string[];
};

type ProbeObservation = {
  targetId: string;
  family: string;
  requestedUri: string;
  renderJavascript: boolean;
  expectedArtifactKinds: string[];
  missingExpectedArtifactKinds: string[];
  elapsedMs: number;
  state: "PASS" | "FAIL";
  pagesAttempted: number;
  artifactCount: number;
  artifactKinds: string[];
  finalUris: string[];
  totalBytes: number;
  errorCode?: string;
  errorMessage?: string;
  stderrTail?: string;
};

type CanaryObservation = {
  jurisdiction: string;
  displayName: string;
  profile: string;
  targetId: string;
  family: string;
  requestedUri: string;
  renderJavascript: boolean;
  expectedArtifactKinds: string[];
  missingExpectedArtifactKinds: string[];
  elapsedMs: number;
  state: "PASS" | "DEGRADED" | "BLOCKED";
  pagesAttempted: number;
  artifactCount: number;
  artifactKinds: string[];
  finalUris: string[];
  totalBytes: number;
  errorCode?: string;
  errorMessage?: string;
  stderrTail?: string;
  authorityBaseline?: ProbeObservation;
};

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Expected integer ${min}..${max}, got ${raw}`);
  }
  return value;
}

function selectedCanaries(): RepresentativeSourceLiveCanary[] {
  const jurisdiction = argument("--jurisdiction")?.trim().toUpperCase();
  const canaries = getRepresentativeSourceLiveCanaries();
  if (!jurisdiction) return canaries;
  const selected = canaries.filter((canary) => canary.jurisdiction === jurisdiction);
  if (selected.length === 0) {
    throw new Error(`Unknown representative canary jurisdiction ${jurisdiction}`);
  }
  return selected;
}

function crawlScriptPath(): string {
  const override = process.env.MARKORBIT_CRAWL4AI_SCRIPT?.trim();
  if (override) return override;
  return fileURLToPath(new URL("../../../workers/crawl4ai/acquire.py", import.meta.url));
}

function pythonExecutable(): string {
  return process.env.MARKORBIT_CRAWL4AI_PYTHON?.trim() || "python";
}

async function runSubprocess(
  probe: CanaryProbe,
  outputDirectory: string,
  timeoutSeconds: number,
): Promise<{ response: CrawlResponse; stderr: string; elapsedMs: number }> {
  assertRepresentativeCanaryArtifactContractSupported(probe.expectedArtifactKinds);
  const request = {
    protocolVersion: "1.0",
    outputDirectory,
    startUrls: [probe.canonicalUri],
    outputKinds: [...REPRESENTATIVE_CANARY_PAGE_EVIDENCE_KINDS],
    maxDepth: 0,
    maxItems: 1,
    renderJavascript: probe.renderJavascript,
    fetchAttachments: false,
    respectRobots: true,
    rateLimitPerMinute: 6,
    timeoutSeconds,
    includePatterns: [probe.canonicalUri],
    excludePatterns: [],
    locale: probe.locale,
    maxArtifactBytes: 16 * 1024 * 1024,
    maxTotalBytes: 32 * 1024 * 1024,
    requireEgressProxy: false,
  };
  const startedAt = Date.now();
  const child = spawn(pythonExecutable(), [crawlScriptPath()], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.end(JSON.stringify(request));

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        child.kill("SIGKILL");
        reject(new Error(`Crawl4AI canary timed out after ${timeoutSeconds + 30}s`));
      },
      (timeoutSeconds + 30) * 1000,
    );
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if (exitCode !== 0) throw new Error(`Crawl4AI subprocess exited with ${exitCode}`);
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("Crawl4AI subprocess emitted no JSON response");
  return {
    response: JSON.parse(trimmed) as CrawlResponse,
    stderr,
    elapsedMs: Date.now() - startedAt,
  };
}

function stderrTail(stderr: string): string | undefined {
  const normalized = stderr.trim();
  if (!normalized) return undefined;
  return normalized.slice(-1200);
}

function emptyArtifactContract(
  probe: CanaryProbe,
): Pick<ProbeObservation, "expectedArtifactKinds" | "missingExpectedArtifactKinds"> {
  return {
    expectedArtifactKinds: [...probe.expectedArtifactKinds],
    missingExpectedArtifactKinds: [...probe.expectedArtifactKinds].sort(),
  };
}

async function observeProbe(
  probe: CanaryProbe,
  outputDirectory: string,
  timeoutSeconds: number,
): Promise<ProbeObservation> {
  await mkdir(outputDirectory, { recursive: true });
  const startedAt = Date.now();
  try {
    const { response, stderr, elapsedMs } = await runSubprocess(
      probe,
      outputDirectory,
      timeoutSeconds,
    );
    const tail = stderrTail(stderr);
    if (!response.ok) {
      return {
        targetId: probe.targetId,
        family: probe.family,
        requestedUri: probe.canonicalUri,
        renderJavascript: probe.renderJavascript,
        ...emptyArtifactContract(probe),
        elapsedMs,
        state: "FAIL",
        pagesAttempted: 0,
        artifactCount: 0,
        artifactKinds: [],
        finalUris: [],
        totalBytes: 0,
        errorCode: response.error.code,
        errorMessage: response.error.message,
        ...(tail ? { stderrTail: tail } : {}),
      };
    }
    const artifactKinds = [
      ...new Set(response.artifacts.map((artifact) => artifact.artifactKind)),
    ].sort();
    const finalUris = [
      ...new Set(response.artifacts.map((artifact) => artifact.canonicalUri)),
    ].sort();
    const artifactAssessment = assessRepresentativeCanaryArtifacts({
      observedArtifactKinds: artifactKinds,
      expectedArtifactKinds: probe.expectedArtifactKinds,
    });
    const validHashes = response.artifacts.every((artifact) =>
      /^[a-f0-9]{64}$/u.test(artifact.sha256),
    );
    const pageEvidenceValid =
      response.artifacts.length >= 2 && artifactAssessment.pageEvidenceComplete && validHashes;
    const passed = pageEvidenceValid && artifactAssessment.targetArtifactContractComplete;
    const failure = !pageEvidenceValid
      ? {
          errorCode: "CANARY_EVIDENCE_INCOMPLETE",
          errorMessage: "Expected governed HTML + MARKDOWN artifacts with valid SHA-256 evidence.",
        }
      : !artifactAssessment.targetArtifactContractComplete
        ? {
            errorCode: "CANARY_ARTIFACT_CONTRACT_INCOMPLETE",
            errorMessage: `Observed page evidence but did not produce expected artifact kinds: ${artifactAssessment.missingExpectedArtifactKinds.join(", ")}.`,
          }
        : undefined;
    return {
      targetId: probe.targetId,
      family: probe.family,
      requestedUri: probe.canonicalUri,
      renderJavascript: probe.renderJavascript,
      expectedArtifactKinds: [...probe.expectedArtifactKinds],
      missingExpectedArtifactKinds: artifactAssessment.missingExpectedArtifactKinds,
      elapsedMs,
      state: passed ? "PASS" : "FAIL",
      pagesAttempted: response.pagesAttempted,
      artifactCount: response.artifacts.length,
      artifactKinds,
      finalUris,
      totalBytes: response.totalBytes,
      ...(failure ?? {}),
      ...(tail ? { stderrTail: tail } : {}),
    };
  } catch (error) {
    return {
      targetId: probe.targetId,
      family: probe.family,
      requestedUri: probe.canonicalUri,
      renderJavascript: probe.renderJavascript,
      ...emptyArtifactContract(probe),
      elapsedMs: Date.now() - startedAt,
      state: "FAIL",
      pagesAttempted: 0,
      artifactCount: 0,
      artifactKinds: [],
      finalUris: [],
      totalBytes: 0,
      errorCode: "CANARY_RUNNER_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function primaryProbe(canary: RepresentativeSourceLiveCanary): CanaryProbe {
  return {
    targetId: canary.targetId,
    family: canary.family,
    canonicalUri: canary.canonicalUri,
    renderJavascript: canary.renderJavascript,
    locale: canary.languages[0] ?? "en",
    expectedArtifactKinds: [...canary.expectedArtifactKinds],
  };
}

function baselineProbe(canary: RepresentativeSourceLiveCanary): CanaryProbe {
  return {
    ...canary.authorityBaseline,
    locale: canary.languages[0] ?? "en",
    expectedArtifactKinds: [...canary.authorityBaseline.expectedArtifactKinds],
  };
}

async function observeCanary(
  canary: RepresentativeSourceLiveCanary,
  root: string,
  timeoutSeconds: number,
): Promise<CanaryObservation> {
  const outputDirectory = join(root, canary.jurisdiction.toLowerCase());
  await mkdir(outputDirectory, { recursive: true });
  const primary = await observeProbe(
    primaryProbe(canary),
    join(outputDirectory, "primary"),
    timeoutSeconds,
  );
  if (primary.state === "PASS") {
    return {
      jurisdiction: canary.jurisdiction,
      displayName: canary.displayName,
      profile: canary.profile,
      ...primary,
      state: "PASS",
    };
  }

  const authorityBaseline = await observeProbe(
    baselineProbe(canary),
    join(outputDirectory, "authority-baseline"),
    timeoutSeconds,
  );
  if (authorityBaseline.state === "PASS") {
    return {
      jurisdiction: canary.jurisdiction,
      displayName: canary.displayName,
      profile: canary.profile,
      ...primary,
      state: "DEGRADED",
      errorCode: "CANARY_ADAPTER_REQUIRED",
      errorMessage: `Primary target ${canary.targetId} failed while authority baseline ${canary.authorityBaseline.targetId} remained collectible. A source-specific adapter or acquisition strategy is required. Primary signal: ${primary.errorCode ?? "UNKNOWN"}: ${primary.errorMessage ?? "unknown failure"}`,
      authorityBaseline,
    };
  }
  return {
    jurisdiction: canary.jurisdiction,
    displayName: canary.displayName,
    profile: canary.profile,
    ...primary,
    state: "BLOCKED",
    errorCode: "CANARY_AUTHORITY_BASELINE_FAILED",
    errorMessage: `Primary target ${canary.targetId} and authority baseline ${canary.authorityBaseline.targetId} both failed. Primary signal: ${primary.errorCode ?? "UNKNOWN"}: ${primary.errorMessage ?? "unknown failure"}; baseline signal: ${authorityBaseline.errorCode ?? "UNKNOWN"}: ${authorityBaseline.errorMessage ?? "unknown failure"}`,
    authorityBaseline,
  };
}

async function main(): Promise<void> {
  const outputRoot =
    argument("--output-dir")?.trim() || process.env.MARKORBIT_LIVE_CANARY_OUTPUT_DIR?.trim();
  const root = outputRoot || (await mkdtemp(join(tmpdir(), "markorbit-representative-canary-")));
  const timeoutSeconds = boundedInteger(
    process.env.MARKORBIT_LIVE_CANARY_TIMEOUT_SECONDS,
    60,
    10,
    180,
  );
  const canaries = selectedCanaries();
  const observations: CanaryObservation[] = [];
  for (const canary of canaries) {
    process.stdout.write(
      `${JSON.stringify({
        event: "representative-live-canary.start",
        jurisdiction: canary.jurisdiction,
        targetId: canary.targetId,
        uri: canary.canonicalUri,
        expectedArtifactKinds: canary.expectedArtifactKinds,
        authorityBaseline: canary.authorityBaseline,
      })}\n`,
    );
    const observation = await observeCanary(canary, root, timeoutSeconds);
    observations.push(observation);
    process.stdout.write(
      `${JSON.stringify({ event: "representative-live-canary.result", ...observation })}\n`,
    );
  }
  const summary = {
    version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2" as const,
    observedAt: new Date().toISOString(),
    strict: false,
    total: observations.length,
    passed: observations.filter((item) => item.state === "PASS").length,
    degraded: observations.filter((item) => item.state === "DEGRADED").length,
    blocked: observations.filter((item) => item.state === "BLOCKED").length,
    failed: observations.filter((item) => item.state !== "PASS").length,
    observations,
  };
  await writeFile(join(root, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const lines = [
    "# Representative Source Live Canary",
    "",
    `Observed: ${summary.observedAt}`,
    `Result: ${summary.passed}/${summary.total} passed; ${summary.degraded} degraded; ${summary.blocked} blocked`,
    "",
    "| Jurisdiction | Target | Profile | JS | Result | Artifacts | Missing | Baseline |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...observations.map((item) => {
      const baseline = item.authorityBaseline
        ? `${item.authorityBaseline.targetId}:${item.authorityBaseline.state}`
        : "not-run";
      return `| ${item.jurisdiction} | ${item.targetId} | ${item.profile} | ${item.renderJavascript ? "yes" : "no"} | ${item.state} | ${item.artifactKinds.join(",") || "none"} | ${item.missingExpectedArtifactKinds.join(",") || "none"} | ${baseline} |`;
    }),
  ];
  await writeFile(join(root, "summary.md"), `${lines.join("\n")}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({
      event: "representative-live-canary.summary",
      jsonPath: join(root, "summary.json"),
      markdownPath: join(root, "summary.md"),
      ...summary,
    })}\n`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
