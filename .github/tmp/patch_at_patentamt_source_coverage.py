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

austria_block = r'''const PATENTAMT_AT: Authority = {
  jurisdiction: "AT",
  authorityName: "Austrian Patent Office (Österreichisches Patentamt)",
  languages: ["de-AT", "en"],
  verificationEvidenceUri: "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark",
};

export const PATENTAMT_AT_SOURCE_COVERAGE_TARGETS = [
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademarks",
    family: "PORTAL",
    displayName: "Austrian Patent Office Trademark Protection",
    canonicalUri: "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-filing",
    family: "FILING",
    displayName: "Austrian Patent Office National Trademark",
    canonicalUri:
      "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark/national-trademark",
    verificationEvidenceUri:
      "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark/national-trademark",
    notes:
      "The national trademark page documents digital Online Filing, paper filing, examination, publication and post-refusal remedies.",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-search",
    family: "SEARCH",
    displayName: "Austrian Patent Office see.ip Trademark Search",
    canonicalUri: "https://seeip.patentamt.at/en/markesuche",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://seeip.patentamt.at/en/markesuche",
    notes:
      "see.ip is the Austrian Patent Office register search and exposes national, EU and international trademark records relevant to Austria.",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-fees",
    family: "FEES",
    displayName: "Austrian Patent Office Trademark Application Fees",
    canonicalUri: "https://www.patentamt.at/en/apply-for-protection/application-fees",
    verificationEvidenceUri: "https://www.patentamt.at/en/apply-for-protection/application-fees",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Austrian Patent Office Trademark Classification",
    canonicalUri:
      "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark/national-trademark/trademark-classification",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.patentamt.at/en/apply-for-protection/protect-a-trademark/national-trademark/trademark-classification",
    notes:
      "The current classification page publishes Nice Classification NCL 13-2026 materials effective from 1 January 2026.",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Austrian Patent Office Law and Legislation",
    canonicalUri: "https://www.patentamt.at/en/about-us/law-legislation",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.patentamt.at/en/about-us/law-legislation",
    notes:
      "The official legal hub publishes current versions in force, including the Trademark Protection Act and Patent Office rules.",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Austrian Patent Office Trademark Proceedings and Appeals",
    canonicalUri:
      "https://www.patentamt.at/en/manage-preserve-protection/trademarks/proceedings-appeals",
    verificationEvidenceUri:
      "https://www.patentamt.at/en/manage-preserve-protection/trademarks/proceedings-appeals",
    notes:
      "The official proceedings page covers opposition, cancellation before the Nullity Department and appeals, with current procedural fees and deadlines.",
  }),
  target(PATENTAMT_AT, {
    id: "at-patentamt-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Austrian Trademark Gazette",
    canonicalUri:
      "https://www.patentamt.at/en/manage-preserve-protection/trademarks/trademark-gazette",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.patentamt.at/en/manage-preserve-protection/trademarks/trademark-gazette",
    notes:
      "The Austrian Trademark Gazette is published on the 20th of each month and currently provides 2026 issues including July 2026.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''

priority = replace_once(priority, "const CIPO: Authority = {", austria_block + "const CIPO: Authority = {", "insert Austria coverage")
priority = replace_once(
    priority,
    "  ...PRH_FI_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...PRH_FI_SOURCE_COVERAGE_TARGETS,\n  ...PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "aggregate Austria coverage",
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
catalog = catalog.replace(
    "  PRH_FI_SOURCE_COVERAGE_TARGETS,\n",
    "  PRH_FI_SOURCE_COVERAGE_TARGETS,\n  PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,\n",
)
if catalog.count("PATENTAMT_AT_SOURCE_COVERAGE_TARGETS") != 2:
    raise RuntimeError("catalog: expected Austria import and export")
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_once(
    priority_test,
    "  PRH_FI_SOURCE_COVERAGE_TARGETS,\n",
    "  PRH_FI_SOURCE_COVERAGE_TARGETS,\n  PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,\n",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["FI", PRH_FI_SOURCE_COVERAGE_TARGETS, ["prh.fi"]],\n',
    '  ["FI", PRH_FI_SOURCE_COVERAGE_TARGETS, ["prh.fi"]],\n  ["AT", PATENTAMT_AT_SOURCE_COVERAGE_TARGETS, ["patentamt.at"]],\n',
    "priority test authority set",
)
priority_test = priority_test.replace(
    'ships explicit, official, unique coverage for twenty priority national offices',
    'ships explicit, official, unique coverage for twenty-one priority national offices',
)
priority_test = priority_test.replace("toHaveLength(148)", "toHaveLength(156)", 1)
priority_test = priority_test.replace("toBe(\n      148,\n", "toBe(\n      156,\n", 1)
priority_test = priority_test.replace(").toBe(148);", ").toBe(156);", 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
austria_probes = r'''  {
    id: "at-trademarks-name",
    targetId: "at-patentamt-trademarks",
    query: "Austrian Patent Office trademark protection",
  },
  {
    id: "at-trademark-filing-name",
    targetId: "at-patentamt-trademark-filing",
    query: "national trademark online filing Austria",
  },
  {
    id: "at-trademark-search-name",
    targetId: "at-patentamt-trademark-search",
    query: "see.ip trademark search Austria",
  },
  {
    id: "at-trademark-fees-name",
    targetId: "at-patentamt-trademark-fees",
    query: "trademark application fees Austria",
  },
  {
    id: "at-trademark-classification-name",
    targetId: "at-patentamt-trademark-classification",
    query: "Nice Classification NCL 13-2026 trademark",
  },
  {
    id: "at-trademark-law-name",
    targetId: "at-patentamt-trademark-law",
    query: "Trademark Protection Act law legislation Austria",
  },
  {
    id: "at-trademark-proceedings-name",
    targetId: "at-patentamt-trademark-proceedings",
    query: "trademark opposition cancellation proceedings appeals Austria",
  },
'''
retrieval = replace_once(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    austria_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    "retrieval Austria probes",
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace("toHaveLength(162)", "toHaveLength(169)", 2)
retrieval_test = retrieval_test.replace("toBe(\n      162,\n", "toBe(\n      169,\n", 1)
retrieval_test = replace_once(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "FI", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "FI", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "AT", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    "retrieval test Austria jurisdiction",
)
retrieval_test_path.write_text(retrieval_test)

print("Austria Patent Office source coverage patch applied")
