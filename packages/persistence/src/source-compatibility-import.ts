import type { SourceCompatibilityObservationInput } from "@markorbit/contracts";
import { RegistryValidationError } from "./index";

type JsonObject = Record<string, unknown>;

const COMPATIBILITY_STATES = new Set(["PASS", "DEGRADED", "BLOCKED"]);
const GIT_SHA = /^[a-f0-9]{40}$/iu;

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RegistryValidationError(`${field} must be an object`);
  }
  return value as JsonObject;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function gitSha(value: unknown, field: string): string {
  const normalized = text(value, field);
  if (!GIT_SHA.test(normalized)) {
    throw new RegistryValidationError(`${field} must be a 40-character git SHA`);
  }
  return normalized.toLowerCase();
}

function evidenceContext(value: unknown): JsonObject | undefined {
  if (value === undefined || value === null) return undefined;
  const context = object(value, "evidenceContext");
  return {
    provider: text(context.provider, "evidenceContext.provider"),
    repository: text(context.repository, "evidenceContext.repository"),
    runId: text(context.runId, "evidenceContext.runId"),
    runAttempt: text(context.runAttempt, "evidenceContext.runAttempt"),
    commitSha: gitSha(context.commitSha, "evidenceContext.commitSha"),
    workflowSha: gitSha(context.workflowSha, "evidenceContext.workflowSha"),
    workflow: text(context.workflow, "evidenceContext.workflow"),
    eventName: text(context.eventName, "evidenceContext.eventName"),
    ...(optionalText(context.sourceRef) ? { sourceRef: optionalText(context.sourceRef) } : {}),
    ...(optionalText(context.serverUrl) ? { serverUrl: optionalText(context.serverUrl) } : {}),
  };
}

export function parseRepresentativeLiveCanarySummary(
  input: unknown,
): SourceCompatibilityObservationInput[] {
  const summary = object(input, "summary");
  if (summary.version !== "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2") {
    throw new RegistryValidationError("unsupported live canary summary version");
  }
  const observedAt = text(summary.observedAt, "observedAt");
  const provenance = evidenceContext(summary.evidenceContext);
  if (!Array.isArray(summary.observations)) {
    throw new RegistryValidationError("observations must be an array");
  }

  return summary.observations.map((value, index) => {
    const observation = object(value, `observations[${index}]`);
    const state = text(observation.state, `observations[${index}].state`);
    if (!COMPATIBILITY_STATES.has(state)) {
      throw new RegistryValidationError(`observations[${index}].state is invalid`);
    }
    const baseline = observation.authorityBaseline
      ? object(observation.authorityBaseline, `observations[${index}].authorityBaseline`)
      : undefined;
    const baselineState = baseline ? optionalText(baseline.state) : undefined;
    if (baselineState && baselineState !== "PASS" && baselineState !== "FAIL") {
      throw new RegistryValidationError(
        `observations[${index}].authorityBaseline.state is invalid`,
      );
    }
    const errorCode = optionalText(observation.errorCode);
    const errorMessage = optionalText(observation.errorMessage);
    return {
      targetId: text(observation.targetId, `observations[${index}].targetId`),
      jurisdiction: text(observation.jurisdiction, `observations[${index}].jurisdiction`),
      state: state as "PASS" | "DEGRADED" | "BLOCKED",
      observedAt,
      primaryUri: text(observation.requestedUri, `observations[${index}].requestedUri`),
      renderJavascript: Boolean(observation.renderJavascript),
      ...(errorCode ? { errorCode } : {}),
      ...(errorMessage ? { errorMessage } : {}),
      ...(baseline
        ? {
            baselineTargetId: text(
              baseline.targetId,
              `observations[${index}].authorityBaseline.targetId`,
            ),
            baselineState: baselineState as "PASS" | "FAIL",
          }
        : {}),
      details: {
        profile: observation.profile,
        family: observation.family,
        elapsedMs: observation.elapsedMs,
        pagesAttempted: observation.pagesAttempted,
        artifactCount: observation.artifactCount,
        artifactKinds: observation.artifactKinds,
        finalUris: observation.finalUris,
        totalBytes: observation.totalBytes,
        ...(provenance ? { evidenceContext: provenance } : {}),
      },
    } satisfies SourceCompatibilityObservationInput;
  });
}
