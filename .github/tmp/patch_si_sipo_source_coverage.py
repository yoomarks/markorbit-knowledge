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
slovenia_block = '''const SIPO_SI: Authority = {
  jurisdiction: "SI",
  authorityName: "Slovenian Intellectual Property Office (SIPO/URSIL)",
  languages: ["sl-SI", "en"],
  verificationEvidenceUri: "https://www.gov.si/en/topics/trademarks/",
};

export const SIPO_SI_SOURCE_COVERAGE_TARGETS = [
  target(SIPO_SI, {
    id: "si-sipo-trademarks",
    family: "PORTAL",
    displayName: "Slovenian Intellectual Property Office Trademarks",
    canonicalUri: "https://www.gov.si/en/topics/trademarks/",
    verificationEvidenceUri: "https://www.gov.si/en/topics/trademarks/",
    notes:
      "The current GOV.SI trademark hub covers national protection, opposition, maintenance, changes, international protection, legislation and official databases; it was updated in February 2026.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-filing",
    family: "FILING",
    displayName: "SIPO Registering a Trademark",
    canonicalUri: "https://www.gov.si/en/registries/services/registering-a-trademark/",
    entrypoints: [
      {
        uri: "https://www.gov.si/en/registries/services/registering-a-trademark/",
        label: "Current national registration procedure",
      },
      { uri: "https://eil.uil-sipo.si/", label: "SIPO online trademark application" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://www.gov.si/en/registries/services/registering-a-trademark/",
    notes:
      "The national registration service was updated on 18 March 2026 and documents electronic/paper filing, Nice-class goods and services, formal and substantive examination, publication, three-month opposition and registration.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-search",
    family: "SEARCH",
    displayName: "SIPO Marks Information Database",
    canonicalUri: "https://www2.uil-sipo.si/que021.stm",
    entrypoints: [
      { uri: "https://www2.uil-sipo.si/default1.stm", label: "SIPO information databases" },
      { uri: "https://www2.uil-sipo.si/que021.stm", label: "Marks query guide" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www2.uil-sipo.si/que021.stm",
    notes:
      "The official SIPO marks database contains applications and registered marks and supports queries by mark text, Nice class, publication date, status, applicant, owner and representative; the indexed English surface was updated on 28 July 2026.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-fees",
    family: "FEES",
    displayName: "SIPO Fees and Charges",
    canonicalUri:
      "https://www.gov.si/assets/organi-v-sestavi/URSIL/Dokumenti/Seznami-cenik/Pristojbine-takse-in-cenik-storitev-Urada-za-intelektualno-lastnino.docx",
    expectedArtifactKinds: ["DOCX"],
    verificationEvidenceUri:
      "https://www.gov.si/en/state-authorities/bodies-within-ministries/slovenian-intellectual-property-office/",
    notes:
      "The Office publishes its official fees, administrative charges and service price list as a GOV.SI document linked from the current SIPO authority page.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "SIPO Nice Classification 13-2026",
    canonicalUri:
      "https://www.gov.si/novice/2025-12-19-nova-nicejska-klasifikacija-2026-spremembe-pri-razvrstitvi-blaga-in-storitev/",
    entrypoints: [
      {
        uri: "https://www.gov.si/novice/2025-12-19-nova-nicejska-klasifikacija-2026-spremembe-pri-razvrstitvi-blaga-in-storitev/",
        label: "Official 2026 Nice Classification notice",
      },
      {
        uri: "https://www.gov.si/en/registries/services/registering-a-trademark/",
        label: "Current filing guidance requiring Nice Classification",
      },
    ],
    verificationEvidenceUri:
      "https://www.gov.si/novice/2025-12-19-nova-nicejska-klasifikacija-2026-spremembe-pri-razvrstitvi-blaga-in-storitev/",
    notes:
      "SIPO announced that the 13th edition of the Nice Classification took effect on 1 January 2026 for applications filed from that date, with no retroactive reclassification of earlier marks.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Slovenia Industrial Property Act and Trademark Rules",
    canonicalUri: "https://pisrs.si/Pis.web/pregledPredpisa?id=ZAKO1668",
    entrypoints: [
      {
        uri: "https://pisrs.si/Pis.web/pregledPredpisa?id=ZAKO1668",
        label: "Industrial Property Act",
      },
      {
        uri: "https://pisrs.si/Pis.web/pregledPredpisa?id=PRAV14047",
        label: "Trademark Rules",
      },
      {
        uri: "https://www.gov.si/en/topics/trademarks/",
        label: "SIPO trademark legislation hub and consolidated Act attachment",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "DOCX"],
    verificationEvidenceUri: "https://pisrs.si/Pis.web/pregledPredpisa?id=ZAKO1668",
    notes:
      "The current SIPO registration and dispute services cite the Industrial Property Act and Trademark Rules; both official legal texts are maintained in Slovenia's PISRS legal information system.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "SIPO Trademark Opposition, Revocation and Invalidity",
    canonicalUri: "https://www.gov.si/en/registries/services/opposition-to-a-trademark-registration/",
    entrypoints: [
      {
        uri: "https://www.gov.si/en/registries/services/opposition-to-a-trademark-registration/",
        label: "Trademark opposition procedure",
      },
      {
        uri: "https://www.gov.si/en/registries/services/revocation-of-a-trademark/",
        label: "Trademark revocation procedure",
      },
      {
        uri: "https://www.gov.si/en/registries/services/declaration-of-invalidity-of-a-trademark/",
        label: "Trademark invalidity procedure",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.gov.si/en/registries/services/opposition-to-a-trademark-registration/",
    notes:
      "SIPO provides electronic and written opposition, revocation and invalidity procedures; opposition to national applications is due within three months of bulletin publication, while revocation/invalidity requests carry the prescribed proceeding fee.",
  }),
  target(SIPO_SI, {
    id: "si-sipo-industrial-property-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "SIPO Official Bulletin on Industrial Property",
    canonicalUri:
      "https://www.uil-sipo.si/uil/dejavnosti/informacijske-storitve/bilten-za-industrijsko-lastnino/",
    entrypoints: [
      {
        uri: "https://www.gov.si/en/state-authorities/bodies-within-ministries/slovenian-intellectual-property-office/",
        label: "Current SIPO authority page linking the Industrial Property Bulletin",
      },
      {
        uri: "https://www2.uil-sipo.si/s/bil/is.dll?tsl=",
        label: "Electronic Industrial Property Bulletin system",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.gov.si/en/state-authorities/bodies-within-ministries/slovenian-intellectual-property-office/",
    notes:
      "SIPO identifies the Industrial Property Bulletin as its official publication for industrial-property rights and links the electronic PDF bulletin system; trademark application and registration publication dates trigger procedural consequences such as opposition timing.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', slovenia_block + 'const CIPO: Authority = {', 'insert Slovenia block')
priority = replace_first(
    priority,
    '  ...DZIV_HR_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...DZIV_HR_SOURCE_COVERAGE_TARGETS,\n  ...SIPO_SI_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Slovenia targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  DZIV_HR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  DZIV_HR_SOURCE_COVERAGE_TARGETS,\n  SIPO_SI_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Slovenia targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Slovenia targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  DZIV_HR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  DZIV_HR_SOURCE_COVERAGE_TARGETS,\n  SIPO_SI_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Slovenia targets',
)
priority_test = replace_first(
    priority_test,
    '  ["HR", DZIV_HR_SOURCE_COVERAGE_TARGETS, ["dziv.hr"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["HR", DZIV_HR_SOURCE_COVERAGE_TARGETS, ["dziv.hr"]],\n  ["SI", SIPO_SI_SOURCE_COVERAGE_TARGETS, ["gov.si", "uil-sipo.si", "pisrs.si"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Slovenia authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for thirty priority national offices',
    'ships explicit, official, unique coverage for thirty-one priority national offices',
    'priority office count label',
)
priority_test = priority_test.replace('toHaveLength(228)', 'toHaveLength(236)', 1)
priority_test = priority_test.replace('      228,\n', '      236,\n', 1)
priority_test = priority_test.replace('    ).toBe(228);', '    ).toBe(236);', 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
slovenia_probes = '''  {
    id: "si-trademarks-name",
    targetId: "si-sipo-trademarks",
    query: "Slovenia trademark protection SIPO URSIL",
  },
  {
    id: "si-trademark-filing-name",
    targetId: "si-sipo-trademark-filing",
    query: "Slovenia registering trademark Nice application opposition SIPO",
  },
  {
    id: "si-trademark-search-name",
    targetId: "si-sipo-trademark-search",
    query: "Slovenia SIPO marks database applications registered marks",
  },
  {
    id: "si-trademark-fees-name",
    targetId: "si-sipo-trademark-fees",
    query: "Slovenian Intellectual Property Office fees charges trademarks",
  },
  {
    id: "si-trademark-classification-name",
    targetId: "si-sipo-trademark-classification",
    query: "Slovenia Nice Classification 13 2026 goods services trademarks",
  },
  {
    id: "si-trademark-law-name",
    targetId: "si-sipo-trademark-law",
    query: "Slovenia Industrial Property Act Trademark Rules PISRS",
  },
  {
    id: "si-trademark-proceedings-name",
    targetId: "si-sipo-trademark-proceedings",
    query: "Slovenia trademark opposition revocation invalidity SIPO",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    slovenia_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Slovenia retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace('expect(targets).toHaveLength(232);', 'expect(targets).toHaveLength(239);', 1)
retrieval_test = retrieval_test.replace('expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(232);', 'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(239);', 1)
retrieval_test = retrieval_test.replace('      232,\n', '      239,\n', 1)
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "HR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "HR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "SI", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    'retrieval test Slovenia jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
