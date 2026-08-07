import type {
  CollectionRegistryPlan,
  CollectionRegistryRun,
  CollectionTarget,
} from "@markorbit/contracts";

export class CollectionRegistry {
  private readonly plans = new Map<string, CollectionRegistryPlan>();
  private readonly runs = new Map<string, CollectionRegistryRun>();

  createPlan(plan: CollectionRegistryPlan): CollectionRegistryPlan {
    this.plans.set(plan.planId, plan);
    return plan;
  }

  getPlan(planId: string): CollectionRegistryPlan | null {
    return this.plans.get(planId) ?? null;
  }

  addTarget(planId: string, target: CollectionTarget): CollectionRegistryPlan {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Collection plan ${planId} not found`);
    const updated = { ...plan, targets: [...plan.targets, target] };
    this.plans.set(planId, updated);
    return updated;
  }

  createRun(run: CollectionRegistryRun): CollectionRegistryRun {
    this.runs.set(run.runId, run);
    return run;
  }

  getRun(runId: string): CollectionRegistryRun | null {
    return this.runs.get(runId) ?? null;
  }
}
