import { readFile } from "node:fs/promises";
import {
  prepareFoundationalApiRemediation,
  type FoundationalApiBindingSpec,
} from "./source-coverage-api-remediation";

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function requiredArgument(name: string): string {
  const value = argument(name)?.trim();
  if (!value) throw new Error(`${name}=... is required`);
  return value;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function binding(value: unknown, index: number): FoundationalApiBindingSpec {
  const item = record(value);
  if (!item) throw new Error(`bindings[${index}] must be an object`);
  const allowed = new Set([
    "targetId",
    "endpointBinding",
    "resourcePath",
    "query",
    "timeoutMs",
    "maxResponseBytes",
  ]);
  const extra = Object.keys(item).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    throw new Error(`bindings[${index}] contains unsupported fields: ${extra.join(", ")}`);
  }
  if (
    typeof item.targetId !== "string" ||
    typeof item.endpointBinding !== "string" ||
    typeof item.resourcePath !== "string"
  ) {
    throw new Error(
      `bindings[${index}] requires string targetId, endpointBinding and resourcePath`,
    );
  }
  let query: Record<string, string> | undefined;
  if (item.query !== undefined) {
    const rawQuery = record(item.query);
    if (!rawQuery) throw new Error(`bindings[${index}].query must be an object`);
    query = {};
    for (const [key, value] of Object.entries(rawQuery)) {
      if (typeof value !== "string") {
        throw new Error(`bindings[${index}].query.${key} must be a string`);
      }
      query[key] = value;
    }
  }
  const timeoutMs = item.timeoutMs;
  const maxResponseBytes = item.maxResponseBytes;
  if (timeoutMs !== undefined && typeof timeoutMs !== "number") {
    throw new Error(`bindings[${index}].timeoutMs must be a number`);
  }
  if (maxResponseBytes !== undefined && typeof maxResponseBytes !== "number") {
    throw new Error(`bindings[${index}].maxResponseBytes must be a number`);
  }
  return {
    targetId: item.targetId,
    endpointBinding: item.endpointBinding,
    resourcePath: item.resourcePath,
    ...(query ? { query } : {}),
    ...(typeof timeoutMs === "number" ? { timeoutMs } : {}),
    ...(typeof maxResponseBytes === "number" ? { maxResponseBytes } : {}),
  };
}

async function loadBindings(path: string): Promise<FoundationalApiBindingSpec[]> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  const container = record(parsed);
  const rawBindings = Array.isArray(parsed)
    ? parsed
    : container && Array.isArray(container.bindings)
      ? container.bindings
      : null;
  if (!rawBindings || rawBindings.length === 0) {
    throw new Error("Binding manifest must be a non-empty array or an object with bindings[]");
  }
  return rawBindings.map(binding);
}

async function main(): Promise<void> {
  const bindings = await loadBindings(requiredArgument("--bindings-file"));
  const result = await prepareFoundationalApiRemediation({
    baseUrl: requiredEnvironment("MARKORBIT_CONTROL_PLANE_URL"),
    workspaceId: requiredEnvironment("MARKORBIT_WORKSPACE_ID"),
    jurisdiction: requiredArgument("--jurisdiction"),
    bindings,
    apply: process.argv.includes("--apply"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
