from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
relevance_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
relevance_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")

priority = priority_path.read_text(encoding="utf-8")
es_block = '''const OEPM_ES: Authority = {
  jurisdiction: "ES",
  authorityName: "Oficina Española de Patentes y Marcas",
  languages: ["es-ES"],
  verificationEvidenceUri: "https://www.oepm.es/es/marcas-y-nombres-comerciales",
};

export const OEPM_ES_SOURCE_COVERAGE_TARGETS = [
  target(OEPM_ES, {
    id: "es-oepm-trademarks",
    family: "PORTAL",
    displayName: "OEPM Marcas y nombres comerciales",
    canonicalUri: "https://www.oepm.es/es/marcas-y-nombres-comerciales",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-filing",
    family: "FILING",
    displayName: "OEPM Solicitud de marca",
    canonicalUri:
      "https://www.oepm.es/es/herramientas/Formularios/formularios-de-marcas-y-nombres-comerciales/marcas/solicitud-de-marca/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/herramientas/Formularios/formularios-de-marcas-y-nombres-comerciales/marcas/solicitud-de-marca/",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-search",
    family: "SEARCH",
    displayName: "OEPM Buscador de marcas y nombres comerciales",
    canonicalUri:
      "https://www.oepm.es/es/herramientas/buscador-base-de-datos/buscador-marcas-y-nombres-comerciales/",
    entrypoints: [
      {
        uri: "https://www.oepm.es/es/herramientas/buscador-base-de-datos/buscador-marcas-y-nombres-comerciales/",
        label: "Search tools guidance",
      },
      {
        uri: "https://consultas2.oepm.es/LocalizadorWeb/?no_link=1",
        label: "Localizador de marcas con efectos en España",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/herramientas/buscador-base-de-datos/buscador-marcas-y-nombres-comerciales/",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-fees",
    family: "FEES",
    displayName: "OEPM Tasas de marcas y nombres comerciales",
    canonicalUri: "https://www.oepm.es/es/tasas-y-precios-publicos/tasas-de-marcas-y-nombres-comerciales/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/tasas-y-precios-publicos/tasas-de-marcas-y-nombres-comerciales/",
    notes: "The official fees page publishes the current 2026 trade mark and trade name fee schedule.",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-forms",
    family: "FILING",
    displayName: "OEPM Formularios de marcas y nombres comerciales",
    canonicalUri:
      "https://www.oepm.es/es/herramientas/Formularios/formularios-de-marcas-y-nombres-comerciales/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/herramientas/Formularios/formularios-de-marcas-y-nombres-comerciales/",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-examination-directives",
    family: "EXAMINATION_MANUAL",
    displayName: "OEPM Directrices de examen",
    canonicalUri: "https://www.oepm.es/es/herramientas/Manuales-y-guias/Directrices-de-examen/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/herramientas/Manuales-y-guias/Directrices-de-examen/",
    notes:
      "OEPM announced updated absolute- and relative-ground examination directives on 31 March 2026.",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "OEPM Normativa de marcas y nombres comerciales",
    canonicalUri:
      "https://www.oepm.es/es/conoce-la-propiedad-industrial/normativa-y-jurisprudencia/normativa-marcas-y-nombres-comerciales/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/conoce-la-propiedad-industrial/normativa-y-jurisprudencia/normativa-marcas-y-nombres-comerciales/",
  }),
  target(OEPM_ES, {
    id: "es-oepm-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "OEPM CLINMAR Nice Classification",
    canonicalUri: "https://consultas2.oepm.es/clinmar/inicio",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.oepm.es/es/herramientas/buscador-base-de-datos/buscador-marcas-y-nombres-comerciales/",
    notes:
      "The current CLINMAR interface identifies Nice Classification 13th Edition 2026 and was updated in July 2026.",
  }),
  target(OEPM_ES, {
    id: "es-oepm-bopi-marks",
    family: "OFFICIAL_GAZETTE",
    displayName: "OEPM Boletín Oficial de la Propiedad Industrial - Marcas",
    canonicalUri: "https://consultas2.oepm.es/bopiweb/descargaPublicaciones/",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: false,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF", "XML"],
    verificationEvidenceUri: "https://consultas2.oepm.es/bopiweb/descargaPublicaciones/",
    notes:
      "The official BOPI download service publishes Tome 1 for marks and other distinctive signs with PDF, XML and HTML downloads.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
anchor = "const CIPO: Authority = {"
if "export const OEPM_ES_SOURCE_COVERAGE_TARGETS" not in priority:
    if anchor not in priority:
        raise SystemExit("CIPO insertion anchor not found")
    priority = priority.replace(anchor, es_block + anchor, 1)
aggregate_old = "  ...IPONZ_NZ_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
aggregate_new = "  ...IPONZ_NZ_SOURCE_COVERAGE_TARGETS,\n  ...OEPM_ES_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
if aggregate_old in priority:
    priority = priority.replace(aggregate_old, aggregate_new, 1)
elif aggregate_new not in priority:
    raise SystemExit("priority Spain aggregate anchor not found")
priority_path.write_text(priority, encoding="utf-8")

catalog = catalog_path.read_text(encoding="utf-8")
needle = "  IPONZ_NZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replacement = "  IPONZ_NZ_SOURCE_COVERAGE_TARGETS,\n  OEPM_ES_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replaced = 0
while needle in catalog and replaced < 2:
    catalog = catalog.replace(needle, replacement, 1)
    replaced += 1
if catalog.count("OEPM_ES_SOURCE_COVERAGE_TARGETS") < 2:
    raise SystemExit("catalog Spain import/export integration incomplete")
catalog_path.write_text(catalog, encoding="utf-8")

priority_tests = priority_test_path.read_text(encoding="utf-8")
test_import_old = "  IPONZ_NZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
test_import_new = "  IPONZ_NZ_SOURCE_COVERAGE_TARGETS,\n  OEPM_ES_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
if test_import_old in priority_tests:
    priority_tests = priority_tests.replace(test_import_old, test_import_new, 1)
elif test_import_new not in priority_tests:
    raise SystemExit("priority test Spain import anchor not found")
set_old = '  ["NZ", IPONZ_NZ_SOURCE_COVERAGE_TARGETS, ["iponz.govt.nz"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
set_new = '  ["NZ", IPONZ_NZ_SOURCE_COVERAGE_TARGETS, ["iponz.govt.nz"]],\n  ["ES", OEPM_ES_SOURCE_COVERAGE_TARGETS, ["oepm.es"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
if set_old in priority_tests:
    priority_tests = priority_tests.replace(set_old, set_new, 1)
elif set_new not in priority_tests:
    raise SystemExit("priority test Spain authority set anchor not found")
priority_tests = priority_tests.replace(
    "ships explicit, official, unique coverage for thirteen priority national offices",
    "ships explicit, official, unique coverage for fourteen priority national offices",
)
priority_tests = priority_tests.replace("toHaveLength(89)", "toHaveLength(98)")
priority_tests = priority_tests.replace(".size).toBe(89)", ".size).toBe(98)")
priority_tests = priority_tests.replace(").toBe(89);", ").toBe(98);")
if priority_tests.count("98") < 3:
    raise SystemExit("priority Spain cardinality updates incomplete")
priority_test_path.write_text(priority_tests, encoding="utf-8")

relevance = relevance_path.read_text(encoding="utf-8")
probe_anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
es_probes = '''  {
    id: "es-trademarks-name",
    targetId: "es-oepm-trademarks",
    query: "marcas nombres comerciales",
  },
  {
    id: "es-trademark-filing-name",
    targetId: "es-oepm-trademark-filing",
    query: "solicitud marca",
  },
  {
    id: "es-trademark-search-name",
    targetId: "es-oepm-trademark-search",
    query: "buscar marcas nombres comerciales",
  },
  {
    id: "es-trademark-fees-name",
    targetId: "es-oepm-trademark-fees",
    query: "tasas marcas nombres comerciales",
  },
  {
    id: "es-trademark-forms-name",
    targetId: "es-oepm-trademark-forms",
    query: "formularios marcas nombres comerciales",
  },
  {
    id: "es-trademark-directives-name",
    targetId: "es-oepm-trademark-examination-directives",
    query: "directrices examen marcas",
  },
  {
    id: "es-trademark-law-name",
    targetId: "es-oepm-trademark-law",
    query: "normativa marcas nombres comerciales",
  },
  {
    id: "es-trademark-classification-name",
    targetId: "es-oepm-trademark-classification",
    query: "CLINMAR clasificación Niza",
  },
