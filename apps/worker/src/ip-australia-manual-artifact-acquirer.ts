import type {
  AcquiredCollectionArtifact,
  ArtifactBackedExecutionContext,
  CollectionArtifactAcquirer,
} from "@markorbit/worker-runtime";
import { CollectionAcquisitionError } from "@markorbit/worker-runtime";
import type { ExecutionExecutor } from "@markorbit/contracts";
import { inventoryIpAustraliaManual } from "./ip-australia-manual-inventory";
import { parseIpAustraliaManualArticle } from "./ip-australia-manual-article-fidelity";

export type IpAustraliaManualSourceGap = {
  uri: string;
  label: string;
  status?: number;
  reason: "SOURCE_UNAVAILABLE" | "INCOMPLETE_SOURCE_EVIDENCE" | "FETCH_FAILED";
  error: string;
};

export type IpAustraliaManualArtifactAcquirerDiagnostics = {
  inventoryPageCount: number;
  emittedArtifactCount: number;
  sourceGaps: IpAustraliaManualSourceGap[];
};

export type IpAustraliaManualArtifactAcquirerOptions = {
  fetcher?: typeof fetch;
  concurrency?: number;
  interBatchDelayMs?: number;
};

const EXECUTOR: ExecutionExecutor = {
  executorId: "ip-australia-manual-http",
  version: "1.0.0",
  mode: "PRODUCTION",
};

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

function publishedAt(value: string | null): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function safeName(uri: string): string {
  const path = new URL(uri).pathname.split("/").filter(Boolean).at(-1) ?? "manual";
  return `${path.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 180) || "manual"}.html`;
}

function sourceEvidenceComplete(
  html: string,
  uri: string,
): {
  ok: boolean;
  publishedAt?: string;
} {
  const article = parseIpAustraliaManualArticle(html, uri);
  const baseEvidence = article.title.length > 0 && article.controlledDocumentNotice;
  const substantiveEvidence =
    article.bodyText.length >= 100 ||
    article.datePublished !== null ||
    article.amendments.length > 0;
  return {
    ok: baseEvidence && substantiveEvidence,
    ...(publishedAt(article.datePublished)
      ? { publishedAt: publishedAt(article.datePublished) }
      : {}),
  };
}

export class IpAustraliaManualArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = EXECUTOR;

  private readonly fetcher: typeof fetch;
  private readonly concurrency: number;
  private readonly interBatchDelayMs: number;
  private diagnostics: IpAustraliaManualArtifactAcquirerDiagnostics = {
    inventoryPageCount: 0,
    emittedArtifactCount: 0,
    sourceGaps: [],
  };

  constructor(options: IpAustraliaManualArtifactAcquirerOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.concurrency = Math.max(1, Math.min(4, Math.trunc(options.concurrency ?? 2)));
    this.interBatchDelayMs = Math.max(0, Math.trunc(options.interBatchDelayMs ?? 500));
  }

  getDiagnostics(): IpAustraliaManualArtifactAcquirerDiagnostics {
    return structuredClone(this.diagnostics);
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    if (!context.job.planSnapshot.output.artifactKinds.includes("HTML")) {
      throw new CollectionAcquisitionError(
        "IP_AUSTRALIA_MANUAL_HTML_NOT_AUTHORIZED",
        "IP Australia Manual RawArtifact acquisition requires HTML in the immutable CollectionPlan output",
        false,
      );
    }

    const inventory = await inventoryIpAustraliaManual(this.fetcher);
    if (inventory.failedUpdateHistoryPageCount > 0) {
      throw new CollectionAcquisitionError(
        "IP_AUSTRALIA_MANUAL_INVENTORY_INCOMPLETE",
        `Manual inventory contains ${inventory.failedUpdateHistoryPageCount} failed listing page(s)`,
        true,
      );
    }
    if (context.job.planSnapshot.policy.maxItems < inventory.totalUniqueManualPageCount) {
      throw new CollectionAcquisitionError(
        "IP_AUSTRALIA_MANUAL_PLAN_BUDGET_TOO_SMALL",
        `CollectionPlan maxItems ${context.job.planSnapshot.policy.maxItems} cannot cover the ${inventory.totalUniqueManualPageCount}-page Manual inventory`,
        false,
      );
    }

    const artifacts: AcquiredCollectionArtifact[] = [];
    const sourceGaps: IpAustraliaManualSourceGap[] = [];

    for (let offset = 0; offset < inventory.pages.length; offset += this.concurrency) {
      const batch = inventory.pages.slice(offset, offset + this.concurrency);
      const results = await Promise.all(
        batch.map(async (page) => {
          try {
            const response = await this.fetcher(page.uri, {
              headers: {
                "user-agent": "MarkOrbit-Knowledge/1.0 artifact-acquirer",
                accept: "text/html,application/xhtml+xml",
              },
            });
            if (!response.ok) {
              return {
                gap: {
                  uri: page.uri,
                  label: page.label,
                  status: response.status,
                  reason: response.status === 404 ? "SOURCE_UNAVAILABLE" : "FETCH_FAILED",
                  error: `${page.uri} returned HTTP ${response.status}`,
                } satisfies IpAustraliaManualSourceGap,
              };
            }

            const html = await response.text();
            const evidence = sourceEvidenceComplete(html, page.uri);
            if (!evidence.ok) {
              return {
                gap: {
                  uri: page.uri,
                  label: page.label,
                  status: response.status,
                  reason: "INCOMPLETE_SOURCE_EVIDENCE",
                  error:
                    "Reachable Manual page did not preserve the minimum observed source evidence fields",
                } satisfies IpAustraliaManualSourceGap,
              };
            }

            return {
              artifact: {
                artifactKind: "HTML" as const,
                mimeType: "text/html",
                originalName: safeName(page.uri),
                sourceUri: page.uri,
                canonicalUri: page.uri,
                ...(evidence.publishedAt ? { publishedAt: evidence.publishedAt } : {}),
                content: new TextEncoder().encode(html),
              } satisfies AcquiredCollectionArtifact,
            };
          } catch (error) {
            return {
              gap: {
                uri: page.uri,
                label: page.label,
                reason: "FETCH_FAILED",
                error: error instanceof Error ? error.message : String(error),
              } satisfies IpAustraliaManualSourceGap,
            };
          }
        }),
      );

      for (const result of results) {
        if ("artifact" in result) artifacts.push(result.artifact);
        else sourceGaps.push(result.gap);
      }
      if (offset + this.concurrency < inventory.pages.length) await delay(this.interBatchDelayMs);
    }

    this.diagnostics = {
      inventoryPageCount: inventory.totalUniqueManualPageCount,
      emittedArtifactCount: artifacts.length,
      sourceGaps: sourceGaps.sort((left, right) => left.uri.localeCompare(right.uri)),
    };

    if (artifacts.length === 0) {
      throw new CollectionAcquisitionError(
        "IP_AUSTRALIA_MANUAL_NO_ARTIFACTS",
        "IP Australia Manual acquisition produced no valid HTML evidence",
        true,
      );
    }
    return artifacts.sort((left, right) =>
      (left.canonicalUri ?? left.sourceUri).localeCompare(right.canonicalUri ?? right.sourceUri),
    );
  }
}
