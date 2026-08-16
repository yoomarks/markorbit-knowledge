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

hungary_block = r'''const HIPO_HU: Authority = {
  jurisdiction: "HU",
  authorityName: "Hungarian Intellectual Property Office (HIPO)",
  languages: ["hu-HU", "en"],
  verificationEvidenceUri: "https://sztnh.gov.hu/en/services/trademark",
};

export const HIPO_HU_SOURCE_COVERAGE_TARGETS = [
  target(HIPO_HU, {
    id: "hu-hipo-trademarks",
    family: "PORTAL",
    displayName: "HIPO Trademark Protection",
    canonicalUri: "https://sztnh.gov.hu/en/services/trademark",
    verificationEvidenceUri: "https://sztnh.gov.hu/en/services/trademark",
    notes: "The current HIPO trademark portal was last modified on 27 January 2026.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-filing",
    family: "FILING",
    displayName: "HIPO National Trademark Application",
    canonicalUri: "https://sztnh.gov.hu/en/services/trademark/national-application",
    entrypoints: [
      {
        uri: "https://sztnh.gov.hu/en/services/trademark/national-application",
        label: "National trademark registration procedure",
      },
      {
        uri: "https://ugyintezes.sztnh.gov.hu/eBej2/step1",
        label: "HIPO electronic filing system",
      },
    ],
    verificationEvidenceUri: "https://sztnh.gov.hu/en/services/trademark/national-application",
    notes:
      "The national procedure covers filing-date requirements, examination, earlier-rights search, publication, three-month opposition, accelerated procedures, registration and renewal.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-search",
    family: "SEARCH",
    displayName: "HIPO IP Databases and E-register",
    canonicalUri: "https://sztnh.gov.hu/en/services/ip-databases",
    entrypoints: [
      { uri: "https://sztnh.gov.hu/en/services/ip-databases", label: "IP databases guidance" },
      { uri: "https://epub.hpo.hu/e-kutatas/?lang=HU", label: "E-register search" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://sztnh.gov.hu/en/services/ip-databases",
    notes:
      "HIPO's official IP databases provide trademark register and Gazette search; the public page identifies E-register as the search surface for Hungarian industrial-property records.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-fees",
    family: "FEES",
    displayName: "HIPO Trademark Schedule of Fees",
    canonicalUri: "https://sztnh.gov.hu/sw/static/file/dijtablazat_vedjegy-en_20250413.pdf",
    expectedArtifactKinds: ["PDF"],
    verificationEvidenceUri:
      "https://sztnh.gov.hu/sw/static/file/dijtablazat_vedjegy-en_20250413.pdf",
    notes:
      "The official trademark fee schedule is issued under Decree No. 19/2005 GKM and is in force from 13 April 2025; it covers filing, opposition, accelerated procedures, renewal, cancellation and revocation.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "HIPO Nice Classification",
    canonicalUri: "https://sztnh.gov.hu/en/services/trademark/classification/nice",
    entrypoints: [
      {
        uri: "https://sztnh.gov.hu/en/services/trademark/classification/nice",
        label: "Nice Classification guidance",
      },
      {
        uri: "http://classifications.sztnh.gov.hu/nice/",
        label: "Current Nice Classification browser",
      },
    ],
    verificationEvidenceUri: "https://sztnh.gov.hu/en/services/trademark/classification/nice",
    notes:
      "HIPO identifies the 13th edition of the Nice Classification as the current edition, effective from 1 January 2026.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "HIPO Trademark Legal Sources",
    canonicalUri: "https://sztnh.gov.hu/en/legal-sources-of-intellectual-property",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://sztnh.gov.hu/en/legal-sources-of-intellectual-property",
    notes:
      "The official legal-sources hub publishes Act XI of 1997 on trademarks and geographical indications, the formal-requirements decree and the industrial-property fees decree.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "HIPO Electronic Trademark Proceedings",
    canonicalUri: "https://ugyintezes.sztnh.gov.hu/eBej2/step1",
    entrypoints: [
      {
        uri: "https://ugyintezes.sztnh.gov.hu/eBej2/step1",
        label: "Electronic trademark forms and proceedings",
      },
      {
        uri: "https://sztnh.gov.hu/en/services/trademark/national-application",
        label: "Opposition and procedure guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://ugyintezes.sztnh.gov.hu/eBej2/step1",
    notes:
      "HIPO's electronic administration surface provides national trademark filing, accelerated-procedure, observation and opposition forms plus universal cancellation/revocation submissions.",
  }),
  target(HIPO_HU, {
    id: "hu-hipo-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "HIPO Gazette of Patents and Trademarks",
    canonicalUri: "https://sztnh.gov.hu/en/home/gazette",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://sztnh.gov.hu/en/home/gazette",
    notes:
      "The electronically signed Gazette continues in PDF; national and international trademark columns are published twice monthly, with 2026 issues available on the current official page.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''

priority = replace_once(priority, "const CIPO: Authority = {", hungary_block + "const CIPO: Authority = {", "insert Hungary coverage")
priority = replace_once(
    priority,
    "  ...INDPROP_SK_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...INDPROP_SK_SOURCE_COVERAGE_TARGETS,\n  ...HIPO_HU_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "aggregate Hungary coverage",
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
catalog = catalog.replace(
    "  INDPROP_SK_SOURCE_COVERAGE_TARGETS,\n",
    "  INDPROP_SK_SOURCE_COVERAGE_TARGETS,\n  HIPO_HU_SOURCE_COVERAGE_TARGETS,\n",
)
if catalog.count("HIPO_HU_SOURCE_COVERAGE_TARGETS") != 2:
    raise RuntimeError("catalog: expected Hungary import and export")
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_once(
    priority_test,
    "  INDPROP_SK_SOURCE_COVERAGE_TARGETS,\n",
    "  INDPROP_SK_SOURCE_COVERAGE_TARGETS,\n  HIPO_HU_SOURCE_COVERAGE_TARGETS,\n",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["SK", INDPROP_SK_SOURCE_COVERAGE_TARGETS, ["indprop.gov.sk"]],\n',
    '  ["SK", INDPROP_SK_SOURCE_COVERAGE_TARGETS, ["indprop.gov.sk"]],\n  ["HU", HIPO_HU_SOURCE_COVERAGE_TARGETS, ["sztnh.gov.hu"]],\n',
    "priority test authority set",
)
priority_test = priority_test.replace(
    'ships explicit, official, unique coverage for twenty-six priority national offices',
    'ships explicit, official, unique coverage for twenty-seven priority national offices',
)
priority_test = priority_test.replace("toHaveLength(196)", "toHaveLength(204)", 1)
priority_test = priority_test.replace("toBe(\n      196,\n", "toBe(\n      204,\n", 1)
priority_test = priority_test.replace(").toBe(196);", ").toBe(204);", 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
hungary_probes = r'''  {
    id: "hu-trademarks-name",
    targetId: "hu-hipo-trademarks",
    query: "HIPO trademark protection Hungary",
  },
  {
    id: "hu-trademark-filing-name",
    targetId: "hu-hipo-trademark-filing",
    query: "national trademark application Hungary opposition",
  },
  {
    id: "hu-trademark-search-name",
    targetId: "hu-hipo-trademark-search",
    query: "HIPO IP databases E-register trademark",
  },
  {
    id: "hu-trademark-fees-name",
    targetId: "hu-hipo-trademark-fees",
    query: "trademark schedule fees Hungary HUF",
  },
  {
    id: "hu-trademark-classification-name",
    targetId: "hu-hipo-trademark-classification",
    query: "Nice Classification 13th edition 2026 Hungary",
  },
  {
    id: "hu-trademark-law-name",
    targetId: "hu-hipo-trademark-law",
    query: "Act XI 1997 trademarks geographical indications Hungary",
  },
  {
    id: "hu-trademark-proceedings-name",
    targetId: "hu-hipo-trademark-proceedings",
    query: "electronic trademark opposition cancellation revocation HIPO",
  },
'''
retrieval = replace_once(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    hungary_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    "retrieval Hungary probes",
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace("toHaveLength(204)", "toHaveLength(211)", 2)
retrieval_test = retrieval_test.replace("toBe(\n      204,\n", "toBe(\n      211,\n", 1)
retrieval_test = replace_once(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "SK", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "SK", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "HU", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    "retrieval test Hungary jurisdiction",
)
retrieval_test_path.write_text(retrieval_test)

print("Hungary HIPO source coverage patch applied")
