import {
  parseApiEndpointBindings,
  parseLocalFolderRoots,
  type LocalFolderRootMap,
} from "@markorbit/worker-runtime";
import type {
  CnipaBearerStorageBinding,
  CnipaPlaywrightSessionOptions,
} from "./cnipa-playwright-session-executor";

export type WorkerCollectionProvider =
  "api" | "cnipa" | "crawl4ai" | "github" | "ip-australia-manual" | "local-folder" | "rss";

export type WorkerProcessConfig = {
  controlPlaneUrl: string;
  workerId: string;
  workerCredential: string;
  runtimeVersion: string;
  pollIntervalMs: number;
  keepAliveIntervalMs: number;
  maxCollectionRuntimeMs: number;
  errorBackoffMinMs: number;
  errorBackoffMaxMs: number;
  collectionProvider: WorkerCollectionProvider;
  acquisitionLearningProfileId?: string;
  requireEgressProxy: boolean;
  brightDataFallbackEnabled: boolean;
  brightDataApiToken?: string;
  brightDataZone?: string;
  brightDataMaxRequestsPerRun: number;
  cnipaSession?: CnipaPlaywrightSessionOptions;
  localFolderRoots: LocalFolderRootMap;
  localFolderMaxArtifactBytes: number;
  localFolderMaxTotalBytes: number;
  localFolderMaxItems: number;
  localFolderMaxDepth: number;
  githubMaxFileBytes: number;
  githubMaxTotalBytes: number;
  githubMaxTreeEntries: number;
  githubMaxItems: number;
  githubMaxDepth: number;
  conversionEnabled: boolean;
  workspaceId?: string;
  conversionCapabilityRevision: number;
  conversionLeaseDurationSeconds: number;
};

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function integer(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function enabled(env: NodeJS.ProcessEnv, key: string, fallback = false): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new Error(`${key} must be a boolean value`);
}

function normalizedControlPlaneUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MARKORBIT_CONTROL_PLANE_URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function collectionProvider(env: NodeJS.ProcessEnv): WorkerCollectionProvider {
  const value = env.MARKORBIT_COLLECTION_PROVIDER?.trim().toLowerCase() || "crawl4ai";
  if (
    value === "api" ||
    value === "cnipa" ||
    value === "crawl4ai" ||
    value === "github" ||
    value === "ip-australia-manual" ||
    value === "local-folder" ||
    value === "rss"
  ) {
    return value;
  }
  throw new Error(
    "MARKORBIT_COLLECTION_PROVIDER must be api, cnipa, crawl4ai, github, ip-australia-manual, local-folder, or rss",
  );
}

function normalizedCnipaOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "MARKORBIT_CNIPA_BASE_URL must be an HTTPS origin without credentials/path/query",
    );
  }
  return url.origin;
}

function normalizedCnipaEntry(value: string, baseUrl: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== baseUrl || url.username || url.password) {
    throw new Error("MARKORBIT_CNIPA_SESSION_ENTRY_URL must be HTTPS on MARKORBIT_CNIPA_BASE_URL");
  }
  return url.toString();
}

function cnipaBearerStorage(env: NodeJS.ProcessEnv): CnipaBearerStorageBinding | undefined {
  const raw = env.MARKORBIT_CNIPA_BEARER_STORAGE?.trim();
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MARKORBIT_CNIPA_BEARER_STORAGE must be JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MARKORBIT_CNIPA_BEARER_STORAGE must be a JSON object");
  }
  const input = parsed as Record<string, unknown>;
  if (input.area !== "localStorage" && input.area !== "sessionStorage") {
    throw new Error("MARKORBIT_CNIPA_BEARER_STORAGE.area must be localStorage or sessionStorage");
  }
  if (typeof input.key !== "string" || !input.key.trim() || input.key.length > 128) {
    throw new Error("MARKORBIT_CNIPA_BEARER_STORAGE.key must be a bounded storage key");
  }
  let valuePath: string[] | undefined;
  if (input.valuePath !== undefined) {
    if (!Array.isArray(input.valuePath) || input.valuePath.length > 8) {
      throw new Error(
        "MARKORBIT_CNIPA_BEARER_STORAGE.valuePath must be an array with at most 8 keys",
      );
    }
    valuePath = input.valuePath.map((item) => {
      if (typeof item !== "string" || !item.trim() || item.length > 128) {
        throw new Error("MARKORBIT_CNIPA_BEARER_STORAGE.valuePath contains an invalid key");
      }
      return item.trim();
    });
  }
  if (
    input.prefix !== undefined &&
    (typeof input.prefix !== "string" || input.prefix.length > 32)
  ) {
    throw new Error("MARKORBIT_CNIPA_BEARER_STORAGE.prefix must be a short string");
  }
  return {
    area: input.area,
    key: input.key.trim(),
    ...(valuePath ? { valuePath } : {}),
    ...(typeof input.prefix === "string" ? { prefix: input.prefix } : {}),
  };
}

export function loadCnipaBrowserSessionConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: { headless?: boolean } = {},
): CnipaPlaywrightSessionOptions {
  const baseUrl = normalizedCnipaOrigin(required(env, "MARKORBIT_CNIPA_BASE_URL"));
  return {
    baseUrl,
    sessionEntryUrl: normalizedCnipaEntry(
      required(env, "MARKORBIT_CNIPA_SESSION_ENTRY_URL"),
      baseUrl,
    ),
    userDataDir: required(env, "MARKORBIT_CNIPA_USER_DATA_DIR"),
    executablePath: required(env, "MARKORBIT_CNIPA_BROWSER_EXECUTABLE_PATH"),
    headless: overrides.headless ?? enabled(env, "MARKORBIT_CNIPA_HEADLESS", true),
    minRequestIntervalMs: integer(
      env,
      "MARKORBIT_CNIPA_MIN_REQUEST_INTERVAL_MS",
      2_000,
      250,
      60_000,
    ),
    maxRequestsPerRun: integer(env, "MARKORBIT_CNIPA_MAX_REQUESTS_PER_RUN", 50, 1, 200),
    maxResponseBytes: integer(
      env,
      "MARKORBIT_CNIPA_MAX_RESPONSE_BYTES",
      5 * 1024 * 1024,
      1,
      20 * 1024 * 1024,
    ),
    navigationTimeoutMs: integer(
      env,
      "MARKORBIT_CNIPA_NAVIGATION_TIMEOUT_MS",
      60_000,
      1_000,
      180_000,
    ),
    treatForbiddenAsReauth: enabled(env, "MARKORBIT_CNIPA_TREAT_FORBIDDEN_AS_REAUTH", false),
    ...(cnipaBearerStorage(env) ? { bearerStorage: cnipaBearerStorage(env) } : {}),
  };
}

