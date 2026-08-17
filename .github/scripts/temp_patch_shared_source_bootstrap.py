from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"marker not found in {path}: {old[:160]}")
    file.write_text(text.replace(old, new, 1))


source = "apps/worker/src/source-coverage-bootstrap.ts"
replace_once(
    source,
    '''function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}
''',
    '''function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

export function normalizedCoverageUri(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\\\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

export function sharedJurisdictionsByCanonicalUri(
  targets: readonly CoverageTarget[],
): Map<string, string[]> {
  const grouped = new Map<string, Set<string>>();
  for (const target of targets) {
    const key = normalizedCoverageUri(target.canonicalUri);
    const jurisdictions = grouped.get(key) ?? new Set<string>();
    const jurisdiction = target.jurisdiction.trim().toUpperCase();
    if (jurisdiction) jurisdictions.add(jurisdiction);
    grouped.set(key, jurisdictions);
  }
  return new Map(
    [...grouped].map(([key, jurisdictions]) => [key, [...jurisdictions].sort()] as const),
  );
}
''',
)

replace_once(
    source,
    '''export function sourceCreatePayload(target: CoverageTarget, workspaceId: string): JsonRecord {
  return {
''',
    '''export function sourceCreatePayload(
  target: CoverageTarget,
  workspaceId: string,
  jurisdictions: readonly string[] = [target.jurisdiction],
): JsonRecord {
  const normalizedJurisdictions = [
    ...new Set(
      [...jurisdictions, target.jurisdiction]
        .map((jurisdiction) => jurisdiction.trim().toUpperCase())
        .filter(Boolean),
    ),
  ].sort();
  const tags = [
    "official",
    "source-coverage",
    target.coverageTier.toLowerCase(),
    ...normalizedJurisdictions.map((jurisdiction) => jurisdiction.toLowerCase()),
    target.family.toLowerCase().replaceAll("_", "-"),
  ];
  return {
''',
)
replace_once(source, '    jurisdictions: [target.jurisdiction],', '    jurisdictions: normalizedJurisdictions,')
replace_once(
    source,
    '''    tags: [
      "official",
      "source-coverage",
      target.coverageTier.toLowerCase(),
      target.jurisdiction.toLowerCase(),
      target.family.toLowerCase().replaceAll("_", "-"),
    ],
''',
    '''    tags: [...new Set(tags)],
''',
)

replace_once(
    source,
    '''async function loadCoverage(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
): Promise<{ targets: CoverageTarget[]; registrations: CoverageRegistration[] }> {
''',
    '''async function loadFoundationalTargets(
  fetchImpl: FetchLike,
  baseUrl: string,
): Promise<CoverageTarget[]> {
  const response = await requestJson(
    fetchImpl,
    baseUrl,
    "/api/source-coverage?coverageTier=FOUNDATIONAL&catalogState=ACTIVE",
  );
  return parseCoverageTargets(response.body);
}

async function loadCoverage(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
): Promise<{ targets: CoverageTarget[]; registrations: CoverageRegistration[] }> {
''',
)

replace_once(
    source,
    '''  const initial = await loadCoverage(fetchImpl, baseUrl, workspaceId, jurisdiction);
  if (initial.targets.length === 0) {
    throw new Error(`No active ${jurisdiction} FOUNDATIONAL coverage targets found`);
  }
  const byRegistration = new Map(initial.registrations.map((value) => [value.targetId, value]));
''',
    '''  const initial = await loadCoverage(fetchImpl, baseUrl, workspaceId, jurisdiction);
  if (initial.targets.length === 0) {
    throw new Error(`No active ${jurisdiction} FOUNDATIONAL coverage targets found`);
  }
  const allFoundationalTargets = await loadFoundationalTargets(fetchImpl, baseUrl);
  const jurisdictionsByCanonicalUri = sharedJurisdictionsByCanonicalUri(allFoundationalTargets);
  const byRegistration = new Map(initial.registrations.map((value) => [value.targetId, value]));
''',
)
replace_once(
    source,
    '''      jsonPost(sourceCreatePayload(target, workspaceId)),
''',
    '''      jsonPost(
        sourceCreatePayload(
          target,
          workspaceId,
          jurisdictionsByCanonicalUri.get(normalizedCoverageUri(target.canonicalUri)),
        ),
      ),
''',
)


