import {
  RADAR_AUTHORITY_TYPES,
  RADAR_CANDIDATE_STATUSES,
  RADAR_INTAKE_FILENAMES,
  RADAR_RULE_MATCH_TYPES,
  RADAR_SOURCE_INTAKE_VERSION,
  RADAR_SOURCE_PRIORITIES,
  RADAR_SOURCE_TYPES,
  RADAR_SUBSCRIPTION_STATUSES,
  type RadarAcquisitionKind,
  type RadarAcquisitionProposal,
  type RadarAdvisoryScores,
  type RadarAuthorityType,
  type RadarCandidateProposal,
  type RadarCandidateStatus,
  type RadarCoverageGap,
  type RadarEmailRoutingEvidence,
  type RadarIntakeFilename,
  type RadarIntakeIssue,
  type RadarRoutingRuleEvidence,
  type RadarRuleMatchType,
  type RadarSourceIntakePlan,
  type RadarSourcePriority,
  type RadarSourceProposal,
  type RadarSourceType,
  type RadarSubscriptionEvidence,
  type RadarSubscriptionStatus,
} from "../../../packages/contracts/src/radar-source-intake-v1";

export type RadarSourceIntakeFiles = Partial<Record<RadarIntakeFilename, string>>;

interface ParsedCsvRow {
  row: number;
  values: Record<string, string>;
}

interface ParsedCsv {
  headers: string[];
  rows: ParsedCsvRow[];
}

const SOURCE_REQUIRED_HEADERS = [
  "source_id",
  "name",
  "organization",
  "authority_type",
  "source_type",
  "priority",
  "subscription_status",
] as const;
const CANDIDATE_REQUIRED_HEADERS = ["candidate_id", "name", "url", "status"] as const;
const COVERAGE_REQUIRED_HEADERS = ["jurisdiction", "source_category", "missing"] as const;
const SUBSCRIPTION_REQUIRED_HEADERS = ["source_id"] as const;
const RULE_REQUIRED_HEADERS = ["source_id", "match_type", "match_value"] as const;

const BLOCKED_SUBSCRIPTION_STATUSES = new Set<RadarSubscriptionStatus>([
  "manual_required",
  "rejected",
  "failed",
  "inactive",
]);

const EMAIL_SUBSCRIPTION_STATUSES = new Set<RadarSubscriptionStatus>([
  "available",
  "subscribed",
  "confirmed",
  "already_subscribed",
]);

function normalize(value: string | undefined): string {
  return (value ?? "").trim();
}

function optional(value: string | undefined): string | undefined {
  const normalized = normalize(value);
  return normalized.length > 0 ? normalized : undefined;
}

