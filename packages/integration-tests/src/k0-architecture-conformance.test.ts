import { describe, expect, it } from "vitest";
import {
  aiInventoryDiagnostics,
  cognitiveCompatibilityDiagnostics,
  consumerGateDiagnostics,
  healthAuthorityDiagnostics,
  loadRepositoryFiles,
  workspaceAuthorityDiagnostics,
  type K0ArchitectureDiagnostic,
  type RepositoryFiles,
} from "./k0-architecture-conformance";

function clone(files: RepositoryFiles): Map<string, string> {
  return new Map(files);
}

function rules(diagnostics: readonly K0ArchitectureDiagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.ruleId);
}

const current = loadRepositoryFiles();

describe("K0 architecture conformance", () => {
  it("rejects a new persistence Core Workspace authority", () => {
    const files = clone(current);
    files.set(
      "packages/persistence/src/shadow-core-workspace.ts",
      "export const coreWorkspaceId = 'uuid';",
    );
    expect(rules(workspaceAuthorityDiagnostics(files))).toContain("K0-WORKSPACE-AUTHORITY");
  });

  it("rejects an unclassified production AI module", () => {
    const files = clone(current);
    files.set("packages/contracts/src/ai-shadow-cognition.ts", "export const shadow = true;");
    expect(rules(aiInventoryDiagnostics(files))).toContain("K0-AI-OWNER-UNCLASSIFIED");
  });

  it("rejects a new call site into a migration-owned cognitive contract", () => {
    const files = clone(current);
    files.set(
      "apps/admin/src/server/shadow-cognitive-consumer.ts",
      'import type { AiInstructionSetV1 } from "@markorbit/contracts";\nexport type Shadow = AiInstructionSetV1;\n',
    );
    expect(rules(cognitiveCompatibilityDiagnostics(files))).toContain(
      "K0-AI-COMPATIBILITY-CALLSITE",
    );
  });

  it("rejects a new universal Knowledge health authority declaration", () => {
    const files = clone(current);
    files.set(
      "packages/persistence/src/global-knowledge-health.ts",
      'export const GLOBAL_KNOWLEDGE_HEALTH = "READY";\n',
    );
    expect(rules(healthAuthorityDiagnostics(files))).toContain("K0-HEALTH-AUTHORITY");
  });

  it("rejects removal of the Current Governed Knowledge consumer gate", () => {
    const files = clone(current);
    files.set(
      "apps/admin/src/server/knowledge-brain-ready-export.ts",
      "export const bypassedBrainExport = true;\n",
    );
    expect(rules(consumerGateDiagnostics(files))).toContain("K0-CURRENT-GOVERNED-GATE");
  });

  it("allows bounded subsystem health diagnostics", () => {
    const files = clone(current);
    files.set(
      "packages/persistence/src/source-collection-health-extra.ts",
      'export type SourceCollectionHealthExtra = { status: "READY" | "ATTENTION" };\n',
    );
    expect(healthAuthorityDiagnostics(files)).toEqual([]);
  });
});
