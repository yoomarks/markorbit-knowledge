from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
relevance_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
relevance_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")

priority = priority_path.read_text(encoding="utf-8")
nz_block = '''const IPONZ_NZ: Authority = {
  jurisdiction: "NZ",
  authorityName: "Intellectual Property Office of New Zealand",
  languages: ["en-NZ"],
  verificationEvidenceUri: "https://www.iponz.govt.nz/get-ip/trade-marks/",
};

export const IPONZ_NZ_SOURCE_COVERAGE_TARGETS = [
  target(IPONZ_NZ, {
    id: "nz-iponz-trademarks",
    family: "PORTAL",
    displayName: "IPONZ Trade Marks",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-filing",
    family: "FILING",
    displayName: "IPONZ Apply for a Trade Mark",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/apply/",
    verificationEvidenceUri: "https://www.iponz.govt.nz/get-ip/trade-marks/apply/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-search",
    family: "SEARCH",
    displayName: "IPONZ Search for Existing Trade Marks",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/search/",
    entrypoints: [
      {
        uri: "https://www.iponz.govt.nz/get-ip/trade-marks/search/",
        label: "Trade mark search guidance",
      },
      { uri: "https://app.iponz.govt.nz/app/TradeMarkCheck", label: "Trade Mark Check" },
      {
        uri: "https://app.iponz.govt.nz/app/Extra/Default.aspx?directAccess=true&fcoOp=EXTRA__Default&op=EXTRA_tm_qbe",
        label: "Trade Mark Case Search",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "IMAGE"],
    verificationEvidenceUri: "https://www.iponz.govt.nz/get-ip/trade-marks/search/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-fees",
    family: "FEES",
    displayName: "IPONZ Trade Mark Fees",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/fees/",
    verificationEvidenceUri: "https://www.iponz.govt.nz/get-ip/trade-marks/fees/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-practice-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "IPONZ Trade Mark Practice Guidelines",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/practice-guidelines/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.iponz.govt.nz/get-ip/trade-marks/practice-guidelines/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "IPONZ Classification and Specification Guidelines",
    canonicalUri:
      "https://www.iponz.govt.nz/get-ip/trade-marks/practice-guidelines/current/classification-and-specification/",
    verificationEvidenceUri:
      "https://www.iponz.govt.nz/get-ip/trade-marks/practice-guidelines/current/classification-and-specification/",
    notes:
      "The current guideline states that New Zealand uses the 13th Edition of the Nice Classification, effective from 1 January 2026.",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-trademark-hearings",
    family: "PROCEEDINGS",
    displayName: "IPONZ Trade Mark Hearings",
    canonicalUri: "https://www.iponz.govt.nz/get-ip/trade-marks/hearings/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.iponz.govt.nz/get-ip/trade-marks/hearings/",
  }),
  target(IPONZ_NZ, {
    id: "nz-iponz-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "IPONZ The Journal",
    canonicalUri: "https://www.iponz.govt.nz/about-iponz/the-journal/",
    entrypoints: [
      { uri: "https://www.iponz.govt.nz/about-iponz/the-journal/", label: "Journal guidance" },
      {
        uri: "https://app.iponz.govt.nz/app/Extra/Default.aspx?fcoOp=EXTRA__Default&op=EXTRA_Activity_qbe",
        label: "Online Journal search",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.iponz.govt.nz/about-iponz/the-journal/",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
anchor = "const CIPO: Authority = {"
if "export const IPONZ_NZ_SOURCE_COVERAGE_TARGETS" not in priority:
    if anchor not in priority:
        raise SystemExit("CIPO insertion anchor not found")
    priority = priority.replace(anchor, nz_block + anchor, 1)
aggregate_old = "  ...IMPI_MX_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
aggregate_new = "  ...IMPI_MX_SOURCE_COVERAGE_TARGETS,\n  ...IPONZ_NZ_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
if aggregate_old in priority:
    priority = priority.replace(aggregate_old, aggregate_new, 1)
elif aggregate_new not in priority:
    raise SystemExit("priority New Zealand aggregate anchor not found")
priority_path.write_text(priority, encoding="utf-8")

catalog = catalog_path.read_text(encoding="utf-8")
needle = "  IMPI_MX_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replacement = "  IMPI_MX_SOURCE_COVERAGE_TARGETS,\n  IPONZ_NZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replaced = 0
while needle in catalog and replaced < 2:
    catalog = catalog.replace(needle, replacement, 1)
    replaced += 1
if catalog.count("IPONZ_NZ_SOURCE_COVERAGE_TARGETS") < 2:
    raise SystemExit("catalog New Zealand import/export integration incomplete")
catalog_path.write_text(catalog, encoding="utf-8")

priority_tests = priority_test_path.read_text(encoding="utf-8")
test_import_old = "  IMPI_MX_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
test_import_new = "  IMPI_MX_SOURCE_COVERAGE_TARGETS,\n  IPONZ_NZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
if test_import_old in priority_tests:
    priority_tests = priority_tests.replace(test_import_old, test_import_new, 1)
elif test_import_new not in priority_tests:
    raise SystemExit("priority test New Zealand import anchor not found")
set_old = '  ["MX", IMPI_MX_SOURCE_COVERAGE_TARGETS, ["gob.mx", "impi.gob.mx"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
set_new = '  ["MX", IMPI_MX_SOURCE_COVERAGE_TARGETS, ["gob.mx", "impi.gob.mx"]],\n  ["NZ", IPONZ_NZ_SOURCE_COVERAGE_TARGETS, ["iponz.govt.nz"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
if set_old in priority_tests:
    priority_tests = priority_tests.replace(set_old, set_new, 1)
elif set_new not in priority_tests:
    raise SystemExit("priority test New Zealand authority set anchor not found")
priority_tests = priority_tests.replace(
    "ships explicit, official, unique coverage for twelve priority national offices",
    "ships explicit, official, unique coverage for thirteen priority national offices",
)
priority_tests = priority_tests.replace("toHaveLength(81)", "toHaveLength(89)")
priority_tests = priority_tests.replace(".size).toBe(81)", ".size).toBe(89)")
priority_tests = priority_tests.replace(").toBe(81);", ").toBe(89);")
if priority_tests.count("89") < 3:
    raise SystemExit("priority New Zealand cardinality updates incomplete")
priority_test_path.write_text(priority_tests, encoding="utf-8")

relevance = relevance_path.read_text(encoding="utf-8")
probe_anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
nz_probes = '''  {
    id: "nz-trademarks-name",
    targetId: "nz-iponz-trademarks",
    query: "trade marks",
  },
  {
    id: "nz-trademark-filing-name",
    targetId: "nz-iponz-trademark-filing",
    query: "apply trade mark",
  },
  {
    id: "nz-trademark-search-name",
    targetId: "nz-iponz-trademark-search",
    query: "search existing trade marks",
  },
  {
    id: "nz-trademark-fees-name",
    targetId: "nz-iponz-trademark-fees",
    query: "trade mark fees",
  },
  {
    id: "nz-trademark-practice-guidelines-name",
    targetId: "nz-iponz-trademark-practice-guidelines",
    query: "practice guidelines",
  },
  {
    id: "nz-trademark-classification-name",
    targetId: "nz-iponz-trademark-classification",
    query: "classification specification",
  },
  {
    id: "nz-trademark-hearings-name",
    targetId: "nz-iponz-trademark-hearings",
    query: "trade mark hearings",
  },
