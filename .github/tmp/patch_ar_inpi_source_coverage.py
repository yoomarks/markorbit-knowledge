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
if "INPI_AR_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Argentina coverage already present")

ar_block = r'''const INPI_AR: Authority = {
  jurisdiction: "AR",
  authorityName: "Instituto Nacional de la Propiedad Industrial (INPI Argentina)",
  languages: ["es"],
  verificationEvidenceUri: "https://www.argentina.gob.ar/inpi/marcas",
};

export const INPI_AR_SOURCE_COVERAGE_TARGETS = [
  target(INPI_AR, {
    id: "ar-inpi-trademark-portal",
    family: "PORTAL",
    displayName: "Argentina INPI Trademarks Portal",
    canonicalUri: "https://www.argentina.gob.ar/inpi/marcas",
    verificationEvidenceUri: "https://www.argentina.gob.ar/inpi/marcas",
  }),
  target(INPI_AR, {
    id: "ar-inpi-trademark-filing",
    family: "FILING",
    displayName: "Argentina INPI Online New Trademark Filing",
    canonicalUri: "https://portaltramites.inpi.gob.ar/Marcas/Nuevas",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "IMAGE"],
    verificationEvidenceUri: "https://www.argentina.gob.ar/inpi/marcas/registrar-una-marca",
    notes:
      "Official INPI transaction surface for electronically preparing, signing and paying a new trademark application.",
  }),
  target(INPI_AR, {
    id: "ar-inpi-trademark-search",
    family: "SEARCH",
    displayName: "Argentina INPI Trademark Search",
    canonicalUri: "https://portaltramites.inpi.gob.ar/marcasconsultas/busqueda",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.argentina.gob.ar/inpi/marcas/averigua-si-tu-marca-esta-registrada",
  }),
  target(INPI_AR, {
    id: "ar-inpi-trademark-fees",
    family: "FEES",
    displayName: "Argentina INPI Current Fees",
    canonicalUri: "https://www.argentina.gob.ar/inpi/aranceles-inpi",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.argentina.gob.ar/inpi/aranceles-inpi",
    notes: "INPI states that the current fee schedule was updated effective 1 April 2026.",
  }),
  target(INPI_AR, {
    id: "ar-inpi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Argentina INPI Trademark Classification",
    canonicalUri: "https://www.argentina.gob.ar/inpi/marcas/clasificacion-de-marcas",
    verificationEvidenceUri: "https://www.argentina.gob.ar/inpi/marcas/clasificacion-de-marcas",
  }),
  target(INPI_AR, {
    id: "ar-inpi-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Argentina INPI Trademark Legislation",
    canonicalUri: "https://www.argentina.gob.ar/inpi/marcas/legislacion-de-marcas",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.argentina.gob.ar/inpi/marcas/legislacion-de-marcas",
    notes: "Official INPI index for Trademark Law No. 22,362 and related trademark legislation.",
  }),
  target(INPI_AR, {
    id: "ar-inpi-trademark-opposition",
    family: "PROCEEDINGS",
    displayName: "Argentina INPI Trademark Opposition Procedure",
    canonicalUri: "https://www.argentina.gob.ar/servicio/oponerse-una-marca",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.argentina.gob.ar/servicio/oponerse-una-marca",
  }),
  target(INPI_AR, {
    id: "ar-inpi-trademark-renewal",
    family: "MAINTENANCE",
    displayName: "Argentina INPI Trademark Renewal",
    canonicalUri: "https://www.argentina.gob.ar/inpi/marcas/renovar-una-marca",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.argentina.gob.ar/inpi/marcas/renovar-una-marca",
  }),
  target(INPI_AR, {
    id: "ar-inpi-trademark-bulletins",
    family: "OFFICIAL_GAZETTE",
    displayName: "Argentina INPI Trademark Bulletins",
    canonicalUri: "https://portaltramites.inpi.gob.ar/Boletines?Tipo_Item=3",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://portaltramites.inpi.gob.ar/Boletines?Tipo_Item=3",
    notes:
      "The official INPI trademark bulletin index is retained as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", ar_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n  ...INPI_AR_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "INPI_AR_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Argentina catalog export already present")
catalog = replace_once(
    catalog,
    "  OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n  INPI_AR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...OMPIC_MA_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n",
        "  ...OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n  ...INPI_AR_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  INPI_AR_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n  INPI_AR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["MA", OMPIC_MA_SOURCE_COVERAGE_TARGETS, ["ompic.ma", "directompic.ma"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["MA", OMPIC_MA_SOURCE_COVERAGE_TARGETS, ["ompic.ma", "directompic.ma"]],\n  ["AR", INPI_AR_SOURCE_COVERAGE_TARGETS, ["argentina.gob.ar", "inpi.gob.ar"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("fifty-nine priority national offices", "sixty priority national offices")
priority_test = priority_test.replace("toHaveLength(469)", "toHaveLength(478)", 1)
priority_test = priority_test.replace("    469,\n", "    478,\n", 1)
priority_test = priority_test.replace(").toBe(469);", ").toBe(478);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "ar-inpi-trademark-portal-name" in retrieval:
    raise SystemExit("Argentina retrieval probes already present")
probes = r'''  {
    id: "ar-inpi-trademark-portal-name",
    targetId: "ar-inpi-trademark-portal",
    query: "marcas",
  },
  {
    id: "ar-inpi-trademark-filing-name",
    targetId: "ar-inpi-trademark-filing",
    query: "solicitud nueva marca",
  },
  {
    id: "ar-inpi-trademark-search-name",
    targetId: "ar-inpi-trademark-search",
    query: "buscador de marcas",
  },
  {
    id: "ar-inpi-trademark-fees-name",
    targetId: "ar-inpi-trademark-fees",
    query: "aranceles marcas",
  },
  {
    id: "ar-inpi-trademark-classification-name",
    targetId: "ar-inpi-trademark-classification",
    query: "clasificación de marcas",
  },
  {
    id: "ar-inpi-trademark-legal-texts-name",
    targetId: "ar-inpi-trademark-legal-texts",
    query: "ley de marcas",
  },
  {
    id: "ar-inpi-trademark-opposition-name",
    targetId: "ar-inpi-trademark-opposition",
    query: "oponerse a una marca",
  },
  {
    id: "ar-inpi-trademark-renewal-name",
    targetId: "ar-inpi-trademark-renewal",
    query: "renovar una marca",
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
retrieval_test = retrieval_test.replace("toHaveLength(442)", "toHaveLength(450)", 2)
retrieval_test = retrieval_test.replace("      442,\n", "      450,\n", 1)
ar_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "AR", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "MA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + ar_assertion, "retrieval Argentina jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Argentina INPI source coverage patch applied")
