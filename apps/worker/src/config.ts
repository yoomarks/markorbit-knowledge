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
  requireEgressProxy: boolean;
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

function normalizedControlPlaneUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MARKORBIT_CONTROL_PLANE_URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

export function loadWorkerProcessConfig(env: NodeJS.ProcessEnv = process.env): WorkerProcessConfig {
  const requireEgressProxy = env.MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY?.trim() !== "0";
  if (env.NODE_ENV === "production" && !requireEgressProxy) {
    throw new Error("Production Worker cannot disable the Crawl4AI egress-proxy requirement");
  }

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
    requireEgressProxy,
  };
}
