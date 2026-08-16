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

czech_block = r'''const UPV_CZ: Authority = {
  jurisdiction: "CZ",
  authorityName: "Industrial Property Office of the Czech Republic (ÚPV)",
  languages: ["cs-CZ", "en"],
  verificationEvidenceUri: "https://upv.gov.cz/en/ip-rights/trademarks",
};

export const UPV_CZ_SOURCE_COVERAGE_TARGETS = [
  target(UPV_CZ, {
    id: "cz-upv-trademarks",
    family: "PORTAL",
    displayName: "Czech Industrial Property Office Trademarks",
    canonicalUri: "https://upv.gov.cz/en/ip-rights/trademarks",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-filing",
    family: "FILING",
    displayName: "ÚPV National Trademark Application",
    canonicalUri: "https://upv.gov.cz/en/ip-rights/trademarks/national-trademark-application",
    verificationEvidenceUri:
      "https://upv.gov.cz/en/ip-rights/trademarks/national-trademark-application",
    notes:
      "The national filing page specifies the required application contents, priority framework and Nice-classified goods/services list.",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-search",
    family: "SEARCH",
    displayName: "ÚPV Trademark Databases",
    canonicalUri:
      "https://upv.gov.cz/en/information-sources/national-databases/trademark-databases",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "XML"],
    verificationEvidenceUri:
      "https://upv.gov.cz/en/information-sources/national-databases/trademark-databases",
    notes:
      "The official national trademark database covers ÚPV, WIPO designations for the Czech Republic/EU and EUIPO records and exposes national trademark XML data.",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-fees",
    family: "FEES",
    displayName: "ÚPV Trademark Fees",
    canonicalUri: "https://upv.gov.cz/en/ip-rights/fees",
    verificationEvidenceUri: "https://upv.gov.cz/en/ip-rights/fees",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "ÚPV Trademark Classification",
    canonicalUri:
      "https://upv.gov.cz/informacni-zdroje/tridniky/tridnik-ochranne-znamky",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://upv.gov.cz/informacni-zdroje/tridniky/tridnik-ochranne-znamky",
    notes:
      "The current official classification page identifies Nice Classification 13th Edition, version 2026, and Vienna Classification 10th Edition 2026 as effective from 1 January 2026.",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "ÚPV National Trademark Legislation",
    canonicalUri: "https://upv.gov.cz/en/information-sources/legislation/national",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://upv.gov.cz/en/information-sources/legislation/national",
    notes:
      "The national legislation hub publishes Act No. 441/2003 Coll. on Trademarks, implementing Decree No. 97/2004 and related administrative-fee legislation.",
  }),
  target(UPV_CZ, {
    id: "cz-upv-trademark-common-practices",
    family: "EXAMINATION_MANUAL",
    displayName: "ÚPV Common Trademark Practices",
    canonicalUri:
      "https://upv.gov.cz/en/ip-rights/trademarks/common-communications-on-the-practice-of-euipo-and-eu-member-states",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://upv.gov.cz/en/ip-rights/trademarks/common-communications-on-the-practice-of-euipo-and-eu-member-states",
    notes:
      "The official Common Communications page maintains converged EUIPO/member-state trademark examination practices and principles based on court decisions and office best practices.",
  }),
  target(UPV_CZ, {
    id: "cz-upv-official-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "ÚPV Official Bulletin",
    canonicalUri: "https://upv.gov.cz/en/information-sources/ipo-bulletin",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://upv.gov.cz/en/information-sources/ipo-bulletin",
    notes:
      "The ÚPV Official Bulletin is a weekly digital-only publication containing published trademark applications and granted industrial-property rights.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''

priority = replace_once(priority, "const CIPO: Authority = {", czech_block + "const CIPO: Authority = {", "insert Czech coverage")
priority = replace_once(
    priority,
    "  ...UPRP_PL_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...UPRP_PL_SOURCE_COVERAGE_TARGETS,\n  ...UPV_CZ_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "aggregate Czech coverage",
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
catalog = catalog.replace(
    "  UPRP_PL_SOURCE_COVERAGE_TARGETS,\n",
    "  UPRP_PL_SOURCE_COVERAGE_TARGETS,\n  UPV_CZ_SOURCE_COVERAGE_TARGETS,\n",
)
if catalog.count("UPV_CZ_SOURCE_COVERAGE_TARGETS") != 2:
    raise RuntimeError("catalog: expected Czech import and export")
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_once(
    priority_test,
    "  UPRP_PL_SOURCE_COVERAGE_TARGETS,\n",
    "  UPRP_PL_SOURCE_COVERAGE_TARGETS,\n  UPV_CZ_SOURCE_COVERAGE_TARGETS,\n",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["PL", UPRP_PL_SOURCE_COVERAGE_TARGETS, ["uprp.gov.pl"]],\n',
    '  ["PL", UPRP_PL_SOURCE_COVERAGE_TARGETS, ["uprp.gov.pl"]],\n  ["CZ", UPV_CZ_SOURCE_COVERAGE_TARGETS, ["upv.gov.cz"]],\n',
    "priority test authority set",
)
priority_test = priority_test.replace(
    'ships explicit, official, unique coverage for twenty-four priority national offices',
    'ships explicit, official, unique coverage for twenty-five priority national offices',
)
priority_test = priority_test.replace("toHaveLength(180)", "toHaveLength(188)", 1)
priority_test = priority_test.replace("toBe(\n      180,\n", "toBe(\n      188,\n", 1)
priority_test = priority_test.replace(").toBe(180);", ").toBe(188);", 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
czech_probes = r'''  {
    id: "cz-trademarks-name",
    targetId: "cz-upv-trademarks",
    query: "Industrial Property Office Czech trademarks",
  },
  {
    id: "cz-trademark-filing-name",
    targetId: "cz-upv-trademark-filing",
    query: "national trademark application Czech",
  },
  {
    id: "cz-trademark-search-name",
    targetId: "cz-upv-trademark-search",
    query: "trademark databases Czech ÚPV WIPO EUIPO",
  },
  {
    id: "cz-trademark-fees-name",
    targetId: "cz-upv-trademark-fees",
    query: "trademark administrative fees Czech",
  },
  {
    id: "cz-trademark-classification-name",
    targetId: "cz-upv-trademark-classification",
    query: "Nice Classification 13 2026 ochranné známky",
  },
  {
    id: "cz-trademark-law-name",
    targetId: "cz-upv-trademark-law",
    query: "Act 441 2003 Trademarks Czech legislation",
  },
  {
    id: "cz-trademark-common-practices-name",
    targetId: "cz-upv-trademark-common-practices",
    query: "Common Communications trademark practice EUIPO member states Czech",
  },
'''
retrieval = replace_once(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    czech_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    "retrieval Czech probes",
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace("toHaveLength(190)", "toHaveLength(197)", 2)
retrieval_test = retrieval_test.replace("toBe(\n      190,\n", "toBe(\n      197,\n", 1)
retrieval_test = replace_once(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "PL", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "PL", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "CZ", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    "retrieval test Czech jurisdiction",
)
retrieval_test_path.write_text(retrieval_test)

print("Czech ÚPV source coverage patch applied")
