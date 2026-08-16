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

slovakia_block = r'''const INDPROP_SK: Authority = {
  jurisdiction: "SK",
  authorityName: "Industrial Property Office of the Slovak Republic",
  languages: ["sk-SK", "en"],
  verificationEvidenceUri: "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks",
};

export const INDPROP_SK_SOURCE_COVERAGE_TARGETS = [
  target(INDPROP_SK, {
    id: "sk-indprop-trademarks",
    family: "PORTAL",
    displayName: "Slovak Industrial Property Office Trade Marks",
    canonicalUri: "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-filing",
    family: "FILING",
    displayName: "Slovak IPO File a Trade Mark Application",
    canonicalUri:
      "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/filing-a-trade-mark-application/file-a-trade-mark-application",
    verificationEvidenceUri:
      "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/filing-a-trade-mark-application/file-a-trade-mark-application",
    notes:
      "The official filing page covers electronic and paper applications, payment timing, examination/publication and Fast Track conditions.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-search",
    family: "SEARCH",
    displayName: "Slovak IPO Webregisters",
    canonicalUri:
      "https://www.indprop.gov.sk/en/databases-registries-and-classifications/databases-and-registries",
    entrypoints: [
      {
        uri: "https://www.indprop.gov.sk/en/databases-registries-and-classifications/databases-and-registries",
        label: "Databases and registries guidance",
      },
      { uri: "https://wbr.indprop.gov.sk", label: "Webregister direct access" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.indprop.gov.sk/en/databases-registries-and-classifications/databases-and-registries",
    notes:
      "The official Webregister contains trademark applications and registrations maintained by the Office and is updated daily.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-fees",
    family: "FEES",
    displayName: "Slovak IPO Trade Mark Fees",
    canonicalUri: "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/fees",
    verificationEvidenceUri:
      "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/fees",
    notes:
      "The official fee page publishes current administrative fees for trademark filing and subsequent proceedings under Act No. 145/1995 Coll.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Slovak IPO Trademark Classification Systems",
    canonicalUri:
      "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/classification-systems-trade-marks",
    verificationEvidenceUri:
      "https://www.indprop.gov.sk/en/trade-marks-and-designs/trade-marks/classification-systems-trade-marks",
    notes:
      "The current official page identifies NCL(13-2026) as the Nice Classification version in force from 1 January 2026 and links the ezts goods/services tool.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Slovak IPO Trademark Legislation",
    canonicalUri:
      "https://www.indprop.gov.sk/en/legislation/legislation-of-the-slovak-republic/basic-legal-provisions-in-force/trade-marks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.indprop.gov.sk/en/legislation/legislation-of-the-slovak-republic/basic-legal-provisions-in-force/trade-marks",
    notes:
      "The official legislation page publishes Act No. 506/2009 Coll. on Trademarks and implementing Decree No. 567/2009 Coll., as amended.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-trademark-proceedings-forms",
    family: "PROCEEDINGS",
    displayName: "Slovak IPO Trademark Proceedings Forms",
    canonicalUri: "https://www.indprop.gov.sk/en/documents-and-forms/trade-marks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "DOCX"],
    verificationEvidenceUri: "https://www.indprop.gov.sk/en/documents-and-forms/trade-marks",
    notes:
      "The official trademark forms surface includes opposition, revocation, invalidity, renewal, transfer, licence and international-trademark proceedings forms.",
  }),
  target(INDPROP_SK, {
    id: "sk-indprop-official-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Slovak IPO Official Gazette",
    canonicalUri: "https://indprop.gov.sk/en/products-and-services",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://indprop.gov.sk/en/products-and-services",
    notes:
      "The official Gazette includes trademarks and is published twice monthly; the official 2026 schedule lists issues through December and includes issue 15/2026 dated 12 August 2026.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''

priority = replace_once(priority, "const CIPO: Authority = {", slovakia_block + "const CIPO: Authority = {", "insert Slovakia coverage")
priority = replace_once(
    priority,
    "  ...UPV_CZ_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...UPV_CZ_SOURCE_COVERAGE_TARGETS,\n  ...INDPROP_SK_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "aggregate Slovakia coverage",
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
catalog = catalog.replace(
    "  UPV_CZ_SOURCE_COVERAGE_TARGETS,\n",
    "  UPV_CZ_SOURCE_COVERAGE_TARGETS,\n  INDPROP_SK_SOURCE_COVERAGE_TARGETS,\n",
)
if catalog.count("INDPROP_SK_SOURCE_COVERAGE_TARGETS") != 2:
    raise RuntimeError("catalog: expected Slovakia import and export")
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_once(
    priority_test,
    "  UPV_CZ_SOURCE_COVERAGE_TARGETS,\n",
    "  UPV_CZ_SOURCE_COVERAGE_TARGETS,\n  INDPROP_SK_SOURCE_COVERAGE_TARGETS,\n",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["CZ", UPV_CZ_SOURCE_COVERAGE_TARGETS, ["upv.gov.cz"]],\n',
    '  ["CZ", UPV_CZ_SOURCE_COVERAGE_TARGETS, ["upv.gov.cz"]],\n  ["SK", INDPROP_SK_SOURCE_COVERAGE_TARGETS, ["indprop.gov.sk"]],\n',
    "priority test authority set",
)
priority_test = priority_test.replace(
    'ships explicit, official, unique coverage for twenty-five priority national offices',
    'ships explicit, official, unique coverage for twenty-six priority national offices',
)
priority_test = priority_test.replace("toHaveLength(188)", "toHaveLength(196)", 1)
priority_test = priority_test.replace("toBe(\n      188,\n", "toBe(\n      196,\n", 1)
priority_test = priority_test.replace(").toBe(188);", ").toBe(196);", 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
slovakia_probes = r'''  {
    id: "sk-trademarks-name",
    targetId: "sk-indprop-trademarks",
    query: "Industrial Property Office Slovak Republic trade marks",
  },
  {
    id: "sk-trademark-filing-name",
    targetId: "sk-indprop-trademark-filing",
    query: "file trade mark application Slovakia Fast Track",
  },
  {
    id: "sk-trademark-search-name",
    targetId: "sk-indprop-trademark-search",
    query: "Webregister trademarks Slovakia daily",
  },
  {
    id: "sk-trademark-fees-name",
    targetId: "sk-indprop-trademark-fees",
    query: "trade mark administrative fees Slovakia",
  },
  {
    id: "sk-trademark-classification-name",
    targetId: "sk-indprop-trademark-classification",
    query: "NCL 13-2026 Nice Classification Slovakia",
  },
  {
    id: "sk-trademark-law-name",
    targetId: "sk-indprop-trademark-law",
    query: "Act 506 2009 trademarks Decree 567 Slovakia",
  },
  {
    id: "sk-trademark-proceedings-forms-name",
    targetId: "sk-indprop-trademark-proceedings-forms",
    query: "trademark opposition revocation invalidity forms Slovakia",
  },
'''
retrieval = replace_once(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    slovakia_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    "retrieval Slovakia probes",
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace("toHaveLength(197)", "toHaveLength(204)", 2)
retrieval_test = retrieval_test.replace("toBe(\n      197,\n", "toBe(\n      204,\n", 1)
retrieval_test = replace_once(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "CZ", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "CZ", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "SK", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    "retrieval test Slovakia jurisdiction",
)
retrieval_test_path.write_text(retrieval_test)

print("Slovakia IPO source coverage patch applied")