'''
if 'targetId: "es-oepm-trademarks"' not in relevance:
    if probe_anchor not in relevance:
        raise SystemExit("Canada probe anchor not found")
    relevance = relevance.replace(probe_anchor, es_probes + probe_anchor, 1)
relevance_path.write_text(relevance, encoding="utf-8")

relevance_tests = relevance_test_path.read_text(encoding="utf-8")
for old, new in [
    ("expect(targets).toHaveLength(110);", "expect(targets).toHaveLength(118);"),
    ("expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(110);", "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(118);"),
    ("      110,\n    );\n    expect(targets.every", "      118,\n    );\n    expect(targets.every"),
]:
    if old in relevance_tests:
        relevance_tests = relevance_tests.replace(old, new, 1)
    elif new not in relevance_tests:
        raise SystemExit(f"relevance Spain cardinality assertion missing: {old}")
nz_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "NZ", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
es_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "ES", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
if 'jurisdiction: "ES", coverageTier: "FOUNDATIONAL"' not in relevance_tests:
    if nz_assertion not in relevance_tests:
        raise SystemExit("NZ relevance assertion anchor not found")
    relevance_tests = relevance_tests.replace(nz_assertion, nz_assertion + es_assertion, 1)
relevance_test_path.write_text(relevance_tests, encoding="utf-8")
