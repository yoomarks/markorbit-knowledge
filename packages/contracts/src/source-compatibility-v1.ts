export const SOURCE_COMPATIBILITY_PROTOCOL_VERSION = "1.0" as const;

export const SOURCE_COMPATIBILITY_STATES = ["PASS", "DEGRADED", "BLOCKED"] as const;
export type SourceCompatibilityState = (typeof SOURCE_COMPATIBILITY_STATES)[number];

export const SOURCE_COMPATIBILITY_BASELINE_STATES = ["PASS", "FAIL"] as const;
export type SourceCompatibilityBaselineState =
  (typeof SOURCE_COMPATIBILITY_BASELINE_STATES)[number];

export type SourceCompatibilityObservation = {
  protocolVersion: typeof SOURCE_COMPATIBILITY_PROTOCOL_VERSION;
  objectType: "SOURCE_COMPATIBILITY_OBSERVATION";
  id: string;
  targetId: string;
  jurisdiction: string;
  state: SourceCompatibilityState;
  observedAt: string;
  primaryUri: string;
  renderJavascript: boolean;
  errorCode?: string;
  errorMessage?: string;
  baselineTargetId?: string;
  baselineState?: SourceCompatibilityBaselineState;
  details?: Record<string, unknown>;
};

export type SourceCompatibilityObservationInput = Omit<
  SourceCompatibilityObservation,
  "protocolVersion" | "objectType" | "id"
> & {
  id?: string;
};
