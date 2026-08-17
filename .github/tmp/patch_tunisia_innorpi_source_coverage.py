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
if "INNORPI_TN_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Tunisia coverage already present")

tn_block = r'''const INNORPI_TN: Authority = {
  jurisdiction: "TN",
  authorityName: "Institut National de la Normalisation et de la Propriété Industrielle (INNORPI)",
  languages: ["fr", "ar"],
  verificationEvidenceUri: "https://www.innorpi.tn/fr/la-propriete-industrielle",
};

export const INNORPI_TN_SOURCE_COVERAGE_TARGETS = [
  target(INNORPI_TN, {
    id: "tn-innorpi-trademark-portal",
    family: "PORTAL",
    displayName: "INNORPI Tunisia Industrial Property Portal",
    canonicalUri: "https://www.innorpi.tn/fr/la-propriete-industrielle",
    verificationEvidenceUri: "https://www.innorpi.tn/fr/la-propriete-industrielle",
    notes:
      "Current official INNORPI industrial-property landing surface for trademarks and other national industrial-property rights.",
  }),
  target(INNORPI_TN, {
    id: "tn-innorpi-trademark-filing",
    family: "FILING",
    displayName: "INNORPI Tunisia Digital Industrial Property Filing System",
    canonicalUri:
      "https://www.innorpi.tn/fr/actualites/lancement-officiel-du-systeme-digitalise-de-la-propriete-industrielle-en-tunisie",
    verificationEvidenceUri:
      "https://www.innorpi.tn/fr/actualites/lancement-officiel-du-systeme-digitalise-de-la-propriete-industrielle-en-tunisie",
    notes:
      "Official 24 June 2026 launch notice confirming that the new national digital industrial-property system supports electronic trademark applications and remote online procedures.",
  }),
  target(INNORPI_TN, {
    id: "tn-innorpi-trademark-search",
    family: "SEARCH",
    displayName: "Tunisia National Trademark Search System",
    canonicalUri: "https://ip-search.innorpi.tn/trademark",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://ip-search.innorpi.tn/trademark",
    notes:
      "Current INNORPI Tunisian IP Search System for trademarks with simple, brand and advanced search plus Nice-class analytics.",
  }),
  target(INNORPI_TN, {
    id: "tn-innorpi-trademark-fees",
    family: "FEES",
    displayName: "INNORPI Tunisia Trademark Procedure and Fees",
    canonicalUri:
      "https://www.innorpi.tn/fr/la-protection-des-marques-de-fabrique-de-commerce-et-de-services",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.innorpi.tn/fr/la-protection-des-marques-de-fabrique-de-commerce-et-de-services",
    notes:
      "Official trademark guidance publishing current filing, additional-class, certificate, opposition, prior-search and renewal charges alongside filing and opposition requirements.",
  }),
  target(INNORPI_TN, {
    id: "tn-innorpi-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Tunisia Trademark Laws and Decrees",
    canonicalUri: "https://www.innorpi.tn/fr/loi-decrets",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.innorpi.tn/fr/loi-decrets",
    notes:
      "Official INNORPI legislation index publishing Law No. 2001-36, its 2007 amendment, the 2015 trademark registration/opposition decree and trademark-fee decrees.",
  }),
  target(INNORPI_TN, {
    id: "tn-innorpi-trademark-maintenance",
    family: "MAINTENANCE",
    displayName: "INNORPI Tunisia Trademark Forms and Maintenance Documents",
    canonicalUri: "https://www.innorpi.tn/fr/telechargement",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.innorpi.tn/fr/telechargement",
    notes:
      "Official download library for trademark forms and register-maintenance materials, including reinstatement and registration-document annexes; the trademark guidance also links the renewal form from INNORPI.",
  }),
  target(INNORPI_TN, {
    id: "tn-innorpi-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "INNORPI Tunisia Official Industrial Property Gazette",
    canonicalUri: "https://www.innorpi.tn/fr/officiel-de-la-propriete-industrielle",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.innorpi.tn/fr/officiel-de-la-propriete-industrielle",
    notes:
      "Official monthly industrial-property publication for Tunisian trademark, design and patent filings; retained as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", tn_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  ...INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "INNORPI_TN_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Tunisia catalog export already present")
catalog = replace_once(
    catalog,
    "  INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
catalog = replace_once(
    catalog,
    "  INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog export",
)
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["DZ", INAPI_DZ_SOURCE_COVERAGE_TARGETS, ["inapi.dz"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["DZ", INAPI_DZ_SOURCE_COVERAGE_TARGETS, ["inapi.dz"]],\n  ["TN", INNORPI_TN_SOURCE_COVERAGE_TARGETS, ["innorpi.tn"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("seventy-three priority national offices", "seventy-four priority national offices")
priority_test = priority_test.replace("toHaveLength(597)", "toHaveLength(604)", 1)
priority_test = priority_test.replace("    597,\n", "    604,\n", 1)
priority_test = priority_test.replace(").toBe(597);", ").toBe(604);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "tn-innorpi-trademark-portal-name" in retrieval:
    raise SystemExit("Tunisia retrieval probes already present")
probes = r'''  {
    id: "tn-innorpi-trademark-portal-name",
    targetId: "tn-innorpi-trademark-portal",
    query: "INNORPI Tunisie propriété industrielle marques",
  },
  {
    id: "tn-innorpi-trademark-filing-name",
    targetId: "tn-innorpi-trademark-filing",
    query: "système digitalisé dépôt électronique demandes marques 2026",
  },
  {
    id: "tn-innorpi-trademark-search-name",
    targetId: "tn-innorpi-trademark-search",
    query: "Tunisian IP Search System trademark simple brand advanced search",
  },
  {
    id: "tn-innorpi-trademark-fees-name",
    targetId: "tn-innorpi-trademark-fees",
    query: "redevance dépôt marque renouvellement opposition recherche antériorité",
  },
  {
    id: "tn-innorpi-trademark-legal-texts-name",
    targetId: "tn-innorpi-trademark-legal-texts",
    query: "Loi 2001-36 Décret gouvernemental 2015-303 marques",
  },
  {
    id: "tn-innorpi-trademark-maintenance-name",
    targetId: "tn-innorpi-trademark-maintenance",
    query: "formulaire marque renouvellement levée déchéance inscription registre",
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
retrieval_test = retrieval_test.replace("toHaveLength(556)", "toHaveLength(562)", 2)
retrieval_test = retrieval_test.replace("      556,\n", "      562,\n", 1)
tn_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "TN", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "DZ", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + tn_assertion, "retrieval Tunisia jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Tunisia INNORPI trademark source coverage patch applied")
