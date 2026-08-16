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
croatia_block = '''const DZIV_HR: Authority = {
  jurisdiction: "HR",
  authorityName: "State Intellectual Property Office of the Republic of Croatia (SIPO/DZIV)",
  languages: ["hr-HR", "en"],
  verificationEvidenceUri:
    "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/",
};

export const DZIV_HR_SOURCE_COVERAGE_TARGETS = [
  target(DZIV_HR, {
    id: "hr-dziv-trademarks",
    family: "PORTAL",
    displayName: "Croatia SIPO Trademark Registration Process",
    canonicalUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/",
    verificationEvidenceUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/",
    notes:
      "The current national registration hub explains Nice-class goods/services lists, filing requirements, applicable law, prior-right searches and the Croatian trademark registration route.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-filing",
    family: "FILING",
    displayName: "Croatia SIPO e-Filing for Trademarks",
    canonicalUri: "https://www.dziv.hr/en/e-services/e-filing/trademarks/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://www.dziv.hr/en/e-services/e-filing/trademarks/",
    notes:
      "The trademark e-filing service page, updated in March 2026, covers national applications and subsequent submissions including opposition, revocation and invalidity proceedings.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-search",
    family: "SEARCH",
    displayName: "Croatia SIPO e-Register of Trademarks",
    canonicalUri: "https://www.dziv.hr/en/e-services/e-registers/trademarks/",
    entrypoints: [
      {
        uri: "https://www.dziv.hr/en/e-services/e-registers/trademarks/",
        label: "National trademark e-register",
      },
      {
        uri: "https://www.dziv.hr/en/e-services/e-registers/",
        label: "SIPO e-registers directory",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.dziv.hr/en/e-services/e-registers/trademarks/",
    notes:
      "SIPO provides a public online trademark e-register for Croatian national trademark applications and registrations.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-fees",
    family: "FEES",
    displayName: "Croatia SIPO Trademark Fees",
    canonicalUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/fees/",
    entrypoints: [
      {
        uri: "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/fees/",
        label: "Trademark procedural costs",
      },
      { uri: "https://www.dziv.hr/en/forms-and-publications/fees/", label: "SIPO fees legal basis" },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/fees/",
    notes:
      "The official fee surface links the basic trademark procedural costs and the legislation governing administrative and professional-service charges.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Croatia SIPO Nice Classification and TMclass Practice",
    canonicalUri:
      "https://www.dziv.hr/hr/prirucnik-za-ispitivanje-zigova/poglavlje-iii-klasifikacija/3-2-opca-pravila/",
    entrypoints: [
      {
        uri: "https://www.dziv.hr/hr/prirucnik-za-ispitivanje-zigova/poglavlje-iii-klasifikacija/3-2-opca-pravila/",
        label: "Trademark examination manual classification rules",
      },
      {
        uri: "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/",
        label: "Current registration process requiring Nice Classification",
      },
    ],
    verificationEvidenceUri:
      "https://www.dziv.hr/hr/prirucnik-za-ispitivanje-zigova/poglavlje-iii-klasifikacija/3-2-opca-pravila/",
    notes:
      "SIPO requires goods/services to be classified under Nice and recommends the harmonised TMclass terminology, including through the integrated e-filing workflow; this practice surface avoids treating older static Nice-edition content as current truth.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Croatia SIPO Trademark Legislation",
    canonicalUri: "https://www.dziv.hr/en/ip-legislation/national-legislation/trademarks/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.dziv.hr/en/ip-legislation/national-legislation/trademarks/",
    notes:
      "The official national legislation page publishes the Trademark Act (OG 14/2019) and Trademark Regulations (OG 38/2019), together with former legislation for transitional proceedings.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Croatia SIPO Trademark Opposition, Revocation and Invalidity Forms",
    canonicalUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/forms-and-publications/",
    entrypoints: [
      {
        uri: "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/forms-and-publications/",
        label: "Trademark forms and proceedings publications",
      },
      {
        uri: "https://www.dziv.hr/en/e-services/e-filing/trademarks/",
        label: "Electronic two-party trademark proceedings",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "DOCX"],
    verificationEvidenceUri:
      "https://www.dziv.hr/en/intellectual-property-protection/trademarks/the-registration-process/forms-and-publications/",
    notes:
      "The current forms page, updated in March 2026, includes opposition, revocation and invalidity forms, while the e-filing service supports their electronic submission.",
  }),
  target(DZIV_HR, {
    id: "hr-dziv-official-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Croatian Intellectual Property Gazette",
    canonicalUri: "https://www.dziv.hr/en/the-croatian-intellectual-property-gazette/",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.dziv.hr/en/the-croatian-intellectual-property-gazette/",
    notes:
      "The Croatian Intellectual Property Gazette is SIPO's official publication surface for requested and valid IP rights; trademark publication operates on a biweekly rhythm relevant to opposition timing.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', croatia_block + 'const CIPO: Authority = {', 'insert Croatia block')
priority = replace_first(
    priority,
    '  ...BPO_BG_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...BPO_BG_SOURCE_COVERAGE_TARGETS,\n  ...DZIV_HR_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Croatia targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  BPO_BG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  BPO_BG_SOURCE_COVERAGE_TARGETS,\n  DZIV_HR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Croatia targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Croatia targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  BPO_BG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  BPO_BG_SOURCE_COVERAGE_TARGETS,\n  DZIV_HR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Croatia targets',
)
priority_test = replace_first(
    priority_test,
    '  ["BG", BPO_BG_SOURCE_COVERAGE_TARGETS, ["bpo.bg"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["BG", BPO_BG_SOURCE_COVERAGE_TARGETS, ["bpo.bg"]],\n  ["HR", DZIV_HR_SOURCE_COVERAGE_TARGETS, ["dziv.hr"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Croatia authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for twenty-nine priority national offices',
    'ships explicit, official, unique coverage for thirty priority national offices',
    'priority office count label',
)
priority_test = priority_test.replace('toHaveLength(220)', 'toHaveLength(228)', 1)
priority_test = priority_test.replace('      220,\n', '      228,\n', 1)
priority_test = priority_test.replace('    ).toBe(220);', '    ).toBe(228);', 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
croatia_probes = '''  {
    id: "hr-trademarks-name",
    targetId: "hr-dziv-trademarks",
    query: "Croatia SIPO trademark registration process",
  },
  {
    id: "hr-trademark-filing-name",
    targetId: "hr-dziv-trademark-filing",
    query: "Croatia SIPO e filing trademarks opposition revocation invalidity",
  },
  {
    id: "hr-trademark-search-name",
    targetId: "hr-dziv-trademark-search",
    query: "Croatia trademark e register DZIV",
  },
  {
    id: "hr-trademark-fees-name",
    targetId: "hr-dziv-trademark-fees",
    query: "Croatia SIPO trademark procedural fees costs",
  },
  {
    id: "hr-trademark-classification-name",
    targetId: "hr-dziv-trademark-classification",
    query: "Croatia trademark Nice classification TMclass goods services",
  },
  {
    id: "hr-trademark-law-name",
    targetId: "hr-dziv-trademark-law",
    query: "Croatia Trademark Act 14 2019 Trademark Regulations 38 2019",
  },
  {
    id: "hr-trademark-proceedings-name",
    targetId: "hr-dziv-trademark-proceedings",
    query: "Croatia trademark opposition revocation invalidity forms DZIV",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    croatia_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Croatia retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace('expect(targets).toHaveLength(225);', 'expect(targets).toHaveLength(232);', 1)
retrieval_test = retrieval_test.replace('expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(225);', 'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(232);', 1)
retrieval_test = retrieval_test.replace('      225,\n', '      232,\n', 1)
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "BG", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "BG", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "HR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    'retrieval test Croatia jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
