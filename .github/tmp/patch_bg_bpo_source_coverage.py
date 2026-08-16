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
bulgaria_block = '''const BPO_BG: Authority = {
  jurisdiction: "BG",
  authorityName: "Patent Office of the Republic of Bulgaria (BPO)",
  languages: ["bg-BG", "en"],
  verificationEvidenceUri: "https://www.bpo.bg/en/obekti/marki/nay-vazhnoto-za-markata",
};

export const BPO_BG_SOURCE_COVERAGE_TARGETS = [
  target(BPO_BG, {
    id: "bg-bpo-trademarks",
    family: "PORTAL",
    displayName: "BPO Trademark Summary",
    canonicalUri: "https://www.bpo.bg/en/obekti/marki/nay-vazhnoto-za-markata",
    verificationEvidenceUri: "https://www.bpo.bg/en/obekti/marki/nay-vazhnoto-za-markata",
    notes:
      "The official trademark summary explains protectable signs, collective and certification marks, acquisition of rights and ten-year renewable protection.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-filing",
    family: "FILING",
    displayName: "BPO National Trademark Registration Procedure",
    canonicalUri:
      "https://www.bpo.bg/en/obekti/marki/vazmozhnost-za-registratsiya/registratsiya-po-natsionalen-red",
    entrypoints: [
      {
        uri: "https://www.bpo.bg/en/obekti/marki/vazmozhnost-za-registratsiya/registratsiya-po-natsionalen-red",
        label: "National trademark registration procedure",
      },
      {
        uri: "https://portal.bpo.bg/bpo-portal/eservices/services-trademark/service-definition/tm-efiling",
        label: "BPO electronic trademark filing",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://www.bpo.bg/en/obekti/marki/vazmozhnost-za-registratsiya/registratsiya-po-natsionalen-red",
    notes:
      "The current national procedure covers electronic filing, filing-date requirements, absolute-ground examination, publication, three-month opposition and registration.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-search",
    family: "SEARCH",
    displayName: "BPO State Register of Trademarks",
    canonicalUri: "https://portal.bpo.bg/bpo-registers/marks",
    entrypoints: [
      { uri: "https://www.bpo.bg/en/registri", label: "BPO state registers directory" },
      { uri: "https://portal.bpo.bg/bpo-registers/marks", label: "State Register of Trademarks" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.bpo.bg/en/registri",
    notes:
      "BPO's official registers directory links the public State Register of Trademarks on portal.bpo.bg.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-fees",
    family: "FEES",
    displayName: "BPO 2026 Tariffs and Trademark Fees",
    canonicalUri: "https://www.bpo.bg/en/tarifi",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.bpo.bg/en/tarifi",
    notes:
      "The official tariff surface publishes the Patent Office fee tariff and public-service price list in force from 1 January 2026, including trademark filing and proceeding fees.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "BPO Trademark Goods and Services Classification Guidance",
    canonicalUri: "https://www.bpo.bg/en/chzv/chzv-natsionalna-marka",
    entrypoints: [
      {
        uri: "https://www.bpo.bg/en/chzv/chzv-natsionalna-marka",
        label: "Current national trademark guidance with Nice-class requirements",
      },
      {
        uri: "https://www.bpo.bg/en/obekti/marki/klasifikatsii/nice-klasifikatsiya",
        label: "BPO Nice Classification reference page",
      },
    ],
    verificationEvidenceUri: "https://www.bpo.bg/en/chzv/chzv-natsionalna-marka",
    notes:
      "Current BPO national guidance requires applicants to choose Nice classes and provide the full goods/services list. The standalone BPO Nice page remains on a 2024 version, so it is retained only as a supplementary reference rather than the current canonical source.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "BPO Trademark Legislation",
    canonicalUri: "https://www.bpo.bg/bg/obekti/marki/zakonodatelstvo",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.bpo.bg/bg/obekti/marki/zakonodatelstvo",
    notes:
      "The Bulgarian-language official legislation page publishes the Trademarks and Geographical Indications Act as amended in State Gazette No. 24 of 6 March 2026, together with application, opposition and dispute ordinances.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "BPO Trademark Opposition, Appeals, Revocation and Invalidity",
    canonicalUri: "https://www.bpo.bg/en/obekti/sporove/sporove-protsedura",
    entrypoints: [
      {
        uri: "https://www.bpo.bg/en/obekti/sporove/sporove-protsedura",
        label: "Industrial-property dispute procedure",
      },
      {
        uri: "https://www.bpo.bg/en/obekti/sporove/sporove-elektronni-uslugi",
        label: "Electronic trademark appeal, revocation and invalidity services",
      },
      {
        uri: "https://www.bpo.bg/bg/obekti/marki/marki-elektronni-uslugi/",
        label: "Electronic trademark opposition service",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.bpo.bg/en/obekti/sporove/sporove-protsedura",
    notes:
      "BPO dispute panels hear opposition appeals and requests for invalidity, revocation and cancellation; official electronic services expose the corresponding trademark submissions.",
  }),
  target(BPO_BG, {
    id: "bg-bpo-official-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "BPO Official Bulletin",
    canonicalUri: "https://www.bpo.bg/en/publikacii/bulletin",
    entrypoints: [
      { uri: "https://www.bpo.bg/en/publikacii/bulletin", label: "Official Bulletin guidance" },
      { uri: "https://portal.bpo.bg/bpo-journal/", label: "Electronic BPO Bulletin" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "PDF"],
    verificationEvidenceUri: "https://www.bpo.bg/en/publikacii/bulletin",
    notes:
      "The official bulletin is electronic-only and issued twice monthly; it publishes trademark applications, registrations and State Register changes.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', bulgaria_block + 'const CIPO: Authority = {', 'insert Bulgaria block')
priority = replace_first(
    priority,
    '  ...OSIM_RO_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...OSIM_RO_SOURCE_COVERAGE_TARGETS,\n  ...BPO_BG_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Bulgaria targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  OSIM_RO_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  OSIM_RO_SOURCE_COVERAGE_TARGETS,\n  BPO_BG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Bulgaria targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Bulgaria targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  OSIM_RO_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  OSIM_RO_SOURCE_COVERAGE_TARGETS,\n  BPO_BG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Bulgaria targets',
)
priority_test = replace_first(
    priority_test,
    '  ["RO", OSIM_RO_SOURCE_COVERAGE_TARGETS, ["osim.ro"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["RO", OSIM_RO_SOURCE_COVERAGE_TARGETS, ["osim.ro"]],\n  ["BG", BPO_BG_SOURCE_COVERAGE_TARGETS, ["bpo.bg"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Bulgaria authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for twenty-eight priority national offices',
    'ships explicit, official, unique coverage for twenty-nine priority national offices',
    'priority office count label',
)
priority_test = priority_test.replace('toHaveLength(212)', 'toHaveLength(220)', 1)
priority_test = priority_test.replace('      212,\n', '      220,\n', 1)
priority_test = priority_test.replace('    ).toBe(212);', '    ).toBe(220);', 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
bulgaria_probes = '''  {
    id: "bg-trademarks-name",
    targetId: "bg-bpo-trademarks",
    query: "Bulgaria Patent Office trademark summary",
  },
  {
    id: "bg-trademark-filing-name",
    targetId: "bg-bpo-trademark-filing",
    query: "Bulgaria national trademark registration filing opposition",
  },
  {
    id: "bg-trademark-search-name",
    targetId: "bg-bpo-trademark-search",
    query: "Bulgaria State Register trademarks BPO",
  },
  {
    id: "bg-trademark-fees-name",
    targetId: "bg-bpo-trademark-fees",
    query: "Bulgaria Patent Office tariff fees 2026 trademarks",
  },
  {
    id: "bg-trademark-classification-name",
    targetId: "bg-bpo-trademark-classification",
    query: "Bulgaria trademark Nice classes goods services list",
  },
  {
    id: "bg-trademark-law-name",
    targetId: "bg-bpo-trademark-law",
    query: "Bulgaria Trademarks Geographical Indications Act 2026",
  },
  {
    id: "bg-trademark-proceedings-name",
    targetId: "bg-bpo-trademark-proceedings",
    query: "Bulgaria trademark opposition appeal revocation invalidity BPO",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    bulgaria_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Bulgaria retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace('expect(targets).toHaveLength(218);', 'expect(targets).toHaveLength(225);', 1)
retrieval_test = retrieval_test.replace('expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(218);', 'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(225);', 1)
retrieval_test = retrieval_test.replace('      218,\n', '      225,\n', 1)
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "RO", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "RO", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "BG", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    'retrieval test Bulgaria jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
