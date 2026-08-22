import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  type AcquisitionDiscoverySurface,
  type AcquisitionPlaybook,
  type AcquisitionPlaybookHistory,
  type AcquisitionRunEvidence,
  type AcquisitionStrategySelection,
  type RunLesson,
  type SourceFingerprint,
} from "./acquisition-intelligence-v1";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

function includesEvery<T>(available: readonly T[], required: readonly T[]): boolean {
  return required.every((item) => available.includes(item));
}

function compatibleWithFingerprint(
  fingerprint: SourceFingerprint,
  playbook: AcquisitionPlaybook,
): { compatible: boolean; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  const compatibility = playbook.compatibility;

  if (
    compatibility.architectures?.length &&
    !compatibility.architectures.includes(fingerprint.architecture)
  ) {
    reasonCodes.push("ARCHITECTURE_MISMATCH");
  }
  if (
    compatibility.requiresDiscoverySurfaces?.length &&
    !includesEvery(fingerprint.discoverySurfaces, compatibility.requiresDiscoverySurfaces)
  ) {
    reasonCodes.push("REQUIRED_DISCOVERY_SURFACE_MISSING");
  }
  if (
    compatibility.anyDiscoverySurfaces?.length &&
    !compatibility.anyDiscoverySurfaces.some((surface) =>
      fingerprint.discoverySurfaces.includes(surface),
    )
  ) {
    reasonCodes.push("NO_COMPATIBLE_DISCOVERY_SURFACE");
  }
  if (
    compatibility.renderRequirements?.length &&
    !compatibility.renderRequirements.includes(fingerprint.renderRequirement)
  ) {
    reasonCodes.push("RENDER_REQUIREMENT_MISMATCH");
  }
  if (
    compatibility.localeStructures?.length &&
    !compatibility.localeStructures.includes(fingerprint.localeStructure)
  ) {
    reasonCodes.push("LOCALE_STRUCTURE_MISMATCH");
  }
  if (playbook.stage !== "ACTIVE") {
    reasonCodes.push("PLAYBOOK_NOT_ACTIVE");
  }

  if (reasonCodes.length === 0) reasonCodes.push("STRUCTURAL_MATCH");
  return {
    compatible: reasonCodes.length === 1 && reasonCodes[0] === "STRUCTURAL_MATCH",
    reasonCodes,
  };
}

function playbookScore(
  playbook: AcquisitionPlaybook,
  history: AcquisitionPlaybookHistory | undefined,
  fingerprint: SourceFingerprint,
): { score: number; reasonCodes: string[] } {
  const coverage = history?.averageCoverage ?? playbook.prior.expectedCoverage;
  const successRate = history?.runs ? history.successRate : playbook.prior.expectedSuccessRate;
  const confidence = clamp01(playbook.prior.confidence * 0.7 + fingerprint.confidence * 0.3);
  const costEfficiency = 1 - clamp01(playbook.prior.expectedCostScore);
  const historyWeight = Math.min(history?.runs ?? 0, 10) / 10;

  const score =
    clamp01(coverage ?? playbook.prior.expectedCoverage) * 40 +
    clamp01(successRate) * 30 +
    confidence * 15 +
    costEfficiency * 10 +
    historyWeight * 5;

  const reasonCodes = [
    history?.runs ? "HISTORICAL_OUTCOMES_APPLIED" : "PLAYBOOK_PRIOR_APPLIED",
    coverage !== null && coverage >= 0.95 ? "HIGH_EXPECTED_COVERAGE" : "COVERAGE_UNCERTAIN",
    successRate >= 0.95 ? "HIGH_SUCCESS_RATE" : "SUCCESS_RATE_HAS_HEADROOM",
  ];
  if (historyWeight >= 0.5) reasonCodes.push("REPEATED_EVIDENCE_AVAILABLE");

  return { score: roundScore(score), reasonCodes };
}

