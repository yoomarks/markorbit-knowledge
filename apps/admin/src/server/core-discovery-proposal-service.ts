import { createHash } from "node:crypto";
import type {
  CoreDiscoveryProposalReceiptV1,
  CoreDiscoveryProposalV1,
  SourceCandidateRecord,
} from "@markorbit/contracts";
import {
  CORE_DISCOVERY_PROPOSAL_VERSION,
  CORE_DISCOVERY_PROPOSER,
} from "@markorbit/contracts";
import type {
  DiscoveryBatchRecord,
  SourceDiscoveryRepository,
} from "@markorbit/persistence/source-discovery";
import {
  RegistryConflictError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { getSourceDiscoveryRepository } from "./source-registry";

export type CoreDiscoveryProposalSubmission = {
  proposal: CoreDiscoveryProposalV1;
  batch: DiscoveryBatchRecord;
  candidate: SourceCandidateRecord;
  receipt: CoreDiscoveryProposalReceiptV1;
};

type CoreDiscoveryProposalServiceDependencies = {
  discovery: SourceDiscoveryRepository;
};

function isPrivateIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function normalizeProposalLocator(locator: string, field: string): string {
  let url: URL;
  try {
    url = new URL(locator.trim());
  } catch {
    throw new RegistryValidationError(`${field} must be a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RegistryValidationError(`${field} must use http or https`);
  }
  if (url.username || url.password) {
    throw new RegistryValidationError(`${field} cannot contain URL credentials`);
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "::1" ||
    isPrivateIpv4(hostname)
  ) {
    throw new RegistryValidationError(`${field} cannot target a local or private host`);
  }

  url.hash = "";
  url.hostname = hostname;
  const parameters = [...url.searchParams.entries()]
    .filter(([key]) => {
      const normalized = key.toLowerCase();
      return !(
        normalized.startsWith("utm_") ||
        normalized === "gclid" ||
        normalized === "fbclid"
      );
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyOrder = leftKey.localeCompare(rightKey);
      return keyOrder === 0 ? leftValue.localeCompare(rightValue) : keyOrder;
    });
  url.search = "";
  for (const [key, value] of parameters) url.searchParams.append(key, value);
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

function requiredBoundedString(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  if (normalized.length > maxLength) {
    throw new RegistryValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function optionalBoundedString(
  value: string | undefined,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new RegistryValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function normalizedTimestamp(value: string): string {
  const timestamp = requiredBoundedString(value, "proposedAt", 64);
  const millis = Date.parse(timestamp);
  if (!Number.isFinite(millis)) {
    throw new RegistryValidationError("proposedAt must be an ISO-compatible timestamp");
  }
  return new Date(millis).toISOString();
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function candidateId(locator: string): string {
  return stableId("cand", locator);
}

function findCandidateByLocator(
  discovery: SourceDiscoveryRepository,
  locator: string,
): SourceCandidateRecord | null {
  return (
    discovery
      .listCandidates({ q: locator, limit: 500 })
      .items.find((item) => item.candidate.locator === locator) ?? null
  );
}

function receiptFor(
  proposalId: string,
  batchId: string,
  candidate: SourceCandidateRecord,
): CoreDiscoveryProposalReceiptV1 {
  return {
    version: CORE_DISCOVERY_PROPOSAL_VERSION,
    proposalId,
    batchId,
    candidateId: candidate.candidate.candidateId,
    candidateStatus: candidate.candidate.status,
    fetchedBeforeReview: false,
  };
}

export class CoreDiscoveryProposalService {
  constructor(private readonly dependencies: CoreDiscoveryProposalServiceDependencies) {}

  submit(input: CoreDiscoveryProposalV1): CoreDiscoveryProposalSubmission {
    if (input.version !== CORE_DISCOVERY_PROPOSAL_VERSION) {
      throw new RegistryValidationError(
        `Core discovery proposal version must be ${CORE_DISCOVERY_PROPOSAL_VERSION}`,
      );
    }
    if (input.proposedBy !== CORE_DISCOVERY_PROPOSER) {
      throw new RegistryValidationError(`proposedBy must be ${CORE_DISCOVERY_PROPOSER}`);
    }

    const proposalId = requiredBoundedString(input.proposalId, "proposalId", 128);
    const proposedAt = normalizedTimestamp(input.proposedAt);
    const locator = normalizeProposalLocator(input.locator, "locator");
    const proposedFromSourceId = optionalBoundedString(
      input.proposedFromSourceId,
      "proposedFromSourceId",
      128,
    );
    const evidenceUrl = input.evidenceUrl
      ? normalizeProposalLocator(input.evidenceUrl, "evidenceUrl")
      : undefined;
    const opaqueContextRef = optionalBoundedString(
      input.opaqueContextRef,
      "opaqueContextRef",
      512,
    );
    const batchId = stableId("coreprop", proposalId);
    const existingBatch = this.dependencies.discovery.getBatch(batchId);

    if (existingBatch) {
      const existingLocator = existingBatch.batch.seeds[0]?.locator;
      if (existingLocator !== locator) {
        throw new RegistryConflictError(
          "CORE_DISCOVERY_PROPOSAL_ID_REUSE",
          `Core proposal ${proposalId} was already used for a different locator`,
          { proposalId, existingLocator, locator },
        );
      }
      const existingCandidate = findCandidateByLocator(this.dependencies.discovery, locator);
      if (!existingCandidate) {
        throw new RegistryConflictError(
          "CORE_DISCOVERY_PROPOSAL_CANDIDATE_MISSING",
          `Core proposal ${proposalId} has no persisted candidate`,
          { proposalId, batchId, locator },
        );
      }
      return {
        proposal: {
          ...input,
          proposalId,
          proposedAt,
          locator,
          ...(proposedFromSourceId ? { proposedFromSourceId } : {}),
          ...(evidenceUrl ? { evidenceUrl } : {}),
          ...(opaqueContextRef ? { opaqueContextRef } : {}),
        },
        batch: existingBatch,
        candidate: existingCandidate,
        receipt: receiptFor(proposalId, batchId, existingCandidate),
      };
    }

    const metadata: Record<string, unknown> = {
      source: "markorbit-core",
      proposalId,
      proposedBy: CORE_DISCOVERY_PROPOSER,
      fetchEligibleBeforeReview: false,
      ...(proposedFromSourceId ? { proposedFromSourceId } : {}),
      ...(evidenceUrl ? { evidenceUrl } : {}),
      ...(opaqueContextRef ? { opaqueContextRef } : {}),
    };
    const seed = this.dependencies.discovery.createSeed({ locator, metadata });
    const batch = {
      batchId,
      seeds: [{ seedId: seed.seedId, locator, metadata }],
      createdAt: proposedAt,
      constraints: {
        maxDepth: 0,
        maxCandidates: 1,
        maxFetches: 0,
        sameHostOnly: true,
        respectRobots: true,
        discoverSitemaps: false,
        discoverExternalLinks: false,
        maxExternalCandidates: 0,
      },
    };

    this.dependencies.discovery.createBatch(batch);
    const discoveredAt = proposedAt;
    this.dependencies.discovery.completeBatch(batchId, [
      {
        candidateId: candidateId(locator),
        locator,
        discoveredAt,
        status: "DISCOVERED",
        ...(evidenceUrl ? { discoveredFrom: evidenceUrl } : {}),
        discoveryMethod: "CORE_PROPOSAL",
        depth: 0,
        metadata: {
          kind: "PAGE",
          proposalId,
          proposedBy: CORE_DISCOVERY_PROPOSER,
          fetchEligibleBeforeReview: false,
          ...(proposedFromSourceId ? { proposedFromSourceId } : {}),
          ...(opaqueContextRef ? { opaqueContextRef } : {}),
        },
      },
    ]);

    const candidate = findCandidateByLocator(this.dependencies.discovery, locator);
    if (!candidate) {
      throw new RegistryConflictError(
        "CORE_DISCOVERY_PROPOSAL_CANDIDATE_MISSING",
        `Core proposal ${proposalId} could not be persisted as a candidate`,
        { proposalId, batchId, locator },
      );
    }
    const completed = this.dependencies.discovery.getBatch(batchId);
    if (!completed) {
      throw new RegistryConflictError(
        "CORE_DISCOVERY_PROPOSAL_BATCH_MISSING",
        `Core proposal ${proposalId} lost its discovery batch`,
        { proposalId, batchId },
      );
    }

    const proposal: CoreDiscoveryProposalV1 = {
      version: CORE_DISCOVERY_PROPOSAL_VERSION,
      proposalId,
      proposedBy: CORE_DISCOVERY_PROPOSER,
      proposedAt,
      locator,
      ...(proposedFromSourceId ? { proposedFromSourceId } : {}),
      ...(evidenceUrl ? { evidenceUrl } : {}),
      ...(opaqueContextRef ? { opaqueContextRef } : {}),
    };
    return {
      proposal,
      batch: completed,
      candidate,
      receipt: receiptFor(proposalId, batchId, candidate),
    };
  }
}

let singleton: CoreDiscoveryProposalService | undefined;

export function getCoreDiscoveryProposalService(): CoreDiscoveryProposalService {
  if (!singleton) {
    singleton = new CoreDiscoveryProposalService({
      discovery: getSourceDiscoveryRepository(),
    });
  }
  return singleton;
}