export function loadWorkerProcessConfig(env: NodeJS.ProcessEnv = process.env): WorkerProcessConfig {
  const provider = collectionProvider(env);
  const requireEgressProxy = env.MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY?.trim() !== "0";
  if (env.NODE_ENV === "production" && provider === "crawl4ai" && !requireEgressProxy) {
    throw new Error("Production Crawl4AI Worker cannot disable the egress-proxy requirement");
  }

  const brightDataFallbackEnabled = enabled(env, "MARKORBIT_BRIGHTDATA_FALLBACK_ENABLED", false);
  const brightDataApiToken = env.BRIGHTDATA_API_TOKEN?.trim() || undefined;
  const brightDataZone = env.BRIGHTDATA_WEB_UNLOCKER_ZONE?.trim() || undefined;
  if (brightDataFallbackEnabled && provider !== "crawl4ai") {
    throw new Error(
      "Bright Data fallback may only be enabled with MARKORBIT_COLLECTION_PROVIDER=crawl4ai",
    );
  }
  if (brightDataFallbackEnabled && (!brightDataApiToken || !brightDataZone)) {
    throw new Error(
      "BRIGHTDATA_API_TOKEN and BRIGHTDATA_WEB_UNLOCKER_ZONE are required when Bright Data fallback is enabled",
    );
  }
  const brightDataMaxRequestsPerRun = integer(
    env,
    "MARKORBIT_BRIGHTDATA_MAX_REQUESTS_PER_RUN",
    5,
    1,
    50,
  );

  const localFolderRoots = parseLocalFolderRoots(env.MARKORBIT_LOCAL_FOLDER_ROOTS);
  if (provider === "local-folder" && Object.keys(localFolderRoots).length === 0) {
    throw new Error(
      "MARKORBIT_LOCAL_FOLDER_ROOTS must define at least one allowed root for local-folder collection",
    );
  }
  if (provider === "api") {
    const apiEndpointBindings = parseApiEndpointBindings(env.MARKORBIT_API_ENDPOINT_BINDINGS);
    if (Object.keys(apiEndpointBindings).length === 0) {
      throw new Error(
        "MARKORBIT_API_ENDPOINT_BINDINGS must define at least one HTTPS endpoint binding for API collection",
      );
    }
  }
  const cnipaSession = provider === "cnipa" ? loadCnipaBrowserSessionConfig(env) : undefined;

  const githubMaxFileBytes = integer(
    env,
    "MARKORBIT_GITHUB_MAX_FILE_BYTES",
    2 * 1024 * 1024,
    1,
    20 * 1024 * 1024,
  );
  const githubMaxTotalBytes = integer(
    env,
    "MARKORBIT_GITHUB_MAX_TOTAL_BYTES",
    50 * 1024 * 1024,
    1,
    200 * 1024 * 1024,
  );
  if (githubMaxTotalBytes < githubMaxFileBytes) {
    throw new Error(
      "MARKORBIT_GITHUB_MAX_TOTAL_BYTES must be at least MARKORBIT_GITHUB_MAX_FILE_BYTES",
    );
  }
  const githubMaxTreeEntries = integer(
    env,
    "MARKORBIT_GITHUB_MAX_TREE_ENTRIES",
    20_000,
    1,
    100_000,
  );
  const githubMaxItems = integer(env, "MARKORBIT_GITHUB_MAX_ITEMS", 500, 1, 5_000);
  const githubMaxDepth = integer(env, "MARKORBIT_GITHUB_MAX_DEPTH", 30, 0, 60);

  const errorBackoffMinMs = integer(
    env,
    "MARKORBIT_WORKER_ERROR_BACKOFF_MIN_MS",
    1_000,
    100,
    60_000,
  );
  const errorBackoffMaxMs = integer(
    env,
    "MARKORBIT_WORKER_ERROR_BACKOFF_MAX_MS",
    30_000,
    errorBackoffMinMs,
    300_000,
  );
  const conversionEnabled = enabled(env, "MARKORBIT_CONVERSION_ENABLED", false);
  const workspaceId = env.MARKORBIT_WORKSPACE_ID?.trim() || undefined;
  if (conversionEnabled && !workspaceId) {
    throw new Error("MARKORBIT_WORKSPACE_ID is required when production conversion is enabled");
  }
  const acquisitionLearningProfileId =
    env.MARKORBIT_ACQUISITION_LEARNING_PROFILE?.trim() || undefined;

  return {
    controlPlaneUrl: normalizedControlPlaneUrl(required(env, "MARKORBIT_CONTROL_PLANE_URL")),
    workerId: required(env, "MARKORBIT_WORKER_ID"),
    workerCredential: required(env, "MARKORBIT_WORKER_CREDENTIAL"),
    runtimeVersion: env.MARKORBIT_WORKER_RUNTIME_VERSION?.trim() || "1.0.0",
    pollIntervalMs: integer(env, "MARKORBIT_WORKER_POLL_INTERVAL_MS", 2_000, 100, 60_000),
    keepAliveIntervalMs: integer(
      env,
      "MARKORBIT_WORKER_KEEPALIVE_INTERVAL_MS",
      30_000,
      1_000,
      60_000,
    ),
    maxCollectionRuntimeMs: integer(
      env,
      "MARKORBIT_WORKER_MAX_COLLECTION_RUNTIME_MS",
      12 * 60_000,
      30_000,
      14 * 60_000,
    ),
    errorBackoffMinMs,
    errorBackoffMaxMs,
    collectionProvider: provider,
    ...(acquisitionLearningProfileId ? { acquisitionLearningProfileId } : {}),
    requireEgressProxy,
    brightDataFallbackEnabled,
    ...(brightDataApiToken ? { brightDataApiToken } : {}),
    ...(brightDataZone ? { brightDataZone } : {}),
    brightDataMaxRequestsPerRun,
    ...(cnipaSession ? { cnipaSession } : {}),
    localFolderRoots,
    localFolderMaxArtifactBytes: integer(
      env,
      "MARKORBIT_LOCAL_FOLDER_MAX_ARTIFACT_BYTES",
      25 * 1024 * 1024,
      1,
      512 * 1024 * 1024,
    ),
    localFolderMaxTotalBytes: integer(
      env,
      "MARKORBIT_LOCAL_FOLDER_MAX_TOTAL_BYTES",
      100 * 1024 * 1024,
      1,
      1024 * 1024 * 1024,
    ),
    localFolderMaxItems: integer(env, "MARKORBIT_LOCAL_FOLDER_MAX_ITEMS", 500, 1, 5_000),
    localFolderMaxDepth: integer(env, "MARKORBIT_LOCAL_FOLDER_MAX_DEPTH", 20, 0, 20),
    githubMaxFileBytes,
    githubMaxTotalBytes,
    githubMaxTreeEntries,
    githubMaxItems,
    githubMaxDepth,
    conversionEnabled,
    ...(workspaceId ? { workspaceId } : {}),
    conversionCapabilityRevision: integer(
      env,
      "MARKORBIT_CONVERSION_CAPABILITY_REVISION",
      1,
      1,
      1_000_000,
    ),
    conversionLeaseDurationSeconds: integer(
      env,
      "MARKORBIT_CONVERSION_LEASE_DURATION_SECONDS",
      300,
      30,
      3600,
    ),
  };
}