'''
if 'targetId: "nz-iponz-trademarks"' not in relevance:
    if probe_anchor not in relevance:
        raise SystemExit("Canada probe anchor not found")
    relevance = relevance.replace(probe_anchor, nz_probes + probe_anchor, 1)
relevance_path.write_text(relevance, encoding="utf-8")

relevance_tests = relevance_test_path.read_text(encoding="utf-8")
for old, new in [
    ("expect(targets).toHaveLength(103);", "expect(targets).toHaveLength(110);"),
    ("expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(103);", "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(110);"),
    ("      103,\n    );\n    expect(targets.every", "      110,\n    );\n    expect(targets.every"),
]:
    if old in relevance_tests:
        relevance_tests = relevance_tests.replace(old, new, 1)
    elif new not in relevance_tests:
        raise SystemExit(f"relevance New Zealand cardinality assertion missing: {old}")
mx_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "MX", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
nz_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "NZ", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
if 'jurisdiction: "NZ", coverageTier: "FOUNDATIONAL"' not in relevance_tests:
    if mx_assertion not in relevance_tests:
        raise SystemExit("MX relevance assertion anchor not found")
    relevance_tests = relevance_tests.replace(mx_assertion, mx_assertion + nz_assertion, 1)
relevance_test_path.write_text(relevance_tests, encoding="utf-8")
