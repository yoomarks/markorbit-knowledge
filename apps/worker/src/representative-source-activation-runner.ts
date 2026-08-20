import {
  REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS,
  REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION,
  type RepresentativeSourceActivationJurisdiction,
} from "@markorbit/persistence/representative-source-activation";
import { bootstrapFoundationalCoverage } from "./source-coverage-bootstrap";
import { prepareFoundationalSupply } from "./source-coverage-operations";
import { prepareFoundationalAutoConversion } from "./source-supply-conversion";

export const REPRESENTATIVE_SOURCE_ACTIVATION_RUN_VERSION =
  "REPRESENTATIVE_SOURCE_ACTIVATION_RUN_V1" as const;

export type RepresentativeActivationApplyResult = {
  targetCount: number;
  registeredCount: number;
  sourcesCreated: number;
  sourcesReused: number;
  plansCreated: number;
  plansReused: number;
  conversionProfilesCreated: number;
  conversionProfilesReused: number;
  capabilityGapCount: number;
  apiBindingRequirementCount: number;
  webAttachmentRequirementCount: number;
  unsupportedArtifactKindCount: number;
};

export type RepresentativeActivationEntry = {
  jurisdiction: string;
  displayName: string;
  profile: RepresentativeSourceActivationJurisdiction["profile"];
  state: "PLANNED" | "COMPLETED" | "FAILED";
  result: RepresentativeActivationApplyResult | null;
  error: string | null;
};

export type RepresentativeActivationRun = {
  version: typeof REPRESENTATIVE_SOURCE_ACTIVATION_RUN_VERSION;
  activationWaveVersion: typeof REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION;
  mode: "PLAN" | "APPLY";
  workspaceId: string;
  controlPlaneUrl: string;
  collectionAuthorization: "NONE";
  selectedJurisdictions: string[];
  entries: RepresentativeActivationEntry[];
  summary: {
    planned: number;
    completed: number;
    failed: number;
    sourcesCreated: number;
    plansCreated: number;
    conversionProfilesCreated: number;
    capabilityGapCount: number;
    apiBindingRequirementCount: number;
    webAttachmentRequirementCount: number;
    unsupportedArtifactKindCount: number;
  };
};

type ActivateJurisdiction = (input: {
  baseUrl: string;
  workspaceId: string;
  jurisdiction: string;
}) => Promise<RepresentativeActivationApplyResult>;

export type RunRepresentativeActivationOptions = {
  baseUrl: string;
  workspaceId: string;
  apply: boolean;
  jurisdictions?: readonly string[];
  activateJurisdiction?: ActivateJurisdiction;
};

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function selectJurisdictions(requested: readonly string[] | undefined) {
  const supportedCodes = new Set<string>(
    REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS.map((item) => item.jurisdiction),
  );
  if (!requested || requested.length === 0) {
    return [...REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS];
  }
  const normalized = [
    ...new Set(requested.map((value) => value.trim().toUpperCase()).filter(Boolean)),
  ];
  const unknown = normalized.filter((value) => !supportedCodes.has(value));
  if (unknown.length > 0) {
    throw new Error(`Unsupported representative jurisdiction: ${unknown.join(", ")}`);
  }
  return REPRESENTATIVE_SOURCE_ACTIVATION_JURISDICTIONS.filter((item) =>
    normalized.includes(item.jurisdiction),
  );
}

