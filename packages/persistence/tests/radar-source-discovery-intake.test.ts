import type {
  RadarCandidateProposal,
  RadarSourceIntakePlan,
  RadarSourceProposal,
} from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import { openRegistryDatabase, SqliteSourceRepository } from "../src/index";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import {
  queueRadarSourceIntakeForDiscovery,
  type RadarDiscoveryIntakeDependencies,
} from "../src/radar-source-discovery-intake";
import { SqliteSourceDiscoveryRepository } from "../src/source-discovery-registry";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const now = "2026-08-18T01:30:00.000Z";

function environment() {
  const database = openRegistryDatabase(":memory:");
  const clock = () => new Date(now);
  new SqliteCollectionPlanRepository(database, clock);
  new SqliteExecutionLedgerRepository(database, clock);
  return {
    database,
    sources: new SqliteSourceRepository(database, clock),
    discovery: new SqliteSourceDiscoveryRepository(database, clock),
    clock,
  };
}

function sourceProposal(overrides: Partial<RadarSourceProposal> = {}): RadarSourceProposal {
  return {
    externalSourceId: "radar-wipo-alerts",
    name: "WIPO Alerts",
    organizationName: "WIPO",
    organizationKey: "wipo",
    endpointKey: "wipo:newsletter",
    jurisdiction: "WO",
    language: "en",
    authorityType: "international_organization",
    topic: "trademark",
    sourceType: "newsletter",
    priority: "S",
    subscriptionStatus: "confirmed",
    confirmed: true,
    homepageUrl: "https://www.wipo.int/",
    newsletterUrl: "https://www.wipo.int/newsletters/",
    newsUrl: "https://www.wipo.int/pressroom/en/",
    acquisitions: [
      {
        kind: "EMAIL",
        locator: "https://www.wipo.int/newsletters/",
        verified: true,
        senderEmail: "alerts@example.test",
        listId: "wipo.alerts",
      },
      {
        kind: "RSS",
        locator: "https://www.wipo.int/rss/",
        verified: false,
      },
    ],
    routingEvidence: [
      {
        matchType: "list_id",
        matchValue: "wipo.alerts",
        gmailLabel: "RADAR/01_OFFICIAL/GLOBAL",
        verifiedFromRealEmail: true,
      },
    ],
    discoveryProvenance: {
      origin: "RADAR_CODEX_ONBOARDING",
      discoveredBy: "codex",
    },
    advisoryScores: { sourceQuality: 95, authority: 100, signal: 98, noise: 5 },
    disposition: "REVIEW",
    blockingReasons: [],
    notes: "High signal",
    ...overrides,
  };
}

function candidateProposal(
  overrides: Partial<RadarCandidateProposal> = {},
): RadarCandidateProposal {
  return {
    externalCandidateId: "radar-candidate-1",
    name: "Example IP Firm",
    url: "https://example.test/ip-insights",
    organizationName: "Example IP Firm",
    country: "US",
    category: "law_firm",
    discoveredFrom: "radar-wipo-alerts",
    reason: "Cited by trusted source",
    estimatedPriority: "A",
    externalStatus: "promote",
    disposition: "REVIEW",
    notes: "Review before activation",
    ...overrides,
  };
}

function plan(
  args: {
    sources?: RadarSourceProposal[];
    candidates?: RadarCandidateProposal[];
    errors?: number;
  } = {},
): RadarSourceIntakePlan {
  const sourceProposals = args.sources ?? [sourceProposal()];
  const candidateProposals = args.candidates ?? [candidateProposal()];
  return {
    version: "radar-source-intake-v1",
    mode: "PLAN",
    inputLabel: "radar",
    generatedAt: now,
    mutationPerformed: false,
    activationAuthorized: false,
    collectionAuthorized: false,
    sourceProposals,
    candidateProposals,
    coverageGaps: [],
    subscriptionEvidence: [],
    routingEvidence: [],
    issues: args.errors
      ? [
          {
            severity: "ERROR",
            code: "MISSING_REQUIRED_VALUE",
            file: "source_registry.csv",
            field: "name",
            message: "Missing required value: name",
          },
        ]
      : [],
    summary: {
      filesPresent: 5,
      sourceRows: sourceProposals.length,
      sourceProposals: sourceProposals.length,
      candidateRows: candidateProposals.length,
      candidateProposals: candidateProposals.length,
      coverageGapRows: 0,
      subscriptionRows: 0,
      routingRows: 0,
      errors: args.errors ?? 0,
      warnings: 0,
    },
  };
}

function dependencies(env: ReturnType<typeof environment>): RadarDiscoveryIntakeDependencies {
  return { sources: env.sources, discovery: env.discovery, clock: env.clock };
}

function expectNoCollectionAuthority(env: ReturnType<typeof environment>) {
  expect(env.database.prepare("SELECT COUNT(*) AS count FROM collection_plans").get()).toEqual({
    count: 0,
  });
  expect(env.database.prepare("SELECT COUNT(*) AS count FROM collection_runs").get()).toEqual({
    count: 0,
  });
  expect(env.database.prepare("SELECT COUNT(*) AS count FROM jobs").get()).toEqual({ count: 0 });
}

