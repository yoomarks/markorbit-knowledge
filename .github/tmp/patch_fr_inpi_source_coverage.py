from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
relevance_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
relevance_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")

priority = priority_path.read_text(encoding="utf-8")
inpi_block = '''const INPI_FR: Authority = {
  jurisdiction: "FR",
  authorityName: "Institut national de la propriété industrielle",
  languages: ["fr-FR"],
  verificationEvidenceUri: "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/depot-de-marque",
};

export const INPI_FR_SOURCE_COVERAGE_TARGETS = [
  target(INPI_FR, {
    id: "fr-inpi-trademark-portal",
    family: "PORTAL",
    displayName: "INPI Dépôt de marque",
    canonicalUri: "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/depot-de-marque",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-filing",
    family: "FILING",
    displayName: "INPI Déposer sa marque",
    canonicalUri: "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/deposer-sa-marque",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/deposer-sa-marque",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-search",
    family: "SEARCH",
    displayName: "INPI Recherche dans la base Marques",
    canonicalUri:
      "https://www.inpi.fr/ressources/propriete-intellectuelle/rechercher-une-marque-base-marques",
    entrypoints: [
      {
        uri: "https://www.inpi.fr/ressources/propriete-intellectuelle/rechercher-une-marque-base-marques",
        label: "Base Marques guidance",
      },
      { uri: "https://data.inpi.fr/recherche_avancee/marques", label: "DATA INPI advanced trade mark search" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.inpi.fr/ressources/propriete-intellectuelle/rechercher-une-marque-base-marques",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-fees",
    family: "FEES",
    displayName: "INPI Tarifs des procédures et prestations",
    canonicalUri:
      "https://www.inpi.fr/ressources/propriete-intellectuelle/tarifs-procedures-et-prestations-de-linpi",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.inpi.fr/ressources/propriete-intellectuelle/tarifs-procedures-et-prestations-de-linpi",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-goods-services",
    family: "GOODS_SERVICES_ID",
    displayName: "INPI Choix des produits et services pour une marque",
    canonicalUri:
      "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/choix-produits-et-services-pour-ma-marque",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/choix-produits-et-services-pour-ma-marque",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-directives",
    family: "EXAMINATION_MANUAL",
    displayName: "INPI Directives marques",
    canonicalUri: "https://www.inpi.fr/ressources/propriete-intellectuelle/directives",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.inpi.fr/ressources/propriete-intellectuelle/directives",
    notes:
      "The official directives page publishes current trade mark registration, international registration, renewal, invalidity/revocation and opposition directives.",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-opposition",
    family: "PROCEEDINGS",
    displayName: "INPI Opposition à l'enregistrement d'une marque",
    canonicalUri:
      "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/sopposer-lenregistrement-dune-marque",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.inpi.fr/realiser-demarches/propriete-intellectuelle/sopposer-lenregistrement-dune-marque",
  }),
  target(INPI_FR, {
    id: "fr-inpi-trademark-bopi",
    family: "OFFICIAL_GAZETTE",
    displayName: "INPI Bulletin officiel de la propriété industrielle - Marques",
    canonicalUri: "https://www.inpi.fr/ressources/propriete-intellectuelle/bulletins-officiels-de-pi-bopi",
    entrypoints: [
      {
        uri: "https://www.inpi.fr/ressources/propriete-intellectuelle/bulletins-officiels-de-pi-bopi",
        label: "BOPI guidance",
      },
      { uri: "https://data.inpi.fr/recherche_avancee/bopi/marques", label: "DATA INPI BOPI Marques search" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF", "JSON"],
    verificationEvidenceUri:
      "https://www.inpi.fr/ressources/propriete-intellectuelle/bulletins-officiels-de-pi-bopi",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
anchor = "const CIPO: Authority = {"
if "export const INPI_FR_SOURCE_COVERAGE_TARGETS" not in priority:
    if anchor not in priority:
        raise SystemExit("CIPO insertion anchor not found")
    priority = priority.replace(anchor, inpi_block + anchor, 1)
aggregate_old = "  ...IP_INDIA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
aggregate_new = "  ...IP_INDIA_SOURCE_COVERAGE_TARGETS,\n  ...INPI_FR_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
if aggregate_old in priority:
    priority = priority.replace(aggregate_old, aggregate_new, 1)
elif aggregate_new not in priority:
    raise SystemExit("priority aggregate anchor not found")
priority_path.write_text(priority, encoding="utf-8")

catalog = catalog_path.read_text(encoding="utf-8")
import_old = "  IP_INDIA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
import_new = "  IP_INDIA_SOURCE_COVERAGE_TARGETS,\n  INPI_FR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
if import_old in catalog:
    catalog = catalog.replace(import_old, import_new, 1)
elif import_new not in catalog:
    raise SystemExit("catalog import anchor not found")
export_old = "  IP_INDIA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
export_new = "  IP_INDIA_SOURCE_COVERAGE_TARGETS,\n  INPI_FR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
# Import and export blocks have the same local ordering; replace the remaining occurrence.
if export_old in catalog:
    catalog = catalog.replace(export_old, export_new, 1)
elif catalog.count("INPI_FR_SOURCE_COVERAGE_TARGETS") < 2:
    raise SystemExit("catalog export anchor not found")
catalog_path.write_text(catalog, encoding="utf-8")

priority_tests = priority_test_path.read_text(encoding="utf-8")
test_import_old = "  IP_INDIA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
test_import_new = "  IP_INDIA_SOURCE_COVERAGE_TARGETS,\n  INPI_FR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
if test_import_old in priority_tests:
    priority_tests = priority_tests.replace(test_import_old, test_import_new, 1)
elif test_import_new not in priority_tests:
    raise SystemExit("priority test import anchor not found")
set_old = '  ["IN", IP_INDIA_SOURCE_COVERAGE_TARGETS, ["ipindia.gov.in"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
set_new = '  ["IN", IP_INDIA_SOURCE_COVERAGE_TARGETS, ["ipindia.gov.in"]],\n  ["FR", INPI_FR_SOURCE_COVERAGE_TARGETS, ["inpi.fr"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
if set_old in priority_tests:
    priority_tests = priority_tests.replace(set_old, set_new, 1)
elif set_new not in priority_tests:
    raise SystemExit("priority test authority set anchor not found")
priority_tests = priority_tests.replace(
    "ships explicit, official, unique coverage for nine priority national offices",
    "ships explicit, official, unique coverage for ten priority national offices",
)
for old, new in [
    ("toHaveLength(56)", "toHaveLength(64)"),
    (".size).toBe(56)", ".size).toBe(64)"),
    (").toBe(56);", ").toBe(64);"),
]:
    if old in priority_tests:
        priority_tests = priority_tests.replace(old, new, 1)
    elif new not in priority_tests:
        raise SystemExit(f"priority cardinality assertion missing: {old}")
priority_test_path.write_text(priority_tests, encoding="utf-8")

relevance = relevance_path.read_text(encoding="utf-8")
probe_anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
fr_probes = '''  {
    id: "fr-trademark-portal-name",
    targetId: "fr-inpi-trademark-portal",
    query: "dépôt marque",
  },
  {
    id: "fr-trademark-filing-name",
    targetId: "fr-inpi-trademark-filing",
    query: "déposer marque",
  },
  {
    id: "fr-trademark-search-name",
    targetId: "fr-inpi-trademark-search",
    query: "base marques",
  },
  {
    id: "fr-trademark-fees-name",
    targetId: "fr-inpi-trademark-fees",
    query: "tarifs procédures",
  },
  {
    id: "fr-trademark-goods-services-name",
    targetId: "fr-inpi-trademark-goods-services",
    query: "produits services marque",
  },
  {
    id: "fr-trademark-directives-name",
    targetId: "fr-inpi-trademark-directives",
    query: "directives marques",
  },
  {
    id: "fr-trademark-opposition-name",
    targetId: "fr-inpi-trademark-opposition",
    query: "opposition enregistrement marque",
  },
'''
if 'targetId: "fr-inpi-trademark-portal"' not in relevance:
    if probe_anchor not in relevance:
        raise SystemExit("Canada probe anchor not found")
    relevance = relevance.replace(probe_anchor, fr_probes + probe_anchor, 1)
relevance_path.write_text(relevance, encoding="utf-8")

relevance_tests = relevance_test_path.read_text(encoding="utf-8")
for old, new in [
    ("expect(targets).toHaveLength(81);", "expect(targets).toHaveLength(88);"),
    ("expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(81);", "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(88);"),
    (".size).toBe(81);", ".size).toBe(88);"),
]:
    if old in relevance_tests:
        relevance_tests = relevance_tests.replace(old, new, 1)
    elif new not in relevance_tests:
        raise SystemExit(f"relevance cardinality assertion missing: {old}")
in_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "IN", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
fr_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "FR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
if 'jurisdiction: "FR", coverageTier: "FOUNDATIONAL"' not in relevance_tests:
    if in_assertion not in relevance_tests:
        raise SystemExit("IN relevance assertion anchor not found")
    relevance_tests = relevance_tests.replace(in_assertion, in_assertion + fr_assertion, 1)
relevance_test_path.write_text(relevance_tests, encoding="utf-8")
