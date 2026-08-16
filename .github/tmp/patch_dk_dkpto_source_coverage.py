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

denmark_block = r'''const DKPTO_DK: Authority = {
  jurisdiction: "DK",
  authorityName: "Danish Patent and Trademark Office (DKPTO)",
  languages: ["da-DK", "en"],
  verificationEvidenceUri: "https://www.dkpto.org/about-ip-rights/trademarks",
};

export const DKPTO_DK_SOURCE_COVERAGE_TARGETS = [
  target(DKPTO_DK, {
    id: "dk-dkpto-trademarks",
    family: "PORTAL",
    displayName: "DKPTO Trademarks",
    canonicalUri: "https://www.dkpto.org/about-ip-rights/trademarks",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-filing",
    family: "FILING",
    displayName: "DKPTO Apply for a Trademark",
    canonicalUri: "https://www.dkpto.org/apply/apply-trademarks",
    entrypoints: [
      { uri: "https://www.dkpto.org/apply/apply-trademarks", label: "Trademark filing guidance" },
      {
        uri: "https://www.dkpto.org/news/2025/dec/new-submission-system-for-electronic-trademark-applications",
        label: "eFiling launch notice",
      },
    ],
    verificationEvidenceUri: "https://www.dkpto.org/apply/apply-trademarks",
    notes:
      "DKPTO launched its new electronic trademark eFiling system on 16 December 2025, integrated with PVS Pay.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-search",
    family: "SEARCH",
    displayName: "DKPTO PVSOnline Trademark Search",
    canonicalUri: "https://onlineweb.dkpto.dk/pvsonline/?language=GB",
    entrypoints: [
      { uri: "https://www.dkpto.org/search-databases", label: "Search databases guidance" },
      { uri: "https://onlineweb.dkpto.dk/pvsonline/?language=GB", label: "PVSOnline" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.dkpto.org/terms-and-conditions/pvsonline",
    notes:
      "PVSOnline exposes Danish trademark applications, registrations and Madrid marks effective in Denmark and is updated on business days.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-fees",
    family: "FEES",
    displayName: "DKPTO Trademark Prices and Fees",
    canonicalUri: "https://www.dkpto.org/about-ip-rights/prices-and-fees",
    verificationEvidenceUri: "https://www.dkpto.org/about-ip-rights/prices-and-fees",
    notes:
      "The current fee schedule reflects the 2026 fee adjustment and includes application, renewal, opposition and administrative revocation fees.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "DKPTO Trademark Guidelines (Varemærkehåndbogen)",
    canonicalUri: "https://vmguidelines.dkpto.dk/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://vmguidelines.dkpto.dk/",
    notes:
      "The official Trademark Guidelines are a living practice tool explaining DKPTO interpretation and application of the Trade Marks Act and related rules.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "DKPTO Goods and Services Classification Guidance",
    canonicalUri:
      "https://www.dkpto.dk/bliv-klogere-paa-rettigheder/navn-og-logo/varer-og-tjenesteydelser",
    entrypoints: [
      {
        uri: "https://www.dkpto.dk/bliv-klogere-paa-rettigheder/navn-og-logo/varer-og-tjenesteydelser",
        label: "Goods and services guidance",
      },
      {
        uri: "https://vmguidelines.dkpto.dk/aa/aaa/varefortegnelser/saerligt-om-nice-klassifikationen.aspx",
        label: "Nice Classification practice guidance",
      },
    ],
    verificationEvidenceUri:
      "https://www.dkpto.dk/bliv-klogere-paa-rettigheder/navn-og-logo/varer-og-tjenesteydelser",
    notes:
      "DKPTO requires goods and services to be classified under the Nice Classification and maintains detailed class guidance in the Trademark Guidelines.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "DKPTO Trademark Law",
    canonicalUri: "https://www.dkpto.org/about-ip-rights/ip-law",
    entrypoints: [
      { uri: "https://www.dkpto.org/about-ip-rights/ip-law", label: "IP law and trademark legislation" },
      {
        uri: "https://vmguidelines.dkpto.dk/love-og-regler-med-tilknyttede-artikler/varemaerkeloven-%28lbk-nr-88-af-29012019%29.aspx",
        label: "Trade Marks Act with current DKPTO annotations",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.dkpto.org/about-ip-rights/ip-law",
    notes:
      "The official legal hub lists the Trade Marks Act and implementing order; the Trademark Guidelines reflect the fee-law amendments effective 1 January 2026.",
  }),
  target(DKPTO_DK, {
    id: "dk-dkpto-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Dansk Varemærketidende Current Publications",
    canonicalUri: "https://onlineweb.dkpto.dk/pvsonline/Varemaerke",
    entrypoints: [
      { uri: "https://onlineweb.dkpto.dk/pvsonline/Varemaerke", label: "PVSOnline trademark publication surface" },
      {
        uri: "https://onlineweb.dkpto.dk/pvsonline/Varemaerke?action=101&sagID=VA+2026+00258",
        label: "Current 2026 Gazette publication evidence",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://onlineweb.dkpto.dk/pvsonline/Varemaerke?action=101&sagID=VA+2026+00258",
    notes:
      "Current PVSOnline trademark records expose Dansk Varemærketidende publication events, including 2026 application/opposition and registration publications.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''

priority = replace_once(
    priority,
    "const CIPO: Authority = {",
    denmark_block + "const CIPO: Authority = {",
    "insert Denmark coverage",
)
priority = replace_once(
    priority,
    "  ...NIPO_NO_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...NIPO_NO_SOURCE_COVERAGE_TARGETS,\n  ...DKPTO_DK_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "aggregate Denmark coverage",
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
catalog = catalog.replace(
    "  NIPO_NO_SOURCE_COVERAGE_TARGETS,\n",
    "  NIPO_NO_SOURCE_COVERAGE_TARGETS,\n  DKPTO_DK_SOURCE_COVERAGE_TARGETS,\n",
)
if catalog.count("DKPTO_DK_SOURCE_COVERAGE_TARGETS") != 2:
    raise RuntimeError("catalog: expected Denmark import and export")
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_once(
    priority_test,
    "  NIPO_NO_SOURCE_COVERAGE_TARGETS,\n",
    "  NIPO_NO_SOURCE_COVERAGE_TARGETS,\n  DKPTO_DK_SOURCE_COVERAGE_TARGETS,\n",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["NO", NIPO_NO_SOURCE_COVERAGE_TARGETS, ["patentstyret.no"]],\n',
    '  ["NO", NIPO_NO_SOURCE_COVERAGE_TARGETS, ["patentstyret.no"]],\n  ["DK", DKPTO_DK_SOURCE_COVERAGE_TARGETS, ["dkpto.org", "dkpto.dk"]],\n',
    "priority test authority set",
)
priority_test = priority_test.replace(
    'ships explicit, official, unique coverage for eighteen priority national offices',
    'ships explicit, official, unique coverage for nineteen priority national offices',
)
priority_test = priority_test.replace("toHaveLength(132)", "toHaveLength(140)", 1)
priority_test = priority_test.replace("toBe(\n      132,\n", "toBe(\n      140,\n", 1)
priority_test = priority_test.replace(").toBe(132);", ").toBe(140);", 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
denmark_probes = r'''  {
    id: "dk-trademarks-name",
    targetId: "dk-dkpto-trademarks",
    query: "DKPTO trademarks Denmark",
  },
  {
    id: "dk-trademark-filing-name",
    targetId: "dk-dkpto-trademark-filing",
    query: "apply trademark eFiling Denmark",
  },
  {
    id: "dk-trademark-search-name",
    targetId: "dk-dkpto-trademark-search",
    query: "PVSOnline trademark search",
  },
  {
    id: "dk-trademark-fees-name",
    targetId: "dk-dkpto-trademark-fees",
    query: "trademark prices fees",
  },
  {
    id: "dk-trademark-guidelines-name",
    targetId: "dk-dkpto-trademark-guidelines",
    query: "Varemærkehåndbogen trademark guidelines",
  },
  {
    id: "dk-trademark-classification-name",
    targetId: "dk-dkpto-trademark-classification",
    query: "Nice classification varer tjenesteydelser",
  },
  {
    id: "dk-trademark-law-name",
    targetId: "dk-dkpto-trademark-law",
    query: "trademark law Trade Marks Act Denmark",
  },
'''
retrieval = replace_once(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    denmark_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    "retrieval Denmark probes",
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace("toHaveLength(148)", "toHaveLength(155)", 2)
retrieval_test = retrieval_test.replace("toBe(\n      148,\n", "toBe(\n      155,\n", 1)
retrieval_test = replace_once(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "NO", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "NO", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "DK", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    "retrieval test Denmark jurisdiction",
)
retrieval_test_path.write_text(retrieval_test)

print("Denmark DKPTO source coverage patch applied")
