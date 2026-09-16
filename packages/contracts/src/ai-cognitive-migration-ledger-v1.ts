import type { AiEvidencePlaneOwnerClassV1 } from "./ai-evidence-plane-owner-map-v1";

export const AI_COGNITIVE_MIGRATION_LEDGER_VERSION = "1.0" as const;

export type AiCognitiveMigrationTargetOwnerV1 = "BRAIN/METHOD" | "KNOWLEDGE-EVIDENCE-PLANE";

export type AiCognitiveMigrationEntryV1 = {
  modulePath: string;
  classification: Extract<AiEvidencePlaneOwnerClassV1, "DEPRECATE" | "MOVE-TO-BRAIN">;
  targetOwner: AiCognitiveMigrationTargetOwnerV1;
  currentProducers: readonly string[];
  currentConsumers: readonly string[];
  persistedDataDependencies: readonly string[];
  migrationTarget: string;
  crossRepositoryHandoffTarget: string;
  compatibilityRule: string;
  retirementCondition: string;
  approvedCompatibilityCallSites: readonly string[];
};

const brain = (
  entry: Omit<AiCognitiveMigrationEntryV1, "targetOwner" | "crossRepositoryHandoffTarget">,
): AiCognitiveMigrationEntryV1 => ({
  ...entry,
  targetOwner: "BRAIN/METHOD",
  crossRepositoryHandoffTarget: "yoomarks/markorbit :: Brain/Method",
});

