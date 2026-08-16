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

norway_block = r'''const NIPO_NO: Authority = {
  jurisdiction: "NO",
  authorityName: "Norwegian Industrial Property Office (NIPO)",
  languages: ["nb-NO", "nn-NO", "en"],
  verificationEvidenceUri: "https://www.patentstyret.no/en/trademark",
};

export const NIPO_NO_SOURCE_COVERAGE_TARGETS = [
  target(NIPO_NO, {
    id: "no-nipo-trademarks",
    family: "PORTAL",
    displayName: "NIPO Trademarks",
    canonicalUri: "https://www.patentstyret.no/en/trademark",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-filing",
    family: "FILING",
    displayName: "NIPO Start a Trademark Application",
    canonicalUri: "https://www.patentstyret.no/en/trademark/start-a-trademark-application",
    verificationEvidenceUri:
      "https://www.patentstyret.no/en/trademark/start-a-trademark-application",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-search",
    family: "SEARCH",
    displayName: "NIPO Register Search",
    canonicalUri: "https://search.patentstyret.no/advanced/",
    entrypoints: [
      {
        uri: "https://www.patentstyret.no/en/services",
        label: "NIPO services and register guidance",
      },
      { uri: "https://search.patentstyret.no/advanced/", label: "The Register" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.patentstyret.no/en/services",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-fees",
    family: "FEES",
    displayName: "NIPO Trademark Fees",
    canonicalUri:
      "https://www.patentstyret.no/en/about-us/how-we-work/prices-trademark-patent-design",
    verificationEvidenceUri:
      "https://www.patentstyret.no/en/about-us/how-we-work/prices-trademark-patent-design",
    notes: "The official fee schedule was last modified on 1 July 2026.",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "NIPO Selection and Classification of Goods and Services",
    canonicalUri:
      "https://www.patentstyret.no/en/trademark/selection-and-classification-of-goods-and-services",
    entrypoints: [
      {
        uri: "https://www.patentstyret.no/en/trademark/selection-and-classification-of-goods-and-services",
        label: "Classification guidance",
      },
      {
        uri: "https://services.patentstyret.no/tmclassification",
        label: "Product selector",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://www.patentstyret.no/en/trademark/selection-and-classification-of-goods-and-services",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Norwegian Trademarks Act and Regulations",
    canonicalUri: "https://www.patentstyret.no/en/trademark/trademarks-act",
    entrypoints: [
      {
        uri: "https://www.patentstyret.no/en/trademark/trademarks-act",
        label: "Trademarks Act",
      },
      {
        uri: "https://www.patentstyret.no/en/trademark/regulations-to-the-norwegian-trademarks-act-norwegian-trademark-regulations",
        label: "Trademark Regulations",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.patentstyret.no/en/trademark/trademarks-act",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "NIPO Trademark Opposition and Administrative Review",
    canonicalUri: "https://www.patentstyret.no/en/trademark/trademark-appeal-options",
    entrypoints: [
      {
        uri: "https://www.patentstyret.no/en/trademark/trademark-appeal-options/opposition-in-a-trademark-case",
        label: "Opposition",
      },
      {
        uri: "https://www.patentstyret.no/en/trademark/trademark-appeal-options/administrative-review-in-a-trademark-case",
        label: "Administrative review",
      },
    ],
    verificationEvidenceUri: "https://www.patentstyret.no/en/trademark/trademark-appeal-options",
  }),
  target(NIPO_NO, {
    id: "no-nipo-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Norwegian Trademark Gazette",
    canonicalUri: "https://tidende.patentstyret.no/varemerke",
    entrypoints: [
      {
        uri: "https://www.patentstyret.no/en/about-us/how-we-work/about-the-gazette",
        label: "Gazette guidance",
      },
      { uri: "https://tidende.patentstyret.no/varemerke", label: "Digital Trademark Gazette" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "PDF", "IMAGE"],
    verificationEvidenceUri:
      "https://www.patentstyret.no/en/about-us/how-we-work/about-the-gazette",
    notes:
      "The digital Norwegian Gazette replaced PDF editions on 4 March 2024 and publishes the trademark gazette weekly every Monday.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''

priority = replace_once(
    priority,
    "const CIPO: Authority = {",
    norway_block + "const CIPO: Authority = {",
    "insert Norway coverage",
)
priority = replace_once(
    priority,
    "  ...PRV_SE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...PRV_SE_SOURCE_COVERAGE_TARGETS,\n  ...NIPO_NO_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "aggregate Norway coverage",
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
catalog = catalog.replace(
    "  PRV_SE_SOURCE_COVERAGE_TARGETS,\n",
    "  PRV_SE_SOURCE_COVERAGE_TARGETS,\n  NIPO_NO_SOURCE_COVERAGE_TARGETS,\n",
)
if catalog.count("NIPO_NO_SOURCE_COVERAGE_TARGETS") != 2:
    raise RuntimeError("catalog: expected Norway import and export")
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_once(
    priority_test,
    "  PRV_SE_SOURCE_COVERAGE_TARGETS,\n",
    "  PRV_SE_SOURCE_COVERAGE_TARGETS,\n  NIPO_NO_SOURCE_COVERAGE_TARGETS,\n",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["SE", PRV_SE_SOURCE_COVERAGE_TARGETS, ["prv.se"]],\n',
    '  ["SE", PRV_SE_SOURCE_COVERAGE_TARGETS, ["prv.se"]],\n  ["NO", NIPO_NO_SOURCE_COVERAGE_TARGETS, ["patentstyret.no"]],\n',
    "priority test authority set",
)
priority_test = priority_test.replace(
    'ships explicit, official, unique coverage for seventeen priority national offices',
    'ships explicit, official, unique coverage for eighteen priority national offices',
)
priority_test = priority_test.replace("toHaveLength(124)", "toHaveLength(132)", 1)
priority_test = priority_test.replace("toBe(\n      124,\n", "toBe(\n      132,\n", 1)
priority_test = priority_test.replace(").toBe(124);", ").toBe(132);", 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
norway_probes = r'''  {
    id: "no-trademarks-name",
    targetId: "no-nipo-trademarks",
    query: "NIPO trademarks Norway",
  },
  {
    id: "no-trademark-filing-name",
    targetId: "no-nipo-trademark-filing",
    query: "start trademark application",
  },
  {
    id: "no-trademark-search-name",
    targetId: "no-nipo-trademark-search",
    query: "register search trademarks Norway",
  },
  {
    id: "no-trademark-fees-name",
    targetId: "no-nipo-trademark-fees",
    query: "trademark fees price list",
  },
  {
    id: "no-trademark-classification-name",
    targetId: "no-nipo-trademark-classification",
    query: "classification goods services product selector",
  },
  {
    id: "no-trademark-law-name",
    targetId: "no-nipo-trademark-law",
    query: "Norwegian Trademarks Act regulations",
  },
  {
    id: "no-trademark-proceedings-name",
    targetId: "no-nipo-trademark-proceedings",
    query: "trademark opposition administrative review",
  },
'''
retrieval = replace_once(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    norway_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    "retrieval Norway probes",
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace("toHaveLength(141)", "toHaveLength(148)", 2)
retrieval_test = retrieval_test.replace("toBe(\n      141,\n", "toBe(\n      148,\n", 1)
retrieval_test = replace_once(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "SE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "SE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "NO", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    "retrieval test Norway jurisdiction",
)
retrieval_test_path.write_text(retrieval_test)

print("Norway NIPO source coverage patch applied")
