from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
relevance_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
relevance_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")

priority = priority_path.read_text(encoding="utf-8")
dpma_block = r'''const DPMA: Authority = {
  jurisdiction: "DE",
  authorityName: "German Patent and Trade Mark Office",
  languages: ["de-DE", "en"],
  verificationEvidenceUri: "https://www.dpma.de/english/trade_marks/",
};

export const DPMA_SOURCE_COVERAGE_TARGETS = [
  target(DPMA, {
    id: "de-dpma-trademarks",
    family: "PORTAL",
    displayName: "DPMA Trade Marks",
    canonicalUri: "https://www.dpma.de/english/trade_marks/",
  }),
  target(DPMA, {
    id: "de-dpma-trademark-filing",
    family: "FILING",
    displayName: "DPMA Required Data for Filing a Trade Mark Application",
    canonicalUri:
      "https://www.dpma.de/english/trade_marks/application/required_data_for_filing_an_application/index.html",
    verificationEvidenceUri:
      "https://www.dpma.de/english/trade_marks/application/required_data_for_filing_an_application/index.html",
  }),
  target(DPMA, {
    id: "de-dpma-trademark-search",
    family: "SEARCH",
    displayName: "DPMA Trade Mark Search Guidance",
    canonicalUri: "https://www.dpma.de/english/trade_marks/trade_mark_search/",
    entrypoints: [
      {
        uri: "https://www.dpma.de/english/trade_marks/trade_mark_search/",
        label: "Trade mark search guidance",
      },
      { uri: "https://www.dpma.de/english/search/dpmaregister/", label: "DPMAregister guidance" },
    ],
    verificationEvidenceUri: "https://www.dpma.de/english/search/dpmaregister/",
  }),
  target(DPMA, {
    id: "de-dpma-trademark-fees",
    family: "FEES",
    displayName: "DPMA Trade Mark Fees",
    canonicalUri: "https://www.dpma.de/english/services/fees/trademarks/index.html",
    verificationEvidenceUri: "https://www.dpma.de/english/services/fees/trademarks/index.html",
  }),
  target(DPMA, {
    id: "de-dpma-trademark-law-guidelines",
    family: "LEGAL_TEXTS",
    displayName: "DPMA Trade Mark Law and Guidelines",
    canonicalUri: "https://www.dpma.de/english/our_office/law/index.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.dpma.de/english/our_office/law/index.html",
    notes:
      "The official law page links the Trade Mark Act and Ordinance plus German-language examination and opposition guidelines.",
  }),
  target(DPMA, {
    id: "de-dpma-trademark-forms",
    family: "FILING",
    displayName: "DPMA Trade Mark Forms and Applicant Information",
    canonicalUri: "https://www.dpma.de/english/services/forms/trade_marks/index.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.dpma.de/english/services/forms/trade_marks/index.html",
  }),
  target(DPMA, {
    id: "de-dpma-important-notices",
    family: "POLICY_NOTICES",
    displayName: "DPMA Important Notices",
    canonicalUri: "https://www.dpma.de/english/our_office/publications/important_notices/index.html",
    coverageTier: "CHANGE_SIGNAL",
    verificationEvidenceUri:
      "https://www.dpma.de/english/our_office/publications/important_notices/index.html",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
anchor = "const CIPO: Authority = {"
if "export const DPMA_SOURCE_COVERAGE_TARGETS" not in priority:
    if anchor not in priority:
        raise SystemExit("CIPO insertion anchor not found")
    priority = priority.replace(anchor, dpma_block + anchor, 1)
aggregate_old = '''  ...IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  ...IPOS_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,'''
aggregate_new = '''  ...IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  ...IPOS_SOURCE_COVERAGE_TARGETS,\n  ...DPMA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,'''
if aggregate_old in priority:
    priority = priority.replace(aggregate_old, aggregate_new, 1)
elif aggregate_new not in priority:
    raise SystemExit("priority aggregate anchor not found")
priority_path.write_text(priority, encoding="utf-8")

catalog = catalog_path.read_text(encoding="utf-8")
import_old = '''  CNIPA_SOURCE_COVERAGE_TARGETS,\n  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,'''
import_new = '''  CNIPA_SOURCE_COVERAGE_TARGETS,\n  DPMA_SOURCE_COVERAGE_TARGETS,\n  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,'''
if import_old in catalog:
    catalog = catalog.replace(import_old, import_new, 1)
elif import_new not in catalog:
    raise SystemExit("catalog DPMA import anchor not found")
export_old = '''  CNIPA_SOURCE_COVERAGE_TARGETS,\n  EUIPO_SOURCE_COVERAGE_TARGETS,'''
export_new = '''  CNIPA_SOURCE_COVERAGE_TARGETS,\n  DPMA_SOURCE_COVERAGE_TARGETS,\n  EUIPO_SOURCE_COVERAGE_TARGETS,'''
if export_old in catalog:
    catalog = catalog.replace(export_old, export_new, 1)
elif export_new not in catalog:
    raise SystemExit("catalog DPMA export anchor not found")
if catalog.count("DPMA_SOURCE_COVERAGE_TARGETS") < 2:
    raise SystemExit("catalog DPMA integration incomplete")
catalog_path.write_text(catalog, encoding="utf-8")

priority_tests = priority_test_path.read_text(encoding="utf-8")
import_old = '''  CNIPA_SOURCE_COVERAGE_TARGETS,\n  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,'''
import_new = '''  CNIPA_SOURCE_COVERAGE_TARGETS,\n  DPMA_SOURCE_COVERAGE_TARGETS,\n  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,'''
if import_old in priority_tests:
    priority_tests = priority_tests.replace(import_old, import_new, 1)
elif import_new not in priority_tests:
    raise SystemExit("priority test import anchor not found")
set_old = '''  ["SG", IPOS_SOURCE_COVERAGE_TARGETS, ["ipos.gov.sg"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'''
set_new = '''  ["SG", IPOS_SOURCE_COVERAGE_TARGETS, ["ipos.gov.sg"]],\n  ["DE", DPMA_SOURCE_COVERAGE_TARGETS, ["dpma.de"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'''
if set_old in priority_tests:
    priority_tests = priority_tests.replace(set_old, set_new, 1)
elif set_new not in priority_tests:
    raise SystemExit("priority authority set anchor not found")
priority_tests = priority_tests.replace(
    "ships explicit, official, unique coverage for seven priority national offices",
    "ships explicit, official, unique coverage for eight priority national offices",
)
priority_tests = priority_tests.replace("toHaveLength(40)", "toHaveLength(47)")
priority_tests = priority_tests.replace(".size).toBe(40)", ".size).toBe(47)")
priority_test_path.write_text(priority_tests, encoding="utf-8")

relevance = relevance_path.read_text(encoding="utf-8")
probe_anchor = '''  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'''
dpma_probes = '''  { id: "de-trademarks-name", targetId: "de-dpma-trademarks", query: "trade marks" },
  {
    id: "de-trademark-filing-name",
    targetId: "de-dpma-trademark-filing",
    query: "required data",
  },
  {
    id: "de-trademark-search-name",
    targetId: "de-dpma-trademark-search",
    query: "trade mark searches",
  },
  {
    id: "de-trademark-fees-name",
    targetId: "de-dpma-trademark-fees",
    query: "trade mark fees",
  },
  {
    id: "de-trademark-law-name",
    targetId: "de-dpma-trademark-law-guidelines",
    query: "trade mark act",
  },
  {
    id: "de-trademark-forms-name",
    targetId: "de-dpma-trademark-forms",
    query: "trade mark applicants",
  },
'''
if 'targetId: "de-dpma-trademarks"' not in relevance:
    if probe_anchor not in relevance:
        raise SystemExit("relevance Canada anchor not found")
    relevance = relevance.replace(probe_anchor, dpma_probes + probe_anchor, 1)
relevance_path.write_text(relevance, encoding="utf-8")

relevance_tests = relevance_test_path.read_text(encoding="utf-8")
for old, new in [
    ("expect(targets).toHaveLength(68);", "expect(targets).toHaveLength(74);"),
    ("expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(68);", "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(74);"),
    (".size).toBe(68);", ".size).toBe(74);"),
]:
    if old in relevance_tests:
        relevance_tests = relevance_tests.replace(old, new, 1)
    elif new not in relevance_tests:
        raise SystemExit(f"relevance cardinality assertion not found: {old}")
sg_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "SG", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
de_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "DE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
if 'jurisdiction: "DE", coverageTier: "FOUNDATIONAL"' not in relevance_tests:
    if sg_assertion not in relevance_tests:
        raise SystemExit("SG relevance assertion anchor not found")
    relevance_tests = relevance_tests.replace(sg_assertion, sg_assertion + de_assertion, 1)
relevance_test_path.write_text(relevance_tests, encoding="utf-8")
