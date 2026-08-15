from pathlib import Path

path = Path("apps/admin/src/components/sources/source-country-coverage.tsx")
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one match, got {count}: {old[:120]!r}")
    text = text.replace(old, new, 1)

replace_once(
    '''  const [expanded, setExpanded] = useState<string | null>(null);
  const [queueingTargetId, setQueueingTargetId] = useState<string | null>(null);''',
    '''  const [expanded, setExpanded] = useState<string | null>(null);
  const [queueingTargetId, setQueueingTargetId] = useState<string | null>(null);
  const [queueingJurisdiction, setQueueingJurisdiction] = useState<string | null>(null);''',
)

anchor = '''  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);'''
addition = '''  const queueMissingForDiscovery = useCallback(
    async (targetIds: string[], jurisdiction: string) => {
      if (targetIds.length === 0) return;
      setQueueingJurisdiction(jurisdiction);
      try {
        const response = await fetch("/api/source-coverage/discovery", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId, targetIds }),
        });
        if (!response.ok) throw new Error(await readError(response));
        setError(null);
        await refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : zh
              ? "无法批量送入 Discovery"
              : "Unable to queue the coverage targets",
        );
      } finally {
        setQueueingJurisdiction(null);
      }
    },
    [refresh, workspaceId, zh],
  );

'''
if text.count(anchor) != 1:
    raise SystemExit("useEffect anchor mismatch")
text = text.replace(anchor, addition + anchor, 1)

replace_once(
    '''            const missing = item.targets.filter(
              (target) => target.catalogState === "ACTIVE" && target.state === "UNREGISTERED",
            );
            return (''',
    '''            const missing = item.targets.filter(
              (target) => target.catalogState === "ACTIVE" && target.state === "UNREGISTERED",
            );
            const unqueuedMissing = missing.filter((target) => !target.discoveryCandidate);
            return (''',
)

replace_once(
    '''                          {missing.length > 0 ? (
                            <Link
                              href="/discovery"
                              className="text-xs font-semibold text-emerald-700 hover:underline"
                            >
                              {zh ? "前往 Discovery 补充 →" : "Add via Discovery →"}
                            </Link>
                          ) : null}''',
    '''                          {missing.length > 0 ? (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {unqueuedMissing.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void queueMissingForDiscovery(
                                      unqueuedMissing.map((target) => target.id),
                                      item.jurisdiction,
                                    )
                                  }
                                  disabled={queueingJurisdiction === item.jurisdiction}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {queueingJurisdiction === item.jurisdiction ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <Send size={13} />
                                  )}
                                  {zh
                                    ? `全部送审 (${unqueuedMissing.length})`
                                    : `Send all (${unqueuedMissing.length})`}
                                </button>
                              ) : null}
                              <Link
                                href="/discovery"
                                className="text-xs font-semibold text-emerald-700 hover:underline"
                              >
                                {zh ? "前往 Discovery →" : "Open Discovery →"}
                              </Link>
                            </div>
                          ) : null}''',
)

path.write_text(text)
