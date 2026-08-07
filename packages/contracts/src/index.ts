/**
 * Public MarkOrbit Knowledge contracts and independently versioned protocols.
 *
 * Schema v1 is locked for acquisition and staging objects. Execution Contract v1,
 * Worker Protocol v1, Execution Lifecycle Protocol v1, Conversion Execution Protocol v1,
 * controlled execution records, API versions, persistence models and MarkOrbit Core semantic
 * contracts remain independently versioned and separate.
 */
export * from "./vocabularies";
export * from "./schema-v1";
export * from "./execution-v1";
export * from "./worker-protocol-v1";
export {
  EXECUTION_LIFECYCLE_VERSION,
  EXECUTION_EVENT_TYPES as LIFECYCLE_EVENT_TYPES,
  EXECUTION_FAILURE_KINDS,
  isExecutionLifecycleInput,
  targetStatusForExecutionEvent,
  canTransitionJob,
  deriveRunStatusFromJob,
  isJobExecutionEvent,
  assertExecutionLifecycleInput,
  assertJobExecutionEvent,
  type ExecutionEventType as LifecycleExecutionEventType,
  type ExecutionFailureKind,
  type ExecutionMetrics,
  type ExecutionOutputSummary,
  type ExecutionFailure as LifecycleExecutionFailure,
  type ExecutionLifecycleInput,
  type JobExecutionEvent,
} from "./execution-lifecycle-v1";
export * from "./worker-execution-v1";

export * from "./artifact-ingestion-v1";

export * from "./conversion-control-v1";
export * from "./conversion-execution-v1";

export * from "./conversion-runtime-v1";
