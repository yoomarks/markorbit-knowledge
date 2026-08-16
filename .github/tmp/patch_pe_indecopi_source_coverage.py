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
if "INDECOPI_PE_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Peru coverage already present")

pe_block = r'''const INDECOPI_PE: Authority = {
  jurisdiction: "PE",
  authorityName:
    "Instituto Nacional de Defensa de la Competencia y de la Protección de la Propiedad Intelectual (INDECOPI)",
  languages: ["es"],
  verificationEvidenceUri: "https://www.gob.pe/institucion/indecopi/tema/registra-tu-marca",
};

export const INDECOPI_PE_SOURCE_COVERAGE_TARGETS = [
  target(INDECOPI_PE, {
    id: "pe-indecopi-trademark-portal",
    family: "PORTAL",
    displayName: "Peru INDECOPI Trademarks Portal",
    canonicalUri: "https://www.gob.pe/institucion/indecopi/tema/registra-tu-marca",
    verificationEvidenceUri: "https://www.gob.pe/institucion/indecopi/tema/registra-tu-marca",
  }),
  target(INDECOPI_PE, {
    id: "pe-indecopi-trademark-filing",
    family: "FILING",
    displayName: "Peru INDECOPI Trademark Registration",
    canonicalUri:
      "https://www.gob.pe/institucion/indecopi/pages/333-registrar-la-marca-de-producto-o-servicio-de-tu-negocio-en-indecopi",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.gob.pe/institucion/indecopi/pages/333-registrar-la-marca-de-producto-o-servicio-de-tu-negocio-en-indecopi",
    notes:
      "Current public INDECOPI filing guidance links the Registro Virtual de Marcas and documents the online registration path, requirements, publication and examination stages.",
  }),
  target(INDECOPI_PE, {
    id: "pe-indecopi-trademark-search",
    family: "SEARCH",
    displayName: "Peru INDECOPI Busca tu marca",
    canonicalUri:
      "https://www.gob.pe/institucion/indecopi/pages/16475-buscar-una-marca-o-servicio-registrado-busca-tu-marca",
    verificationEvidenceUri:
      "https://www.gob.pe/institucion/indecopi/pages/16475-buscar-una-marca-o-servicio-registrado-busca-tu-marca",
    notes:
      "Official public search entry point for checking identical or similar registered and pending signs by name, owner and phonetic criteria.",
  }),
  target(INDECOPI_PE, {
    id: "pe-indecopi-tupa-2026",
    family: "FEES",
    displayName: "Peru INDECOPI TUPA Consolidated 2026",
    canonicalUri:
      "https://www.gob.pe/institucion/indecopi/normas-legales/8133230-000047-2026-pre-indecopi-consolidado",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.gob.pe/institucion/indecopi/normas-legales/8133230-000047-2026-pre-indecopi-consolidado",
    notes:
      "Official consolidated 2026 Texto Único de Procedimientos Administrativos, published 14 May 2026, for current INDECOPI procedures and administrative fees.",
  }),
  target(INDECOPI_PE, {
    id: "pe-indecopi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Peru INDECOPI Peruanized Goods and Services Search",
    canonicalUri:
      "https://www.gob.pe/institucion/indecopi/pages/15455-buscar-productos-y-servicios-para-registrar-tu-marca-buscador-peruanizado",
    verificationEvidenceUri:
      "https://www.gob.pe/institucion/indecopi/pages/15455-buscar-productos-y-servicios-para-registrar-tu-marca-buscador-peruanizado",
  }),
  target(INDECOPI_PE, {
    id: "pe-indecopi-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Peru INDECOPI Industrial Property Decisions",
    canonicalUri: "https://www.gob.pe/institucion/indecopi/normas-legales/tipos/131-decision",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gob.pe/institucion/indecopi/normas-legales/tipos/131-decision",
    notes:
      "Official INDECOPI legal index includes Decision 486-CAN, the mandatory Andean Community Common Industrial Property Regime governing trademarks in Peru.",
  }),
  target(INDECOPI_PE, {
    id: "pe-indecopi-trademark-opposition",
    family: "PROCEEDINGS",
    displayName: "Peru INDECOPI Trademark Opposition Procedure",
    canonicalUri: "https://www.gob.pe/10907-presentar-oposicion-al-registro-de-una-marca-de-signos-distintivos",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.gob.pe/10907-presentar-oposicion-al-registro-de-una-marca-de-signos-distintivos",
  }),
  target(INDECOPI_PE, {
    id: "pe-indecopi-trademark-renewal",
    family: "MAINTENANCE",
    displayName: "Peru INDECOPI Trademark Renewal",
    canonicalUri: "https://www.gob.pe/17064-renovar-el-registro-de-marca",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gob.pe/17064-renovar-el-registro-de-marca",
  }),
  target(INDECOPI_PE, {
    id: "pe-indecopi-industrial-property-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Peru INDECOPI Electronic Industrial Property Gazette",
    canonicalUri:
      "https://www.gob.pe/15748-buscar-publicaciones-en-la-gaceta-electronica-de-propiedad-industrial",
    coverageTier: "CHANGE_SIGNAL",
    verificationEvidenceUri:
      "https://www.gob.pe/15748-buscar-publicaciones-en-la-gaceta-electronica-de-propiedad-industrial",
    notes:
      "Official public entry point to the electronic industrial-property Gazette; retained as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", pe_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...INPI_AR_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...INPI_AR_SOURCE_COVERAGE_TARGETS,\n  ...INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "INDECOPI_PE_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Peru catalog export already present")
catalog = replace_once(
    catalog,
    "  INPI_AR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  INPI_AR_SOURCE_COVERAGE_TARGETS,\n  INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...INPI_AR_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...INPI_AR_SOURCE_COVERAGE_TARGETS,\n",
        "  ...INPI_AR_SOURCE_COVERAGE_TARGETS,\n  ...INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  INPI_AR_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  INPI_AR_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  INPI_AR_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  INPI_AR_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  INPI_AR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  INPI_AR_SOURCE_COVERAGE_TARGETS,\n  INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["AR", INPI_AR_SOURCE_COVERAGE_TARGETS, ["argentina.gob.ar", "inpi.gob.ar"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["AR", INPI_AR_SOURCE_COVERAGE_TARGETS, ["argentina.gob.ar", "inpi.gob.ar"]],\n  ["PE", INDECOPI_PE_SOURCE_COVERAGE_TARGETS, ["gob.pe"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("sixty priority national offices", "sixty-one priority national offices")
priority_test = priority_test.replace("toHaveLength(478)", "toHaveLength(487)", 1)
priority_test = priority_test.replace("    478,\n", "    487,\n", 1)
priority_test = priority_test.replace(").toBe(478);", ").toBe(487);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "pe-indecopi-trademark-portal-name" in retrieval:
    raise SystemExit("Peru retrieval probes already present")
probes = r'''  {
    id: "pe-indecopi-trademark-portal-name",
    targetId: "pe-indecopi-trademark-portal",
    query: "registra tu marca",
  },
  {
    id: "pe-indecopi-trademark-filing-name",
    targetId: "pe-indecopi-trademark-filing",
    query: "registro virtual de marcas",
  },
  {
    id: "pe-indecopi-trademark-search-name",
    targetId: "pe-indecopi-trademark-search",
    query: "busca tu marca",
  },
  {
    id: "pe-indecopi-tupa-2026-name",
    targetId: "pe-indecopi-tupa-2026",
    query: "TUPA consolidado 2026",
  },
  {
    id: "pe-indecopi-trademark-classification-name",
    targetId: "pe-indecopi-trademark-classification",
    query: "buscador peruanizado",
  },
  {
    id: "pe-indecopi-trademark-legal-texts-name",
    targetId: "pe-indecopi-trademark-legal-texts",
    query: "Decisión 486 propiedad industrial",
  },
  {
    id: "pe-indecopi-trademark-opposition-name",
    targetId: "pe-indecopi-trademark-opposition",
    query: "oposición registro marca",
  },
  {
    id: "pe-indecopi-trademark-renewal-name",
    targetId: "pe-indecopi-trademark-renewal",
    query: "renovar registro marca",
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
retrieval_test = retrieval_test.replace("toHaveLength(450)", "toHaveLength(458)", 2)
retrieval_test = retrieval_test.replace("      450,\n", "      458,\n", 1)
pe_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "PE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "AR", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + pe_assertion, "retrieval Peru jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Peru INDECOPI source coverage patch applied")
