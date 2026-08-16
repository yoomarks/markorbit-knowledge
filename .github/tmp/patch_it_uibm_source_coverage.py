from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
relevance_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
relevance_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")

priority = priority_path.read_text(encoding="utf-8")
it_block = '''const UIBM_IT: Authority = {
  jurisdiction: "IT",
  authorityName: "Ufficio Italiano Brevetti e Marchi",
  languages: ["it-IT"],
  verificationEvidenceUri: "https://uibm.mise.gov.it/index.php/it/marchi",
};

export const UIBM_IT_SOURCE_COVERAGE_TARGETS = [
  target(UIBM_IT, {
    id: "it-uibm-trademarks",
    family: "PORTAL",
    displayName: "UIBM Marchi",
    canonicalUri: "https://uibm.mise.gov.it/index.php/it/marchi",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-filing",
    family: "FILING",
    displayName: "UIBM Come effettuare il deposito",
    canonicalUri:
      "https://uibm.mise.gov.it/index.php/it/marchi/registrare-in-italia/come-effettuare-il-deposito",
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/marchi/registrare-in-italia/come-effettuare-il-deposito",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-search",
    family: "SEARCH",
    displayName: "UIBM Banca Dati nazionale della Proprietà Industriale",
    canonicalUri: "https://www.uibm.gov.it/bancadati/home/index/",
    entrypoints: [
      { uri: "https://www.uibm.gov.it/bancadati/home/index/", label: "National IP database" },
      {
        uri: "https://uibm.mise.gov.it/index.php/it/banche-dati/2035903-banca-dati-bibliografica",
        label: "Database guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.uibm.gov.it/bancadati/home/index/",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-fees",
    family: "FEES",
    displayName: "UIBM Tariffe Marchi",
    canonicalUri: "https://uibm.mise.gov.it/index.php/it/marchi/procedura-di-nullita/tariffe",
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/marchi/procedura-di-nullita/tariffe",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-forms",
    family: "FILING",
    displayName: "UIBM Marchi - primo deposito modulistica",
    canonicalUri:
      "https://uibm.mise.gov.it/index.php/it/deposito-titoli/modulistica-per-il-deposito-cartaceo/227-modulistica-deposito-cartaceo/2036653-marchi-primo-deposito-nuovo",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/deposito-titoli/modulistica-per-il-deposito-cartaceo/227-modulistica-deposito-cartaceo/2036653-marchi-primo-deposito-nuovo",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-examination-opposition",
    family: "EXAMINATION_MANUAL",
    displayName: "UIBM Esame della domanda e procedura di opposizione",
    canonicalUri:
      "https://uibm.mise.gov.it/index.php/it/marchi/esame-della-domanda-e-procedura-di-opposizione",
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/marchi/esame-della-domanda-e-procedura-di-opposizione",
  }),
  target(UIBM_IT, {
    id: "it-uibm-industrial-property-code",
    family: "LEGAL_TEXTS",
    displayName: "UIBM Codice della Proprietà Industriale",
    canonicalUri:
      "https://uibm.mise.gov.it/index.php/it/normativa-pi/il-codice-della-proprieta-industriale",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/normativa-pi/il-codice-della-proprieta-industriale",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-nullity-revocation",
    family: "PROCEEDINGS",
    displayName: "UIBM Procedura di decadenza e nullità dei marchi",
    canonicalUri: "https://uibm.mise.gov.it/index.php/it/marchi/procedura-di-decadenza",
    entrypoints: [
      {
        uri: "https://uibm.mise.gov.it/index.php/it/marchi/procedura-di-decadenza",
        label: "Procedura di decadenza",
      },
      {
        uri: "https://uibm.mise.gov.it/index.php/en/marchi/procedura-di-nullita",
        label: "Procedura di nullità",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://uibm.mise.gov.it/index.php/it/al-via-la-procedura-per-l-accertamento-della-nullita-e-decadenza-dei-marchi",
  }),
  target(UIBM_IT, {
    id: "it-uibm-trademark-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "UIBM Bollettino Marchi",
    canonicalUri: "https://www.uibm.gov.it/bancadati/bollettini/index/",
    entrypoints: [
      {
        uri: "https://uibm.mise.gov.it/index.php/it/marchi/bollettino-marchi",
        label: "Bollettino Marchi guidance",
      },
      { uri: "https://www.uibm.gov.it/bancadati/bollettini/index/", label: "Current bulletins" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: false,
    fetchAttachmentsHint: false,
    expectedArtifactKinds: ["HTML"],
    verificationEvidenceUri: "https://uibm.mise.gov.it/index.php/it/marchi/bollettino-marchi",
    notes:
      "Since May 2021 the official trade mark bulletins are published through searchable web pages rather than PDF files.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
anchor = "const CIPO: Authority = {"
if "export const UIBM_IT_SOURCE_COVERAGE_TARGETS" not in priority:
    if anchor not in priority:
        raise SystemExit("CIPO insertion anchor not found")
    priority = priority.replace(anchor, it_block + anchor, 1)
aggregate_old = "  ...OEPM_ES_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
aggregate_new = "  ...OEPM_ES_SOURCE_COVERAGE_TARGETS,\n  ...UIBM_IT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
if aggregate_old in priority:
    priority = priority.replace(aggregate_old, aggregate_new, 1)
elif aggregate_new not in priority:
    raise SystemExit("priority Italy aggregate anchor not found")
priority_path.write_text(priority, encoding="utf-8")

catalog = catalog_path.read_text(encoding="utf-8")
needle = "  OEPM_ES_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replacement = "  OEPM_ES_SOURCE_COVERAGE_TARGETS,\n  UIBM_IT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
replaced = 0
while needle in catalog and replaced < 2:
    catalog = catalog.replace(needle, replacement, 1)
    replaced += 1
if catalog.count("UIBM_IT_SOURCE_COVERAGE_TARGETS") < 2:
    raise SystemExit("catalog Italy import/export integration incomplete")
catalog_path.write_text(catalog, encoding="utf-8")

priority_tests = priority_test_path.read_text(encoding="utf-8")
test_import_old = "  OEPM_ES_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
test_import_new = "  OEPM_ES_SOURCE_COVERAGE_TARGETS,\n  UIBM_IT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
if test_import_old in priority_tests:
    priority_tests = priority_tests.replace(test_import_old, test_import_new, 1)
elif test_import_new not in priority_tests:
    raise SystemExit("priority test Italy import anchor not found")
set_old = '  ["ES", OEPM_ES_SOURCE_COVERAGE_TARGETS, ["oepm.es"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
set_new = '  ["ES", OEPM_ES_SOURCE_COVERAGE_TARGETS, ["oepm.es"]],\n  ["IT", UIBM_IT_SOURCE_COVERAGE_TARGETS, ["mise.gov.it", "uibm.gov.it"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
if set_old in priority_tests:
    priority_tests = priority_tests.replace(set_old, set_new, 1)
elif set_new not in priority_tests:
    raise SystemExit("priority test Italy authority set anchor not found")
priority_tests = priority_tests.replace(
    "ships explicit, official, unique coverage for fourteen priority national offices",
    "ships explicit, official, unique coverage for fifteen priority national offices",
)
priority_tests = priority_tests.replace("toHaveLength(98)", "toHaveLength(107)")
priority_tests = priority_tests.replace(".size).toBe(98)", ".size).toBe(107)")
priority_tests = priority_tests.replace(").toBe(98);", ").toBe(107);")
if priority_tests.count("107") < 3:
    raise SystemExit("priority Italy cardinality updates incomplete")
priority_test_path.write_text(priority_tests, encoding="utf-8")

relevance = relevance_path.read_text(encoding="utf-8")
probe_anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
it_probes = '''  {
    id: "it-trademarks-name",
    targetId: "it-uibm-trademarks",
    query: "marchi UIBM",
  },
  {
    id: "it-trademark-filing-name",
    targetId: "it-uibm-trademark-filing",
    query: "come effettuare deposito marchio",
  },
  {
    id: "it-trademark-search-name",
    targetId: "it-uibm-trademark-search",
    query: "banca dati proprietà industriale marchi",
  },
  {
    id: "it-trademark-fees-name",
    targetId: "it-uibm-trademark-fees",
    query: "tariffe marchi",
  },
  {
    id: "it-trademark-forms-name",
    targetId: "it-uibm-trademark-forms",
    query: "marchi primo deposito modulistica",
  },
  {
    id: "it-trademark-examination-opposition-name",
    targetId: "it-uibm-trademark-examination-opposition",
    query: "esame domanda opposizione marchio",
  },
  {
    id: "it-industrial-property-code-name",
    targetId: "it-uibm-industrial-property-code",
    query: "codice proprietà industriale",
  },
  {
    id: "it-trademark-nullity-revocation-name",
    targetId: "it-uibm-trademark-nullity-revocation",
    query: "decadenza nullità marchio",
  },
