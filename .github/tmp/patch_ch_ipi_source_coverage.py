from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
relevance_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
relevance_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")

priority = priority_path.read_text(encoding="utf-8")
ch_block = '''const IPI_CH: Authority = {
  jurisdiction: "CH",
  authorityName: "Swiss Federal Institute of Intellectual Property",
  languages: ["de-CH", "fr-CH", "it-CH", "en"],
  verificationEvidenceUri: "https://www.ige.ch/en/trade-marks",
};

export const IPI_CH_SOURCE_COVERAGE_TARGETS = [
  target(IPI_CH, {
    id: "ch-ipi-trademarks",
    family: "PORTAL",
    displayName: "Swiss IPI Trade Marks",
    canonicalUri: "https://www.ige.ch/en/trade-marks",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-filing",
    family: "FILING",
    displayName: "Swiss IPI National Trade Mark Applications",
    canonicalUri: "https://www.ige.ch/en/protecting-your-ip/trade-marks/national-applications",
    verificationEvidenceUri:
      "https://www.ige.ch/en/protecting-your-ip/trade-marks/national-applications",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-search",
    family: "SEARCH",
    displayName: "Swissreg Trade Mark Database",
    canonicalUri:
      "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg/trade-mark-database",
    entrypoints: [
      {
        uri: "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg/trade-mark-database",
        label: "Trade mark database guidance",
      },
      { uri: "https://www.swissreg.ch/database-client/home?lang=en", label: "Swissreg" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "IMAGE"],
    verificationEvidenceUri:
      "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg/trade-mark-database",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-fees",
    family: "FEES",
    displayName: "Swiss IPI Trade Mark Costs and Fees",
    canonicalUri:
      "https://www.ige.ch/en/protecting-your-ip/trade-marks/national-applications/costs-and-fees",
    verificationEvidenceUri:
      "https://www.ige.ch/en/protecting-your-ip/trade-marks/national-applications/costs-and-fees",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "Swiss IPI Trade Mark Guidelines",
    canonicalUri:
      "https://www.ige.ch/en/services/documents-and-links/trade-mark/praxisaenderungen-des-ige",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ige.ch/en/services/documents-and-links/trade-mark/praxisaenderungen-des-ige",
    notes:
      "The official trade mark documents hub publishes the Trade Mark Guidelines dated 1 January 2026 in German, French and Italian.",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Swiss IPI Classification Tool",
    canonicalUri: "https://www.ige.ch/en/services/digital-resources/online-services/classification-tool",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.ige.ch/en/services/digital-resources/online-services/classification-tool",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Swiss IPI Trade Mark Law",
    canonicalUri: "https://www.ige.ch/en/law-and-policy/national-ip-law/trade-mark-law",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ige.ch/en/law-and-policy/national-ip-law/trade-mark-law",
  }),
  target(IPI_CH, {
    id: "ch-ipi-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Swiss IPI Trade Mark Opposition and Non-use Cancellation",
    canonicalUri:
      "https://www.ige.ch/en/protecting-your-ip/trade-marks/after-registration/monitor-and-defend-your-trade-mark/filing-an-opposition",
    entrypoints: [
      {
        uri: "https://www.ige.ch/en/protecting-your-ip/trade-marks/after-registration/monitor-and-defend-your-trade-mark/filing-an-opposition",
        label: "Opposition",
      },
      {
        uri: "https://www.ige.ch/en/protecting-your-ip/trade-marks/after-registration/use-your-trade-mark/cancellation-procedure-for-trade-marks-on-the-grounds-of-non-use",
        label: "Cancellation for non-use",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ige.ch/en/protecting-your-ip/trade-marks/after-registration/monitor-and-defend-your-trade-mark/filing-an-opposition",
  }),
  target(IPI_CH, {
    id: "ch-ipi-swissreg-publications",
    family: "OFFICIAL_GAZETTE",
    displayName: "Swissreg Official Publication Organ",
    canonicalUri:
      "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg",
    entrypoints: [
      {
        uri: "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg",
        label: "Swissreg publication organ guidance",
      },
      { uri: "https://www.swissreg.ch/database-client/home?lang=en", label: "Swissreg publications" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF", "JSON"],
    verificationEvidenceUri:
      "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg",
    notes:
      "Swissreg is the IPI's official organ for legally effective publication of new registrations and changes to the register.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
anchor = "const CIPO: Authority = {"
if "export const IPI_CH_SOURCE_COVERAGE_TARGETS" not in priority:
    if anchor not in priority:
        raise SystemExit("CIPO insertion anchor not found")
    priority = priority.replace(anchor, ch_block + anchor, 1)
aggregate_old = "  ...UIBM_IT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
aggregate_new = "  ...UIBM_IT_SOURCE_COVERAGE_TARGETS,\n  ...IPI_CH_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
if aggregate_old in priority:
    priority = priority.replace(aggregate_old, aggregate_new, 1)
elif aggregate_new not in priority:
    raise SystemExit("priority Switzerland aggregate anchor not found")
priority_path.write_text(priority, encoding="utf-8")

catalog = catalog_path.read_text(encoding="utf-8")
needle = "  UIBM_IT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replacement = "  UIBM_IT_SOURCE_COVERAGE_TARGETS,\n  IPI_CH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replaced = 0
while needle in catalog and replaced < 2:
    catalog = catalog.replace(needle, replacement, 1)
    replaced += 1
if catalog.count("IPI_CH_SOURCE_COVERAGE_TARGETS") < 2:
    raise SystemExit("catalog Switzerland import/export integration incomplete")
catalog_path.write_text(catalog, encoding="utf-8")

priority_tests = priority_test_path.read_text(encoding="utf-8")
test_import_old = "  UIBM_IT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
test_import_new = "  UIBM_IT_SOURCE_COVERAGE_TARGETS,\n  IPI_CH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
if test_import_old in priority_tests:
    priority_tests = priority_tests.replace(test_import_old, test_import_new, 1)
elif test_import_new not in priority_tests:
    raise SystemExit("priority test Switzerland import anchor not found")
set_old = '  ["IT", UIBM_IT_SOURCE_COVERAGE_TARGETS, ["mise.gov.it", "uibm.gov.it"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
set_new = '  ["IT", UIBM_IT_SOURCE_COVERAGE_TARGETS, ["mise.gov.it", "uibm.gov.it"]],\n  ["CH", IPI_CH_SOURCE_COVERAGE_TARGETS, ["ige.ch"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
if set_old in priority_tests:
    priority_tests = priority_tests.replace(set_old, set_new, 1)
elif set_new not in priority_tests:
    raise SystemExit("priority test Switzerland authority set anchor not found")
priority_tests = priority_tests.replace(
    "ships explicit, official, unique coverage for fifteen priority national offices",
    "ships explicit, official, unique coverage for sixteen priority national offices",
)
priority_tests = priority_tests.replace("toHaveLength(107)", "toHaveLength(116)")
priority_tests = priority_tests.replace("      107,", "      116,")
priority_tests = priority_tests.replace(").toBe(107);", ").toBe(116);")
if priority_tests.count("116") < 3:
    raise SystemExit("priority Switzerland cardinality updates incomplete")
priority_test_path.write_text(priority_tests, encoding="utf-8")

relevance = relevance_path.read_text(encoding="utf-8")
probe_anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
ch_probes = '''  {
    id: "ch-trademarks-name",
    targetId: "ch-ipi-trademarks",
    query: "Swiss trade marks",
  },
  {
    id: "ch-trademark-filing-name",
    targetId: "ch-ipi-trademark-filing",
    query: "national trade mark applications",
  },
  {
    id: "ch-trademark-search-name",
    targetId: "ch-ipi-trademark-search",
    query: "Swissreg trade mark database",
  },
  {
    id: "ch-trademark-fees-name",
    targetId: "ch-ipi-trademark-fees",
    query: "trade mark costs fees",
  },
  {
    id: "ch-trademark-guidelines-name",
    targetId: "ch-ipi-trademark-guidelines",
    query: "trade mark guidelines 2026",
  },
  {
    id: "ch-trademark-classification-name",
    targetId: "ch-ipi-trademark-classification",
    query: "classification tool goods services",
  },
  {
    id: "ch-trademark-law-name",
    targetId: "ch-ipi-trademark-law",
    query: "trade mark law legal framework",
  },
  {
    id: "ch-trademark-proceedings-name",
    targetId: "ch-ipi-trademark-proceedings",
    query: "trade mark opposition cancellation non-use",
  },
