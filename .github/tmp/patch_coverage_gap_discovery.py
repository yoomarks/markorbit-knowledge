from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, got {count}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


# Exact locator lookup keeps coverage intake idempotent without creating redundant batches.
path = Path("packages/persistence/src/source-discovery-registry.ts")
replace_once(
    path,
    '''  getCandidate(candidateId: string): SourceCandidateRecord | null;
  listCandidates(filters?: SourceCandidateListFilters): SourceCandidateListResult;''',
    '''  getCandidate(candidateId: string): SourceCandidateRecord | null;
  getCandidateByLocator(locator: string): SourceCandidateRecord | null;
  listCandidates(filters?: SourceCandidateListFilters): SourceCandidateListResult;''',
)
replace_once(
    path,
    '''  getCandidate(candidateId: string): SourceCandidateRecord | null {
    const row = this.database
      .prepare("SELECT * FROM source_candidates WHERE candidate_id = ?")
      .get(candidateId) as Record<string, unknown> | undefined;
    return row ? parseCandidate(row) : null;
  }

  listCandidates(filters: SourceCandidateListFilters = {}): SourceCandidateListResult {''',
    '''  getCandidate(candidateId: string): SourceCandidateRecord | null {
    const row = this.database
      .prepare("SELECT * FROM source_candidates WHERE candidate_id = ?")
      .get(candidateId) as Record<string, unknown> | undefined;
    return row ? parseCandidate(row) : null;
  }

  getCandidateByLocator(locator: string): SourceCandidateRecord | null {
    const normalized = normalizeLocator(locator);
    const row = this.database
      .prepare("SELECT * FROM source_candidates WHERE locator = ?")
      .get(normalized) as Record<string, unknown> | undefined;
    return row ? parseCandidate(row) : null;
  }

  listCandidates(filters: SourceCandidateListFilters = {}): SourceCandidateListResult {''',
)

# Export the governed intake service to the admin app.
path = Path("packages/persistence/package.json")
replace_once(
    path,
    '''    "./source-coverage": "./src/source-coverage-catalog.ts",
    "./source-supply-health": "./src/source-supply-health.ts",''',
    '''    "./source-coverage": "./src/source-coverage-catalog.ts",
    "./source-coverage-discovery-intake": "./src/source-coverage-discovery-intake.ts",
    "./source-supply-health": "./src/source-supply-health.ts",''',
)

# Surface existing Discovery state alongside each missing coverage target.
path = Path("apps/admin/src/server/source-coverage-service.ts")
replace_once(
    path,
    '''import { getSourceRepository } from "./source-registry";''',
    '''import { getSourceDiscoveryRepository, getSourceRepository } from "./source-registry";''',
)
replace_once(
    path,
    '''  state: "REGISTERED" | "UNREGISTERED";
  sources: Array<{ id: string; name: string; status: string }>;
};''',
    '''  state: "REGISTERED" | "UNREGISTERED";
  sources: Array<{ id: string; name: string; status: string }>;
  discoveryCandidate?: { candidateId: string; status: string };
};''',
)
replace_once(
    path,
    '''  const repository = getSourceRepository();
  const sources = repository.list({ workspaceId, limit: 100 }).items;''',
    '''  const repository = getSourceRepository();
  const discovery = getSourceDiscoveryRepository();
  const sources = repository.list({ workspaceId, limit: 100 }).items;''',
)
replace_once(
    path,
    '''      const target = targetById.get(registration.targetId)!;
      return {
        id: target.id,''',
    '''      const target = targetById.get(registration.targetId)!;
      const discoveryCandidate =
        registration.state === "UNREGISTERED"
          ? discovery.getCandidateByLocator(target.canonicalUri)
          : null;
      return {
        id: target.id,''',
)
replace_once(
    path,
    '''        sources: registration.sourceIds
          .map((sourceId) => sourceById.get(sourceId))
          .filter(Boolean)
          .map((source) => ({ id: source!.id, name: source!.name, status: source!.status })),
      } satisfies SourceCoverageTargetView;''',
    '''        sources: registration.sourceIds
          .map((sourceId) => sourceById.get(sourceId))
          .filter(Boolean)
          .map((source) => ({ id: source!.id, name: source!.name, status: source!.status })),
        ...(discoveryCandidate
          ? {
              discoveryCandidate: {
                candidateId: discoveryCandidate.candidate.candidateId,
                status: discoveryCandidate.candidate.status,
              },
            }
          : {}),
      } satisfies SourceCoverageTargetView;''',
)

# Turn the missing coverage list into an explicit review-queue action.
path = Path("apps/admin/src/components/sources/source-country-coverage.tsx")
replace_once(
    path,
    '''  Loader2,
  RefreshCw,
} from "lucide-react";''',
    '''  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";''',
)
replace_once(
    path,
    '''  state: "REGISTERED" | "UNREGISTERED";
  sources: Array<{ id: string; name: string; status: string }>;
};''',
    '''  state: "REGISTERED" | "UNREGISTERED";
  sources: Array<{ id: string; name: string; status: string }>;
  discoveryCandidate?: { candidateId: string; status: string };
};''',
)
replace_once(
    path,
    '''  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);''',
    '''  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [queueingTargetId, setQueueingTargetId] = useState<string | null>(null);''',
)
replace_once(
    path,
    '''  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);''',
    '''  const queueForDiscovery = useCallback(
    async (targetId: string) => {
      setQueueingTargetId(targetId);
      try {
        const response = await fetch(
          `/api/source-coverage/${encodeURIComponent(targetId)}/discovery`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workspaceId }),
          },
        );
        if (!response.ok) throw new Error(await readError(response));
        setError(null);
        await refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : zh
              ? "无法送入 Discovery"
              : "Unable to queue the coverage target",
        );
      } finally {
        setQueueingTargetId(null);
      }
    },
    [refresh, workspaceId, zh],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);''',
)
old_block = '''                          {missing.map((target) => (
                            <a
                              key={target.id}
                              href={target.canonicalUri}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg bg-white px-3 py-2 text-xs hover:ring-1 hover:ring-slate-200"
                            >
                              <p className="font-medium text-slate-800">{target.displayName}</p>
                              <p className="mt-1 text-slate-500">
                                {target.family} · {target.coverageTier}
                              </p>
                            </a>
                          ))}'''
new_block = '''                          {missing.map((target) => (
                            <div
                              key={target.id}
                              className="rounded-lg bg-white px-3 py-2 text-xs"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <a
                                    href={target.canonicalUri}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-slate-800 hover:text-emerald-700 hover:underline"
                                  >
                                    {target.displayName}
                                  </a>
                                  <p className="mt-1 text-slate-500">
                                    {target.family} · {target.coverageTier}
                                  </p>
                                </div>
                                {target.discoveryCandidate ? (
                                  <Link
                                    href="/discovery"
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-100"
                                  >
                                    {zh ? "已在 Discovery" : "In Discovery"} · {target.discoveryCandidate.status}
                                  </Link>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void queueForDiscovery(target.id)}
                                    disabled={queueingTargetId === target.id}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {queueingTargetId === target.id ? (
                                      <Loader2 size={13} className="animate-spin" />
                                    ) : (
                                      <Send size={13} />
                                    )}
                                    {zh ? "送入 Discovery" : "Send to Discovery"}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}'''
replace_once(path, old_block, new_block)
