from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
relevance_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
relevance_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")

priority = priority_path.read_text(encoding="utf-8")
se_block = '''const PRV_SE: Authority = {
  jurisdiction: "SE",
  authorityName: "Swedish Intellectual Property Office (PRV)",
  languages: ["sv-SE", "en"],
  verificationEvidenceUri: "https://www.prv.se/en/trademarks/",
};

export const PRV_SE_SOURCE_COVERAGE_TARGETS = [
  target(PRV_SE, {
    id: "se-prv-trademarks",
    family: "PORTAL",
    displayName: "PRV Trademarks",
    canonicalUri: "https://www.prv.se/en/trademarks/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-filing",
    family: "FILING",
    displayName: "PRV Prepare for the Trademark Application",
    canonicalUri: "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/",
    entrypoints: [
      {
        uri: "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/",
        label: "Application checklist and filing guidance",
      },
      {
        uri: "https://www.prv.se/en/ip-professional/trademarks/trademark-online-services/",
        label: "Trademark online services",
      },
    ],
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-search",
    family: "SEARCH",
    displayName: "PRV Swedish Trademark Database",
    canonicalUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/trademark-databases/",
    entrypoints: [
      {
        uri: "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/trademark-databases/",
        label: "Trademark database guidance",
      },
      { uri: "https://search.prv.se/", label: "Search PRV's Databases" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/trademark-databases/",
    notes:
      "PRV launched the new Search PRV's Databases interface on 26 January 2026 as the modernised access point for the Swedish Trademark Database.",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-fees",
    family: "FEES",
    displayName: "PRV Trademark Fees",
    canonicalUri: "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/fees-and-payment/",
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/fees-and-payment/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "PRV Goods and Services Classification Guidance",
    canonicalUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/choose-the-right-goods-and-services-for-your-trademark/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/choose-the-right-goods-and-services-for-your-trademark/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "PRV Trademark Laws and Regulations",
    canonicalUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/laws-and-regulations-concerning-trademarks/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/laws-and-regulations-concerning-trademarks/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-examination-opposition",
    family: "PROCEEDINGS",
    displayName: "PRV Trademark Application Processing and Opposition",
    canonicalUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/processing-of-applications-of-trademarks/",
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/prepare-for-the-trademark-application/processing-of-applications-of-trademarks/",
  }),
  target(PRV_SE, {
    id: "se-prv-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Swedish Trademark Gazette",
    canonicalUri:
      "https://www.prv.se/en/trademarks/when-you-have-a-registered-trademark/monitor-your-trademark/swedish-trademark-gazette/",
    entrypoints: [
      {
        uri: "https://www.prv.se/en/trademarks/when-you-have-a-registered-trademark/monitor-your-trademark/swedish-trademark-gazette/",
        label: "Gazette guidance",
      },
      { uri: "https://search.prv.se/", label: "Daily trademark notices" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.prv.se/en/trademarks/when-you-have-a-registered-trademark/monitor-your-trademark/swedish-trademark-gazette/",
    notes:
      "From 26 January 2026 the Swedish Trademark Gazette moved from daily/weekly PDF editions to online notices published daily through Search PRV's Databases.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
anchor = "const CIPO: Authority = {"
if "export const PRV_SE_SOURCE_COVERAGE_TARGETS" not in priority:
    if anchor not in priority:
        raise SystemExit("CIPO insertion anchor not found")
    priority = priority.replace(anchor, se_block + anchor, 1)
aggregate_old = "  ...IPI_CH_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
aggregate_new = "  ...IPI_CH_SOURCE_COVERAGE_TARGETS,\n  ...PRV_SE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
if aggregate_old in priority:
    priority = priority.replace(aggregate_old, aggregate_new, 1)
elif aggregate_new not in priority:
    raise SystemExit("priority Sweden aggregate anchor not found")
priority_path.write_text(priority, encoding="utf-8")

catalog = catalog_path.read_text(encoding="utf-8")
needle = "  IPI_CH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replacement = "  IPI_CH_SOURCE_COVERAGE_TARGETS,\n  PRV_SE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replaced = 0
while needle in catalog and replaced < 2:
    catalog = catalog.replace(needle, replacement, 1)
    replaced += 1
if catalog.count("PRV_SE_SOURCE_COVERAGE_TARGETS") < 2:
    raise SystemExit("catalog Sweden import/export integration incomplete")
catalog_path.write_text(catalog, encoding="utf-8")

priority_tests = priority_test_path.read_text(encoding="utf-8")
test_import_old = "  IPI_CH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
test_import_new = "  IPI_CH_SOURCE_COVERAGE_TARGETS,\n  PRV_SE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
if test_import_old in priority_tests:
    priority_tests = priority_tests.replace(test_import_old, test_import_new, 1)
elif test_import_new not in priority_tests:
    raise SystemExit("priority test Sweden import anchor not found")
set_old = '  ["CH", IPI_CH_SOURCE_COVERAGE_TARGETS, ["ige.ch"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
set_new = '  ["CH", IPI_CH_SOURCE_COVERAGE_TARGETS, ["ige.ch"]],\n  ["SE", PRV_SE_SOURCE_COVERAGE_TARGETS, ["prv.se"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
if set_old in priority_tests:
    priority_tests = priority_tests.replace(set_old, set_new, 1)
elif set_new not in priority_tests:
    raise SystemExit("priority test Sweden authority set anchor not found")
priority_tests = priority_tests.replace(
    "ships explicit, official, unique coverage for sixteen priority national offices",
    "ships explicit, official, unique coverage for seventeen priority national offices",
)
priority_tests = priority_tests.replace("toHaveLength(116)", "toHaveLength(124)")
priority_tests = priority_tests.replace("      116,", "      124,")
priority_tests = priority_tests.replace(").toBe(116);", ").toBe(124);")
if priority_tests.count("124") < 3:
    raise SystemExit("priority Sweden cardinality updates incomplete")
priority_test_path.write_text(priority_tests, encoding="utf-8")

relevance = relevance_path.read_text(encoding="utf-8")
probe_anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
se_probes = '''  {
    id: "se-trademarks-name",
    targetId: "se-prv-trademarks",
    query: "PRV trademarks Sweden",
  },
  {
    id: "se-trademark-filing-name",
    targetId: "se-prv-trademark-filing",
    query: "prepare trademark application",
  },
  {
    id: "se-trademark-search-name",
    targetId: "se-prv-trademark-search",
    query: "Swedish trademark database",
  },
  {
    id: "se-trademark-fees-name",
    targetId: "se-prv-trademark-fees",
    query: "trademark fees",
  },
  {
    id: "se-trademark-classification-name",
    targetId: "se-prv-trademark-classification",
    query: "goods services trademark classes",
  },
  {
    id: "se-trademark-law-name",
    targetId: "se-prv-trademark-law",
    query: "trademark laws regulations",
  },
  {
    id: "se-trademark-examination-opposition-name",
    targetId: "se-prv-trademark-examination-opposition",
    query: "processing trademark applications opposition",
  },
