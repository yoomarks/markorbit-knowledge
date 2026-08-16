from pathlib import Path

coverage_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")

coverage = coverage_path.read_text(encoding="utf-8")
ipos_block = r'''const IPOS: Authority = {
  jurisdiction: "SG",
  authorityName: "Intellectual Property Office of Singapore",
  languages: ["en-SG"],
  verificationEvidenceUri: "https://www.ipos.gov.sg/about-ip/trade-marks/introduction-trade-marks/",
};

export const IPOS_SOURCE_COVERAGE_TARGETS = [
  target(IPOS, {
    id: "sg-ipos-trademarks",
    family: "PORTAL",
    displayName: "IPOS Introduction to Trade Marks",
    canonicalUri: "https://www.ipos.gov.sg/about-ip/trade-marks/introduction-trade-marks/",
  }),
  target(IPOS, {
    id: "sg-ipos-trademark-registration",
    family: "FILING",
    displayName: "IPOS How to Register Trade Marks",
    canonicalUri: "https://www.ipos.gov.sg/about-ip/trade-marks/how-to-register/",
    verificationEvidenceUri: "https://www.ipos.gov.sg/about-ip/trade-marks/how-to-register/",
  }),
  target(IPOS, {
    id: "sg-ipos-trademark-search",
    family: "SEARCH",
    displayName: "IPOS Digital Hub Trade Mark Search and Enquiry",
    canonicalUri: "https://digitalhub.ipos.gov.sg/FAMN/eservice/IP4SG/MN_AdvancedSearch",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.ipos.gov.sg/about-ip/trade-marks/introduction-trade-marks/",
  }),
  target(IPOS, {
    id: "sg-ipos-trademark-forms-fees",
    family: "FEES",
    displayName: "IPOS Trade Mark Forms and Fees",
    canonicalUri: "https://www.ipos.gov.sg/about-ip/trade-marks/forms-and-fees/",
    verificationEvidenceUri: "https://www.ipos.gov.sg/about-ip/trade-marks/forms-and-fees/",
  }),
  target(IPOS, {
    id: "sg-ipos-trademark-guides-work-manual",
    family: "EXAMINATION_MANUAL",
    displayName: "IPOS Trade Marks Guides and Work Manual",
    canonicalUri: "https://www.ipos.gov.sg/about-ip/trade-marks/tm-guides/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.ipos.gov.sg/about-ip/trade-marks/tm-guides/",
  }),
  target(IPOS, {
    id: "sg-ipos-trademark-circulars-practice-directions",
    family: "POLICY_NOTICES",
    displayName: "IPOS Trade Mark Circulars and Practice Directions",
    canonicalUri: "https://www.ipos.gov.sg/about-ip/trade-marks/circulars-and-practice-directions/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.ipos.gov.sg/about-ip/trade-marks/circulars-and-practice-directions/",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
anchor = "const CIPO: Authority = {"
if "export const IPOS_SOURCE_COVERAGE_TARGETS" not in coverage:
    if anchor not in coverage:
        raise SystemExit("CIPO insertion anchor not found")
    coverage = coverage.replace(anchor, ipos_block + anchor, 1)

aggregate_old = '''  ...UKIPO_SOURCE_COVERAGE_TARGETS,\n  ...IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,'''
aggregate_new = '''  ...UKIPO_SOURCE_COVERAGE_TARGETS,\n  ...IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  ...IPOS_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,'''
if aggregate_old in coverage:
    coverage = coverage.replace(aggregate_old, aggregate_new, 1)
elif aggregate_new not in coverage:
    raise SystemExit("priority aggregate anchor not found")
coverage_path.write_text(coverage, encoding="utf-8")

catalog = catalog_path.read_text(encoding="utf-8")
import_old = '''  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  JPO_SOURCE_COVERAGE_TARGETS,'''
import_new = '''  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,\n  JPO_SOURCE_COVERAGE_TARGETS,'''
if import_old in catalog:
    catalog = catalog.replace(import_old, import_new, 1)
elif import_new not in catalog:
    raise SystemExit("catalog import anchor not found")
export_old = '''  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  JPO_SOURCE_COVERAGE_TARGETS,'''
# The same text occurs once more in the export block after the import was changed.
if export_old in catalog:
    catalog = catalog.replace(export_old, import_new, 1)
if catalog.count("IPOS_SOURCE_COVERAGE_TARGETS") < 2:
    raise SystemExit("catalog IPOS import/export integration incomplete")
catalog_path.write_text(catalog, encoding="utf-8")

tests = test_path.read_text(encoding="utf-8")
test_import_old = '''  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  JPO_SOURCE_COVERAGE_TARGETS,'''
test_import_new = '''  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,\n  JPO_SOURCE_COVERAGE_TARGETS,'''
if test_import_old in tests:
    tests = tests.replace(test_import_old, test_import_new, 1)
elif test_import_new not in tests:
    raise SystemExit("test import anchor not found")
set_old = '''  ["AU", IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS, ["ipaustralia.gov.au"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'''
set_new = '''  ["AU", IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS, ["ipaustralia.gov.au"]],\n  ["SG", IPOS_SOURCE_COVERAGE_TARGETS, ["ipos.gov.sg"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'''
if set_old in tests:
    tests = tests.replace(set_old, set_new, 1)
elif set_new not in tests:
    raise SystemExit("authority set anchor not found")
tests = tests.replace(
    'ships explicit, official, unique coverage for six priority national offices',
    'ships explicit, official, unique coverage for seven priority national offices',
)
tests = tests.replace('toHaveLength(34)', 'toHaveLength(40)')
tests = tests.replace(').size).toBe(34)', ').size).toBe(40)')
if '"SG", IPOS_SOURCE_COVERAGE_TARGETS' not in tests or 'toHaveLength(40)' not in tests:
    raise SystemExit("IPOS test integration incomplete")
test_path.write_text(tests, encoding="utf-8")
