from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)


priority_path = "packages/persistence/src/priority-national-source-coverage.ts"
priority = read(priority_path)
if "RDB_RW_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Rwanda coverage already present")

rw_block = r'''const RDB_RW: Authority = {
  jurisdiction: "RW",
  authorityName: "Rwanda Development Board – Office of the Registrar General, Intellectual Property Division",
  languages: ["en", "rw", "fr"],
  verificationEvidenceUri: "https://org.rdb.rw/intellectual-property-rights/",
};

export const RDB_RW_SOURCE_COVERAGE_TARGETS = [
  target(RDB_RW, {
    id: "rw-rdb-trademark-portal",
    family: "PORTAL",
    displayName: "Rwanda Office of the Registrar General – Intellectual Property Rights",
    canonicalUri: "https://org.rdb.rw/intellectual-property-rights/",
    verificationEvidenceUri: "https://org.rdb.rw/intellectual-property-rights/",
    notes:
      "Current RDB Office of the Registrar General intellectual-property portal covering marks and the national registration/protection framework.",
  }),
  target(RDB_RW, {
    id: "rw-rdb-trademark-filing",
    family: "FILING",
    displayName: "Rwanda Register a Trade Mark Procedure",
    canonicalUri: "https://businessprocedures.rdb.rw/procedure/31?l=en",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://businessprocedures.rdb.rw/procedure/31?l=en",
    notes:
      "Official RDB-managed eRegulations procedure covering trademark search, application, examination, publication, opposition, registration and renewal under the current administrative workflow.",
  }),
  target(RDB_RW, {
    id: "rw-rdb-trademark-search",
    family: "SEARCH",
    displayName: "Rwanda Trademark Search Procedure",
    canonicalUri:
      "https://businessprocedures.rdb.rw/procedure/print/31/step/708?embed=true&includeSearch=false&l=en&showCertification=false&showRecourses=true",
    verificationEvidenceUri:
      "https://businessprocedures.rdb.rw/procedure/print/31/step/708?embed=true&includeSearch=false&l=en&showCertification=false&showRecourses=true",
    notes:
      "Official RDB trademark-search step detailing the request, required mark reproduction and Nice classes, current RWF 5,000 search fee and search-result notice.",
  }),
  target(RDB_RW, {
    id: "rw-rdb-trademark-fees",
    family: "FEES",
    displayName: "Rwanda Intellectual Property Fee Tariffs",
    canonicalUri: "https://org.rdb.rw/intellectual-property-rights/fee-tariffs/",
    verificationEvidenceUri: "https://org.rdb.rw/intellectual-property-rights/fee-tariffs/",
    notes:
      "Current ORG fee tariff covering trademark opposition, amendments, renewal and late renewal, international classes, Madrid transmittal, duplicates and IP searches.",
  }),
  target(RDB_RW, {
    id: "rw-rdb-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Rwanda Intellectual Property Legal Documents",
    canonicalUri: "https://org.rdb.rw/legal-documents/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://org.rdb.rw/legal-documents/",
    notes:
      "Official ORG legal-document surface publishing the 2024 intellectual-property law, industrial-property requirements, ministerial orders and related IP policy materials.",
  }),
  target(RDB_RW, {
    id: "rw-rdb-trademark-forms",
    family: "FILING",
    displayName: "Rwanda Trademark Application and Proceedings Forms",
    canonicalUri: "https://org.rdb.rw/intellectual-property-rights/application-forms/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "DOCX"],
    verificationEvidenceUri: "https://org.rdb.rw/intellectual-property-rights/application-forms/",
    notes:
      "Official ORG form library with trademark application, search, amendment, non-use removal and opposition forms.",
  }),
  target(RDB_RW, {
    id: "rw-rdb-ip-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "Rwanda Monthly Industrial Property Journal",
    canonicalUri: "https://org.rdb.rw/intellectual-property-rights/monthly-industrial-property-journal/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://org.rdb.rw/intellectual-property-rights/monthly-industrial-property-journal/",
    notes:
      "Official ORG industrial-property journal with 2026 issues published through July; retained as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", rw_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...URSB_UG_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...URSB_UG_SOURCE_COVERAGE_TARGETS,\n  ...RDB_RW_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "RDB_RW_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Rwanda catalog export already present")
catalog = replace_once(
    catalog,
    "  URSB_UG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  URSB_UG_SOURCE_COVERAGE_TARGETS,\n  RDB_RW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
catalog = replace_once(
    catalog,
    "  URSB_UG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  URSB_UG_SOURCE_COVERAGE_TARGETS,\n  RDB_RW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog export",
)
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  URSB_UG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  URSB_UG_SOURCE_COVERAGE_TARGETS,\n  RDB_RW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["UG", URSB_UG_SOURCE_COVERAGE_TARGETS, ["ursb.go.ug", "uppc.go.ug"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["UG", URSB_UG_SOURCE_COVERAGE_TARGETS, ["ursb.go.ug", "uppc.go.ug"]],\n  ["RW", RDB_RW_SOURCE_COVERAGE_TARGETS, ["rdb.rw"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("seventy-five priority national offices", "seventy-six priority national offices")
priority_test = priority_test.replace("toHaveLength(612)", "toHaveLength(619)", 1)
priority_test = priority_test.replace("    612,\n", "    619,\n", 1)
priority_test = priority_test.replace(").toBe(612);", ").toBe(619);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "rw-rdb-trademark-portal-name" in retrieval:
    raise SystemExit("Rwanda retrieval probes already present")
probes = r'''  {
    id: "rw-rdb-trademark-portal-name",
    targetId: "rw-rdb-trademark-portal",
    query: "Rwanda Office Registrar General intellectual property trademark",
  },
  {
    id: "rw-rdb-trademark-filing-name",
    targetId: "rw-rdb-trademark-filing",
    query: "Rwanda register a trade mark search application examination publication opposition",
  },
  {
    id: "rw-rdb-trademark-search-name",
    targetId: "rw-rdb-trademark-search",
    query: "Rwanda request trademark search Nice classification search result notice",
  },
  {
    id: "rw-rdb-trademark-fees-name",
    targetId: "rw-rdb-trademark-fees",
    query: "Rwanda trademark opposition renewal international classes search fees",
  },
  {
    id: "rw-rdb-trademark-legal-texts-name",
    targetId: "rw-rdb-trademark-legal-texts",
    query: "Rwanda IP Law 055/2024 intellectual property legal documents",
  },
  {
    id: "rw-rdb-trademark-forms-name",
    targetId: "rw-rdb-trademark-forms",
    query: "Rwanda trademark application search amendment non-use opposition forms",
  },
'''
closing = "] satisfies readonly RetrievalRelevanceProbe[];"
pos = retrieval.find(closing)
if pos < 0:
    raise SystemExit("missing retrieval probe array closing")
retrieval = retrieval[:pos] + probes + retrieval[pos:]
write(retrieval_path, retrieval)

retrieval_test_path = "packages/persistence/tests/retrieval-relevance-audit.test.ts"
retrieval_test = read(retrieval_test_path)
retrieval_test = retrieval_test.replace("toHaveLength(569)", "toHaveLength(575)", 2)
retrieval_test = retrieval_test.replace("      569,\n", "      575,\n", 1)
rw_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "RW", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "UG", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + rw_assertion, "retrieval Rwanda jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Rwanda RDB trademark source coverage patch applied")
