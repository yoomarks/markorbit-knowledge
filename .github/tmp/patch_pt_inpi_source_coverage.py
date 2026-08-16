from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
retrieval_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
retrieval_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


priority = priority_path.read_text()

portugal_block = r'''const INPI_PT: Authority = {
  jurisdiction: "PT",
  authorityName: "Instituto Nacional da Propriedade Industrial (Portugal)",
  languages: ["pt-PT", "en"],
  verificationEvidenceUri: "https://inpi.justica.gov.pt/",
};

export const INPI_PT_SOURCE_COVERAGE_TARGETS = [
  target(INPI_PT, {
    id: "pt-inpi-trademarks",
    family: "PORTAL",
    displayName: "Portugal INPI Trademarks Portal",
    canonicalUri: "https://inpi.justica.gov.pt/",
    notes:
      "The official INPI portal exposes national trademark registration, maintenance and post-registration services.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-filing",
    family: "FILING",
    displayName: "Portugal INPI Online Trademark Filing Guide",
    canonicalUri:
      "https://inpi.justica.gov.pt/Saber-PI/Guias-de-pedido-online/Guia-de-pedido-online-de-marcas-e-logotipos",
    entrypoints: [
      {
        uri: "https://inpi.justica.gov.pt/Saber-PI/Guias-de-pedido-online/Guia-de-pedido-online-de-marcas-e-logotipos",
        label: "Online trademark and logo filing guide",
      },
      {
        uri: "https://servicosonline.inpi.justica.gov.pt/sp-ui-eservices/",
        label: "INPI online trademark services",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://inpi.justica.gov.pt/Saber-PI/Guias-de-pedido-online/Guia-de-pedido-online-de-marcas-e-logotipos",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-search",
    family: "SEARCH",
    displayName: "Portugal INPI Online Trademark Search",
    canonicalUri: "https://servicosonline.inpi.justica.gov.pt/pesquisas/main/marcas.jsp?lang=PT",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://inpi.justica.gov.pt/Saber-PI/Guias-de-pedido-online/Guia-de-pedido-online-de-marcas-e-logotipos",
    notes:
      "The official filing guide directs applicants to INPI databases for a fuller search of earlier trademarks and logos before filing.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-fees",
    family: "FEES",
    displayName: "Portugal INPI Industrial Property Fee Tables",
    canonicalUri: "https://inpi.justica.gov.pt/Documentos/Taxas/Tabelas-de-taxas",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://inpi.justica.gov.pt/Documentos/Taxas/Tabelas-de-taxas",
    notes:
      "The official 2026 industrial property fee table is effective from 1 July 2026.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Portugal INPI International Classifications and Class Lists",
    canonicalUri:
      "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos/Classificacoes-internacionais-e-listas-de-classes",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos/Classificacoes-internacionais-e-listas-de-classes",
    notes:
      "The current trademark classification page publishes the 13th Edition Nice Classification lists and Vienna Classification materials.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-examination-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "Portugal INPI Trademark Examination Guidelines",
    canonicalUri:
      "https://inpi.justica.gov.pt/Noticias-do-INPI/Guia-Pratico-de-Exame-Substancial-de-Marcas-e-Logotipos",
    entrypoints: [
      {
        uri: "https://inpi.justica.gov.pt/Noticias-do-INPI/Guia-Pratico-de-Exame-Substancial-de-Marcas-e-Logotipos",
        label: "Trademark substantive examination guide",
      },
      {
        uri: "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos",
        label: "Current legislation and examination documents hub",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://inpi.justica.gov.pt/Noticias-do-INPI/Guia-Pratico-de-Exame-Substancial-de-Marcas-e-Logotipos",
    notes:
      "The official guide sets out absolute and relative grounds examination criteria for trademarks and logos.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Portugal INPI Industrial Property Code and Trademark Legal Documents",
    canonicalUri: "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos",
    entrypoints: [
      {
        uri: "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos",
        label: "Legislation and other documents",
      },
      {
        uri: "https://servicosonline.inpi.justica.gov.pt/sp-ui-eservices/tm-opposition.htm?execution=e1s1",
        label: "Online trademark opposition service",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://inpi.justica.gov.pt/Documentos/Legislacao-e-outros-documentos",
    notes:
      "The official legal hub provides the Industrial Property Code, formal filing rules, the CPI implementation manual and trademark examination materials.",
  }),
  target(INPI_PT, {
    id: "pt-inpi-industrial-property-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "Portugal INPI Industrial Property Bulletin",
    canonicalUri: "https://inpi.justica.gov.pt/en-gb/Industrial-Property-Bulletin",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://inpi.justica.gov.pt/en-gb/Industrial-Property-Bulletin",
    notes:
      "The Industrial Property Bulletin is published electronically on business days. Publication dates trigger opposition, appeal and notification-compliance periods; the current page lists July 2026 bulletins.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''

priority = replace_once(priority, "const CIPO: Authority = {", portugal_block + "const CIPO: Authority = {", "insert Portugal coverage")
priority = replace_once(
    priority,
    "  ...IPOI_IE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...IPOI_IE_SOURCE_COVERAGE_TARGETS,\n  ...INPI_PT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "aggregate Portugal coverage",
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
catalog = catalog.replace(
    "  IPOI_IE_SOURCE_COVERAGE_TARGETS,\n",
    "  IPOI_IE_SOURCE_COVERAGE_TARGETS,\n  INPI_PT_SOURCE_COVERAGE_TARGETS,\n",
)
if catalog.count("INPI_PT_SOURCE_COVERAGE_TARGETS") != 2:
    raise RuntimeError("catalog: expected Portugal import and export")
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_once(
    priority_test,
    "  IPOI_IE_SOURCE_COVERAGE_TARGETS,\n",
    "  IPOI_IE_SOURCE_COVERAGE_TARGETS,\n  INPI_PT_SOURCE_COVERAGE_TARGETS,\n",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["IE", IPOI_IE_SOURCE_COVERAGE_TARGETS, ["ipoi.gov.ie"]],\n',
    '  ["IE", IPOI_IE_SOURCE_COVERAGE_TARGETS, ["ipoi.gov.ie"]],\n  ["PT", INPI_PT_SOURCE_COVERAGE_TARGETS, ["inpi.justica.gov.pt"]],\n',
    "priority test authority set",
)
priority_test = priority_test.replace(
    'ships explicit, official, unique coverage for twenty-two priority national offices',
    'ships explicit, official, unique coverage for twenty-three priority national offices',
)
priority_test = priority_test.replace("toHaveLength(164)", "toHaveLength(172)", 1)
priority_test = priority_test.replace("toBe(\n      164,\n", "toBe(\n      172,\n", 1)
priority_test = priority_test.replace(").toBe(164);", ").toBe(172);", 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
portugal_probes = r'''  {
    id: "pt-trademarks-name",
    targetId: "pt-inpi-trademarks",
    query: "INPI marcas Portugal registar marca nacional",
  },
  {
    id: "pt-trademark-filing-name",
    targetId: "pt-inpi-trademark-filing",
    query: "pedido online marcas logotipos Portugal",
  },
  {
    id: "pt-trademark-search-name",
    targetId: "pt-inpi-trademark-search",
    query: "pesquisa online marcas INPI Portugal",
  },
  {
    id: "pt-trademark-fees-name",
    targetId: "pt-inpi-trademark-fees",
    query: "tabela taxas propriedade industrial 2026 marcas",
  },
  {
    id: "pt-trademark-classification-name",
    targetId: "pt-inpi-trademark-classification",
    query: "13 edição Classificação Nice produtos serviços marcas",
  },
  {
    id: "pt-trademark-examination-name",
    targetId: "pt-inpi-trademark-examination-guidelines",
    query: "Guidelines Exame motivos absolutos relativos marcas",
  },
  {
    id: "pt-trademark-law-name",
    targetId: "pt-inpi-trademark-law",
    query: "Código Propriedade Industrial marcas Portugal",
  },
'''
retrieval = replace_once(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    portugal_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    "retrieval Portugal probes",
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace("toHaveLength(176)", "toHaveLength(183)", 2)
retrieval_test = retrieval_test.replace("toBe(\n      176,\n", "toBe(\n      183,\n", 1)
retrieval_test = replace_once(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "IE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "IE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "PT", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    "retrieval test Portugal jurisdiction",
)
retrieval_test_path.write_text(retrieval_test)

print("Portugal INPI source coverage patch applied")
