from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise RuntimeError(f"{label}: expected one match, found {text.count(old)}")
    return text.replace(old, new, 1)


# Catalog: compose US + WIPO into one global source-coverage map.
path = Path("packages/persistence/src/source-coverage-catalog.ts")
text = path.read_text()
text = replace_once(
    text,
    '} from "@markorbit/contracts";\n\nconst VERIFIED_AT',
    '} from "@markorbit/contracts";\nimport { WIPO_SOURCE_COVERAGE_TARGETS } from "./wipo-source-coverage";\n\nconst VERIFIED_AT',
    "catalog import",
)
text = replace_once(
    text,
    '] satisfies readonly SourceCoverageTarget[];\n\nexport type SourceCoverageFilters',
    '] satisfies readonly SourceCoverageTarget[];\n\nexport { WIPO_SOURCE_COVERAGE_TARGETS };\nexport const SOURCE_COVERAGE_TARGETS = [\n  ...US_SOURCE_COVERAGE_TARGETS,\n  ...WIPO_SOURCE_COVERAGE_TARGETS,\n] satisfies readonly SourceCoverageTarget[];\n\nexport type SourceCoverageFilters',
    "catalog aggregate",
)
text = text.replace("return US_SOURCE_COVERAGE_TARGETS.filter((item) => {", "return SOURCE_COVERAGE_TARGETS.filter((item) => {")
text = text.replace(
    "const item = US_SOURCE_COVERAGE_TARGETS.find((candidate) => candidate.id === id);",
    "const item = SOURCE_COVERAGE_TARGETS.find((candidate) => candidate.id === id);",
)
text = text.replace(
    "targets: readonly SourceCoverageTarget[] = US_SOURCE_COVERAGE_TARGETS,",
    "targets: readonly SourceCoverageTarget[] = SOURCE_COVERAGE_TARGETS,",
)
path.write_text(text)


# Bootstrap: make source registration reusable by jurisdiction while keeping US API compatibility.
path = Path("apps/worker/src/source-coverage-bootstrap.ts")
text = path.read_text()
old = '''async function loadCoverage(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
): Promise<{ targets: CoverageTarget[]; registrations: CoverageRegistration[] }> {
  const response = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-coverage?jurisdiction=US&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return {
    targets: parseCoverageTargets(response.body),
    registrations: parseRegistrations(response.body),
  };
}
'''
new = '''async function loadCoverage(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
): Promise<{ targets: CoverageTarget[]; registrations: CoverageRegistration[] }> {
  const response = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-coverage?jurisdiction=${encodeURIComponent(jurisdiction)}&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return {
    targets: parseCoverageTargets(response.body),
    registrations: parseRegistrations(response.body),
  };
}
'''
text = replace_once(text, old, new, "bootstrap loadCoverage")
marker = "export type BootstrapCoverageOptions = {"
idx = text.index(marker)
text = text[:idx] + '''export type BootstrapCoverageOptions = {
  baseUrl: string;
  workspaceId?: string;
  jurisdiction?: string;
  dispatchRepresentative?: boolean;
  representativeTargetIds?: readonly string[];
  fetchImpl?: FetchLike;
};

export async function bootstrapFoundationalCoverage(options: BootstrapCoverageOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const workspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const jurisdiction = (options.jurisdiction ?? "US").trim().toUpperCase();
  if (!jurisdiction) throw new Error("jurisdiction is required");
  await ensureConnector(fetchImpl, baseUrl);

  const initial = await loadCoverage(fetchImpl, baseUrl, workspaceId, jurisdiction);
  if (initial.targets.length === 0) {
    throw new Error(`No active ${jurisdiction} FOUNDATIONAL coverage targets found`);
  }
  const byRegistration = new Map(initial.registrations.map((value) => [value.targetId, value]));
  const created: Array<{ targetId: string; sourceId: string }> = [];
  const reused: Array<{ targetId: string; sourceIds: string[] }> = [];

  for (const target of initial.targets) {
    const registration = byRegistration.get(target.id);
    if (registration?.state === "REGISTERED") {
      reused.push({ targetId: target.id, sourceIds: registration.sourceIds });
      continue;
    }
    const response = await requestJson(
      fetchImpl,
      baseUrl,
      "/api/sources",
      jsonPost(sourceCreatePayload(target, workspaceId)),
    );
    const source = record(record(response.body)?.source);
    created.push({ targetId: target.id, sourceId: requiredString(source?.id, "source.id") });
  }

  const finalCoverage = await loadCoverage(fetchImpl, baseUrl, workspaceId, jurisdiction);
  const missing = finalCoverage.registrations.filter((value) => value.state !== "REGISTERED");
  if (missing.length > 0) {
    throw new Error(
      `Coverage registration incomplete: ${missing.map((value) => value.targetId).join(", ")}`,
    );
  }

  const representativeTargetIds =
    options.representativeTargetIds ?? (jurisdiction === "US" ? REPRESENTATIVE_TARGET_IDS : []);
  let worker: { workerId: string; credential: string | null } | null = null;
  const runs: Array<{ targetId: string; sourceId: string; planId: string; runId: string }> = [];
  if (options.dispatchRepresentative && representativeTargetIds.length > 0) {
    worker = await ensureWorker(fetchImpl, baseUrl);
    const targetMap = new Map(finalCoverage.targets.map((value) => [value.id, value]));
    const registrationMap = new Map(
      finalCoverage.registrations.map((value) => [value.targetId, value]),
    );
    for (const targetId of representativeTargetIds) {
      const target = targetMap.get(targetId);
      const registration = registrationMap.get(targetId);
      if (!target || !registration || registration.state !== "REGISTERED") {
        throw new Error(`Representative target ${targetId} is not registered`);
      }
      const sourceId = requiredString(registration.sourceIds[0], `${targetId}.sourceId`);
      const planId = await ensurePlan(fetchImpl, baseUrl, sourceId, target);
      const runId = await dispatchPlan(fetchImpl, baseUrl, targetId, planId);
      runs.push({ targetId, sourceId, planId, runId });
    }
  }

  return {
    controlPlaneUrl: baseUrl,
    workspaceId,
    jurisdiction,
    connector: `${COVERAGE_CONNECTOR_ID}@${COVERAGE_CONNECTOR_VERSION}`,
    targetCount: finalCoverage.targets.length,
    registeredCount: finalCoverage.registrations.length,
    created,
    reused,
    workerId: worker?.workerId ?? null,
    workerCredential: worker?.credential ?? null,
    runs,
    collectionAuthorization: runs.length > 0
      ? "REPRESENTATIVE_MANUAL_RUNS_EXPLICITLY_DISPATCHED"
      : "NONE",
  };
}

export type JurisdictionBootstrapCoverageOptions = Omit<
  BootstrapCoverageOptions,
  "jurisdiction" | "representativeTargetIds"
>;

export function bootstrapUsFoundationalCoverage(options: JurisdictionBootstrapCoverageOptions) {
  return bootstrapFoundationalCoverage({
    ...options,
    jurisdiction: "US",
    representativeTargetIds: REPRESENTATIVE_TARGET_IDS,
  });
}

export function bootstrapWipoFoundationalCoverage(options: JurisdictionBootstrapCoverageOptions) {
  return bootstrapFoundationalCoverage({
    ...options,
    jurisdiction: "WO",
    representativeTargetIds: [],
  });
}
'''
path.write_text(text)