export function selectAcquisitionPlaybook(input: {
  fingerprint: SourceFingerprint;
  playbooks: readonly AcquisitionPlaybook[];
  history?: Readonly<Record<string, AcquisitionPlaybookHistory>>;
}): AcquisitionStrategySelection {
  const ranked = input.playbooks
    .map((playbook) => {
      const compatibility = compatibleWithFingerprint(input.fingerprint, playbook);
      const history = input.history?.[`${playbook.id}@${playbook.revision}`];
      const scored = compatibility.compatible
        ? playbookScore(playbook, history, input.fingerprint)
        : { score: 0, reasonCodes: [] };
      return {
        playbookId: playbook.id,
        revision: playbook.revision,
        compatible: compatibility.compatible,
        score: scored.score,
        reasonCodes: [...compatibility.reasonCodes, ...scored.reasonCodes],
      };
    })
    .sort((left, right) => {
      if (left.compatible !== right.compatible) return left.compatible ? -1 : 1;
      if (right.score !== left.score) return right.score - left.score;
      return left.playbookId.localeCompare(right.playbookId);
    });

  const selected = ranked.find((item) => item.compatible) ?? null;
  const selectedPlaybook = selected
    ? (input.playbooks.find(
        (playbook) =>
          playbook.id === selected.playbookId && playbook.revision === selected.revision,
      ) ?? null)
    : null;
  const compatibleIds = ranked.filter((item) => item.compatible).map((item) => item.playbookId);
  const fallbackOrder = selectedPlaybook
    ? [
        ...selectedPlaybook.fallbackPlaybookIds.filter(
          (id) => id !== selectedPlaybook.id && compatibleIds.includes(id),
        ),
        ...compatibleIds.filter(
          (id) => id !== selectedPlaybook.id && !selectedPlaybook.fallbackPlaybookIds.includes(id),
        ),
      ]
    : [];

  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_STRATEGY_SELECTION",
    sourceId: input.fingerprint.sourceId,
    selectedPlaybookId: selected?.playbookId ?? null,
    selectedRevision: selected?.revision ?? null,
    ranked,
    fallbackOrder,
    rationale: selected
      ? [
          `Selected ${selected.playbookId}@${selected.revision} from structural fingerprint compatibility and observed outcomes.`,
          `Selection score ${selected.score}; selection does not promote the playbook or grant collection authority.`,
        ]
      : [
          "No ACTIVE playbook matched the source fingerprint; a bounded probe or candidate is required.",
        ],
    boundaries: {
      selectionGrantsCollectionAuthority: false,
      autoPromotionApplied: false,
    },
  };
}

function lesson(
  evidence: AcquisitionRunEvidence,
  input: Omit<RunLesson, "protocolVersion" | "objectType" | "runId" | "sourceId" | "evidenceRefs">,
): RunLesson {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_RUN_LESSON",
    runId: evidence.runId,
    sourceId: evidence.sourceId,
    evidenceRefs: evidence.evidenceRefs,
    ...input,
  };
}

function surfaceCoverage(surface: { accepted: number; knownCorpus: number | null }): number | null {
  if (surface.knownCorpus === null || surface.knownCorpus <= 0) return null;
  return clamp01(surface.accepted / surface.knownCorpus);
}

function surfacePrimitive(surface: AcquisitionDiscoverySurface) {
  switch (surface) {
    case "SITEMAP":
      return "SITEMAP_ENUMERATION" as const;
    case "INDEX_PAGE":
      return "INDEX_TREE_ENUMERATION" as const;
    case "COUNTRY_INDEX":
      return "COUNTRY_INDEX_ENUMERATION" as const;
    case "TOC":
      return "TOC_GRAPH_ENUMERATION" as const;
    case "API":
    case "DOCUMENT_CATALOG":
      return "API_CATALOG_ENUMERATION" as const;
    default:
      return undefined;
  }
}

