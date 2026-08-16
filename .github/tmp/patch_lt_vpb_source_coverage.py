from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
retrieval_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
retrieval_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")


def replace_first(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"{label}: anchor not found")
    return text.replace(old, new, 1)


priority = priority_path.read_text()
lithuania_block = '''const VPB_LT: Authority = {
  jurisdiction: "LT",
  authorityName: "State Patent Bureau of the Republic of Lithuania (VPB)",
  languages: ["lt-LT", "en"],
  verificationEvidenceUri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/",
};

export const VPB_LT_SOURCE_COVERAGE_TARGETS = [
  target(VPB_LT, {
    id: "lt-vpb-trademarks",
    family: "PORTAL",
    displayName: "Lithuanian State Patent Bureau Trademarks",
    canonicalUri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/",
    verificationEvidenceUri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/",
    notes:
      "The current trademark hub, updated in July 2026, links national registration, online requests, search, Nice classification, fees, disputes, validity, international protection and legislation.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-filing",
    family: "FILING",
    displayName: "Lithuanian State Patent Bureau Trademark Filing",
    canonicalUri:
      "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/kaip-iregistruoti-prekiu-zenkla/",
    entrypoints: [
      {
        uri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/kaip-iregistruoti-prekiu-zenkla/",
        label: "Trademark registration guidance",
      },
      {
        uri: "https://vpb.lrv.lt/lt/apie-valstybini-patentu-biura-1/paslaugos/",
        label: "Current electronic services hub",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/kaip-iregistruoti-prekiu-zenkla/",
    notes:
      "The national guidance covers electronic filing, EUR 180 filing fee, additional Nice classes, examination, publication in the official bulletin and subsequent opposition; the current services page states that all Bureau services are available electronically.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-search",
    family: "SEARCH",
    displayName: "Lithuanian State Patent Bureau Trademark Databases",
    canonicalUri: "https://vpb.lrv.lt/lt/duomenu-bazes/",
    entrypoints: [
      { uri: "https://vpb.lrv.lt/lt/duomenu-bazes/", label: "Current VPB databases hub" },
      {
        uri: "https://vpb.lrv.lt/en/services/trademarks/databases-2/",
        label: "English trademark database guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://vpb.lrv.lt/lt/duomenu-bazes/",
    notes:
      "The current database hub, updated in June 2026, provides national trademark search and related industrial-property databases.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-fees",
    family: "FEES",
    displayName: "Lithuanian State Patent Bureau Trademark Fees",
    canonicalUri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/mokesciai/",
    entrypoints: [
      {
        uri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/mokesciai/",
        label: "Current Lithuanian trademark fee table",
      },
      { uri: "https://vpb.lrv.lt/en/services/trademarks/fees-2/", label: "English fee table" },
    ],
    verificationEvidenceUri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/mokesciai/",
    notes:
      "The official fee table publishes the current trademark charges, including EUR 180 filing, EUR 40 for each class after the first, EUR 160 opposition and EUR 180 invalidation or cancellation.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Lithuanian State Patent Bureau Nice Classification Guidance",
    canonicalUri:
      "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/prekiu-ir-paslaugu-klasifikacija/",
    entrypoints: [
      {
        uri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/prekiu-ir-paslaugu-klasifikacija/",
        label: "Goods and services classification guidance",
      },
      {
        uri: "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/prekiu-ir-paslaugu-klasifikacija/nicos-klasifikacija/",
        label: "Nice Classification hub",
      },
    ],
    verificationEvidenceUri:
      "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/prekiu-ir-paslaugu-klasifikacija/",
    notes:
      "VPB requires goods and services to be classified under the edition of the Nice Classification in force on the filing date and links Nice and TMclass resources; this avoids freezing a stale edition number into the canonical source.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Lithuania Trademark Legal Acts",
    canonicalUri:
      "https://vpb.lrv.lt/lt/teisine-informacija/teises-aktai/prekiu-zenklai-2/lietuvos-respublikos-teises-aktai-2/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://vpb.lrv.lt/lt/teisine-informacija/teises-aktai/prekiu-zenklai-2/lietuvos-respublikos-teises-aktai-2/",
    notes:
      "The current legal-acts page, updated in July 2026, publishes the Lithuanian Law on Trademarks, Trademark Register rules, registration rules and rules governing appeals, opposition, invalidity and cancellation.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Lithuania Trademark Appeals, Opposition, Invalidity and Cancellation",
    canonicalUri:
      "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/gincai-del-prekiu-zenklu/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://vpb.lrv.lt/lt/veiklos-sritys/prekiu-zenklai/gincai-del-prekiu-zenklu/",
    notes:
      "The Bureau's Appeals Division conducts mandatory pre-litigation trademark disputes, including appeals, opposition, invalidity and cancellation; the current service describes the statutory filing periods and electronic submission route.",
  }),
  target(VPB_LT, {
    id: "lt-vpb-official-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "Lithuanian State Patent Bureau Official Bulletin - Trademarks and Designs",
    canonicalUri: "https://vpb.lrv.lt/en/structure-and-contacts-1/official-bulletin/2026/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://vpb.lrv.lt/en/structure-and-contacts-1/official-bulletin/2026/",
    notes:
      "The official 2026 bulletin page publishes the Trademarks and Designs issues throughout the year, with issue 14 dated 27 July 2026; it is the current change-signal publication surface for national trademark events.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', lithuania_block + 'const CIPO: Authority = {', 'insert Lithuania block')
priority = replace_first(
    priority,
    '  ...LPO_LV_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...LPO_LV_SOURCE_COVERAGE_TARGETS,\n  ...VPB_LT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Lithuania targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  LPO_LV_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  LPO_LV_SOURCE_COVERAGE_TARGETS,\n  VPB_LT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Lithuania targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Lithuania targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  LPO_LV_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  LPO_LV_SOURCE_COVERAGE_TARGETS,\n  VPB_LT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Lithuania targets',
)
priority_test = replace_first(
    priority_test,
    '  ["LV", LPO_LV_SOURCE_COVERAGE_TARGETS, ["lrpv.gov.lv"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["LV", LPO_LV_SOURCE_COVERAGE_TARGETS, ["lrpv.gov.lv"]],\n  ["LT", VPB_LT_SOURCE_COVERAGE_TARGETS, ["vpb.lrv.lt"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Lithuania authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for thirty-six priority national offices',
    'ships explicit, official, unique coverage for thirty-seven priority national offices',
    'priority office count label',
)
priority_test = priority_test.replace('toHaveLength(276)', 'toHaveLength(284)', 1)
priority_test = priority_test.replace('      276,\n', '      284,\n', 1)
priority_test = priority_test.replace('    ).toBe(276);', '    ).toBe(284);', 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
lithuania_probes = '''  {
    id: "lt-trademarks-name",
    targetId: "lt-vpb-trademarks",
    query: "Lithuania State Patent Bureau trademarks",
  },
  {
    id: "lt-trademark-filing-name",
    targetId: "lt-vpb-trademark-filing",
    query: "Lithuania trademark registration electronic filing VPB",
  },
  {
    id: "lt-trademark-search-name",
    targetId: "lt-vpb-trademark-search",
    query: "Lithuania VPB trademark databases search",
  },
  {
    id: "lt-trademark-fees-name",
    targetId: "lt-vpb-trademark-fees",
    query: "Lithuania trademark fees filing opposition invalidation",
  },
  {
    id: "lt-trademark-classification-name",
    targetId: "lt-vpb-trademark-classification",
    query: "Lithuania trademark Nice classification goods services TMclass",
  },
  {
    id: "lt-trademark-law-name",
    targetId: "lt-vpb-trademark-law",
    query: "Lithuania Law on Trademarks registration rules",
  },
  {
    id: "lt-trademark-proceedings-name",
    targetId: "lt-vpb-trademark-proceedings",
    query: "Lithuania trademark appeal opposition invalidity cancellation Appeals Division",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    lithuania_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Lithuania retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace('expect(targets).toHaveLength(274);', 'expect(targets).toHaveLength(281);', 1)
retrieval_test = retrieval_test.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(274);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(281);',
    1,
)
retrieval_test = retrieval_test.replace('      274,\n', '      281,\n', 1)
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "LV", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "LV", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "LT", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    'retrieval test Lithuania jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