'''
if 'targetId: "se-prv-trademarks"' not in relevance:
    if probe_anchor not in relevance:
        raise SystemExit("Canada probe anchor not found")
    relevance = relevance.replace(probe_anchor, se_probes + probe_anchor, 1)
relevance_path.write_text(relevance, encoding="utf-8")

relevance_tests = relevance_test_path.read_text(encoding="utf-8")
for old, new in [
    ("expect(targets).toHaveLength(134);", "expect(targets).toHaveLength(141);"),
    ("expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(134);", "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(141);"),
    ("      134,\n    );\n    expect(targets.every", "      141,\n    );\n    expect(targets.every"),
]:
    if old in relevance_tests:
        relevance_tests = relevance_tests.replace(old, new, 1)
    elif new not in relevance_tests:
        raise SystemExit(f"relevance Sweden cardinality assertion missing: {old}")
ch_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "CH", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
se_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "SE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
if 'jurisdiction: "SE", coverageTier: "FOUNDATIONAL"' not in relevance_tests:
    if ch_assertion not in relevance_tests:
        raise SystemExit("CH relevance assertion anchor not found")
    relevance_tests = relevance_tests.replace(ch_assertion, ch_assertion + se_assertion, 1)
relevance_test_path.write_text(relevance_tests, encoding="utf-8")