export function extractAcquisitionRunLessons(evidence: AcquisitionRunEvidence): RunLesson[] {
  const lessons: RunLesson[] = [];

  for (const surface of evidence.surfaceOutcomes) {
    const coverage = surfaceCoverage(surface);
    if (coverage !== null && coverage >= 0.98) {
      lessons.push(
        lesson(evidence, {
          lessonType: "AUTHORITATIVE_ENUMERATOR",
          scope: "SOURCE",
          statement: `${surface.surface} enumerated at least 98% of the known corpus in this run.`,
          confidence: clamp01(0.75 + coverage * 0.25),
          reasonCodes: ["SURFACE_COVERAGE_GTE_98_PERCENT"],
          ...(surfacePrimitive(surface.surface)
            ? { recommendedPrimitive: surfacePrimitive(surface.surface) }
            : {}),
          affectedSurface: surface.surface,
        }),
      );
    } else if (coverage !== null && coverage < 0.9) {
      lessons.push(
        lesson(evidence, {
          lessonType: "INCOMPLETE_ENUMERATOR",
          scope: "SOURCE",
          statement: `${surface.surface} covered less than 90% of the known corpus and should not be trusted as the sole enumerator.`,
          confidence: clamp01(0.7 + (1 - coverage) * 0.3),
          reasonCodes: ["SURFACE_COVERAGE_LT_90_PERCENT", "FALLBACK_REQUIRED"],
          recommendedPrimitive: "CORPUS_RECONCILIATION",
          affectedSurface: surface.surface,
        }),
      );
    }
  }

  if (
    evidence.coverage.ratio !== null &&
    evidence.coverage.previousRatio !== null &&
    evidence.coverage.previousRatio - evidence.coverage.ratio >= 0.05
  ) {
    lessons.push(
      lesson(evidence, {
        lessonType: "COVERAGE_REGRESSION",
        scope: "SOURCE",
        statement:
          "Corpus coverage regressed by at least five percentage points versus the previous run.",
        confidence: 0.95,
        reasonCodes: ["COVERAGE_DROP_GTE_5_POINTS", "REVALIDATION_REQUIRED"],
        recommendedPrimitive: "CORPUS_RECONCILIATION",
      }),
    );
  }

  const probe = evidence.rendering.comparativeProbe;
  if (probe && probe.renderedAccepted <= probe.staticAccepted) {
    lessons.push(
      lesson(evidence, {
        lessonType: "RENDERING_UNNECESSARY",
        scope: "SOURCE",
        statement:
          "JavaScript rendering did not increase accepted content during the comparative probe.",
        confidence: 0.9,
        reasonCodes: ["RENDERED_ACCEPTED_NOT_GREATER_THAN_STATIC"],
        recommendedPrimitive: "STATIC_HTML_FETCH",
      }),
    );
  } else if (probe && probe.renderedAccepted > probe.staticAccepted * 1.05) {
    lessons.push(
      lesson(evidence, {
        lessonType: "RENDERING_REQUIRED",
        scope: "SOURCE",
        statement: "JavaScript rendering increased accepted content by more than five percent.",
        confidence: 0.9,
        reasonCodes: ["RENDERED_ACCEPTED_GT_STATIC_BY_5_PERCENT"],
        recommendedPrimitive: "JS_RENDERED_FETCH",
      }),
    );
  }

  if (evidence.changeDetection.validator304Count > 0) {
    lessons.push(
      lesson(evidence, {
        lessonType: "HTTP_VALIDATORS_EFFECTIVE",
        scope: "DOMAIN",
        statement:
          "HTTP validators produced 304 responses and can reduce unchanged-content transfer.",
        confidence: 0.95,
        reasonCodes: ["HTTP_304_OBSERVED"],
        recommendedPrimitive: "HTTP_VALIDATOR_CHANGE_WATCH",
      }),
    );
  } else if (
    evidence.changeDetection.etagObserved === false &&
    evidence.changeDetection.lastModifiedObserved === false
  ) {
    lessons.push(
      lesson(evidence, {
        lessonType: "HTTP_VALIDATORS_UNAVAILABLE",
        scope: "DOMAIN",
        statement:
          "Neither ETag nor Last-Modified was observed; validator-only change watch is unavailable.",
        confidence: 0.9,
        reasonCodes: ["NO_ETAG", "NO_LAST_MODIFIED"],
        recommendedPrimitive: "CONTENT_DIGEST_CHANGE_WATCH",
      }),
    );
    lessons.push(
      lesson(evidence, {
        lessonType: "DIGEST_WATCH_REQUIRED",
        scope: "DOMAIN",
        statement:
          "Content digest comparison should remain the fallback change-detection mechanism.",
        confidence: 0.9,
        reasonCodes: ["HTTP_VALIDATORS_UNAVAILABLE"],
        recommendedPrimitive: "CONTENT_DIGEST_CHANGE_WATCH",
      }),
    );
  }

  const duplicateRatio =
    evidence.counts.accepted + evidence.counts.duplicates > 0
      ? evidence.counts.duplicates / (evidence.counts.accepted + evidence.counts.duplicates)
      : 0;
  if (duplicateRatio >= 0.15) {
    lessons.push(
      lesson(evidence, {
        lessonType: "DUPLICATION_HIGH",
        scope: "SOURCE",
        statement:
          "At least 15% of accepted-or-duplicate items were duplicates; identity or enumeration rules need refinement.",
        confidence: clamp01(0.75 + duplicateRatio * 0.25),
        reasonCodes: ["DUPLICATE_RATIO_GTE_15_PERCENT"],
        recommendedPrimitive: "CORPUS_RECONCILIATION",
      }),
    );
  }

  for (const failure of evidence.failureSignatures) {
    if (failure.count <= 0) continue;
    lessons.push(
      lesson(evidence, {
        lessonType: "FAILURE_SIGNATURE",
        scope: "SOURCE",
        statement: `Observed repeatable acquisition failure signature ${failure.code} (${failure.count}).`,
        confidence: clamp01(0.6 + Math.min(failure.count, 20) / 50),
        reasonCodes: ["FAILURE_SIGNATURE_OBSERVED", failure.code],
      }),
    );
  }

  if (
    evidence.outcome === "SUCCESS" &&
    (evidence.coverage.ratio === null || evidence.coverage.ratio >= 0.95)
  ) {
    lessons.push(
      lesson(evidence, {
        lessonType: "PLAYBOOK_SUCCESS",
        scope: "SOURCE",
        statement:
          "The selected playbook completed successfully with no known material coverage gap.",
        confidence: evidence.coverage.ratio === null ? 0.7 : 0.95,
        reasonCodes: [
          "RUN_SUCCESS",
          evidence.coverage.ratio === null ? "CORPUS_SIZE_UNKNOWN" : "COVERAGE_GTE_95_PERCENT",
        ],
      }),
    );
  }

  return lessons;
}