describe("Radar Source Intake → Discovery", () => {
  it("queues reviewable Radar proposals as durable manual Discovery candidates only", () => {
    const env = environment();
    const beforeSources = env.sources.list({ workspaceId, limit: 100 }).total;

    const result = queueRadarSourceIntakeForDiscovery(
      { workspaceId, plan: plan() },
      dependencies(env),
    );

    expect(result.summary).toEqual({
      total: 2,
      QUEUED: 2,
      ALREADY_IN_DISCOVERY: 0,
      ALREADY_COVERED: 0,
      SKIPPED_BLOCKED: 0,
      SKIPPED_NO_LOCATOR: 0,
    });
    expect(result.results[0]).toMatchObject({
      itemType: "SOURCE_PROPOSAL",
      externalId: "radar-wipo-alerts",
      state: "QUEUED",
      locator: "https://www.wipo.int/pressroom/en/",
    });
    expect(result.results[0].candidate?.candidate).toMatchObject({
      status: "DISCOVERED",
      discoveryMethod: "MANUAL",
      depth: 0,
      metadata: {
        radarIntake: {
          origin: "RADAR_CODEX_ONBOARDING",
          externalSourceId: "radar-wipo-alerts",
          organizationKey: "wipo",
          endpointKey: "wipo:newsletter",
          subscriptionStatus: "confirmed",
          confirmed: true,
        },
      },
    });
    expect(result.results[1].candidate?.candidate.metadata).toMatchObject({
      radarIntake: {
        externalCandidateId: "radar-candidate-1",
        externalStatus: "promote",
      },
    });
    expect(env.discovery.listCandidates({ status: "DISCOVERED" }).total).toBe(2);
    expect(env.sources.list({ workspaceId, limit: 100 }).total).toBe(beforeSources);
    expectNoCollectionAuthority(env);
    env.database.close();
  });

  it("is replay-safe by canonical locator and preserves human review state", () => {
    const env = environment();
    const intakePlan = plan({ candidates: [] });
    const first = queueRadarSourceIntakeForDiscovery(
      { workspaceId, plan: intakePlan },
      dependencies(env),
    );
    const candidateId = first.results[0].candidate!.candidate.candidateId;
    env.discovery.reviewCandidate(candidateId, {
      decision: "REJECTED",
      reviewer: "radar-reviewer",
      note: "Not an acquisition endpoint",
    });

    const second = queueRadarSourceIntakeForDiscovery(
      { workspaceId, plan: intakePlan },
      dependencies(env),
    );

    expect(second.summary).toMatchObject({
      total: 1,
      QUEUED: 0,
      ALREADY_IN_DISCOVERY: 1,
    });
    expect(second.results[0].candidate?.candidate.status).toBe("REJECTED");
    expect(second.results[0].candidate?.review?.decision).toBe("REJECTED");
    expect(env.discovery.listCandidates().total).toBe(1);
    expect(env.discovery.listBatches()).toHaveLength(1);
    expectNoCollectionAuthority(env);
    env.database.close();
  });

  it("skips blocked items and email-only proposals without inventing a URL", () => {
    const env = environment();
    const blocked = sourceProposal({
      externalSourceId: "blocked-source",
      disposition: "BLOCKED",
      blockingReasons: ["SUBSCRIPTION_STATUS_MANUAL_REQUIRED"],
    });
    const emailOnly = sourceProposal({
      externalSourceId: "email-only",
      name: "Email Only",
      organizationName: "Email Only Org",
      organizationKey: "email-only-org",
      endpointKey: "email-only-org:newsletter",
      homepageUrl: undefined,
      newsletterUrl: undefined,
      newsUrl: undefined,
      acquisitions: [
        {
          kind: "EMAIL",
          locator: "alerts@example.test",
          verified: true,
          senderEmail: "alerts@example.test",
        },
      ],
    });
    const rejectedCandidate = candidateProposal({
      externalCandidateId: "rejected-candidate",
      externalStatus: "reject",
      disposition: "BLOCKED",
    });

    const result = queueRadarSourceIntakeForDiscovery(
      {
        workspaceId,
        plan: plan({ sources: [blocked, emailOnly], candidates: [rejectedCandidate] }),
      },
      dependencies(env),
    );

    expect(result.summary).toEqual({
      total: 3,
      QUEUED: 0,
      ALREADY_IN_DISCOVERY: 0,
      ALREADY_COVERED: 0,
      SKIPPED_BLOCKED: 2,
      SKIPPED_NO_LOCATOR: 1,
    });
    expect(env.discovery.listCandidates().total).toBe(0);
    expect(env.discovery.listBatches()).toHaveLength(0);
    expectNoCollectionAuthority(env);
    env.database.close();
  });

  it("does not queue a Radar locator that is already a registered Source", () => {
    const env = environment();
    const registered = env.sources.create({
      workspaceId,
      name: "WIPO Pressroom",
      slug: "wipo-pressroom",
      sourceType: "WEB",
      category: "OFFICIAL_AUTHORITY",
      authorityLevel: "PRIMARY_OFFICIAL",
      status: "ACTIVE",
      jurisdictions: ["WO"],
      languages: ["en"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      connectorConfig: {},
      canonicalUri: "https://www.wipo.int/pressroom/en/",
      entrypoints: [{ uri: "https://www.wipo.int/pressroom/en/" }],
    });

    const result = queueRadarSourceIntakeForDiscovery(
      { workspaceId, plan: plan({ candidates: [] }) },
      dependencies(env),
    );

    expect(result.results[0]).toMatchObject({
      state: "ALREADY_COVERED",
      sourceIds: [registered.id],
    });
    expect(env.discovery.listCandidates().total).toBe(0);
    expectNoCollectionAuthority(env);
    env.database.close();
  });

  it("refuses a validation-error plan before mutating Discovery", () => {
    const env = environment();

    expect(() =>
      queueRadarSourceIntakeForDiscovery(
        { workspaceId, plan: plan({ errors: 1 }) },
        dependencies(env),
      ),
    ).toThrow(/refuses a plan with validation errors/);

    expect(env.discovery.listCandidates().total).toBe(0);
    expect(env.discovery.listBatches()).toHaveLength(0);
    expectNoCollectionAuthority(env);
    env.database.close();
  });
});
