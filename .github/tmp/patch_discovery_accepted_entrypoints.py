from pathlib import Path

service_path = Path("apps/admin/src/server/discovery-service.ts")
text = service_path.read_text()

anchor = '''function findWebsiteSourceByIdentity(
  sources: SourceRepository,
  identity: string,
): SourceDefinition | null {'''
helper = '''function ensureAcceptedDiscoveryEntrypoint(
  sources: SourceRepository,
  source: SourceDefinition,
  locator: string,
): SourceDefinition {
  const uri = locator.trim();
  if (source.entrypoints.some((entrypoint) => entrypoint.uri === uri)) return source;
  return sources.update(
    source.id,
    {
      entrypoints: [
        ...source.entrypoints,
        {
          uri,
          label: "Accepted discovery page",
        },
      ],
    },
    source.updatedAt,
  );
}

'''
if text.count(anchor) != 1:
    raise SystemExit(f"identity helper anchor count={text.count(anchor)}")
text = text.replace(anchor, helper + anchor, 1)

review_anchor = '''      const candidate = this.dependencies.discovery.reviewCandidate(candidateId, {
        decision: "ACCEPTED",'''
review_replacement = '''      source = ensureAcceptedDiscoveryEntrypoint(
        this.dependencies.sources,
        source,
        current.candidate.locator,
      );

      const candidate = this.dependencies.discovery.reviewCandidate(candidateId, {
        decision: "ACCEPTED",'''
if text.count(review_anchor) != 1:
    raise SystemExit(f"review anchor count={text.count(review_anchor)}")
text = text.replace(review_anchor, review_replacement, 1)
service_path.write_text(text)

test_path = Path("apps/admin/src/server/__tests__/discovery-service.test.ts")
test = test_path.read_text()

first_anchor = '''    expect(first.source?.entrypoints[0]?.uri).toBe("https://example.com/start-here");
    expect(first.source?.connector).toEqual({ connectorId: "crawl4ai-web", version: "1.2.0" });'''
first_replacement = '''    expect(first.source?.entrypoints.map((entrypoint) => entrypoint.uri)).toEqual([
      "https://example.com/start-here",
      "https://example.com/trademarks",
    ]);
    expect(first.source?.entrypoints[1]?.label).toBe("Accepted discovery page");
    expect(first.source?.connector).toEqual({ connectorId: "crawl4ai-web", version: "1.2.0" });'''
if test.count(first_anchor) != 1:
    raise SystemExit(f"first assertion anchor count={test.count(first_anchor)}")
test = test.replace(first_anchor, first_replacement, 1)

second_anchor = '''    expect(second.plan?.id).toBe(first.plan?.id);
    expect(sources.list({ sourceType: "WEB", limit: 100 }).total).toBe(1);'''
second_replacement = '''    expect(second.plan?.id).toBe(first.plan?.id);
    expect(second.source?.entrypoints.map((entrypoint) => entrypoint.uri)).toEqual([
      "https://example.com/start-here",
      "https://example.com/trademarks",
      "https://www.example.com/guides/fees.pdf",
    ]);
    expect(sources.list({ sourceType: "WEB", limit: 100 }).total).toBe(1);'''
if test.count(second_anchor) != 1:
    raise SystemExit(f"second assertion anchor count={test.count(second_anchor)}")
test = test.replace(second_anchor, second_replacement, 1)

external_anchor = '''    expect(secondExternal.plan?.id).toBe(firstExternal.plan?.id);
    expect(sources.list({ sourceType: "WEB", limit: 100 }).total).toBe(2);'''
external_replacement = '''    expect(secondExternal.plan?.id).toBe(firstExternal.plan?.id);
    expect(secondExternal.source?.entrypoints.map((entrypoint) => entrypoint.uri)).toEqual([
      "https://peer.example/services",
      "https://www.peer.example/blog",
    ]);
    expect(sources.list({ sourceType: "WEB", limit: 100 }).total).toBe(2);'''
if test.count(external_anchor) != 1:
    raise SystemExit(f"external assertion anchor count={test.count(external_anchor)}")
test = test.replace(external_anchor, external_replacement, 1)

test_path.write_text(test)
