import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const API_ROOT = fileURLToPath(new URL("../app/api/", import.meta.url));
const HTTP_METHOD_PATTERN = /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;

const BROWSER_BOUNDARY_PATTERNS = [
  /\bresolveAdminBrowserApiReadAccess\b/,
  /\bresolveAdminBrowserApiMutationAccess\b/,
  /\bresolveSourceIntelligenceBrowserReadAccess\b/,
  /\bresolveSourceIntelligenceBrowserMutationAccess\b/,
  /\bresolveExpertReadPrincipal\b/,
  /\bresolveExpertMutationPrincipal\b/,
] as const;

const OPERATOR_BOUNDARY_PATTERNS = [
  /\bresolveOperatorServiceReadAccess\b/,
  /\bresolveOperatorServiceMutationAccess\b/,
] as const;

const SERVICE_AUTH_PATTERNS = [
  /\bauthorizeCaseProducerRequest\b/,
  /\bauthenticateCaseProducerRequest\b/,
  /\bbearerCredential\b/,
  /\bverifyCredential\b/,
  /\bverifySignature\b/,
  /\bauthorize[A-Z][A-Za-z0-9]*Request\b/,
  /\bauthenticate[A-Z][A-Za-z0-9]*Request\b/,
] as const;

const EXPLICIT_MIXED_METHOD_BOUNDARIES = new Map<string, string>([
  ["ready-packages/[id]/core-intake#GET", "browser-session"],
  ["ready-packages/[id]/core-intake#POST", "operator-service"],
]);

// Intentionally public/read-only methods must be named here. Keep this list narrow: adding a
// workspace-scoped or mutating endpoint here should be a conscious review decision.
const EXPLICIT_PUBLIC_READ_ONLY_METHODS = new Set<string>();

function routeFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...routeFiles(path));
    } else if (entry.isFile() && entry.name === "route.ts") {
      files.push(path);
    }
  }
  return files;
}

function routeName(file: string): string {
  return relative(API_ROOT, file).replaceAll("\\", "/").replace(/\/route\.ts$/, "");
}

function exportedMethods(source: string): string[] {
  return [...source.matchAll(HTTP_METHOD_PATTERN)].map((match) => match[1]);
}

function matchesAny(source: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(source));
}

function sourceBoundaryCandidates(route: string, source: string): string[] {
  const boundaries = new Set<string>();

  if (matchesAny(source, BROWSER_BOUNDARY_PATTERNS)) boundaries.add("browser-session");
  if (matchesAny(source, OPERATOR_BOUNDARY_PATTERNS)) boundaries.add("operator-service");

  if (route.startsWith("worker/v1/")) {
    boundaries.add("worker-machine");
    assert.ok(
      matchesAny(source, SERVICE_AUTH_PATTERNS),
      `${route} is a worker-machine route but has no recognizable worker credential/auth boundary`,
    );
  } else if (route.startsWith("internal/")) {
    boundaries.add("internal-service");
    assert.ok(
      matchesAny(source, SERVICE_AUTH_PATTERNS) || matchesAny(source, OPERATOR_BOUNDARY_PATTERNS),
      `${route} is an internal-service route but has no recognizable server-side auth boundary`,
    );
  } else if (matchesAny(source, SERVICE_AUTH_PATTERNS)) {
    boundaries.add("service-authenticated");
  }

  return [...boundaries];
}

test("every Admin API HTTP method has an explicit security-boundary classification", () => {
  const unclassified: string[] = [];
  const ambiguous: string[] = [];

  for (const file of routeFiles(API_ROOT)) {
    const route = routeName(file);
    const source = readFileSync(file, "utf8");
    const methods = exportedMethods(source);
    assert.ok(methods.length > 0, `${route} must export at least one HTTP method`);

    const candidates = sourceBoundaryCandidates(route, source);
    for (const method of methods) {
      const key = `${route}#${method}`;
      const explicitMixedBoundary = EXPLICIT_MIXED_METHOD_BOUNDARIES.get(key);
      if (explicitMixedBoundary) continue;

      if (EXPLICIT_PUBLIC_READ_ONLY_METHODS.has(key)) {
        assert.ok(
          method === "GET" || method === "HEAD" || method === "OPTIONS",
          `${key} is marked public/read-only but is a mutating method`,
        );
        continue;
      }

      if (candidates.length === 0) {
        unclassified.push(key);
      } else if (candidates.length > 1) {
        ambiguous.push(`${key} => ${candidates.join(", ")}`);
      }
    }
  }

  assert.deepEqual(
    unclassified,
    [],
    `Unclassified Admin API methods:\n${unclassified.map((item) => `- ${item}`).join("\n")}`,
  );
  assert.deepEqual(
    ambiguous,
    [],
    `Ambiguous Admin API methods require an explicit mixed-method classification:\n${ambiguous
      .map((item) => `- ${item}`)
      .join("\n")}`,
  );
});
