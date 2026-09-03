import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as ts from "typescript";

const API_ROOT = fileURLToPath(new URL("../app/api/", import.meta.url));
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

type ApiBoundary =
  | "browser-session"
  | "operator-service"
  | "worker-machine"
  | "internal-service"
  | "service-authenticated";

type ExportedMethod = {
  method: string;
  source: string;
};

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

// Same HTTP method can intentionally support a public static view and a canonical browser view
// when a workspace assertion is supplied. Keep these cases explicit instead of letting a
// file-level auth import hide the public branch.
const EXPLICIT_CONDITIONAL_PUBLIC_READ_ONLY_METHODS = new Set([
  "source-coverage#GET",
  "source-coverage/[id]#GET",
]);

// Methods that intentionally expose only non-sensitive static/read-only policy data.
const EXPLICIT_PUBLIC_READ_ONLY_METHODS = new Set(["manual-uploads#GET"]);

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
  return relative(API_ROOT, file)
    .replaceAll("\\", "/")
    .replace(/\/route\.ts$/, "");
}

function isExported(node: { modifiers?: ts.NodeArray<ts.ModifierLike> }): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function exportedMethods(source: string, file: string): ExportedMethod[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const methods: ExportedMethod[] = [];

  for (const node of sourceFile.statements) {
    if (ts.isFunctionDeclaration(node) && isExported(node) && node.name) {
      const method = node.name.text;
      if (HTTP_METHODS.has(method)) methods.push({ method, source: node.getText(sourceFile) });
      continue;
    }
    if (!ts.isVariableStatement(node) || !isExported(node)) continue;
    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const method = declaration.name.text;
      if (HTTP_METHODS.has(method)) methods.push({ method, source: declaration.getText(sourceFile) });
    }
  }

  return methods;
}

function matchesAny(source: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(source));
}

function methodBoundaryCandidates(
  route: string,
  methodSource: string,
  routeSource: string,
): ApiBoundary[] {
  const boundaries = new Set<ApiBoundary>();

  if (matchesAny(methodSource, BROWSER_BOUNDARY_PATTERNS)) boundaries.add("browser-session");
  if (matchesAny(methodSource, OPERATOR_BOUNDARY_PATTERNS)) boundaries.add("operator-service");

  if (route.startsWith("worker/v1/")) {
    boundaries.add("worker-machine");
    assert.ok(
      matchesAny(methodSource, SERVICE_AUTH_PATTERNS) || matchesAny(routeSource, SERVICE_AUTH_PATTERNS),
      `${route} is a worker-machine route but has no recognizable worker credential/auth boundary`,
    );
  } else if (route.startsWith("internal/")) {
    boundaries.add("internal-service");
    assert.ok(
      matchesAny(methodSource, SERVICE_AUTH_PATTERNS) ||
        matchesAny(routeSource, SERVICE_AUTH_PATTERNS) ||
        matchesAny(methodSource, OPERATOR_BOUNDARY_PATTERNS),
      `${route} is an internal-service route but has no recognizable server-side auth boundary`,
    );
  } else if (matchesAny(methodSource, SERVICE_AUTH_PATTERNS)) {
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
    const methods = exportedMethods(source, file);
    assert.ok(methods.length > 0, `${route} must export at least one HTTP method`);

    for (const { method, source: methodSource } of methods) {
      const key = `${route}#${method}`;
      const candidates = methodBoundaryCandidates(route, methodSource, source);

      if (EXPLICIT_CONDITIONAL_PUBLIC_READ_ONLY_METHODS.has(key)) {
        assert.ok(
          method === "GET" || method === "HEAD" || method === "OPTIONS",
          `${key} has a public branch but is a mutating method`,
        );
        assert.ok(
          candidates.includes("browser-session"),
          `${key} must use canonical browser access when it returns workspace-scoped data`,
        );
        continue;
      }

      if (EXPLICIT_PUBLIC_READ_ONLY_METHODS.has(key)) {
        assert.ok(
          method === "GET" || method === "HEAD" || method === "OPTIONS",
          `${key} is marked public/read-only but is a mutating method`,
        );
        assert.deepEqual(candidates, [], `${key} is public/read-only and must not imply another boundary`);
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
    `Ambiguous Admin API methods require a single method-local boundary:\n${ambiguous
      .map((item) => `- ${item}`)
      .join("\n")}`,
  );
});
