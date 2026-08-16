from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
retrieval_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
retrieval_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")


def replace_first(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"{label}: anchor not found")
    return text.replace(old, new, 1)


priority = priority_path.read_text()
estonia_block = '''const EPA_EE: Authority = {
  jurisdiction: "EE",
  authorityName: "Estonian Patent Office (Patendiamet)",
  languages: ["et-EE", "en"],
  verificationEvidenceUri: "https://www.epa.ee/en",
};

export const EPA_EE_SOURCE_COVERAGE_TARGETS = [
  target(EPA_EE, {
    id: "ee-epa-trademarks",
    family: "PORTAL",
    displayName: "Estonian Patent Office Trade Marks",
    canonicalUri: "https://www.epa.ee/en",
    verificationEvidenceUri: "https://www.epa.ee/en",
    notes:
      "The Estonian Patent Office is the national industrial-property authority and its current portal provides trademark filing, search, fees, legal guidance, proceedings and Gazette services.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-filing",
    family: "FILING",
    displayName: "Estonian Patent Office National Trademark Filing",
    canonicalUri:
      "https://www.epa.ee/en/trade-marks/filing-application/how-protect-your-trade-mark",
    entrypoints: [
      {
        uri: "https://www.epa.ee/en/trade-marks/filing-application/how-protect-your-trade-mark",
        label: "National trademark filing guidance",
      },
      { uri: "https://www.epa.ee/en/e-services", label: "Patent Office electronic services" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://www.epa.ee/en/trade-marks/filing-application/how-protect-your-trade-mark",
    notes:
      "Current filing guidance directs applicants to file a national trademark application with the Estonian Patent Office electronically or on the official form and links the Office's e-services.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-search",
    family: "SEARCH",
    displayName: "Estonian Patent Office Trademark Database",
    canonicalUri:
      "https://www.epa.ee/en/trade-marks/search-databases/trade-marks-databases",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.epa.ee/en/trade-marks/search-databases/trade-marks-databases",
    notes:
      "The official trademark database covers national applications and registrations plus international marks protected or filed in Estonia and is updated daily; the Office distinguishes its informative search view from legally effective registry and Gazette data.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-fees",
    family: "FEES",
    displayName: "Estonian Patent Office Trademark Fees",
    canonicalUri: "https://www.epa.ee/en/trade-marks/filing-application/fees",
    verificationEvidenceUri: "https://www.epa.ee/en/trade-marks/filing-application/fees",
    notes:
      "The current official fee page publishes national trademark filing, additional-class, renewal and other trademark procedure fees and was updated in December 2025.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Estonian Patent Office Nice Classification 13-2026",
    canonicalUri: "https://www.epa.ee/kaubamargid/kaubad-ja-teenused/loend-klasside-kaupa",
    entrypoints: [
      {
        uri: "https://www.epa.ee/kaubamargid/kaubad-ja-teenused/loend-klasside-kaupa",
        label: "Nice Classification 13th edition 2026 class list",
      },
      {
        uri: "https://www.epa.ee/en/trade-marks/filing-application/goods-and-services",
        label: "English goods and services guidance",
      },
      {
        uri: "https://www.epa.ee/en/trade-marks/filing-application/scope-legal-protection",
        label: "Current legal-protection and Nice-edition guidance",
      },
    ],
    verificationEvidenceUri:
      "https://www.epa.ee/kaubamargid/kaubad-ja-teenused/loend-klasside-kaupa",
    notes:
      "The official class-by-class list identifies Nice Classification 13th edition, 2026 version; current filing guidance requires goods and services to use the valid Nice edition.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Estonia Trademark Legal Acts",
    canonicalUri: "https://www.epa.ee/en/node/235",
    entrypoints: [
      { uri: "https://www.epa.ee/en/node/235", label: "Patent Office legal acts" },
      {
        uri: "https://www.riigiteataja.ee/en/eli/527022024003/consolide",
        label: "Consolidated Trade Marks Act in Riigi Teataja",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.epa.ee/en/node/235",
    notes:
      "The Patent Office legal-acts surface links Estonia's Trade Marks Act and related rules; the consolidated authentic legal text is maintained in the official Riigi Teataja system.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Estonia Trademark Opposition and Board of Appeal Proceedings",
    canonicalUri: "https://www.epa.ee/en/trade-marks/additional-info/opposition",
    entrypoints: [
      {
        uri: "https://www.epa.ee/en/trade-marks/additional-info/opposition",
        label: "Trademark opposition guidance",
      },
      { uri: "https://www.epa.ee/en/appeals/board-appeals", label: "Board of Appeal" },
      { uri: "https://www.epa.ee/en/e-services", label: "Electronic revocation submissions" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.epa.ee/en/trade-marks/additional-info/opposition",
    notes:
      "The Industrial Property Board of Appeal handles trademark challenges; the official opposition page explains the two-month contest period following Gazette publication and the Office also provides electronic proceeding services.",
  }),
  target(EPA_EE, {
    id: "ee-epa-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Estonian Trade Mark Gazette",
    canonicalUri:
      "https://www.epa.ee/en/trade-marks/managing-trade-marks/estonian-trade-mark-gazette",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.epa.ee/en/trade-marks/managing-trade-marks/estonian-trade-mark-gazette",
    notes:
      "The Estonian Trade Mark Gazette is the Office's official digital periodical, issued 24 times per year; the current page lists 2026 PDF issues and publishes registration decisions, registered marks and register amendments.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(
    priority,
    'const CIPO: Authority = {',
    estonia_block + 'const CIPO: Authority = {',
    'insert Estonia block',
)
priority = replace_first(
    priority,
    '  ...IPRD_MT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...IPRD_MT_SOURCE_COVERAGE_TARGETS,\n  ...EPA_EE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Estonia targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  IPRD_MT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  IPRD_MT_SOURCE_COVERAGE_TARGETS,\n  EPA_EE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Estonia targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Estonia targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  IPRD_MT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  IPRD_MT_SOURCE_COVERAGE_TARGETS,\n  EPA_EE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Estonia targets',
)
priority_test = replace_first(
    priority_test,
    '  ["MT", IPRD_MT_SOURCE_COVERAGE_TARGETS, ["commerce.gov.mt", "ips.gov.mt"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["MT", IPRD_MT_SOURCE_COVERAGE_TARGETS, ["commerce.gov.mt", "ips.gov.mt"]],\n  ["EE", EPA_EE_SOURCE_COVERAGE_TARGETS, ["epa.ee", "riigiteataja.ee"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Estonia authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for thirty-four priority national offices',
    'ships explicit, official, unique coverage for thirty-five priority national offices',
    'priority office count label',
)
priority_test = priority_test.replace('toHaveLength(260)', 'toHaveLength(268)', 1)
priority_test = priority_test.replace('      260,\n', '      268,\n', 1)
priority_test = priority_test.replace('    ).toBe(260);', '    ).toBe(268);', 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
estonia_probes = '''  {
    id: "ee-trademarks-name",
    targetId: "ee-epa-trademarks",
    query: "Estonian Patent Office Patendiamet trademarks",
  },
  {
    id: "ee-trademark-filing-name",
    targetId: "ee-epa-trademark-filing",
    query: "Estonia national trademark filing application Patent Office",
  },
  {
    id: "ee-trademark-search-name",
    targetId: "ee-epa-trademark-search",
    query: "Estonian Patent Office trademark database daily updated",
  },
  {
    id: "ee-trademark-fees-name",
    targetId: "ee-epa-trademark-fees",
    query: "Estonia trademark filing fees additional class renewal",
  },
  {
    id: "ee-trademark-classification-name",
    targetId: "ee-epa-trademark-classification",
    query: "Estonia Nice Classification 13 2026 goods services",
  },
  {
    id: "ee-trademark-law-name",
    targetId: "ee-epa-trademark-law",
    query: "Estonia Trade Marks Act Patent Office legal acts",
  },
  {
    id: "ee-trademark-proceedings-name",
    targetId: "ee-epa-trademark-proceedings",
    query: "Estonia trademark opposition Board of Appeal two months",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    estonia_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Estonia retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace('expect(targets).toHaveLength(260);', 'expect(targets).toHaveLength(267);', 1)
retrieval_test = retrieval_test.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(260);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(267);',
    1,
)
retrieval_test = retrieval_test.replace('      260,\n', '      267,\n', 1)
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "MT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "MT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "EE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    'retrieval test Estonia jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
