import {
  CHANGE_SIGNIFICANCE_CAPABILITY_ID,
  CHANGE_SIGNIFICANCE_CAPABILITY_VERSION,
  isChangeSignificanceResponseV1,
  type ChangeSignificanceRequestV1,
  type ChangeSignificanceResponseV1,
} from "@markorbit/contracts";
import { RegistryError } from "@markorbit/persistence";
import { capabilityConnectionStatus, invokeCapability } from "./capability-client";
import { getSourceDiscoveryRepository } from "./source-registry";

const DEFAULT_OBJECTIVE =
  "Assess whether the supplied mechanically observed source change is significant enough to merit operator re-review. Explain only what the before/after evidence supports. Do not infer legal consequence, source authority, correctness, or downstream strategy.";

export type ChangeSignificanceCapabilityStatus = {
  capability: typeof CHANGE_SIGNIFICANCE_CAPABILITY_ID;
  configured: boolean;
  endpoint?: string;
};

function validateResponse(value: unknown): ChangeSignificanceResponseV1 {
  if (!isChangeSignificanceResponseV1(value)) {
    throw new RegistryError(
      "CHANGE_SIGNIFICANCE_CAPABILITY_INVALID_RESPONSE",
      "Change significance capability returned an invalid v1 response",
    );
  }
  if (Number.isNaN(Date.parse(value.generatedAt))) {
    throw new RegistryError(
      "CHANGE_SIGNIFICANCE_CAPABILITY_INVALID_TIMESTAMP",
      "Change significance capability returned an invalid generatedAt timestamp",
    );
  }
  return { ...value, generatedAt: new Date(value.generatedAt).toISOString() };
}

export class ChangeSignificanceCapabilityService {
  private readonly discovery = getSourceDiscoveryRepository();

  status(): ChangeSignificanceCapabilityStatus {
    const connection = capabilityConnectionStatus(CHANGE_SIGNIFICANCE_CAPABILITY_ID);
    return {
      capability: CHANGE_SIGNIFICANCE_CAPABILITY_ID,
      configured: connection.configured,
      ...(connection.endpoint ? { endpoint: connection.endpoint } : {}),
    };
  }

  async assess(input: { candidateId: string; locale?: string; objective?: string }): Promise<{
    request: ChangeSignificanceRequestV1;
    response: ChangeSignificanceResponseV1;
  }> {
    const latest = this.discovery.latestCandidateObservation(input.candidateId);
    if (!latest) {
      throw new RegistryError(
        "CANDIDATE_OBSERVATION_NOT_FOUND",
        `Candidate ${input.candidateId} has no observation history`,
      );
    }
    if (latest.delta !== "CHANGED" && latest.delta !== "REJECTED_CHANGED") {
      throw new RegistryError(
        "CANDIDATE_OBSERVATION_NOT_CHANGED",
        `Candidate ${input.candidateId} has no changed observation to assess`,
      );
    }
    const before = this.discovery.previousCandidateObservation(latest.observationId);
    if (!before) {
      throw new RegistryError(
        "CANDIDATE_PREVIOUS_OBSERVATION_NOT_FOUND",
        `Candidate ${input.candidateId} has no previous observation to compare`,
      );
    }

    const request: ChangeSignificanceRequestV1 = {
      version: CHANGE_SIGNIFICANCE_CAPABILITY_VERSION,
      capability: CHANGE_SIGNIFICANCE_CAPABILITY_ID,
      locale: input.locale?.trim() || "zh-CN",
      objective: input.objective?.trim() || DEFAULT_OBJECTIVE,
      before,
      after: latest,
    };
    const response = await invokeCapability({
      capabilityId: CHANGE_SIGNIFICANCE_CAPABILITY_ID,
      request,
      errorCodePrefix: "CHANGE_SIGNIFICANCE_CAPABILITY",
      validate: validateResponse,
    });
    return { request, response };
  }
}

let singleton: ChangeSignificanceCapabilityService | null = null;

export function getChangeSignificanceCapabilityService(): ChangeSignificanceCapabilityService {
  singleton ??= new ChangeSignificanceCapabilityService();
  return singleton;
}
