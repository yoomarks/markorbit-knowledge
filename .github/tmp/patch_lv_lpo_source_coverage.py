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
latvia_block = '''const LPO_LV: Authority = {
  jurisdiction: "LV",
  authorityName: "Latvian Patent Office (Patentu valde)",
  languages: ["lv-LV", "en"],
  verificationEvidenceUri: "https://www.lrpv.gov.lv/en/trade-marks/services",
};

export const LPO_LV_SOURCE_COVERAGE_TARGETS = [
  target(LPO_LV, {
    id: "lv-lpo-trademarks",
    family: "PORTAL",
    displayName: "Latvian Patent Office Trade Mark Services",
    canonicalUri: "https://www.lrpv.gov.lv/en/trade-marks/services",
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/trade-marks/services",
    notes:
      "The current trademark services hub exposes filing, renewal, transfers, licensing, international registration, register extracts, opposition, appeal, revocation and invalidity services.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-filing",
    family: "FILING",
    displayName: "Latvian Patent Office Trademark Application",
    canonicalUri: "https://www.lrpv.gov.lv/en/services/filing-trademark-application",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/services/filing-trademark-application",
    notes:
      "The filing service, updated in April 2026, documents national electronic filing, Nice-class fees, examination, registration/publication, opposition timing and ten-year renewable protection.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-search",
    family: "SEARCH",
    displayName: "Latvian Patent Office Trade Mark Databases",
    canonicalUri: "https://www.lrpv.gov.lv/en/trade-mark-databases-0",
    entrypoints: [
      { uri: "https://www.lrpv.gov.lv/en/trade-mark-databases-0", label: "Trademark database guidance" },
      { uri: "https://www.lrpv.gov.lv/en/services/trademark-search", label: "Patent Office trademark search service" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/trade-mark-databases-0",
    notes:
      "The Patent Office provides access to the Latvian national trademark database and related search resources; the public database is maintained as an up-to-date information source while legally effective information is published through the register and Official Gazette.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-fees",
    family: "FEES",
    displayName: "Latvian Patent Office Trademark Fees",
    canonicalUri: "https://www.lrpv.gov.lv/en/fees-legal-protection-trademarks",
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/fees-legal-protection-trademarks",
    notes:
      "The official trademark fee table was updated on 20 April 2026 under the current 2026 price list and publishes filing, additional-class, registration, renewal and proceeding charges.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Latvian Patent Office Nice Classification 13-2026",
    canonicalUri:
      "https://www.lrpv.gov.lv/lv/nicas-klasifikacijas-precu-un-pakalpojumu-saraksts",
    entrypoints: [
      {
        uri: "https://www.lrpv.gov.lv/lv/nicas-klasifikacijas-precu-un-pakalpojumu-saraksts",
        label: "Nice Classification class list",
      },
      {
        uri: "https://www.lrpv.gov.lv/lv/Nicas-klasifikacija/klasu-virsraksti-un-skaidrojumi",
        label: "Nice class headings and explanatory notes",
      },
      {
        uri: "https://www.lrpv.gov.lv/en/services/filing-trademark-application",
        label: "Current filing guidance using Nice classes",
      },
    ],
    verificationEvidenceUri:
      "https://www.lrpv.gov.lv/lv/nicas-klasifikacijas-precu-un-pakalpojumu-saraksts",
    notes:
      "The Patent Office's current class list identifies the 13th edition of the Nice Classification effective from 1 January 2026, and current filing guidance calculates application fees by Nice class.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Latvia Trade Mark Law",
    canonicalUri: "https://www.lrpv.gov.lv/en/law-0",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/law-0",
    notes:
      "The official Patent Office legal surface publishes Latvia's Trade Mark Law, including national filing requirements, fees, examination and registration procedure.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Latvia Industrial Property Board of Appeal Trademark Proceedings",
    canonicalUri: "https://www.lrpv.gov.lv/en/board-of-appeal-services",
    entrypoints: [
      { uri: "https://www.lrpv.gov.lv/en/board-of-appeal-services", label: "Board of Appeal services" },
      {
        uri: "https://www.lrpv.gov.lv/en/services/submission-notice-opposition-registration-object-industrial-property",
        label: "Trademark opposition service",
      },
      {
        uri: "https://www.lrpv.gov.lv/en/services/submission-notice-declaration-invalidity-trademark-registration",
        label: "Trademark invalidity service",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/board-of-appeal-services",
    notes:
      "The Industrial Property Board of Appeal handles trademark appeals, opposition, revocation and invalidity; opposition may be filed within three months from official publication and electronic submission is supported.",
  }),
  target(LPO_LV, {
    id: "lv-lpo-official-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Latvian Patent Office Official Gazette",
    canonicalUri: "https://www.lrpv.gov.lv/en/official-gazette",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.lrpv.gov.lv/en/official-gazette",
    notes:
      "The Patent Office publishes its industrial-property registers and changes through the electronic Official Gazette; the current official page lists 2026 issues and the July 2026 issue has been published.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', latvia_block + 'const CIPO: Authority = {', 'insert Latvia block')
priority = replace_first(
    priority,
    '  ...EPA_EE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...EPA_EE_SOURCE_COVERAGE_TARGETS,\n  ...LPO_LV_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Latvia targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  EPA_EE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  EPA_EE_SOURCE_COVERAGE_TARGETS,\n  LPO_LV_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Latvia targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Latvia targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  EPA_EE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  EPA_EE_SOURCE_COVERAGE_TARGETS,\n  LPO_LV_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Latvia targets',
)
priority_test = replace_first(
    priority_test,
    '  ["EE", EPA_EE_SOURCE_COVERAGE_TARGETS, ["epa.ee", "riigiteataja.ee"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["EE", EPA_EE_SOURCE_COVERAGE_TARGETS, ["epa.ee", "riigiteataja.ee"]],\n  ["LV", LPO_LV_SOURCE_COVERAGE_TARGETS, ["lrpv.gov.lv"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Latvia authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for thirty-five priority national offices',
    'ships explicit, official, unique coverage for thirty-six priority national offices',
    'priority office count label',
)
priority_test = priority_test.replace('toHaveLength(268)', 'toHaveLength(276)', 1)
priority_test = priority_test.replace('      268,\n', '      276,\n', 1)
priority_test = priority_test.replace('    ).toBe(268);', '    ).toBe(276);', 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
latvia_probes = '''  {
    id: "lv-trademarks-name",
    targetId: "lv-lpo-trademarks",
    query: "Latvian Patent Office trademark services",
  },
  {
    id: "lv-trademark-filing-name",
    targetId: "lv-lpo-trademark-filing",
    query: "Latvia filing trademark application electronic Nice classes",
  },
  {
    id: "lv-trademark-search-name",
    targetId: "lv-lpo-trademark-search",
    query: "Latvia Patent Office trademark database search",
  },
  {
    id: "lv-trademark-fees-name",
    targetId: "lv-lpo-trademark-fees",
    query: "Latvia trademark fees 2026 filing additional class registration",
  },
  {
    id: "lv-trademark-classification-name",
    targetId: "lv-lpo-trademark-classification",
    query: "Latvia Nice Classification 13 2026 goods services",
  },
  {
    id: "lv-trademark-law-name",
    targetId: "lv-lpo-trademark-law",
    query: "Latvia Trade Mark Law Patent Office",
  },
  {
    id: "lv-trademark-proceedings-name",
    targetId: "lv-lpo-trademark-proceedings",
    query: "Latvia trademark opposition appeal revocation invalidity Board of Appeal",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    latvia_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Latvia retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace('expect(targets).toHaveLength(267);', 'expect(targets).toHaveLength(274);', 1)
retrieval_test = retrieval_test.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(267);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(274);',
    1,
)
retrieval_test = retrieval_test.replace('      267,\n', '      274,\n', 1)
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "EE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "EE", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "LV", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    'retrieval test Latvia jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
