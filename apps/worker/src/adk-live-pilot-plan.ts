import { readFileSync } from "node:fs";
import {
  isAiProductionPilotPlanV1,
  type AiProductionPilotPlanV1,
} from "@markorbit/worker-runtime/ai-production-pilot";
import { US_TRADEMARK_LIBRARY_ASSIGNMENTS } from "@markorbit/persistence/us-trademark-assignment-library";

const US_ASSIGNMENT_IDS = new Set(
  US_TRADEMARK_LIBRARY_ASSIGNMENTS.map((assignment) => assignment.assignmentId),
);

export function assertFrozenAdkLivePilotPlan(plan: AiProductionPilotPlanV1): void {
  if (
    plan.providers.length !== 2 ||
    plan.providers[0] !== "DEEPSEEK" ||
    plan.providers[1] !== "OPENAI"
  ) {
    throw new Error("Live ADK pilot provider set must be exactly DEEPSEEK,OPENAI in frozen order");
  }

  for (const assignmentId of plan.assignmentIds) {
    if (!US_ASSIGNMENT_IDS.has(assignmentId)) {
      throw new Error(
        `Frozen live pilot assignment ${assignmentId} is not in kal_us_trademark_core@1`,
      );
    }
  }
}

export function parseFrozenAdkLivePilotPlan(value: unknown): AiProductionPilotPlanV1 {
  if (!isAiProductionPilotPlanV1(value)) {
    throw new Error("Live ADK pilot plan does not satisfy AiProductionPilotPlanV1");
  }
  assertFrozenAdkLivePilotPlan(value);
  return value;
}

export function loadFrozenAdkLivePilotPlan(path: string): AiProductionPilotPlanV1 {
  return parseFrozenAdkLivePilotPlan(JSON.parse(readFileSync(path, "utf8")) as unknown);
}