test = "apps/worker/tests/source-coverage-bootstrap.test.ts"
replace_once(
    test,
    '''  bootstrapUsFoundationalCoverage,
  parseCoverageTargets,
''',
    '''  bootstrapFoundationalCoverage,
  bootstrapUsFoundationalCoverage,
  parseCoverageTargets,
''',
)
replace_once(
    test,
    '''const target = (id: string, canonicalUri: string): CoverageTarget => ({
  id,
  jurisdiction: "US",
  authorityName: "United States Patent and Trademark Office",
''',
    '''const target = (id: string, canonicalUri: string, jurisdiction = "US"): CoverageTarget => ({
  id,
  jurisdiction,
  authorityName:
    jurisdiction === "US"
      ? "United States Patent and Trademark Office"
      : "African Intellectual Property Organization (OAPI)",
''',
)

replace_once(
    test,
    '''    expect(payload.extensions).toMatchObject({
      "x-markorbit-source-coverage-target-id": "us-uspto-trademark-fees",
      "x-markorbit-collection-authorization": false,
    });
  });
''',
    '''    expect(payload.jurisdictions).toEqual(["US"]);
    expect(payload.extensions).toMatchObject({
      "x-markorbit-source-coverage-target-id": "us-uspto-trademark-fees",
      "x-markorbit-collection-authorization": false,
    });
  });

  it("deduplicates and normalizes shared source jurisdictions in deterministic order", () => {
    const payload = sourceCreatePayload(
      target("ci-oapi-trademark-filing", "https://oapi.int/proteger-la-pi/marque/", "CI"),
      "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      ["SN", "ci", "CM", "CI"],
    );

    expect(payload.jurisdictions).toEqual(["CI", "CM", "SN"]);
    expect(payload.tags).toEqual(
      expect.arrayContaining(["official", "source-coverage", "ci", "cm", "sn"]),
    );
  });
''',
)

insert_marker = '''  it("registers only missing targets and remains non-dispatching by default", async () => {
'''
shared_test = '''  it("creates one shared OAPI source with all member jurisdictions from a CI bootstrap", async () => {
    const canonicalUri = "https://oapi.int/proteger-la-pi/marque/";
    const ciTarget = target("ci-oapi-trademark-filing", canonicalUri, "CI");
    const allTargets = [
      ciTarget,
      target("cm-oapi-trademark-filing", canonicalUri, "CM"),
      target("sn-oapi-trademark-filing", canonicalUri, "SN"),
    ];
    let sourceCreated = false;
    let sourcePayload: Record<string, unknown> | null = null;

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/connectors/crawl4ai-web/1.2.0" && method === "GET") {
        return Response.json({ connectorId: "crawl4ai-web" });
      }
      if (url.pathname === "/api/source-coverage" && method === "GET") {
        const jurisdiction = url.searchParams.get("jurisdiction");
        if (!jurisdiction) return Response.json({ targets: allTargets });
        if (jurisdiction !== "CI") throw new Error(`Unexpected jurisdiction ${jurisdiction}`);
        return Response.json({
          targets: [ciTarget],
          registration: [
            {
              targetId: ciTarget.id,
              state: sourceCreated ? "REGISTERED" : "UNREGISTERED",
              sourceIds: sourceCreated ? ["src_01OAPI_SHARED_SOURCE"] : [],
            },
          ],
        });
      }
      if (url.pathname === "/api/sources" && method === "POST") {
        sourcePayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        sourceCreated = true;
        return Response.json({ source: { id: "src_01OAPI_SHARED_SOURCE" } }, { status: 201 });
      }
      throw new Error(`Unexpected request ${method} ${url.pathname}${url.search}`);
    };

    const result = await bootstrapFoundationalCoverage({
      baseUrl: "http://127.0.0.1:3000",
      jurisdiction: "CI",
      fetchImpl,
    });

    expect(sourcePayload).not.toBeNull();
    expect(sourcePayload?.jurisdictions).toEqual(["CI", "CM", "SN"]);
    expect(sourcePayload?.tags).toEqual(expect.arrayContaining(["ci", "cm", "sn"]));
    expect(result.created).toEqual([
      { targetId: ciTarget.id, sourceId: "src_01OAPI_SHARED_SOURCE" },
    ]);
    expect(result.runs).toEqual([]);
    expect(result.collectionAuthorization).toBe("NONE");
  });

'''
replace_once(test, insert_marker, shared_test + insert_marker)