# Supply plans: same manual-only operation for any curated jurisdiction.
path = Path("apps/worker/src/source-coverage-operations.ts")
text = path.read_text()
old = '''async function loadCoverage(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
): Promise<{ targets: CoverageTarget[]; registrations: CoverageRegistration[] }> {
  const payload = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-coverage?jurisdiction=US&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  const outer = record(payload);
  const targets = array(outer?.targets) as CoverageTarget[];
  const registrations = array(outer?.registration) as CoverageRegistration[];
  if (targets.length === 0) throw new Error("No active US FOUNDATIONAL coverage targets found");
  return { targets, registrations };
}
'''
new = '''async function loadCoverage(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
): Promise<{ targets: CoverageTarget[]; registrations: CoverageRegistration[] }> {
  const payload = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-coverage?jurisdiction=${encodeURIComponent(jurisdiction)}&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  const outer = record(payload);
  const targets = array(outer?.targets) as CoverageTarget[];
  const registrations = array(outer?.registration) as CoverageRegistration[];
  if (targets.length === 0) {
    throw new Error(`No active ${jurisdiction} FOUNDATIONAL coverage targets found`);
  }
  return { targets, registrations };
}
'''
text = replace_once(text, old, new, "operations loadCoverage")
marker = "export type PrepareUsFoundationalSupplyOptions = {"
idx = text.index(marker)
text = text[:idx] + '''export type PrepareFoundationalSupplyOptions = {
  baseUrl: string;
  workspaceId: string;
  jurisdiction: string;
  dispatchTargetIds?: string[];
  fetchImpl?: FetchLike;
};

export async function prepareFoundationalSupply(options: PrepareFoundationalSupplyOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const jurisdiction = options.jurisdiction.trim().toUpperCase();
  if (!jurisdiction) throw new Error("jurisdiction is required");
  const coverage = await loadCoverage(fetchImpl, baseUrl, options.workspaceId, jurisdiction);
  const registrationMap = new Map(coverage.registrations.map((value) => [value.targetId, value]));
  const targetMap = new Map(coverage.targets.map((value) => [value.id, value]));

  const missing = coverage.targets.filter(
    (target) => registrationMap.get(target.id)?.state !== "REGISTERED",
  );
  if (missing.length > 0) {
    throw new Error(
      `Foundational sources must be registered first: ${missing.map((v) => v.id).join(", ")}`,
    );
  }

  const plans: PreparedSupplyPlan[] = [];
  for (const target of coverage.targets) {
    const registration = registrationMap.get(target.id)!;
    const sourceId = requiredString(registration.sourceIds[0], `${target.id}.sourceId`);
    plans.push(await ensureSupplyPlan(fetchImpl, baseUrl, sourceId, target));
  }

  const requestedTargets = [...new Set(options.dispatchTargetIds ?? [])];
  for (const targetId of requestedTargets) {
    if (!targetMap.has(targetId)) {
      throw new Error(`Unknown ${jurisdiction} FOUNDATIONAL target ${targetId}`);
    }
  }

  const planMap = new Map(plans.map((plan) => [plan.targetId, plan]));
  const runs: SupplyRun[] = [];
  for (const targetId of requestedTargets) {
    const plan = planMap.get(targetId)!;
    const runId = await dispatchSupplyPlan(fetchImpl, baseUrl, targetId, plan.planId);
    runs.push({
      targetId,
      sourceId: plan.sourceId,
      planId: plan.planId,
      runId,
    });
  }

  const capabilityGaps: SupplyCapabilityGap[] = coverage.targets
    .filter(
      (target) =>
        !target.acquisition.fetchAttachmentsHint &&
        target.acquisition.expectedArtifactKinds.some((kind) => kind === "JSON"),
    )
    .map((target) => ({
      targetId: target.id,
      code: "STRUCTURED_ENDPOINT_NOT_CAPTURED" as const,
      expectedArtifactKinds: target.acquisition.expectedArtifactKinds.filter(
        (kind) => kind === "JSON",
      ),
    }));

  return {
    controlPlaneUrl: baseUrl,
    workspaceId: options.workspaceId,
    jurisdiction,
    targetCount: coverage.targets.length,
    preparedPlanCount: plans.length,
    plans,
    capabilityGaps,
    runs,
    collectionAuthorization: runs.length > 0 ? "EXPLICIT_TARGET_MANUAL_RUNS_DISPATCHED" : "NONE",
  };
}

export type PrepareJurisdictionFoundationalSupplyOptions = Omit<
  PrepareFoundationalSupplyOptions,
  "jurisdiction"
>;

export function prepareUsFoundationalSupply(options: PrepareJurisdictionFoundationalSupplyOptions) {
  return prepareFoundationalSupply({ ...options, jurisdiction: "US" });
}

export function prepareWipoFoundationalSupply(
  options: PrepareJurisdictionFoundationalSupplyOptions,
) {
  return prepareFoundationalSupply({ ...options, jurisdiction: "WO" });
}
'''
path.write_text(text)


