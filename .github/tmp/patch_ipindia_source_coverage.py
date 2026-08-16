from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
relevance_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
relevance_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")

priority = priority_path.read_text(encoding="utf-8")
ipindia_block = '''const IP_INDIA: Authority = {
  jurisdiction: "IN",
  authorityName: "Office of the Controller General of Patents, Designs and Trade Marks",
  languages: ["en-IN", "hi-IN"],
  verificationEvidenceUri: "https://ipindia.gov.in/basics-of-trademarks",
};

export const IP_INDIA_SOURCE_COVERAGE_TARGETS = [
  target(IP_INDIA, {
    id: "in-ipindia-trademarks",
    family: "PORTAL",
    displayName: "IP India Basics of Trademarks",
    canonicalUri: "https://ipindia.gov.in/basics-of-trademarks",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-filing-process",
    family: "FILING",
    displayName: "IP India Trade Mark Filing Process",
    canonicalUri: "https://ipindia.gov.in/trade-marks-learn-filing-process-step-by-step",
    verificationEvidenceUri: "https://ipindia.gov.in/trade-marks-learn-filing-process-step-by-step",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-search",
    family: "SEARCH",
    displayName: "IP India Search Existing Trademarks",
    canonicalUri: "https://ipindia.gov.in/trade-marks-before-you-apply-search-existing-trademarks",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://ipindia.gov.in/trade-marks-before-you-apply-search-existing-trademarks",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-forms-fees",
    family: "FEES",
    displayName: "IP India Trade Mark Forms and Official Fees",
    canonicalUri: "https://ipindia.gov.in/pages/trade-marks/learn/forms-and-official-fees",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://ipindia.gov.in/pages/trade-marks/learn/forms-and-official-fees",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-act",
    family: "LEGAL_TEXTS",
    displayName: "IP India Trade Marks Act",
    canonicalUri: "https://ipindia.gov.in/trade-marks-resources-act",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ipindia.gov.in/trade-marks-resources-act",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-rules",
    family: "LEGAL_TEXTS",
    displayName: "IP India Trade Marks Rules",
    canonicalUri: "https://ipindia.gov.in/trade-marks-resources-rules",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ipindia.gov.in/trade-marks-resources-rules",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-manual",
    family: "EXAMINATION_MANUAL",
    displayName: "IP India Trade Marks Practice and Procedure Manual",
    canonicalUri: "https://ipindia.gov.in/trade-marks-resources-manual",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ipindia.gov.in/trade-marks-resources-manual",
    notes:
      "As verified on 2026-08-16, the official page publishes draft Trade Marks Practice and Procedure manual materials.",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-guidelines",
    family: "POLICY_NOTICES",
    displayName: "IP India Trade Mark Guidelines and SOPs",
    canonicalUri: "https://ipindia.gov.in/trade-marks-resources-guidelines",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ipindia.gov.in/trade-marks-resources-guidelines",
  }),
  target(IP_INDIA, {
    id: "in-ipindia-trademark-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "IP India Trade Marks Journal",
    canonicalUri: "https://search.ipindia.gov.in/IPOJournal/Journal/Trademark",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF", "IMAGE"],
    verificationEvidenceUri: "https://search.ipindia.gov.in/IPOJournal/Journal/Trademark",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
anchor = "const CIPO: Authority = {"
if "export const IP_INDIA_SOURCE_COVERAGE_TARGETS" not in priority:
    if anchor not in priority:
        raise SystemExit("CIPO insertion anchor not found")
    priority = priority.replace(anchor, ipindia_block + anchor, 1)
aggregate_old = "  ...DPMA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
aggregate_new = "  ...DPMA_SOURCE_COVERAGE_TARGETS,\n  ...IP_INDIA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
if aggregate_old in priority:
    priority = priority.replace(aggregate_old, aggregate_new, 1)
elif aggregate_new not in priority:
    raise SystemExit("priority aggregate anchor not found")
priority_path.write_text(priority, encoding="utf-8")

catalog = catalog_path.read_text(encoding="utf-8")
import_old = "  DPMA_SOURCE_COVERAGE_TARGETS,\n  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,"
import_new = "  DPMA_SOURCE_COVERAGE_TARGETS,\n  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  IP_INDIA_SOURCE_COVERAGE_TARGETS,"
if import_old in catalog:
    catalog = catalog.replace(import_old, import_new, 1)
elif import_new not in catalog:
    raise SystemExit("catalog import anchor not found")
export_old = "  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
export_new = "  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  IP_INDIA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
if export_old in catalog:
    catalog = catalog.replace(export_old, export_new, 1)
elif export_new not in catalog:
    raise SystemExit("catalog export anchor not found")
catalog_path.write_text(catalog, encoding="utf-8")

priority_tests = priority_test_path.read_text(encoding="utf-8")
test_import_old = "  DPMA_SOURCE_COVERAGE_TARGETS,\n  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,"
test_import_new = "  DPMA_SOURCE_COVERAGE_TARGETS,\n  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  IP_INDIA_SOURCE_COVERAGE_TARGETS,"
if test_import_old in priority_tests:
    priority_tests = priority_tests.replace(test_import_old, test_import_new, 1)
elif test_import_new not in priority_tests:
    raise SystemExit("priority test import anchor not found")
set_old = '  ["DE", DPMA_SOURCE_COVERAGE_TARGETS, ["dpma.de"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
set_new = '  ["DE", DPMA_SOURCE_COVERAGE_TARGETS, ["dpma.de"]],\n  ["IN", IP_INDIA_SOURCE_COVERAGE_TARGETS, ["ipindia.gov.in"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
if set_old in priority_tests:
    priority_tests = priority_tests.replace(set_old, set_new, 1)
elif set_new not in priority_tests:
    raise SystemExit("priority test authority set anchor not found")
priority_tests = priority_tests.replace(
    "ships explicit, official, unique coverage for eight priority national offices",
    "ships explicit, official, unique coverage for nine priority national offices",
)
priority_tests = priority_tests.replace("toHaveLength(47)", "toHaveLength(56)")
priority_tests = priority_tests.replace(".size).toBe(47)", ".size).toBe(56)")
priority_test_path.write_text(priority_tests, encoding="utf-8")

relevance = relevance_path.read_text(encoding="utf-8")
probe_anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
ipindia_probes = '''  { id: "in-trademarks-name", targetId: "in-ipindia-trademarks", query: "basics trademarks" },
  {
    id: "in-trademark-filing-name",
    targetId: "in-ipindia-trademark-filing-process",
    query: "filing process",
  },
  {
    id: "in-trademark-search-name",
    targetId: "in-ipindia-trademark-search",
    query: "search existing trademarks",
  },
  {
    id: "in-trademark-forms-fees-name",
    targetId: "in-ipindia-trademark-forms-fees",
    query: "forms official fees",
  },
  {
    id: "in-trademark-act-name",
    targetId: "in-ipindia-trademark-act",
    query: "trade marks act",
  },
  {
    id: "in-trademark-rules-name",
    targetId: "in-ipindia-trademark-rules",
    query: "trade marks rules",
  },
  {
    id: "in-trademark-manual-name",
    targetId: "in-ipindia-trademark-manual",
    query: "trademarks practice procedure manual",
  },
'''
if 'targetId: "in-ipindia-trademarks"' not in relevance:
    if probe_anchor not in relevance:
        raise SystemExit("Canada probe anchor not found")
    relevance = relevance.replace(probe_anchor, ipindia_probes + probe_anchor, 1)
relevance_path.write_text(relevance, encoding="utf-8")

relevance_tests = relevance_test_path.read_text(encoding="utf-8")
for old, new in [
    ("expect(targets).toHaveLength(74);", "expect(targets).toHaveLength(81);"),
    ("expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(74);", "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(81);"),
    (".size).toBe(74);", ".size).toBe(81);"),
]:
    if old in relevance_tests:
        relevance_tests = relevance_tests.replace(old, new, 1)
    elif new not in relevance_tests:
        raise SystemExit(f"relevance cardinality assertion not found: {old}")
de_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "DE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
in_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "IN", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
if 'jurisdiction: "IN", coverageTier: "FOUNDATIONAL"' not in relevance_tests:
    if de_assertion not in relevance_tests:
        raise SystemExit("DE relevance assertion anchor not found")
    relevance_tests = relevance_tests.replace(de_assertion, de_assertion + in_assertion, 1)
relevance_test_path.write_text(relevance_tests, encoding="utf-8")
