from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
retrieval_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
retrieval_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


priority = priority_path.read_text()

ireland_block = r'''const IPOI_IE: Authority = {
  jurisdiction: "IE",
  authorityName: "Intellectual Property Office of Ireland (IPOI)",
  languages: ["en-IE"],
  verificationEvidenceUri: "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/",
};

export const IPOI_IE_SOURCE_COVERAGE_TARGETS = [
  target(IPOI_IE, {
    id: "ie-ipoi-trademarks",
    family: "PORTAL",
    displayName: "IPOI Trade Marks",
    canonicalUri: "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-filing",
    family: "FILING",
    displayName: "IPOI Apply for a Trade Mark",
    canonicalUri: "https://www.ipoi.gov.ie/en/manage-ip/apply/apply-for-a-trade-mark/",
    verificationEvidenceUri:
      "https://www.ipoi.gov.ie/en/manage-ip/apply/apply-for-a-trade-mark/",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-search",
    family: "SEARCH",
    displayName: "IPOI Trademark Search",
    canonicalUri: "https://www.ipoi.gov.ie/en/ip-search-tools/trademark-search/",
    entrypoints: [
      {
        uri: "https://www.ipoi.gov.ie/en/ip-search-tools/trademark-search/",
        label: "Trademark search guidance",
      },
      {
        uri: "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/using-the-trade-mark-search-tools/",
        label: "Irish trademark search tools",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.ipoi.gov.ie/en/ip-search-tools/trademark-search/",
    notes:
      "The National Trade Mark Database covers Irish applications and Madrid registrations designating Ireland; IPOI also exposes quick and advanced register search tools.",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-fees",
    family: "FEES",
    displayName: "IPOI Statutory Trade Mark Fees",
    canonicalUri: "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/statutory-trade-mark-fees/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/statutory-trade-mark-fees/",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "IPOI Classification of Goods and Services",
    canonicalUri:
      "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/understanding-trade-marks/classifying-your-goods-or-services/",
    verificationEvidenceUri:
      "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/understanding-trade-marks/classifying-your-goods-or-services/",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-law-practice",
    family: "LEGAL_TEXTS",
    displayName: "IPOI Trade Mark Law and Practice",
    canonicalUri:
      "https://www.ipoi.gov.ie/en/law-practice/legislation/trade-marks/trade-marks-acts/",
    entrypoints: [
      {
        uri: "https://www.ipoi.gov.ie/en/law-practice/legislation/trade-marks/trade-marks-acts/",
        label: "Trade Marks Acts",
      },
      {
        uri: "https://www.ipoi.gov.ie/en/law-practice/legislation/trade-marks/rules-regulations/",
        label: "Trade mark rules and regulations",
      },
      {
        uri: "https://www.ipoi.gov.ie/en/law-practice/legislation/trade-marks/trade-marks-practice-and-procedures/",
        label: "Trade mark practice and procedures",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ipoi.gov.ie/en/law-practice/legislation/trade-marks/trade-marks-acts/",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-trademark-opposition",
    family: "PROCEEDINGS",
    displayName: "IPOI Trademark Opposition",
    canonicalUri: "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/after-you-apply/opposition/",
    verificationEvidenceUri:
      "https://www.ipoi.gov.ie/en/types-of-ip/trade-marks/after-you-apply/opposition/",
    notes:
      "IPOI provides a three-month opposition period following publication of an accepted trademark in the Official Journal.",
  }),
  target(IPOI_IE, {
    id: "ie-ipoi-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "IPOI Journal - Trade Marks Part II",
    canonicalUri: "https://www.ipoi.gov.ie/en/ip-search-tools/search-the-journal/download-journals/",
    entrypoints: [
      {
        uri: "https://www.ipoi.gov.ie/en/ip-search-tools/search-the-journal/about-the-journal/",
        label: "About the fortnightly Journal",
      },
      {
        uri: "https://www.ipoi.gov.ie/en/ip-search-tools/search-the-journal/download-journals/",
        label: "Download current and past Journals",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ipoi.gov.ie/en/ip-search-tools/search-the-journal/download-journals/",
    notes:
      "IPOI publishes the Journal fortnightly; Part II covers trademark filings, oppositions, registrations, renewals, restorations and Madrid events. The download page lists Journal 2572 dated 15 July 2026.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''

priority = replace_once(priority, "const CIPO: Authority = {", ireland_block + "const CIPO: Authority = {", "insert Ireland coverage")
priority = replace_once(
    priority,
    "  ...PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,\n  ...IPOI_IE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "aggregate Ireland coverage",
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
catalog = catalog.replace(
    "  PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,\n",
    "  PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,\n  IPOI_IE_SOURCE_COVERAGE_TARGETS,\n",
)
if catalog.count("IPOI_IE_SOURCE_COVERAGE_TARGETS") != 2:
    raise RuntimeError("catalog: expected Ireland import and export")
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_once(
    priority_test,
    "  PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,\n",
    "  PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,\n  IPOI_IE_SOURCE_COVERAGE_TARGETS,\n",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["AT", PATENTAMT_AT_SOURCE_COVERAGE_TARGETS, ["patentamt.at"]],\n',
    '  ["AT", PATENTAMT_AT_SOURCE_COVERAGE_TARGETS, ["patentamt.at"]],\n  ["IE", IPOI_IE_SOURCE_COVERAGE_TARGETS, ["ipoi.gov.ie"]],\n',
    "priority test authority set",
)
priority_test = priority_test.replace(
    'ships explicit, official, unique coverage for twenty-one priority national offices',
    'ships explicit, official, unique coverage for twenty-two priority national offices',
)
priority_test = priority_test.replace("toHaveLength(156)", "toHaveLength(164)", 1)
priority_test = priority_test.replace("toBe(\n      156,\n", "toBe(\n      164,\n", 1)
priority_test = priority_test.replace(").toBe(156);", ").toBe(164);", 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
ireland_probes = r'''  {
    id: "ie-trademarks-name",
    targetId: "ie-ipoi-trademarks",
    query: "IPOI trade marks Ireland",
  },
  {
    id: "ie-trademark-filing-name",
    targetId: "ie-ipoi-trademark-filing",
    query: "apply for a trade mark Ireland",
  },
  {
    id: "ie-trademark-search-name",
    targetId: "ie-ipoi-trademark-search",
    query: "Irish trademark search database",
  },
  {
    id: "ie-trademark-fees-name",
    targetId: "ie-ipoi-trademark-fees",
    query: "statutory trade mark fees Ireland",
  },
  {
    id: "ie-trademark-classification-name",
    targetId: "ie-ipoi-trademark-classification",
    query: "classifying goods services Nice Ireland",
  },
  {
    id: "ie-trademark-law-name",
    targetId: "ie-ipoi-trademark-law-practice",
    query: "Trade Marks Act rules practice Ireland",
  },
  {
    id: "ie-trademark-opposition-name",
    targetId: "ie-ipoi-trademark-opposition",
    query: "trade mark opposition Ireland IPOI",
  },
'''
retrieval = replace_once(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    ireland_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    "retrieval Ireland probes",
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace("toHaveLength(169)", "toHaveLength(176)", 2)
retrieval_test = retrieval_test.replace("toBe(\n      169,\n", "toBe(\n      176,\n", 1)
retrieval_test = replace_once(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "AT", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "AT", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "IE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    "retrieval test Ireland jurisdiction",
)
retrieval_test_path.write_text(retrieval_test)

print("Ireland IPOI source coverage patch applied")