# Conversion profiles: select coverage by jurisdiction; preserve US path and add WIPO namespace.
path = Path("apps/worker/src/source-supply-conversion.ts")
text = path.read_text()
old = '''async function loadCoverage(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
): Promise<{ targets: CoverageTarget[]; registrations: CoverageRegistration[] }> {
  const payload = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-coverage?jurisdiction=US&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return {
    targets: parseCoverageTargets(payload),
    registrations: parseRegistrations(payload),
  };
}
'''
new = '''async function loadCoverage(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
): Promise<{ targets: CoverageTarget[]; registrations: CoverageRegistration[] }> {
  const payload = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-coverage?jurisdiction=${encodeURIComponent(jurisdiction)}&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return {
    targets: parseCoverageTargets(payload),
    registrations: parseRegistrations(payload),
  };
}
'''
text = replace_once(text, old, new, "conversion loadCoverage")
text = replace_once(
    text,
    'targetPathTemplate: "sources/uspto/{artifactId}.md",',
    'targetPathTemplate: `sources/${target.jurisdiction === "US" ? "uspto" : target.jurisdiction === "WO" ? "wipo" : target.jurisdiction.toLowerCase()}/{artifactId}.md`,',
    "conversion target path",
)
marker = "export type PrepareUsFoundationalAutoConversionOptions = {"
idx = text.index(marker)
text = text[:idx] + '''export type PrepareFoundationalAutoConversionOptions = {
  baseUrl: string;
  workspaceId: string;
  jurisdiction: string;
  fetchImpl?: FetchLike;
};

export async function prepareFoundationalAutoConversion(
  options: PrepareFoundationalAutoConversionOptions,
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const jurisdiction = options.jurisdiction.trim().toUpperCase();
  if (!jurisdiction) throw new Error("jurisdiction is required");
  const coverage = await loadCoverage(fetchImpl, baseUrl, options.workspaceId, jurisdiction);
  if (coverage.targets.length === 0) {
    throw new Error(`No active ${jurisdiction} FOUNDATIONAL coverage targets found`);
  }
  const registrations = new Map(coverage.registrations.map((value) => [value.targetId, value]));

  const manifests: Array<{ converterId: string; version: string; state: "CREATED" | "REUSED" }> =
    [];
  for (const spec of CONVERTERS) {
    manifests.push({
      converterId: spec.converterId,
      version: spec.version,
      state: await ensureManifest(fetchImpl, baseUrl, spec),
    });
  }

  const profiles: Array<{
    targetId: string;
    sourceId: string;
    converterId: string;
    profileId: string;
    state: "CREATED" | "REUSED";
  }> = [];
  for (const target of coverage.targets) {
    const sourceId = sourceIdForTarget(target, registrations);
    for (const spec of CONVERTERS) {
      const input = profileInput(target, spec);
      if (!input) continue;
      const profile = await ensureProfile(
        fetchImpl,
        baseUrl,
        options.workspaceId,
        sourceId,
        target,
        spec,
        input,
      );
      profiles.push({
        targetId: target.id,
        sourceId,
        converterId: spec.converterId,
        profileId: profile.profileId,
        state: profile.state,
      });
    }
  }

  return {
    workspaceId: options.workspaceId,
    jurisdiction,
    targetCount: coverage.targets.length,
    manifestCount: manifests.length,
    profileCount: profiles.length,
    manifests,
    profiles,
    automaticPolicy: {
      pages: "MARKDOWN_ONLY",
      html: "RAW_EVIDENCE_ONLY",
      pdf: "TEXT_LAYER_ONLY_NO_OCR_FALLBACK",
      scannedPdf: "EXPLICIT_OCR_REQUIRED",
    },
  };
}

export type PrepareJurisdictionFoundationalAutoConversionOptions = Omit<
  PrepareFoundationalAutoConversionOptions,
  "jurisdiction"
>;

export function prepareUsFoundationalAutoConversion(
  options: PrepareJurisdictionFoundationalAutoConversionOptions,
) {
  return prepareFoundationalAutoConversion({ ...options, jurisdiction: "US" });
}

export function prepareWipoFoundationalAutoConversion(
  options: PrepareJurisdictionFoundationalAutoConversionOptions,
) {
  return prepareFoundationalAutoConversion({ ...options, jurisdiction: "WO" });
}
'''
path.write_text(text)


