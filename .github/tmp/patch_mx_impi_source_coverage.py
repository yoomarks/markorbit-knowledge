from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
relevance_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
relevance_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")

priority = priority_path.read_text(encoding="utf-8")
mx_block = '''const IMPI_MX: Authority = {
  jurisdiction: "MX",
  authorityName: "Instituto Mexicano de la Propiedad Industrial",
  languages: ["es-MX"],
  verificationEvidenceUri: "https://www.gob.mx/impi/documentos/registro-de-marcas",
};

export const IMPI_MX_SOURCE_COVERAGE_TARGETS = [
  target(IMPI_MX, {
    id: "mx-impi-trademarks",
    family: "PORTAL",
    displayName: "Mexico IMPI Trademarks",
    canonicalUri: "https://www.gob.mx/impi/acciones-y-programas/servicios-que-ofrece-el-impi-marcas",
    verificationEvidenceUri: "https://www.gob.mx/impi/documentos/registro-de-marcas",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-filing",
    family: "FILING",
    displayName: "Mexico IMPI Trademark Filing",
    canonicalUri: "https://www.gob.mx/impi/documentos/registro-de-marcas",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gob.mx/impi/documentos/registro-de-marcas",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-search",
    family: "SEARCH",
    displayName: "Mexico IMPI Trademark Search MARCia",
    canonicalUri: "https://marcia.impi.gob.mx/marcas/search/quick",
    entrypoints: [
      { uri: "https://marcia.impi.gob.mx/marcas/search/quick", label: "MARCia quick search" },
      { uri: "https://www.gob.mx/impi/documentos/registro-de-marcas", label: "IMPI trademark guidance" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "IMAGE"],
    verificationEvidenceUri: "https://www.gob.mx/impi/documentos/registro-de-marcas",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-fees",
    family: "FEES",
    displayName: "Mexico IMPI Trademark Fees",
    canonicalUri: "https://www.gob.mx/impi/acciones-y-programas/servicios-que-ofrece-el-impi-tarifas-215115",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.gob.mx/impi/acciones-y-programas/servicios-que-ofrece-el-impi-tarifas-215115",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-forms",
    family: "FILING",
    displayName: "Mexico IMPI Trademark Forms",
    canonicalUri: "https://www.gob.mx/impi/acciones-y-programas/servicios-que-ofrece-el-impi-formatos",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.gob.mx/impi/acciones-y-programas/servicios-que-ofrece-el-impi-formatos",
  }),
  target(IMPI_MX, {
    id: "mx-impi-legal-framework",
    family: "LEGAL_TEXTS",
    displayName: "Mexico IMPI Industrial Property Legal Framework",
    canonicalUri: "https://www.gob.mx/impi/documentos/marco-juridico-nacional-274326",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gob.mx/impi/documentos/marco-juridico-nacional-274326",
    notes:
      "The official IMPI legal framework hub tracks current legislation and regulations; it states that the Diario Oficial de la Federación remains the legally authoritative publication.",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Mexico IMPI Trademark Classification ClasNiza",
    canonicalUri: "https://clasniza.impi.gob.mx/buscador",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://clasniza.impi.gob.mx/",
  }),
  target(IMPI_MX, {
    id: "mx-impi-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Mexico IMPI Gaceta de la Propiedad Industrial",
    canonicalUri: "https://siga.impi.gob.mx/inicio",
    entrypoints: [
      { uri: "https://siga.impi.gob.mx/inicio", label: "SIGA 2.0" },
      {
        uri: "https://www.gob.mx/impi/acciones-y-programas/gaceta-de-la-propiedad-industrial",
        label: "Official Gaceta guidance",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.gob.mx/impi/acciones-y-programas/gaceta-de-la-propiedad-industrial",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
anchor = "const CIPO: Authority = {"
if "export const IMPI_MX_SOURCE_COVERAGE_TARGETS" not in priority:
    if anchor not in priority:
        raise SystemExit("CIPO insertion anchor not found")
    priority = priority.replace(anchor, mx_block + anchor, 1)
aggregate_old = "  ...INPI_BR_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
aggregate_new = "  ...INPI_BR_SOURCE_COVERAGE_TARGETS,\n  ...IMPI_MX_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
if aggregate_old in priority:
    priority = priority.replace(aggregate_old, aggregate_new, 1)
elif aggregate_new not in priority:
    raise SystemExit("priority Mexico aggregate anchor not found")
priority_path.write_text(priority, encoding="utf-8")

catalog = catalog_path.read_text(encoding="utf-8")
needle = "  INPI_BR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replacement = "  INPI_BR_SOURCE_COVERAGE_TARGETS,\n  IMPI_MX_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replaced = 0
while needle in catalog and replaced < 2:
    catalog = catalog.replace(needle, replacement, 1)
    replaced += 1
if catalog.count("IMPI_MX_SOURCE_COVERAGE_TARGETS") < 2:
    raise SystemExit("catalog Mexico import/export integration incomplete")
catalog_path.write_text(catalog, encoding="utf-8")

priority_tests = priority_test_path.read_text(encoding="utf-8")
test_import_old = "  INPI_BR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
test_import_new = "  INPI_BR_SOURCE_COVERAGE_TARGETS,\n  IMPI_MX_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
if test_import_old in priority_tests:
    priority_tests = priority_tests.replace(test_import_old, test_import_new, 1)
elif test_import_new not in priority_tests:
    raise SystemExit("priority test Mexico import anchor not found")
set_old = '  ["BR", INPI_BR_SOURCE_COVERAGE_TARGETS, ["gov.br", "inpi.gov.br"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
set_new = '  ["BR", INPI_BR_SOURCE_COVERAGE_TARGETS, ["gov.br", "inpi.gov.br"]],\n  ["MX", IMPI_MX_SOURCE_COVERAGE_TARGETS, ["gob.mx", "impi.gob.mx"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
if set_old in priority_tests:
    priority_tests = priority_tests.replace(set_old, set_new, 1)
elif set_new not in priority_tests:
    raise SystemExit("priority test Mexico authority set anchor not found")
priority_tests = priority_tests.replace(
    "ships explicit, official, unique coverage for eleven priority national offices",
    "ships explicit, official, unique coverage for twelve priority national offices",
)
priority_tests = priority_tests.replace("toHaveLength(73)", "toHaveLength(81)")
priority_tests = priority_tests.replace(".size).toBe(73)", ".size).toBe(81)")
priority_tests = priority_tests.replace(").toBe(73);", ").toBe(81);")
if priority_tests.count("81") < 3:
    raise SystemExit("priority Mexico cardinality updates incomplete")
priority_test_path.write_text(priority_tests, encoding="utf-8")

relevance = relevance_path.read_text(encoding="utf-8")
probe_anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
mx_probes = '''  {
    id: "mx-trademarks-name",
    targetId: "mx-impi-trademarks",
    query: "Mexico IMPI trademarks",
  },
  {
    id: "mx-trademark-filing-name",
    targetId: "mx-impi-trademark-filing",
    query: "trademark filing",
  },
  {
    id: "mx-trademark-search-name",
    targetId: "mx-impi-trademark-search",
    query: "trademark search MARCia",
  },
  {
    id: "mx-trademark-fees-name",
    targetId: "mx-impi-trademark-fees",
    query: "trademark fees",
  },
  {
    id: "mx-trademark-forms-name",
    targetId: "mx-impi-trademark-forms",
    query: "trademark forms",
  },
  {
    id: "mx-legal-framework-name",
    targetId: "mx-impi-legal-framework",
    query: "industrial property legal framework",
  },
  {
    id: "mx-trademark-classification-name",
    targetId: "mx-impi-trademark-classification",
    query: "trademark classification ClasNiza",
  },
'''
if 'targetId: "mx-impi-trademarks"' not in relevance:
    if probe_anchor not in relevance:
        raise SystemExit("Canada probe anchor not found")
    relevance = relevance.replace(probe_anchor, mx_probes + probe_anchor, 1)
relevance_path.write_text(relevance, encoding="utf-8")

relevance_tests = relevance_test_path.read_text(encoding="utf-8")
for old, new in [
    ("expect(targets).toHaveLength(96);", "expect(targets).toHaveLength(103);"),
    ("expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(96);", "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(103);"),
    (".size).toBe(96);", ".size).toBe(103);"),
]:
    if old in relevance_tests:
        relevance_tests = relevance_tests.replace(old, new, 1)
    elif new not in relevance_tests:
        raise SystemExit(f"relevance Mexico cardinality assertion missing: {old}")
br_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "BR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
mx_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "MX", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
if 'jurisdiction: "MX", coverageTier: "FOUNDATIONAL"' not in relevance_tests:
    if br_assertion not in relevance_tests:
        raise SystemExit("BR relevance assertion anchor not found")
    relevance_tests = relevance_tests.replace(br_assertion, br_assertion + mx_assertion, 1)
relevance_test_path.write_text(relevance_tests, encoding="utf-8")