function stableKey(value: string, fallback: string): string {
  const key = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key || fallback.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function enumValue<T extends readonly string[]>(values: T, value: string): T[number] | undefined {
  return (values as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

function pushIssue(issues: RadarIntakeIssue[], issue: RadarIntakeIssue): void {
  issues.push(issue);
}

function requiredValue(
  row: ParsedCsvRow,
  file: RadarIntakeFilename,
  field: string,
  issues: RadarIntakeIssue[],
): string | undefined {
  const value = normalize(row.values[field]);
  if (value) return value;
  pushIssue(issues, {
    severity: "ERROR",
    code: "MISSING_REQUIRED_VALUE",
    file,
    row: row.row,
    field,
    message: `Missing required value: ${field}`,
  });
  return undefined;
}

function parseEnum<T extends readonly string[]>(args: {
  values: T;
  value: string | undefined;
  field: string;
  row: ParsedCsvRow;
  file: RadarIntakeFilename;
  issues: RadarIntakeIssue[];
}): T[number] | undefined {
  const value = normalize(args.value);
  if (!value) {
    pushIssue(args.issues, {
      severity: "ERROR",
      code: "MISSING_REQUIRED_VALUE",
      file: args.file,
      row: args.row.row,
      field: args.field,
      message: `Missing required value: ${args.field}`,
    });
    return undefined;
  }
  const parsed = enumValue(args.values, value);
  if (parsed) return parsed;
  pushIssue(args.issues, {
    severity: "ERROR",
    code: "UNSUPPORTED_ENUM",
    file: args.file,
    row: args.row.row,
    field: args.field,
    value,
    message: `Unsupported ${args.field}: ${value}`,
  });
  return undefined;
}

function parseBoolean(
  value: string | undefined,
  args: {
    file: RadarIntakeFilename;
    row: number;
    field: string;
    issues: RadarIntakeIssue[];
  },
): boolean | undefined {
  const normalized = normalize(value).toLowerCase();
  if (!normalized) return undefined;
  if (["true", "yes", "1", "y"].includes(normalized)) return true;
  if (["false", "no", "0", "n"].includes(normalized)) return false;
  pushIssue(args.issues, {
    severity: "WARNING",
    code: "INVALID_BOOLEAN",
    file: args.file,
    row: args.row,
    field: args.field,
    value: normalize(value),
    message: `Invalid boolean ${args.field}: ${normalize(value)}`,
  });
  return undefined;
}

function parseScore(
  value: string | undefined,
  args: {
    file: RadarIntakeFilename;
    row: number;
    field: string;
    issues: RadarIntakeIssue[];
  },
): number | undefined {
  const normalized = normalize(value);
  if (!normalized) return undefined;
  const score = Number(normalized);
  if (Number.isFinite(score) && score >= 0 && score <= 100) return score;
  pushIssue(args.issues, {
    severity: "WARNING",
    code: "INVALID_SCORE",
    file: args.file,
    row: args.row,
    field: args.field,
    value: normalized,
    message: `Score must be between 0 and 100: ${args.field}`,
  });
  return undefined;
}

export function parseRadarCsv(content: string): ParsedCsv {
  const input = content.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  const finishRecord = () => {
    record.push(field);
    field = "";
    if (record.some((value) => value.length > 0)) records.push(record);
    record = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      finishRecord();
    } else if (char === "\r") {
      if (input[index + 1] === "\n") continue;
      finishRecord();
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (field.length > 0 || record.length > 0) finishRecord();
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((header) => header.trim());
  const rows = records.slice(1).map((values, index) => ({
    row: index + 2,
    values: Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""])),
  }));
  return { headers, rows };
}

function parseDocument(args: {
  file: RadarIntakeFilename;
  content: string | undefined;
  requiredHeaders: readonly string[];
  issues: RadarIntakeIssue[];
}): ParsedCsv {
  if (args.content === undefined) return { headers: [], rows: [] };
  let parsed: ParsedCsv;
  try {
    parsed = parseRadarCsv(args.content);
  } catch (error) {
    pushIssue(args.issues, {
      severity: "ERROR",
      code: "CSV_PARSE_ERROR",
      file: args.file,
      message: error instanceof Error ? error.message : "Unable to parse CSV",
    });
    return { headers: [], rows: [] };
  }
  for (const header of args.requiredHeaders) {
    if (!parsed.headers.includes(header)) {
      pushIssue(args.issues, {
        severity: "ERROR",
        code: "MISSING_HEADER",
        file: args.file,
        field: header,
        message: `Missing required CSV header: ${header}`,
      });
    }
  }
  return parsed;
}

function firstHttpUrl(value: string | undefined): string | undefined {
  const match = normalize(value).match(/https?:\/\/[^\s,;]+/i);
  return match?.[0];
}

function addAcquisition(
  acquisitions: RadarAcquisitionProposal[],
  proposal: RadarAcquisitionProposal | undefined,
): void {
  if (!proposal?.locator) return;
  if (
    acquisitions.some(
      (candidate) => candidate.kind === proposal.kind && candidate.locator === proposal.locator,
    )
  ) {
    return;
  }
  acquisitions.push(proposal);
}

function buildSourceAcquisitions(args: {
  row: ParsedCsvRow;
  status: RadarSubscriptionStatus;
  confirmed: boolean;
  issues: RadarIntakeIssue[];
}): RadarAcquisitionProposal[] {
  const { row, status, confirmed, issues } = args;
  const acquisitions: RadarAcquisitionProposal[] = [];
  const newsletterUrl = optional(row.values.newsletter_url);
  const senderEmail = optional(row.values.sender_email);
  const senderDomain = optional(row.values.sender_domain);
  const listId = optional(row.values.list_id);

  if (EMAIL_SUBSCRIPTION_STATUSES.has(status) && (newsletterUrl || senderEmail || listId)) {
    addAcquisition(acquisitions, {
      kind: "EMAIL",
      locator: newsletterUrl ?? senderEmail ?? listId ?? "",
      verified: confirmed,
      senderEmail,
      senderDomain,
      listId,
    });
  }

  const rssUrl = optional(row.values.rss_url);
  if (rssUrl) addAcquisition(acquisitions, { kind: "RSS", locator: rssUrl, verified: false });

  const sitemapUrl = optional(row.values.sitemap_url);
  if (sitemapUrl) {
    addAcquisition(acquisitions, { kind: "SITEMAP", locator: sitemapUrl, verified: false });
  }

  const newsUrl = optional(row.values.news_url);
  if (newsUrl) {
    addAcquisition(acquisitions, { kind: "HTML_WATCH", locator: newsUrl, verified: false });
  }

  const other = optional(row.values.other_acquisition);
  const otherUrl = firstHttpUrl(other);
  const lowerOther = other?.toLowerCase() ?? "";
  const inferred: RadarAcquisitionKind[] = [];
  if (status === "api_available" || lowerOther.includes("api")) inferred.push("API");
  if (status === "html_watch" || lowerOther.includes("html")) inferred.push("HTML_WATCH");
  if (status === "sitemap_watch" || lowerOther.includes("sitemap")) inferred.push("SITEMAP");
  if (lowerOther.includes("pdf")) inferred.push("PDF_WATCH");

  for (const kind of inferred) {
    const locator =
      otherUrl ??
      (kind === "SITEMAP" ? sitemapUrl : undefined) ??
      newsUrl ??
      optional(row.values.homepage_url);
    if (locator) {
      addAcquisition(acquisitions, { kind, locator, verified: false });
    } else {
      pushIssue(issues, {
        severity: "WARNING",
        code: "MISSING_ACQUISITION_LOCATOR",
        file: "source_registry.csv",
        row: row.row,
        field: "other_acquisition",
        message: `Acquisition ${kind} has no usable locator`,
      });
    }
  }

  if (status === "rss_only" && !acquisitions.some((item) => item.kind === "RSS")) {
    pushIssue(issues, {
      severity: "WARNING",
      code: "MISSING_ACQUISITION_LOCATOR",
      file: "source_registry.csv",
      row: row.row,
      field: "rss_url",
      message: "rss_only source has no rss_url",
    });
  }

  return acquisitions;
}

function sourceDisposition(
  status: RadarSubscriptionStatus,
  priority: RadarSourcePriority,
  acquisitions: RadarAcquisitionProposal[],
): { disposition: RadarSourceProposal["disposition"]; reasons: string[] } {
  if (BLOCKED_SUBSCRIPTION_STATUSES.has(status)) {
    return { disposition: "BLOCKED", reasons: [`SUBSCRIPTION_STATUS_${status.toUpperCase()}`] };
  }
  if (status === "not_checked") {
    return { disposition: "CANDIDATE_ONLY", reasons: ["SOURCE_NOT_CHECKED"] };
  }
  if (priority === "C") {
    return { disposition: "CANDIDATE_ONLY", reasons: ["LOW_PRIORITY_REQUIRES_REVIEW"] };
  }
  if (acquisitions.length === 0) {
    return { disposition: "CANDIDATE_ONLY", reasons: ["NO_ACQUISITION_PROPOSAL"] };
  }
  return { disposition: "REVIEW", reasons: [] };
}

function candidateDisposition(status: RadarCandidateStatus): RadarCandidateProposal["disposition"] {
  if (status === "reject" || status === "duplicate") return "BLOCKED";
  if (status === "promote") return "REVIEW";
  return "CANDIDATE_ONLY";
}

function advisoryScores(row: ParsedCsvRow, issues: RadarIntakeIssue[]): RadarAdvisoryScores | undefined {
  const args = (field: string) => ({
    file: "source_registry.csv" as const,
    row: row.row,
    field,
    issues,
  });
  const scores: RadarAdvisoryScores = {
    sourceQuality: parseScore(row.values.source_quality_score, args("source_quality_score")),
    authority: parseScore(row.values.authority_score, args("authority_score")),
    originality: parseScore(row.values.originality_score, args("originality_score")),
    freshness: parseScore(row.values.freshness_score, args("freshness_score")),
    signal: parseScore(row.values.signal_score, args("signal_score")),
    noise: parseScore(row.values.noise_score, args("noise_score")),
  };
  return Object.values(scores).some((score) => score !== undefined) ? scores : undefined;
}

export function planRadarSourceIntake(args: {
  files: RadarSourceIntakeFiles;
  inputLabel?: string;
  generatedAt?: string;
}): RadarSourceIntakePlan {
  const issues: RadarIntakeIssue[] = [];
  let filesPresent = 0;
  for (const file of RADAR_INTAKE_FILENAMES) {
    if (args.files[file] !== undefined) {
      filesPresent += 1;
      continue;
    }
    pushIssue(issues, {
      severity: file === "source_registry.csv" ? "ERROR" : "WARNING",
      code: "MISSING_FILE",
      file,
      message: `Radar intake file is missing: ${file}`,
    });
  }

  const sourceCsv = parseDocument({
    file: "source_registry.csv",
    content: args.files["source_registry.csv"],
    requiredHeaders: SOURCE_REQUIRED_HEADERS,
    issues,
  });
  const candidateCsv = parseDocument({
    file: "candidates.csv",
    content: args.files["candidates.csv"],
    requiredHeaders: CANDIDATE_REQUIRED_HEADERS,
    issues,
  });
  const coverageCsv = parseDocument({
    file: "missing_coverage.csv",
    content: args.files["missing_coverage.csv"],
    requiredHeaders: COVERAGE_REQUIRED_HEADERS,
    issues,
  });
  const subscriptionCsv = parseDocument({
    file: "subscription_log.csv",
    content: args.files["subscription_log.csv"],
    requiredHeaders: SUBSCRIPTION_REQUIRED_HEADERS,
    issues,
  });
  const ruleCsv = parseDocument({
    file: "rules_map.csv",
    content: args.files["rules_map.csv"],
    requiredHeaders: RULE_REQUIRED_HEADERS,
    issues,
  });

  const routingEvidence: RadarRoutingRuleEvidence[] = [];
  const routingBySource = new Map<string, RadarEmailRoutingEvidence[]>();
  for (const row of ruleCsv.rows) {
    const externalSourceId = requiredValue(row, "rules_map.csv", "source_id", issues);
    const matchValue = requiredValue(row, "rules_map.csv", "match_value", issues);
    const matchType = parseEnum({
      values: RADAR_RULE_MATCH_TYPES,
      value: row.values.match_type,
      field: "match_type",
      row,
      file: "rules_map.csv",
      issues,
    }) as RadarRuleMatchType | undefined;
    if (!externalSourceId || !matchValue || !matchType) continue;
    const verified =
      parseBoolean(row.values.verified_from_real_email, {
        file: "rules_map.csv",
        row: row.row,
        field: "verified_from_real_email",
        issues,
      }) ?? false;
    const created =
      parseBoolean(row.values.created, {
        file: "rules_map.csv",
        row: row.row,
        field: "created",
        issues,
      }) ?? false;
    const evidence: RadarRoutingRuleEvidence = {
      externalSourceId,
      sourceName: optional(row.values.source_name),
      ruleId: optional(row.values.rule_id),
      matchType,
      matchValue,
      gmailLabel: optional(row.values.gmail_label),
      verifiedFromRealEmail: verified,
      created,
      createdAt: optional(row.values.created_at),
      notes: optional(row.values.notes),
    };
    routingEvidence.push(evidence);
    const sourceEvidence = routingBySource.get(externalSourceId) ?? [];
    sourceEvidence.push({
      ruleId: evidence.ruleId,
      matchType,
      matchValue,
      gmailLabel: evidence.gmailLabel,
      verifiedFromRealEmail: verified,
    });
    routingBySource.set(externalSourceId, sourceEvidence);
  }

  const subscriptionEvidence: RadarSubscriptionEvidence[] = [];
  for (const row of subscriptionCsv.rows) {
    const externalSourceId = requiredValue(row, "subscription_log.csv", "source_id", issues);
    if (!externalSourceId) continue;
    subscriptionEvidence.push({
      timestamp: optional(row.values.timestamp),
      externalSourceId,
      sourceName: optional(row.values.source_name),
      newsletterUrl: optional(row.values.newsletter_url),
      action: optional(row.values.action),
      result: optional(row.values.result),
      emailUsed: optional(row.values.email_used),
      confirmationRequired: parseBoolean(row.values.confirmation_required, {
        file: "subscription_log.csv",
        row: row.row,
        field: "confirmation_required",
        issues,
      }),
      confirmationReceived: parseBoolean(row.values.confirmation_received, {
        file: "subscription_log.csv",
        row: row.row,
        field: "confirmation_received",
        issues,
      }),
      confirmationCompleted: parseBoolean(row.values.confirmation_completed, {
        file: "subscription_log.csv",
        row: row.row,
        field: "confirmation_completed",
        issues,
      }),
      gmailLabel: optional(row.values.gmail_label),
      manualRequired: parseBoolean(row.values.manual_required, {
        file: "subscription_log.csv",
        row: row.row,
        field: "manual_required",
        issues,
      }),
      notes: optional(row.values.notes),
    });
  }

  const sourceProposals: RadarSourceProposal[] = [];
  const seenSources = new Set<string>();
  for (const row of sourceCsv.rows) {
    const externalSourceId = requiredValue(row, "source_registry.csv", "source_id", issues);
    const name = requiredValue(row, "source_registry.csv", "name", issues);
    const organizationName = requiredValue(row, "source_registry.csv", "organization", issues);
    const authorityType = parseEnum({
      values: RADAR_AUTHORITY_TYPES,
      value: row.values.authority_type,
      field: "authority_type",
      row,
      file: "source_registry.csv",
      issues,
    }) as RadarAuthorityType | undefined;
    const sourceType = parseEnum({
      values: RADAR_SOURCE_TYPES,
      value: row.values.source_type,
      field: "source_type",
      row,
      file: "source_registry.csv",
      issues,
    }) as RadarSourceType | undefined;
    const priority = parseEnum({
      values: RADAR_SOURCE_PRIORITIES,
      value: row.values.priority,
      field: "priority",
      row,
      file: "source_registry.csv",
      issues,
    }) as RadarSourcePriority | undefined;
    const status = parseEnum({
      values: RADAR_SUBSCRIPTION_STATUSES,
      value: row.values.subscription_status,
      field: "subscription_status",
      row,
      file: "source_registry.csv",
      issues,
    }) as RadarSubscriptionStatus | undefined;
    if (!externalSourceId || !name || !organizationName || !authorityType || !sourceType || !priority || !status) {
      continue;
    }
    if (seenSources.has(externalSourceId)) {
      pushIssue(issues, {
        severity: "ERROR",
        code: "DUPLICATE_ID",
        file: "source_registry.csv",
        row: row.row,
        field: "source_id",
        value: externalSourceId,
        message: `Duplicate source_id: ${externalSourceId}`,
      });
      continue;
    }
    seenSources.add(externalSourceId);

    const explicitConfirmed = parseBoolean(row.values.confirmed, {
      file: "source_registry.csv",
      row: row.row,
      field: "confirmed",
      issues,
    });
    const confirmed = explicitConfirmed ?? status === "confirmed";
    const acquisitions = buildSourceAcquisitions({ row, status, confirmed, issues });
    const state = sourceDisposition(status, priority, acquisitions);
    const organizationKey = stableKey(organizationName, externalSourceId);
    const endpointKey = `${organizationKey}:${stableKey(sourceType, externalSourceId)}`;
    sourceProposals.push({
      externalSourceId,
      name,
      organizationName,
      organizationKey,
      endpointKey,
      jurisdiction: optional(row.values.jurisdiction),
      country: optional(row.values.country),
      region: optional(row.values.region),
      language: optional(row.values.language),
      authorityType,
      topic: optional(row.values.topic),
      sourceType,
      priority,
      subscriptionStatus: status,
      confirmed,
      homepageUrl: optional(row.values.homepage_url),
      newsletterUrl: optional(row.values.newsletter_url),
      newsUrl: optional(row.values.news_url),
      acquisitions,
      routingEvidence: routingBySource.get(externalSourceId) ?? [],
      discoveryProvenance: {
        origin: "RADAR_CODEX_ONBOARDING",
        discoveredBy: optional(row.values.discovered_by),
        parentSource: optional(row.values.parent_source),
      },
      advisoryScores: advisoryScores(row, issues),
      disposition: state.disposition,
      blockingReasons: state.reasons,
      notes: optional(row.values.notes),
    });
  }

  const candidateProposals: RadarCandidateProposal[] = [];
  const seenCandidates = new Set<string>();
  for (const row of candidateCsv.rows) {
    const externalCandidateId = requiredValue(row, "candidates.csv", "candidate_id", issues);
    const name = requiredValue(row, "candidates.csv", "name", issues);
    const url = requiredValue(row, "candidates.csv", "url", issues);
    const status = parseEnum({
      values: RADAR_CANDIDATE_STATUSES,
      value: row.values.status,
      field: "status",
      row,
      file: "candidates.csv",
      issues,
    }) as RadarCandidateStatus | undefined;
    const priorityRaw = optional(row.values.estimated_priority);
    let estimatedPriority: RadarSourcePriority | undefined;
    if (priorityRaw) {
      estimatedPriority = enumValue(RADAR_SOURCE_PRIORITIES, priorityRaw) as
        | RadarSourcePriority
        | undefined;
      if (!estimatedPriority) {
        pushIssue(issues, {
          severity: "WARNING",
          code: "UNSUPPORTED_ENUM",
          file: "candidates.csv",
          row: row.row,
          field: "estimated_priority",
          value: priorityRaw,
          message: `Unsupported estimated_priority: ${priorityRaw}`,
        });
      }
    }
    if (!externalCandidateId || !name || !url || !status) continue;
    if (seenCandidates.has(externalCandidateId)) {
      pushIssue(issues, {
        severity: "ERROR",
        code: "DUPLICATE_ID",
        file: "candidates.csv",
        row: row.row,
        field: "candidate_id",
        value: externalCandidateId,
        message: `Duplicate candidate_id: ${externalCandidateId}`,
      });
      continue;
    }
    seenCandidates.add(externalCandidateId);
    candidateProposals.push({
      externalCandidateId,
      name,
      url,
      organizationName: optional(row.values.organization),
      country: optional(row.values.country),
      category: optional(row.values.category),
      discoveredFrom: optional(row.values.discovered_from),
      reason: optional(row.values.reason),
      estimatedPriority,
      externalStatus: status,
      disposition: candidateDisposition(status),
      notes: optional(row.values.notes),
    });
  }

  const coverageGaps: RadarCoverageGap[] = [];
  for (const row of coverageCsv.rows) {
    const jurisdiction = requiredValue(row, "missing_coverage.csv", "jurisdiction", issues);
    const sourceCategory = requiredValue(row, "missing_coverage.csv", "source_category", issues);
    const missing = requiredValue(row, "missing_coverage.csv", "missing", issues);
    if (!jurisdiction || !sourceCategory || !missing) continue;
    coverageGaps.push({
      jurisdiction,
      country: optional(row.values.country),
      sourceCategory,
      importance: optional(row.values.importance),
      currentCoverage: optional(row.values.current_coverage),
      missing,
      recommendedAction: optional(row.values.recommended_action),
      notes: optional(row.values.notes),
    });
  }

  const errors = issues.filter((issue) => issue.severity === "ERROR").length;
  const warnings = issues.filter((issue) => issue.severity === "WARNING").length;
  return {
    version: RADAR_SOURCE_INTAKE_VERSION,
    mode: "PLAN",
    inputLabel: args.inputLabel ?? "radar",
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    mutationPerformed: false,
    activationAuthorized: false,
    collectionAuthorized: false,
    sourceProposals,
    candidateProposals,
    coverageGaps,
    subscriptionEvidence,
    routingEvidence,
    issues,
    summary: {
      filesPresent,
      sourceRows: sourceCsv.rows.length,
      sourceProposals: sourceProposals.length,
      candidateRows: candidateCsv.rows.length,
      candidateProposals: candidateProposals.length,
      coverageGapRows: coverageCsv.rows.length,
      subscriptionRows: subscriptionCsv.rows.length,
      routingRows: ruleCsv.rows.length,
      errors,
      warnings,
    },
  };
}