'''
if 'targetId: "it-uibm-trademarks"' not in relevance:
    if probe_anchor not in relevance:
        raise SystemExit("Canada probe anchor not found")
    relevance = relevance.replace(probe_anchor, it_probes + probe_anchor, 1)
relevance_path.write_text(relevance, encoding="utf-8")

relevance_tests = relevance_test_path.read_text(encoding="utf-8")
for old, new in [
    ("expect(targets).toHaveLength(118);", "expect(targets).toHaveLength(126);"),
    ("expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(118);", "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(126);"),
    ("      118,\n    );\n    expect(targets.every", "      126,\n    );\n    expect(targets.every"),
]:
    if old in relevance_tests:
        relevance_tests = relevance_tests.replace(old, new, 1)
    elif new not in relevance_tests:
        raise SystemExit(f"relevance Italy cardinality assertion missing: {old}")
es_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "ES", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
it_assertion = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "IT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
if 'jurisdiction: "IT", coverageTier: "FOUNDATIONAL"' not in relevance_tests:
    if es_assertion not in relevance_tests:
        raise SystemExit("ES relevance assertion anchor not found")
    relevance_tests = relevance_tests.replace(es_assertion, es_assertion + it_assertion, 1)
relevance_test_path.write_text(relevance_tests, encoding="utf-8")
