from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
retrieval_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
retrieval_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


priority = priority_path.read_text()
romania_block = '''const OSIM_RO: Authority = {
  jurisdiction: "RO",
  authorityName: "State Office for Inventions and Trademarks (OSIM)",
  languages: ["ro-RO", "en"],
  verificationEvidenceUri: "https://www.osim.ro/en/basic-information-trademarks",
};

export const OSIM_RO_SOURCE_COVERAGE_TARGETS = [
  target(OSIM_RO, {
    id: "ro-osim-trademarks",
    family: "PORTAL",
    displayName: "OSIM Trademark Information",
    canonicalUri: "https://www.osim.ro/en/basic-information-trademarks",
    verificationEvidenceUri: "https://www.osim.ro/en/basic-information-trademarks",
    notes:
      "The current OSIM trademark hub links national legislation, fees, filing guides, Nice/TMclass classification resources and international trademark services.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-filing",
    family: "FILING",
    displayName: "OSIM Online Filing - Trademarks",
    canonicalUri: "https://www.osim.ro/en/online-filing-trademarks",
    entrypoints: [
      {
        uri: "https://www.osim.ro/en/online-filing-trademarks",
        label: "Online filing - trademarks",
      },
      {
        uri: "https://www.osim.ro/en/online-filing-trademarks/guides",
        label: "Trademark registration guides",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.osim.ro/en/online-filing-trademarks",
    notes:
      "OSIM supports national trademark filing online and publishes current registration guidance covering filing, publication, examination and registration steps.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-search",
    family: "SEARCH",
    displayName: "OSIM National Trademark Online Register",
    canonicalUri: "https://api.osim.ro:8443/tm-registry",
    entrypoints: [
      {
        uri: "https://api.osim.ro:8443/tm-registry",
        label: "National trademark online register",
      },
      {
        uri: "https://www.osim.ro/en/basic-information-trademarks?id=29&view=category",
        label: "OSIM trademark documentary-search guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.osim.ro/en/basic-information-trademarks?id=29&view=category",
    notes:
      "OSIM identifies the national trademark register at api.osim.ro as its public database for Romanian trademark records.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-fees",
    family: "FEES",
    displayName: "OSIM 2026 Trademark Fees - Annex 4",
    canonicalUri:
      "https://www.osim.ro/images/Taxe/2026/Taxe-PI-01.01.2026-Anexa-4-Marci-OSIM.pdf",
    expectedArtifactKinds: ["PDF"],
    verificationEvidenceUri:
      "https://www.osim.ro/images/Taxe/2026/Taxe-PI-01.01.2026-Anexa-4-Marci-OSIM.pdf",
    notes:
      "The official Annex 4 publishes trademark and geographical-indication fees applicable from 1 January 2026.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "OSIM Trademark Classification Guidance",
    canonicalUri: "https://www.osim.ro/en/online-filing-trademarks/guides",
    entrypoints: [
      {
        uri: "https://www.osim.ro/en/online-filing-trademarks/guides",
        label: "Registration guide and Nice classification guidance",
      },
      {
        uri: "https://www.osim.ro/en/basic-information-trademarks",
        label: "OSIM Nice Classification and TMclass links",
      },
    ],
    verificationEvidenceUri: "https://www.osim.ro/en/online-filing-trademarks/guides",
    notes:
      "OSIM requires goods and services to be identified by Nice classes and points applicants to its Nice Classification and TMclass resources; the guide is kept on the current filing surface rather than freezing an older static classification PDF.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "OSIM Trademark Legislation",
    canonicalUri: "https://osim.ro/en/legislation-trademarks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://osim.ro/en/legislation-trademarks",
    notes:
      "The official legislation page publishes Law No. 84/1998 on Trademarks and Geographical Indications, the implementing regulations and the current 2026 fee annex.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "OSIM Trademark Proceedings and Forms",
    canonicalUri: "https://osim.ro/en/forms-trademarks",
    entrypoints: [
      { uri: "https://osim.ro/en/forms-trademarks", label: "Trademark forms including opposition" },
      {
        uri: "https://osim.ro/en/board-of-cancellation-trademarks",
        label: "Trademark cancellation board proceedings",
      },
      {
        uri: "https://osim.ro/en/board-of-appeal-trademarks",
        label: "Trademark appeal board proceedings",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "DOCX"],
    verificationEvidenceUri: "https://osim.ro/en/forms-trademarks",
    notes:
      "OSIM publishes the opposition form and maintains current trademark appeal and cancellation-board proceeding surfaces.",
  }),
  target(OSIM_RO, {
    id: "ro-osim-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "OSIM Official Industrial Property Bulletin - Trademarks",
    canonicalUri: "https://osim.ro/en/trademarks-official-industrial-property-bulletin",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://osim.ro/en/trademarks-official-industrial-property-bulletin",
    notes:
      "The official BOPI Trademarks and Geographical Indications section publishes monthly 2026 issues and current trademark-application publication notices.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(
    priority,
    'const CIPO: Authority = {',
    romania_block + 'const CIPO: Authority = {',
    "insert Romania source block",
)
priority = replace_once(
    priority,
    '  ...HIPO_HU_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...HIPO_HU_SOURCE_COVERAGE_TARGETS,\n  ...OSIM_RO_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    "aggregate Romania targets",
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
catalog = replace_once(
    catalog,
    '  HIPO_HU_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  HIPO_HU_SOURCE_COVERAGE_TARGETS,\n  OSIM_RO_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    "catalog import Romania targets",
)
catalog = replace_once(
    catalog,
    '  HIPO_HU_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  HIPO_HU_SOURCE_COVERAGE_TARGETS,\n  OSIM_RO_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    "catalog export Romania targets",
)
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_once(
    priority_test,
    '  HIPO_HU_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  HIPO_HU_SOURCE_COVERAGE_TARGETS,\n  OSIM_RO_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    "priority test import Romania targets",
)
priority_test = replace_once(
    priority_test,
    '  ["HU", HIPO_HU_SOURCE_COVERAGE_TARGETS, ["sztnh.gov.hu"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["HU", HIPO_HU_SOURCE_COVERAGE_TARGETS, ["sztnh.gov.hu"]],\n  ["RO", OSIM_RO_SOURCE_COVERAGE_TARGETS, ["osim.ro"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority test Romania authority set",
)
priority_test = replace_once(
    priority_test,
    'ships explicit, official, unique coverage for twenty-seven priority national offices',
    'ships explicit, official, unique coverage for twenty-eight priority national offices',
    "priority office count label",
)
priority_test = priority_test.replace('toHaveLength(204)', 'toHaveLength(212)', 1)
priority_test = priority_test.replace('      204,\n', '      212,\n', 1)
priority_test = priority_test.replace('    ).toBe(204);', '    ).toBe(212);', 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
romania_probes = '''  {
    id: "ro-trademarks-name",
    targetId: "ro-osim-trademarks",
    query: "OSIM trademark information Romania",
  },
  {
    id: "ro-trademark-filing-name",
    targetId: "ro-osim-trademark-filing",
    query: "OSIM online trademark filing Romania",
  },
  {
    id: "ro-trademark-search-name",
    targetId: "ro-osim-trademark-search",
    query: "OSIM national trademark online register Romania",
  },
  {
    id: "ro-trademark-fees-name",
    targetId: "ro-osim-trademark-fees",
    query: "OSIM 2026 trademark fees Annex 4 Romania",
  },
  {
    id: "ro-trademark-classification-name",
    targetId: "ro-osim-trademark-classification",
    query: "OSIM Nice classification TMclass goods services Romania",
  },
  {
    id: "ro-trademark-law-name",
    targetId: "ro-osim-trademark-law",
    query: "Law 84 1998 trademarks geographical indications Romania OSIM",
  },
  {
    id: "ro-trademark-proceedings-name",
    targetId: "ro-osim-trademark-proceedings",
    query: "OSIM trademark opposition cancellation appeal forms Romania",
  },
'''
retrieval = replace_once(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    romania_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    "insert Romania retrieval probes",
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace('expect(targets).toHaveLength(211);', 'expect(targets).toHaveLength(218);', 1)
retrieval_test = retrieval_test.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(211);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(218);',
    1,
)
retrieval_test = retrieval_test.replace('      211,\n', '      218,\n', 1)
retrieval_test = replace_once(
    retrieval_test,
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "HU", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "HU", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "RO", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    "retrieval test Romania jurisdiction assertion",
)
retrieval_test_path.write_text(retrieval_test)
