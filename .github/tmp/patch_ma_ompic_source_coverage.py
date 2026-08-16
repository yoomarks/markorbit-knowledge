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
if "OMPIC_MA_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Morocco coverage already present")

ma_block = r'''const OMPIC_MA: Authority = {
  jurisdiction: "MA",
  authorityName: "Moroccan Office of Industrial and Commercial Property (OMPIC)",
  languages: ["fr", "ar"],
  verificationEvidenceUri: "https://www.ompic.ma/fr/content/depot-de-marque-au-maroc",
};

export const OMPIC_MA_SOURCE_COVERAGE_TARGETS = [
  target(OMPIC_MA, {
    id: "ma-ompic-trademark-portal",
    family: "PORTAL",
    displayName: "Morocco OMPIC Trademark Portal",
    canonicalUri: "https://www.ompic.ma/fr/content/propos-de-la-marque",
    verificationEvidenceUri: "https://www.ompic.ma/fr/content/propos-de-la-marque",
  }),
  target(OMPIC_MA, {
    id: "ma-ompic-trademark-filing",
    family: "FILING",
    displayName: "Morocco DirectOMPIC Online Trademark Filing",
    canonicalUri: "https://marque.directompic.ma/demarche/marque/depot/form",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.ompic.ma/fr/actualites/mise-en-service-dune-nouvelle-version-de-la-plateforme-directompic",
    notes:
      "DirectOMPIC is OMPIC's authenticated electronic filing surface for trademark applications and related online formalities.",
  }),
  target(OMPIC_MA, {
    id: "ma-ompic-trademark-search",
    family: "SEARCH",
    displayName: "Morocco OMPIC National Trademark Search",
    canonicalUri: "https://www.ompic.ma/fr/content/recherche-sur-les-marques-nationales",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.ompic.ma/fr/content/recherche-dans-les-bases-de-donees-ompic",
  }),
  target(OMPIC_MA, {
    id: "ma-ompic-trademark-forms",
    family: "FILING",
    displayName: "Morocco OMPIC Trademark Forms",
    canonicalUri: "https://www.ompic.ma/fr/content/formulaires",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.ompic.ma/fr/content/formulaires",
  }),
  target(OMPIC_MA, {
    id: "ma-ompic-trademark-fees",
    family: "FEES",
    displayName: "Morocco OMPIC Fees",
    canonicalUri: "https://www.ompic.ma/fr/content/nos-tarifs",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.ompic.ma/fr/content/nos-tarifs",
  }),
  target(OMPIC_MA, {
    id: "ma-ompic-nice-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Morocco OMPIC Nice Classification",
    canonicalUri: "https://www.ompic.ma/fr/content/classification-de-nice",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.ompic.ma/fr/content/classification-de-nice",
  }),
  target(OMPIC_MA, {
    id: "ma-ompic-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Morocco OMPIC Industrial Property Laws and Regulations",
    canonicalUri: "https://www.ompic.ma/fr/content/lois-et-reglementations",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.ompic.ma/fr/content/lois-et-reglementations",
  }),
  target(OMPIC_MA, {
    id: "ma-ompic-trademark-opposition",
    family: "PROCEEDINGS",
    displayName: "Morocco OMPIC Trademark Opposition Procedure",
    canonicalUri: "https://www.ompic.ma/fr/respect-droit/mecanismes-juridiques",
    verificationEvidenceUri: "https://www.ompic.ma/fr/respect-droit/mecanismes-juridiques",
  }),
  target(OMPIC_MA, {
    id: "ma-ompic-trademark-official-catalogue",
    family: "OFFICIAL_GAZETTE",
    displayName: "Morocco OMPIC Official Trademark Catalogue",
    canonicalUri: "https://www.ompic.ma/fr/content/catalogue-officiel-des-marques",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.ompic.ma/fr/content/catalogue-officiel-des-marques",
    notes:
      "OMPIC publishes the official trademark catalogue twice monthly; retain it as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", ma_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n  ...OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "OMPIC_MA_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Morocco catalog export already present")
catalog = replace_once(
    catalog,
    "  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n  OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...ISIPO_IS_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n",
        "  ...ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n  ...OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  ISIPO_IS_SOURCE_COVERAGE_TARGETS,\n  OMPIC_MA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["IS", ISIPO_IS_SOURCE_COVERAGE_TARGETS, ["hugverk.is"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["IS", ISIPO_IS_SOURCE_COVERAGE_TARGETS, ["hugverk.is"]],\n  ["MA", OMPIC_MA_SOURCE_COVERAGE_TARGETS, ["ompic.ma", "directompic.ma"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("fifty-eight priority national offices", "fifty-nine priority national offices")
priority_test = priority_test.replace("toHaveLength(460)", "toHaveLength(469)", 1)
priority_test = priority_test.replace("    460,\n", "    469,\n", 1)
priority_test = priority_test.replace(").toBe(460);", ").toBe(469);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "ma-ompic-trademark-portal-name" in retrieval:
    raise SystemExit("Morocco retrieval probes already present")
probes = r'''  {
    id: "ma-ompic-trademark-portal-name",
    targetId: "ma-ompic-trademark-portal",
    query: "marque",
  },
  {
    id: "ma-ompic-trademark-filing-name",
    targetId: "ma-ompic-trademark-filing",
    query: "déposer marque",
  },
  {
    id: "ma-ompic-trademark-search-name",
    targetId: "ma-ompic-trademark-search",
    query: "recherche marques nationales",
  },
  {
    id: "ma-ompic-trademark-forms-name",
    targetId: "ma-ompic-trademark-forms",
    query: "formulaire marque",
  },
  {
    id: "ma-ompic-trademark-fees-name",
    targetId: "ma-ompic-trademark-fees",
    query: "tarifs",
  },
  {
    id: "ma-ompic-nice-classification-name",
    targetId: "ma-ompic-nice-classification",
    query: "classification de Nice",
  },
  {
    id: "ma-ompic-trademark-legal-texts-name",
    targetId: "ma-ompic-trademark-legal-texts",
    query: "loi propriété industrielle",
  },
  {
    id: "ma-ompic-trademark-opposition-name",
    targetId: "ma-ompic-trademark-opposition",
    query: "opposition marque",
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
retrieval_test = retrieval_test.replace("toHaveLength(434)", "toHaveLength(442)", 2)
retrieval_test = retrieval_test.replace("      434,\n", "      442,\n", 1)
ma_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "MA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "IS", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + ma_assertion, "retrieval Morocco jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Morocco OMPIC source coverage patch applied")
