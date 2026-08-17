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
if "INAPI_DZ_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Algeria coverage already present")

dz_block = r'''const INAPI_DZ: Authority = {
  jurisdiction: "DZ",
  authorityName: "Institut National Algérien de la Propriété Industrielle (INAPI)",
  languages: ["fr", "ar", "en"],
  verificationEvidenceUri: "https://inapi.dz/aboutMark",
};

export const INAPI_DZ_SOURCE_COVERAGE_TARGETS = [
  target(INAPI_DZ, {
    id: "dz-inapi-trademark-portal",
    family: "PORTAL",
    displayName: "INAPI Algeria Trademark Portal",
    canonicalUri: "https://inapi.dz/aboutMark",
    verificationEvidenceUri: "https://inapi.dz/aboutMark",
    notes:
      "Current official INAPI trademark overview linking filing, prior-art search, register inscriptions, fees, legislation, database access and BOPI publication surfaces.",
  }),
  target(INAPI_DZ, {
    id: "dz-inapi-trademark-filing",
    family: "FILING",
    displayName: "INAPI Algeria Trademark Filing Procedure",
    canonicalUri: "https://inapi.dz/markFilingInfo",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://inapi.dz/markFilingInfo",
    notes:
      "Official national trademark filing procedure describing the INAPI online account/new-deposit workflow, payment receipt, filing form and supporting documents.",
  }),
  target(INAPI_DZ, {
    id: "dz-inapi-trademark-search",
    family: "SEARCH",
    displayName: "INAPI Algeria Trademark Search and Database",
    canonicalUri: "https://inapi.dz/bdd",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://inapi.dz/bdd",
    notes:
      "Official INAPI searches-and-databases hub exposing the national trademark search surface alongside patent, design and emblem databases.",
  }),
  target(INAPI_DZ, {
    id: "dz-inapi-trademark-fees",
    family: "FEES",
    displayName: "INAPI Algeria Trademark Fees",
    canonicalUri: "https://inapi.dz/markTaxes",
    verificationEvidenceUri: "https://inapi.dz/markTaxes",
    notes:
      "Official trademark and collective-mark tariff table covering filing/publication, per-class charges, renewal, late renewal, searches, recordals, appeals and other register actions.",
  }),
  target(INAPI_DZ, {
    id: "dz-inapi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "INAPI Algeria Nice Classification Guidance",
    canonicalUri: "https://inapi.dz/aboutMarkSearch",
    verificationEvidenceUri: "https://inapi.dz/aboutMarkSearch",
    notes:
      "Official prior-art-search guidance directing applicants to the Nice Classification goods/services list before filing or requesting an availability search.",
  }),
  target(INAPI_DZ, {
    id: "dz-inapi-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Algeria Trademark Law and Implementing Decree",
    canonicalUri: "https://inapi.dz/legal",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://inapi.dz/legal",
    notes:
      "Official INAPI legislation index publishing Ordinance No. 03-06 of 19 July 2003 on trademarks and Executive Decree No. 05-277 of 2 August 2005 on trademark filing and registration procedures.",
  }),
  target(INAPI_DZ, {
    id: "dz-inapi-trademark-maintenance",
    family: "MAINTENANCE",
    displayName: "INAPI Algeria Trademark Renewal and Register Recordals",
    canonicalUri: "https://inapi.dz/inscription_marque",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://inapi.dz/inscription_marque",
    notes:
      "Official register-inscription procedure covering renewal plus changes of address/name, assignments, corrections, withdrawals and supporting-document requirements.",
  }),
  target(INAPI_DZ, {
    id: "dz-inapi-trademark-bopi",
    family: "OFFICIAL_GAZETTE",
    displayName: "INAPI Algeria Trademark BOPI",
    canonicalUri: "https://inapi.dz/getbopi?nature=Marque",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://inapi.dz/getbopi?nature=Marque",
    notes:
      "Official monthly trademark BOPI index with current 2026 issues; retained as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", dz_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...IPO_NG_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...IPO_NG_SOURCE_COVERAGE_TARGETS,\n  ...INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "INAPI_DZ_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Algeria catalog export already present")
catalog = replace_once(
    catalog,
    "  IPO_NG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  IPO_NG_SOURCE_COVERAGE_TARGETS,\n  INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
catalog = replace_once(
    catalog,
    "  IPO_NG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  IPO_NG_SOURCE_COVERAGE_TARGETS,\n  INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog export",
)
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  IPO_NG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  IPO_NG_SOURCE_COVERAGE_TARGETS,\n  INAPI_DZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["NG", IPO_NG_SOURCE_COVERAGE_TARGETS, ["iponigeria.fmiti.gov.ng", "iponigeria.com"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["NG", IPO_NG_SOURCE_COVERAGE_TARGETS, ["iponigeria.fmiti.gov.ng", "iponigeria.com"]],\n  ["DZ", INAPI_DZ_SOURCE_COVERAGE_TARGETS, ["inapi.dz"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("seventy-two priority national offices", "seventy-three priority national offices")
priority_test = priority_test.replace("toHaveLength(589)", "toHaveLength(597)", 1)
priority_test = priority_test.replace("    589,\n", "    597,\n", 1)
priority_test = priority_test.replace(").toBe(589);", ").toBe(597);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "dz-inapi-trademark-portal-name" in retrieval:
    raise SystemExit("Algeria retrieval probes already present")
probes = r'''  {
    id: "dz-inapi-trademark-portal-name",
    targetId: "dz-inapi-trademark-portal",
    query: "INAPI Algérie marque enregistrer protéger",
  },
  {
    id: "dz-inapi-trademark-filing-name",
    targetId: "dz-inapi-trademark-filing",
    query: "dépôt marque nouveau dépôt formulaire quittance paiement",
  },
  {
    id: "dz-inapi-trademark-search-name",
    targetId: "dz-inapi-trademark-search",
    query: "rechercher une marque base de données INAPI",
  },
  {
    id: "dz-inapi-trademark-fees-name",
    targetId: "dz-inapi-trademark-fees",
    query: "taxes marques dépôt publication renouvellement recherche recours",
  },
  {
    id: "dz-inapi-trademark-classification-name",
    targetId: "dz-inapi-trademark-classification",
    query: "classification de Nice produits services recherche antériorité",
  },
  {
    id: "dz-inapi-trademark-legal-texts-name",
    targetId: "dz-inapi-trademark-legal-texts",
    query: "Ordonnance 03-06 marques Décret exécutif 05-277",
  },
  {
    id: "dz-inapi-trademark-maintenance-name",
    targetId: "dz-inapi-trademark-maintenance",
    query: "renouvellement marque inscription cession changement adresse",
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
retrieval_test = retrieval_test.replace("toHaveLength(549)", "toHaveLength(556)", 2)
retrieval_test = retrieval_test.replace("      549,\n", "      556,\n", 1)
dz_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "DZ", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "NG", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + dz_assertion, "retrieval Algeria jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Algeria INAPI trademark source coverage patch applied")