async function activateJurisdiction(input: {
  baseUrl: string;
  workspaceId: string;
  jurisdiction: string;
}): Promise<RepresentativeActivationApplyResult> {
  const bootstrap = await bootstrapFoundationalCoverage({
    baseUrl: input.baseUrl,
    workspaceId: input.workspaceId,
    jurisdiction: input.jurisdiction,
    dispatchRepresentative: false,
  });
  const supply = await prepareFoundationalSupply({
    baseUrl: input.baseUrl,
    workspaceId: input.workspaceId,
    jurisdiction: input.jurisdiction,
    dispatchTargetIds: [],
  });
  const conversion = await prepareFoundationalAutoConversion({
    baseUrl: input.baseUrl,
    workspaceId: input.workspaceId,
    jurisdiction: input.jurisdiction,
  });

  if (bootstrap.collectionAuthorization !== "NONE" || supply.collectionAuthorization !== "NONE") {
    throw new Error(
      `${input.jurisdiction} activation attempted to authorize collection; representative activation must remain plan-only`,
    );
  }

  return {
    targetCount: bootstrap.targetCount,
    registeredCount: bootstrap.registeredCount,
    sourcesCreated: bootstrap.created.length,
    sourcesReused: bootstrap.reused.length,
    plansCreated: supply.plans.filter((plan) => plan.state === "CREATED").length,
    plansReused: supply.plans.filter((plan) => plan.state === "REUSED").length,
    conversionProfilesCreated: conversion.profiles.filter((profile) => profile.state === "CREATED")
      .length,
    conversionProfilesReused: conversion.profiles.filter((profile) => profile.state === "REUSED")
      .length,
    capabilityGapCount: supply.capabilityGaps.length,
    apiBindingRequirementCount: supply.capabilityGaps.filter(
      (gap) => gap.remediation.apiBinding !== null,
    ).length,
    webAttachmentRequirementCount: supply.capabilityGaps.filter(
      (gap) => gap.remediation.webAttachments !== null,
    ).length,
    unsupportedArtifactKindCount: supply.capabilityGaps.reduce(
      (total, gap) => total + gap.remediation.unsupportedArtifactKinds.length,
      0,
    ),
  };
}

export async function runRepresentativeSourceActivationWave(
  options: RunRepresentativeActivationOptions,
): Promise<RepresentativeActivationRun> {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const selected = selectJurisdictions(options.jurisdictions);
  const activate = options.activateJurisdiction ?? activateJurisdiction;
  const entries: RepresentativeActivationEntry[] = [];

  for (const jurisdiction of selected) {
    if (!options.apply) {
      entries.push({
        jurisdiction: jurisdiction.jurisdiction,
        displayName: jurisdiction.displayName,
        profile: jurisdiction.profile,
        state: "PLANNED",
        result: null,
        error: null,
      });
      continue;
    }

    try {
      const result = await activate({
        baseUrl,
        workspaceId: options.workspaceId,
        jurisdiction: jurisdiction.jurisdiction,
      });
      entries.push({
        jurisdiction: jurisdiction.jurisdiction,
        displayName: jurisdiction.displayName,
        profile: jurisdiction.profile,
        state: "COMPLETED",
        result,
        error: null,
      });
    } catch (error) {
      entries.push({
        jurisdiction: jurisdiction.jurisdiction,
        displayName: jurisdiction.displayName,
        profile: jurisdiction.profile,
        state: "FAILED",
        result: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    version: REPRESENTATIVE_SOURCE_ACTIVATION_RUN_VERSION,
    activationWaveVersion: REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION,
    mode: options.apply ? "APPLY" : "PLAN",
    workspaceId: options.workspaceId,
    controlPlaneUrl: baseUrl,
    collectionAuthorization: "NONE",
    selectedJurisdictions: selected.map((item) => item.jurisdiction),
    entries,
    summary: {
      planned: entries.filter((entry) => entry.state === "PLANNED").length,
      completed: entries.filter((entry) => entry.state === "COMPLETED").length,
      failed: entries.filter((entry) => entry.state === "FAILED").length,
      sourcesCreated: entries.reduce(
        (total, entry) => total + (entry.result?.sourcesCreated ?? 0),
        0,
      ),
      plansCreated: entries.reduce((total, entry) => total + (entry.result?.plansCreated ?? 0), 0),
      conversionProfilesCreated: entries.reduce(
        (total, entry) => total + (entry.result?.conversionProfilesCreated ?? 0),
        0,
      ),
      capabilityGapCount: entries.reduce(
        (total, entry) => total + (entry.result?.capabilityGapCount ?? 0),
        0,
      ),
      apiBindingRequirementCount: entries.reduce(
        (total, entry) => total + (entry.result?.apiBindingRequirementCount ?? 0),
        0,
      ),
      webAttachmentRequirementCount: entries.reduce(
        (total, entry) => total + (entry.result?.webAttachmentRequirementCount ?? 0),
        0,
      ),
      unsupportedArtifactKindCount: entries.reduce(
        (total, entry) => total + (entry.result?.unsupportedArtifactKindCount ?? 0),
        0,
      ),
    },
  };
}
