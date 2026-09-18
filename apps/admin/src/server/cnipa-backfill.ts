import type { ExecutionActor } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import type { CollectionPlanRegistryRecord } from "@markorbit/persistence/collection-plans";
import type { ExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import {
  cnipaBackfillDocumentKindFromPlan,
  planCnipaBackfillForPlan,
} from "@markorbit/worker-runtime";
import { CNIPA_CONNECTOR_ID } from "@markorbit/worker-runtime/cnipa-artifact-acquirer";

export type DispatchCnipaBackfillInput = {
  plan: CollectionPlanRegistryRecord;
  fromDate: string;
  toDate: string;
  requestedBy: ExecutionActor;
};

export type CnipaBackfillDispatchSummary = {
  planId: string;
  documentKind: string;
  fromDate: string;
  toDate: string;
  requested: number;
  created: number;
  replayed: number;
  runs: Array<{
    date: string;
    runId: string;
    replayed: boolean;
  }>;
};

type BackfillLedger = Pick<ExecutionLedgerRepository, "dispatchManual">;

function validationError(error: unknown): RegistryValidationError {
  if (error instanceof RegistryValidationError) return error;
  return new RegistryValidationError(
    error instanceof Error ? error.message : "CNIPA backfill input is invalid",
  );
}

export function dispatchCnipaBackfill(
  input: DispatchCnipaBackfillInput,
  ledger: BackfillLedger,
): CnipaBackfillDispatchSummary {
  if (input.plan.source.connector.connectorId !== CNIPA_CONNECTOR_ID) {
    throw new RegistryValidationError(
      `CollectionPlan source must use ${CNIPA_CONNECTOR_ID} for CNIPA backfill`,
    );
  }

  let planned;
  let documentKind;
  try {
    documentKind = cnipaBackfillDocumentKindFromPlan(input.plan.plan);
    planned = planCnipaBackfillForPlan({
      plan: input.plan.plan,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
  } catch (error) {
    throw validationError(error);
  }

  const runs = planned.map((item) => {
    const dispatched = ledger.dispatchManual({
      planId: input.plan.plan.id,
      requestedBy: input.requestedBy,
      idempotencyKey: item.idempotencyKey,
      extensions: item.extensions,
    });
    return {
      date: item.date,
      runId: dispatched.record.run.id,
      replayed: dispatched.replayed,
    };
  });

  return {
    planId: input.plan.plan.id,
    documentKind,
    fromDate: input.fromDate,
    toDate: input.toDate,
    requested: planned.length,
    created: runs.filter((item) => !item.replayed).length,
    replayed: runs.filter((item) => item.replayed).length,
    runs,
  };
}
