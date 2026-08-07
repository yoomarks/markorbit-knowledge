import type { CollectionPlan, CollectionRun, CollectionTarget } from "@markorbit/contracts";

export class CollectionRegistry {
  private readonly plans = new Map<string, CollectionPlan>();
  private readonly runs = new Map<string, CollectionRun>();

  createPlan(plan: CollectionPlan): CollectionPlan {
    this.plans.set(plan.planId, plan);
    return plan;
  }

  getPlan(planId: string): CollectionPlan | null {
    return this.plans.get(planId) ?? null;
  }

  addTarget(planId: string, target: CollectionTarget): CollectionPlan {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Collection plan ${planId} not found`);
    const updated = { ...plan, targets: [...plan.targets, target] };
    this.plans.set(planId, updated);
    return updated;
  }

  createRun(run: CollectionRun): CollectionRun {
    this.runs.set(run.runId, run);
    return run;
  }

  getRun(runId: string): CollectionRun | null {
    return this.runs.get(runId) ?? null;
  }
}