export const AI_COGNITIVE_MIGRATION_LEDGER_V1: readonly AiCognitiveMigrationEntryV1[] = [
  brain({
    modulePath: "packages/contracts/src/ai-distilled-knowledge-v1.ts",
    classification: "DEPRECATE",
    currentProducers: [
      "packages/worker-runtime/src/ai-distilled-knowledge-acquirer.ts",
      "packages/worker-runtime/src/managed-ai-knowledge-adapter.ts",
      "packages/worker-runtime/src/openai-knowledge-adapter.ts",
    ],
    currentConsumers: [
      "packages/contracts/src/ai-production-pilot-v1.ts",
      "packages/contracts/src/ai-source-pack-v1.ts",
      "packages/persistence/src/ai-distilled-knowledge-ingestion.ts",
      "packages/persistence/src/ai-grounded-validation-evidence.ts",
      "packages/persistence/src/ai-knowledge-assignment-registry.ts",
      "apps/admin/src/server/ai-question-bank.ts",
    ],
    persistedDataDependencies: [
      "ai_instruction_sets",
      "ai_knowledge_assignments",
      "legacy AI RawArtifacts",
    ],
    migrationTarget:
      "Brain/Method research-intent and semantic-artifact contracts; Knowledge keeps evidence-only acquisition contracts.",
    compatibilityRule:
      "Historical contract parsing and adapter reads remain allowed; no new Knowledge semantic authority may be added.",
    retirementCondition:
      "No Knowledge producer constructs distilled semantic artifacts or owns research-instruction meaning; historical readers are isolated compatibility surfaces.",
    approvedCompatibilityCallSites: [
      "apps/admin/src/components/questions/ai-question-bank-workbench.tsx",
      "apps/admin/src/server/ai-question-bank.ts",
      "packages/contracts/src/ai-production-pilot-v1.ts",
      "packages/contracts/src/ai-source-pack-v1.ts",
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
      "packages/persistence/src/ai-assignment-library-registry.ts",
      "packages/persistence/src/ai-distilled-knowledge-ingestion.ts",
      "packages/persistence/src/ai-grounded-validation-evidence.ts",
      "packages/persistence/src/ai-knowledge-assignment-registry.ts",
      "packages/persistence/src/au-trademark-assignment-library.ts",
      "packages/persistence/src/ca-trademark-assignment-library.ts",
      "packages/persistence/src/us-trademark-assignment-library.ts",
      "packages/worker-runtime/src/ai-distilled-knowledge-acquirer.ts",
      "packages/worker-runtime/src/ai-grounded-execution-preparer.ts",
      "packages/worker-runtime/src/ai-production-pilot.ts",
      "packages/worker-runtime/src/ai-source-pack-renderer.ts",
      "packages/worker-runtime/src/managed-ai-knowledge-adapter.ts",
      "packages/worker-runtime/src/openai-knowledge-adapter.ts",
    ],
  }),
  {
    modulePath: "packages/persistence/src/ai-distilled-knowledge-ingestion.ts",
    classification: "DEPRECATE",
    targetOwner: "KNOWLEDGE-EVIDENCE-PLANE",
    currentProducers: [
      "packages/worker-runtime/src/ai-distilled-knowledge-acquirer.ts",
      "packages/worker-runtime/src/managed-ai-knowledge-adapter.ts",
      "packages/worker-runtime/src/openai-knowledge-adapter.ts",
    ],
    currentConsumers: [
      "apps/worker/src/adk-knowledge-job-worker.ts",
      "apps/worker/src/run-adk-live-pilot.ts",
    ],
    persistedDataDependencies: [
      "raw_artifacts",
      "content-addressed provider response bytes",
      "legacy distilled Markdown RawArtifacts",
    ],
    migrationTarget: "AiAcquisitionEvidenceV1 plus raw immutable provider evidence ingestion.",
    crossRepositoryHandoffTarget:
      "yoomarks/markorbit :: Brain/Method semantic artifact intake; Knowledge retains evidence ingestion",
    compatibilityRule:
      "Keep historical RawArtifact lineage readable; new writes should prefer evidence-only acquisition and must not promote semantic truth.",
    retirementCondition:
      "All active AI acquisition workers persist exact provider evidence without requiring AiDistilledKnowledgeArtifactV1 ingestion.",
    approvedCompatibilityCallSites: [
      "apps/worker/src/adk-knowledge-job-worker.ts",
      "apps/worker/src/run-adk-live-pilot.ts",
    ],
  },
  brain({
    modulePath: "packages/contracts/src/ai-assignment-candidate-promotion-v1.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: ["packages/persistence/src/ai-assignment-candidate-promotion.ts"],
    currentConsumers: ["packages/persistence/src/ai-assignment-candidate-promotion.ts"],
    persistedDataDependencies: ["ai_assignment_candidate_promotions"],
    migrationTarget: "Brain/Method candidate-approval and promotion receipt contract.",
    compatibilityRule:
      "Knowledge may read historical promotion receipts for lineage only; no new promotion semantics are owned here.",
    retirementCondition:
      "Brain/Method owns promotion execution and Knowledge retains only imported historical receipts or evidence references.",
    approvedCompatibilityCallSites: [
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
    ],
  }),
  brain({
    modulePath: "packages/contracts/src/ai-assignment-candidate-v1.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: ["packages/persistence/src/ai-assignment-candidate-registry.ts"],
    currentConsumers: ["packages/persistence/src/ai-assignment-candidate-registry.ts"],
    persistedDataDependencies: ["ai_assignment_candidates"],
    migrationTarget: "Brain/Method research follow-up candidate contract.",
    compatibilityRule:
      "Existing candidate documents remain readable; no new Knowledge-owned candidate strategy is permitted.",
    retirementCondition:
      "Candidate creation and review move to Brain/Method and Knowledge has no active writer for candidate semantics.",
    approvedCompatibilityCallSites: [
      "packages/persistence/src/ai-assignment-candidate-registry.ts",
    ],
  }),
  brain({
    modulePath: "packages/contracts/src/ai-assignment-graph-v1.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: [
      "packages/persistence/src/ai-assignment-graph-registry.ts",
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
    ],
    currentConsumers: [
      "packages/persistence/src/ai-assignment-graph-registry.ts",
      "packages/persistence/src/ai-assignment-candidate-registry.ts",
    ],
    persistedDataDependencies: [
      "ai_assignment_graphs",
      "ai_assignment_graph_nodes",
      "ai_assignment_graph_edges",
    ],
    migrationTarget: "Brain/Method research graph contract and graph lifecycle.",
    compatibilityRule:
      "Historical graph revisions remain readable for lineage; Knowledge must not derive new research strategy from them.",
    retirementCondition:
      "Brain/Method owns graph mutation and Knowledge keeps no active semantic graph writer.",
    approvedCompatibilityCallSites: [
      "packages/persistence/src/ai-assignment-graph-registry.ts",
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
    ],
  }),
  brain({
    modulePath: "packages/contracts/src/ai-assignment-library-v1.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: [
      "packages/persistence/src/us-trademark-assignment-library.ts",
      "packages/persistence/src/ca-trademark-assignment-library.ts",
      "packages/persistence/src/au-trademark-assignment-library.ts",
    ],
    currentConsumers: [
      "apps/admin/src/server/ai-question-bank.ts",
      "packages/persistence/src/ai-assignment-library-registry.ts",
      "packages/persistence/src/trademark-assignment-library-catalog.ts",
    ],
    persistedDataDependencies: ["ai_assignment_libraries", "ai_assignment_library_entries"],
    migrationTarget: "Brain/Method governed research-library catalog.",
    compatibilityRule:
      "Seeded libraries remain readable until Brain/Method imports them; Knowledge cannot expand their semantic workflow catalog.",
    retirementCondition:
      "Brain/Method serves the canonical library and all Knowledge seed/bootstrap writers are disabled or compatibility-only.",
    approvedCompatibilityCallSites: [
      "apps/admin/src/components/questions/ai-question-bank-workbench.tsx",
      "apps/admin/src/server/ai-question-bank.ts",
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
      "packages/persistence/src/ai-assignment-library-registry.ts",
      "packages/persistence/src/au-trademark-assignment-library.ts",
      "packages/persistence/src/ca-trademark-assignment-library.ts",
      "packages/persistence/src/trademark-assignment-library-catalog.ts",
      "packages/persistence/src/us-trademark-assignment-library.ts",
    ],
  }),
  brain({
    modulePath: "packages/worker-runtime/src/ai-source-pack-renderer.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: ["packages/worker-runtime/src/ai-grounded-execution-preparer.ts"],
    currentConsumers: [
      "packages/worker-runtime/src/ai-grounded-execution-preparer.ts",
      "packages/worker-runtime/src/ai-grounded-output-validator.ts",
      "apps/worker/src/prepare-adk-grounded-execution.ts",
    ],
    persistedDataDependencies: ["ai_source_packs", "ai_assignment_source_bindings"],
    migrationTarget:
      "Brain/Method prompt/instruction rendering; Knowledge receives opaque governed execution input plus evidence identity.",
    compatibilityRule:
      "Renderer may serve existing grounded execution adapters only; no new prompt policy or reasoning strategy is added.",
    retirementCondition:
      "Brain/Method supplies the governed provider input and Knowledge adapters no longer compose assignment prompt semantics.",
    approvedCompatibilityCallSites: [
      "packages/worker-runtime/src/ai-grounded-execution-preparer.ts",
      "packages/worker-runtime/src/ai-grounded-output-validator.ts",
      "apps/worker/src/prepare-adk-grounded-execution.ts",
    ],
  }),
  brain({
    modulePath: "packages/persistence/src/ai-assignment-candidate-promotion.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: ["apps/worker/src/run-adk-candidate-promotion.ts"],
    currentConsumers: ["apps/worker/src/run-adk-candidate-promotion.ts"],
    persistedDataDependencies: [
      "ai_assignment_candidate_promotions",
      "ai_assignment_candidates",
      "ai_assignment_graphs",
      "ai_assignment_libraries",
      "ai_knowledge_assignments",
    ],
    migrationTarget:
      "Brain/Method promotion transaction; Knowledge retains historical receipt readability only.",
    compatibilityRule:
      "Existing promotion transactions remain callable only by the frozen compatibility CLI.",
    retirementCondition:
      "No active Knowledge CLI invokes promotion and all historical promotion receipts are available to Brain/Method or archived read-only.",
    approvedCompatibilityCallSites: ["apps/worker/src/run-adk-candidate-promotion.ts"],
  }),
  brain({
    modulePath: "packages/persistence/src/ai-assignment-candidate-registry.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: ["packages/persistence/src/ai-assignment-candidate-promotion.ts"],
    currentConsumers: ["packages/persistence/src/ai-assignment-candidate-promotion.ts"],
    persistedDataDependencies: ["ai_assignment_candidates"],
    migrationTarget: "Brain/Method candidate registry.",
    compatibilityRule:
      "Historical candidate reads and immutable identity checks remain available until migration completes.",
    retirementCondition:
      "No Knowledge producer writes candidates and Brain/Method has imported required history.",
    approvedCompatibilityCallSites: [
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
    ],
  }),
  brain({
    modulePath: "packages/persistence/src/ai-assignment-graph-registry.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: ["packages/persistence/src/ai-assignment-candidate-promotion.ts"],
    currentConsumers: [
      "packages/persistence/src/ai-assignment-candidate-registry.ts",
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
    ],
    persistedDataDependencies: [
      "ai_assignment_graphs",
      "ai_assignment_graph_nodes",
      "ai_assignment_graph_edges",
    ],
    migrationTarget: "Brain/Method graph persistence.",
    compatibilityRule:
      "Legacy graph revisions remain immutable/readable; no new graph semantics are introduced in Knowledge.",
    retirementCondition:
      "Brain/Method owns graph reads/writes and Knowledge compatibility consumers no longer require the registry.",
    approvedCompatibilityCallSites: [
      "packages/persistence/src/ai-assignment-candidate-registry.ts",
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
    ],
  }),
  brain({
    modulePath: "packages/persistence/src/ai-assignment-library-registry.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: [
      "packages/persistence/src/us-trademark-assignment-library.ts",
      "packages/persistence/src/ca-trademark-assignment-library.ts",
      "packages/persistence/src/au-trademark-assignment-library.ts",
    ],
    currentConsumers: [
      "apps/admin/src/server/ai-question-bank.ts",
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
    ],
    persistedDataDependencies: ["ai_assignment_libraries", "ai_assignment_library_entries"],
    migrationTarget: "Brain/Method assignment-library persistence.",
    compatibilityRule:
      "Existing seeded libraries remain readable and immutable until imported by Brain/Method.",
    retirementCondition:
      "Brain/Method provides the canonical library read model and Knowledge library seed/bootstrap is disabled.",
    approvedCompatibilityCallSites: [
      "apps/admin/src/server/ai-question-bank.ts",
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
      "packages/persistence/src/au-trademark-assignment-library.ts",
      "packages/persistence/src/ca-trademark-assignment-library.ts",
      "packages/persistence/src/us-trademark-assignment-library.ts",
    ],
  }),
  brain({
    modulePath: "packages/persistence/src/ai-knowledge-assignment-registry.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: [
      "packages/persistence/src/us-trademark-assignment-library.ts",
      "packages/persistence/src/ca-trademark-assignment-library.ts",
      "packages/persistence/src/au-trademark-assignment-library.ts",
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
    ],
    currentConsumers: [
      "packages/persistence/src/ai-assignment-graph-registry.ts",
      "packages/persistence/src/ai-assignment-library-registry.ts",
      "packages/persistence/src/ai-source-pack-registry.ts",
      "packages/persistence/src/ai-grounded-prepared-execution-evidence.ts",
    ],
    persistedDataDependencies: ["ai_instruction_sets", "ai_knowledge_assignments"],
    migrationTarget: "Brain/Method research-assignment and instruction persistence.",
    compatibilityRule:
      "Historical assignments remain readable for evidence lineage; Knowledge may resolve identity but not own instruction meaning.",
    retirementCondition:
      "Brain/Method is authoritative for assignments/instructions and Knowledge evidence records reference opaque external identities instead.",
    approvedCompatibilityCallSites: [
      "apps/worker/src/prepare-adk-grounded-execution.ts",
      "apps/worker/src/prepare-adk-live-pilot-runtime.ts",
      "apps/worker/src/run-adk-live-pilot.ts",
      "apps/worker/src/run-adk-queue-enqueue.ts",
      "apps/worker/src/run-adk-queue-worker.ts",
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
      "packages/persistence/src/ai-assignment-graph-registry.ts",
      "packages/persistence/src/ai-assignment-library-registry.ts",
      "packages/persistence/src/ai-grounded-prepared-execution-evidence.ts",
      "packages/persistence/src/ai-source-pack-registry.ts",
      "packages/persistence/src/au-trademark-assignment-library.ts",
      "packages/persistence/src/ca-trademark-assignment-library.ts",
      "packages/persistence/src/us-trademark-assignment-library.ts",
    ],
  }),
  brain({
    modulePath: "apps/worker/src/run-adk-assignment-library-bootstrap.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: ["apps/worker/package.json#adk:library:bootstrap"],
    currentConsumers: ["operator/manual compatibility invocation"],
    persistedDataDependencies: [
      "ai_instruction_sets",
      "ai_knowledge_assignments",
      "ai_assignment_libraries",
      "ai_assignment_library_entries",
    ],
    migrationTarget: "Brain/Method library bootstrap/import workflow.",
    compatibilityRule:
      "Existing CLI remains a bounded compatibility bootstrap only; do not add jurisdictions or workflow semantics here.",
    retirementCondition:
      "Brain/Method imports/owns the seeded libraries and no production operation requires this Knowledge CLI.",
    approvedCompatibilityCallSites: [],
  }),
  brain({
    modulePath: "apps/worker/src/run-adk-candidate-promotion.ts",
    classification: "MOVE-TO-BRAIN",
    currentProducers: ["apps/worker/package.json#adk:candidate:promote"],
    currentConsumers: [
      "packages/persistence/src/ai-assignment-candidate-promotion.ts",
      "operator/manual compatibility invocation",
    ],
    persistedDataDependencies: [
      "ai_assignment_candidate_promotions",
      "ai_assignment_candidates",
      "ai_assignment_graphs",
      "ai_assignment_libraries",
      "ai_knowledge_assignments",
    ],
    migrationTarget: "Brain/Method candidate approval/promotion workflow.",
    compatibilityRule:
      "Existing CLI may replay approved legacy promotion plans only; it cannot define new candidate policy.",
    retirementCondition:
      "Brain/Method owns promotion execution and the Knowledge CLI has no remaining operational caller.",
    approvedCompatibilityCallSites: [],
  }),
];

export function aiCognitiveMigrationEntryFor(
  modulePath: string,
): AiCognitiveMigrationEntryV1 | undefined {
  return AI_COGNITIVE_MIGRATION_LEDGER_V1.find((entry) => entry.modulePath === modulePath);
}

export function isAiCognitiveCompatibilityModule(modulePath: string): boolean {
  return AI_COGNITIVE_MIGRATION_LEDGER_V1.some((entry) => entry.modulePath === modulePath);
}
