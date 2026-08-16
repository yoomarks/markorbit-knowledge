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
iceland_block = '''const ISIPO_IS: Authority = {
  jurisdiction: "IS",
  authorityName: "Icelandic Intellectual Property Office (ISIPO / Hugverkastofan)",
  languages: ["is-IS", "en"],
  verificationEvidenceUri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks",
};

export const ISIPO_IS_SOURCE_COVERAGE_TARGETS = [
  target(ISIPO_IS, {
    id: "is-isipo-trademarks",
    family: "PORTAL",
    displayName: "Icelandic Intellectual Property Office Trademarks",
    canonicalUri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks",
    verificationEvidenceUri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks",
    notes:
      "The current ISIPO trademark hub covers registrability, national protection, filing, search, publication, opposition, revocation, fees, Gazette notices and decisions.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-filing",
    family: "FILING",
    displayName: "ISIPO Trademark Application Portal",
    canonicalUri: "https://www.hugverk.is/en/apply/apply-in-iceland",
    entrypoints: [
      {
        uri: "https://www.hugverk.is/en/apply/apply-in-iceland",
        label: "Apply in Iceland",
      },
      {
        uri: "https://www.hugverk.is/en/apply/apply-in-iceland/apply-for-a-trademark",
        label: "Authenticated trademark application",
      },
      { uri: "https://www.hugverk.is/en/apply/forms", label: "Trademark application forms" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "PDF"],
    verificationEvidenceUri: "https://www.hugverk.is/en/apply/apply-in-iceland",
    notes:
      "ISIPO provides an authenticated electronic trademark application route and official trademark, collective-mark and certification/quality-mark forms; the trademark hub describes an ordinary registration workflow of roughly eight to ten weeks when requirements are met.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-search",
    family: "SEARCH",
    displayName: "ISIPO Trademark Search",
    canonicalUri: "https://www.hugverk.is/en/search/trademark",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.hugverk.is/en/search/trademark",
    notes:
      "The current ISIPO trademark search supports text/number, class, status and advanced queries and exposes individual trademark records with filing, publication, opposition, registration, expiry, ownership and goods/services data.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-fees",
    family: "FEES",
    displayName: "ISIPO Trademark Fees",
    canonicalUri: "https://www.hugverk.is/en/apply/fees-and-banking/trademarks",
    verificationEvidenceUri: "https://www.hugverk.is/en/apply/fees-and-banking/trademarks",
    notes:
      "The current fee schedule under Regulation No. 1279/2024 publishes ISK 40,600 application/renewal including one class, ISK 8,900 per additional class, ISK 50,000 opposition or administrative revocation, and related trademark charges.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "ISIPO 2026 Nice Classification Change",
    canonicalUri:
      "https://www.hugverk.is/en/newsroom/news/law-and-regulations/changes-to-the-class-headings-of-goods-and-services-in-trademark-applications",
    entrypoints: [
      {
        uri: "https://www.hugverk.is/en/newsroom/news/law-and-regulations/changes-to-the-class-headings-of-goods-and-services-in-trademark-applications",
        label: "Official 2026 classification change notice",
      },
      {
        uri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks/good-and-services",
        label: "Current goods and services class list",
      },
      {
        uri: "https://www.hugverk.is/en/knowledge/ip-law/trademarks",
        label: "Trademark law page linking the latest Nice classification",
      },
    ],
    verificationEvidenceUri:
      "https://www.hugverk.is/en/newsroom/news/law-and-regulations/changes-to-the-class-headings-of-goods-and-services-in-trademark-applications",
    notes:
      "ISIPO announced Advertisement No. 1355/2025 as the updated goods/services classification effective 1 January 2026 for applications filed from that date; the trademark-law page states Iceland follows the latest Nice Classification.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Iceland Trademark Act and Regulation",
    canonicalUri: "https://www.hugverk.is/en/knowledge/ip-law/trademarks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.hugverk.is/en/knowledge/ip-law/trademarks",
    notes:
      "The official ISIPO legal surface publishes Trademark Act No. 45/1997, Trademark Regulation No. 850/2020 and the current Nice-classification advertisement.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "ISIPO Trademark Opposition, Revocation and Invalidation",
    canonicalUri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks/opposition",
    entrypoints: [
      {
        uri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks/opposition",
        label: "Trademark opposition guidance",
      },
      {
        uri: "https://www.hugverk.is/en/knowledge/information-for-new-trademark-owners",
        label: "Cancellation and invalidation guidance",
      },
      { uri: "https://www.hugverk.is/en/newsroom/decisions", label: "ISIPO and Board of Appeal decisions" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks/opposition",
    notes:
      "ISIPO accepts trademark opposition within two months of publication, administrative cancellation/revocation and invalidation requests, and publishes decisions; opposition decisions may be appealed to the Board of Appeal for Industrial Property Rights within two months.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-ip-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "ISIPO Intellectual Property Gazette (Hugverkatidindi)",
    canonicalUri: "https://www.hugverk.is/en/newsroom/gazettes",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.hugverk.is/en/newsroom/gazettes",
    notes:
      "Hugverkatidindi is ISIPO's official electronic Gazette and is issued every Wednesday, publishing trademark applications, registrations and other official industrial-property announcements relevant to procedural timing.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', iceland_block + 'const CIPO: Authority = {', 'insert Iceland block')
priority = replace_first(
    priority,
    '  ...VPB_LT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...VPB_LT_SOURCE_COVERAGE_TARGETS,\n  ...ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Iceland targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  VPB_LT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  VPB_LT_SOURCE_COVERAGE_TARGETS,\n  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Iceland targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Iceland targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  VPB_LT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  VPB_LT_SOURCE_COVERAGE_TARGETS,\n  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Iceland targets',
)
priority_test = replace_first(
    priority_test,
    '  ["LT", VPB_LT_SOURCE_COVERAGE_TARGETS, ["vpb.lrv.lt"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["LT", VPB_LT_SOURCE_COVERAGE_TARGETS, ["vpb.lrv.lt"]],\n  ["IS", ISIPO_IS_SOURCE_COVERAGE_TARGETS, ["hugverk.is"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Iceland authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for thirty-seven priority national offices',
    'ships explicit, official, unique coverage for thirty-eight priority national offices',
    'priority office count label',
)
priority_test = priority_test.replace('toHaveLength(284)', 'toHaveLength(292)', 1)
priority_test = priority_test.replace('      284,\n', '      292,\n', 1)
priority_test = priority_test.replace('    ).toBe(284);', '    ).toBe(292);', 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
iceland_probes = '''  {
    id: "is-trademarks-name",
    targetId: "is-isipo-trademarks",
    query: "Icelandic Intellectual Property Office trademarks registration",
  },
  {
    id: "is-trademark-filing-name",
    targetId: "is-isipo-trademark-filing",
    query: "Iceland apply trademark ISIPO electronic application",
  },
  {
    id: "is-trademark-search-name",
    targetId: "is-isipo-trademark-search",
    query: "Iceland ISIPO trademark search classes status",
  },
  {
    id: "is-trademark-fees-name",
    targetId: "is-isipo-trademark-fees",
    query: "Iceland trademark fees ISK application opposition revocation",
  },
  {
    id: "is-trademark-classification-name",
    targetId: "is-isipo-trademark-classification",
    query: "Iceland trademark Nice classification 2026 Advertisement 1355 2025",
  },
  {
    id: "is-trademark-law-name",
    targetId: "is-isipo-trademark-law",
    query: "Iceland Trademark Act 45 1997 Regulation 850 2020",
  },
  {
    id: "is-trademark-proceedings-name",
    targetId: "is-isipo-trademark-proceedings",
    query: "Iceland trademark opposition cancellation invalidation Board of Appeal",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    iceland_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Iceland retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace('expect(targets).toHaveLength(281);', 'expect(targets).toHaveLength(288);', 1)
retrieval_test = retrieval_test.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(281);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(288);',
    1,
)
retrieval_test = retrieval_test.replace('      281,\n', '      288,\n', 1)
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "LT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "LT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "IS", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    'retrieval test Iceland jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