# CLI: explicit jurisdiction selection; still no automatic collection.
Path("apps/worker/src/bootstrap-source-coverage.ts").write_text('''import { bootstrapFoundationalCoverage, DEFAULT_WORKSPACE_ID } from "./source-coverage-bootstrap";
import { prepareFoundationalAutoConversion } from "./source-supply-conversion";
import { prepareFoundationalSupply } from "./source-coverage-operations";

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function argumentsFor(name: string): string[] {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .filter((value) => value.startsWith(prefix))
    .map((value) => value.slice(prefix.length).trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const baseUrl =
    process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() ||
    argument("--control-plane") ||
    "http://127.0.0.1:3000";
  const workspaceId = argument("--workspace") || DEFAULT_WORKSPACE_ID;
  const jurisdiction = (argument("--jurisdiction") || "US").trim().toUpperCase();
  if (jurisdiction !== "US" && jurisdiction !== "WO") {
    throw new Error("--jurisdiction must be US or WO");
  }
  const dispatchRepresentative = process.argv.includes("--dispatch-representative");
  if (dispatchRepresentative && jurisdiction !== "US") {
    throw new Error("--dispatch-representative is currently supported only for US live smoke");
  }
  const sourcesOnly = process.argv.includes("--sources-only");
  const dispatchTargetIds = argumentsFor("--dispatch-target");

  const bootstrap = await bootstrapFoundationalCoverage({
    baseUrl,
    workspaceId,
    jurisdiction,
    dispatchRepresentative,
  });

  const supply = sourcesOnly
    ? null
    : await prepareFoundationalSupply({
        baseUrl,
        workspaceId,
        jurisdiction,
        dispatchTargetIds,
      });
  const conversion = sourcesOnly
    ? null
    : await prepareFoundationalAutoConversion({
        baseUrl,
        workspaceId,
        jurisdiction,
      });

  process.stdout.write(
    `${JSON.stringify(
      {
        bootstrap,
        supply,
        conversion,
        jurisdiction,
        mode: sourcesOnly ? "SOURCES_ONLY" : "SOURCES_SUPPLY_PLANS_AND_AUTO_CONVERSION_PROFILES",
      },
      null,
      2,
    )}\\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\\n`,
  );
  process.exitCode = 1;
});
''')