'''
if 'targetId: "ch-ipi-trademarks"' not in relevance:
    if probe_anchor not in relevance:
        raise SystemExit("Canada probe anchor not found")
    relevance = relevance.replace(probe_anchor, ch_probes + probe_anchor, 1)
relevance_path.write_text(relevance, encoding="utf-8")

relevance_tests = relevance_test_path.read_text(encoding="utf-8")
for old, new in [
    ("expect(targets).toHaveLength(126);", "expect(targets).toHaveLength(134);"),
    ("expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(126);", "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(134);"),
    ("      126,\n    );\n    expect(targets.every", "      134,\n    );\n    expect(targets.every"),
]:
    if old in relevance_tests:
        relevance_tests = relevance_tests.replace(old, new, 1)
    elif new not in relevance_tests:
        raise SystemExit(f"relevance Switzerland cardinality assertion missing: {old}")
it_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "IT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
ch_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "CH", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
if 'jurisdiction: "CH", coverageTier: "FOUNDATIONAL"' not in relevance_tests:
    if it_assertion not in relevance_tests:
        raise SystemExit("IT relevance assertion anchor not found")
    relevance_tests = relevance_tests.replace(it_assertion, it_assertion + ch_assertion, 1)
relevance_test_path.write_text(relevance_tests, encoding="utf-8")
