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
serbia_block = '''const ZIS_RS: Authority = {
  jurisdiction: "RS",
  authorityName: "Intellectual Property Office of the Republic of Serbia (ZIS)",
  languages: ["sr-RS", "en"],
  verificationEvidenceUri: "https://www.zis.gov.rs/en/rights/trademark/",
};

export const ZIS_RS_SOURCE_COVERAGE_TARGETS = [
  target(ZIS_RS, {
    id: "rs-zis-trademarks",
    family: "PORTAL",
    displayName: "Serbia IPO Trademark Information",
    canonicalUri: "https://www.zis.gov.rs/en/rights/trademark/",
    verificationEvidenceUri: "https://www.zis.gov.rs/en/rights/trademark/",
    notes:
      "The official trademark hub covers national filing, searches, classification, examination, twice-monthly publication, three-month opposition, registration, renewal, cancellation and non-use termination.",
  }),
  target(ZIS_RS, {
    id: "rs-zis-trademark-filing",
    family: "FILING",
    displayName: "Serbia IPO e-Application",
    canonicalUri: "https://www.zis.gov.rs/en/e-application/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://www.zis.gov.rs/en/e-application/",
    notes:
      "The Office accepts national industrial-property applications electronically and grants a 25% fee reduction for electronic trademark and industrial-design filings; foreign applicants without Serbian domicile must use a registered representative.",
  }),
  target(ZIS_RS, {
    id: "rs-zis-trademark-search",
    family: "SEARCH",
    displayName: "Serbia IPO E-Register of National Trademarks",
    canonicalUri: "https://www.zis.gov.rs/en/databases/trademark/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.zis.gov.rs/en/databases/trademark/",
    notes:
      "The official trademark database surface links the E-register of national trademarks and complementary Madrid Monitor search and includes status, validity and classification information.",
  }),
  target(ZIS_RS, {
    id: "rs-zis-trademark-fees",
    family: "FEES",
    displayName: "Serbia IPO Trademark Fees",
    canonicalUri: "https://www.zis.gov.rs/en/rights/fees/",
    verificationEvidenceUri: "https://www.zis.gov.rs/en/rights/fees/",
    notes:
      "The official fee table publishes current trademark application, class surcharge, registration/renewal, certificate and professional search charges in Serbian dinars, with links to the governing administrative-fee tariff.",
  }),
  target(ZIS_RS, {
    id: "rs-zis-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Serbia IPO Nice Classification 13-2026",
    canonicalUri: "https://www.zis.gov.rs/en/vesti/2026-new-13th-edition-of-the-nice-classification/",
    entrypoints: [
      {
        uri: "https://www.zis.gov.rs/en/vesti/2026-new-13th-edition-of-the-nice-classification/",
        label: "Official Nice 13-2026 notice",
      },
      {
        uri: "https://www.zis.gov.rs/en/rights/trademark/",
        label: "Current trademark classification guidance",
      },
    ],
    verificationEvidenceUri: "https://www.zis.gov.rs/en/vesti/2026-new-13th-edition-of-the-nice-classification/",
    notes:
      "The Office confirms Nice 13-2026 entered into force on 1 January 2026 for applications filed from that date and explains key class changes without retroactive reclassification.",
  }),
  target(ZIS_RS, {
    id: "rs-zis-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Serbia Trademark Laws, Regulations and Methodology",
    canonicalUri: "https://www.zis.gov.rs/en/about-us/documents/laws-and-regulations/?cat=trademarks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.zis.gov.rs/en/about-us/documents/laws-and-regulations/?cat=trademarks",
    notes:
      "The official legal hub publishes the Trademark Law (Official Gazette RS 6/2020), the 2021 Trademark Register/opposition regulation and the Office methodology for registration and post-registration trademark proceedings.",
  }),
  target(ZIS_RS, {
    id: "rs-zis-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Serbia Trademark Forms, Opposition and Post-Registration Proceedings",
    canonicalUri: "https://www.zis.gov.rs/en/forms-and-instructions/?cat=trademarks",
    entrypoints: [
      {
        uri: "https://www.zis.gov.rs/en/forms-and-instructions/?cat=trademarks",
        label: "Trademark forms and instructions",
      },
      {
        uri: "https://www.zis.gov.rs/en/rights/trademark/",
        label: "Opposition, cancellation and non-use procedure guidance",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "DOCX"],
    verificationEvidenceUri: "https://www.zis.gov.rs/en/forms-and-instructions/?cat=trademarks",
    notes:
      "The Office publishes formal trademark forms and instructions alongside procedure guidance for the three-month opposition period, invalidation/cancellation, non-use termination, renewal and recordals.",
  }),
  target(ZIS_RS, {
    id: "rs-zis-intellectual-property-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Serbia Intellectual Property Gazette",
    canonicalUri: "https://www.zis.gov.rs/en/intellectual-property-gazette/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.zis.gov.rs/en/intellectual-property-gazette/",
    notes:
      "The official digital Gazette is published twice monthly for trademark applications and registrations; the current page lists 2026 issues and publication starts the national opposition period.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', serbia_block + 'const CIPO: Authority = {', 'insert Serbia source block')
priority = replace_first(
    priority,
    '  ...TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,\n  ...ZIS_RS_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Serbia targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,\n  ZIS_RS_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Serbia targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Serbia targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,\n  ZIS_RS_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Serbia targets',
)
priority_test = replace_first(
    priority_test,
    '  ["TR", TURKPATENT_TR_SOURCE_COVERAGE_TARGETS, ["turkpatent.gov.tr"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["TR", TURKPATENT_TR_SOURCE_COVERAGE_TARGETS, ["turkpatent.gov.tr"]],\n  ["RS", ZIS_RS_SOURCE_COVERAGE_TARGETS, ["zis.gov.rs"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Serbia authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for thirty-eight priority national offices',
    'ships explicit, official, unique coverage for thirty-nine priority national offices',
    'priority office count label',
)
priority_test = replace_first(priority_test, 'toHaveLength(292)', 'toHaveLength(300)', 'priority target count')
priority_test = replace_first(priority_test, '      292,\n', '      300,\n', 'priority id uniqueness count')
priority_test = replace_first(priority_test, '    ).toBe(292);', '    ).toBe(300);', 'priority canonical uniqueness count')
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
serbia_probes = '''  {
    id: "rs-trademarks-name",
    targetId: "rs-zis-trademarks",
    query: "Serbia trademark Intellectual Property Office examination opposition",
  },
  {
    id: "rs-trademark-filing-name",
    targetId: "rs-zis-trademark-filing",
    query: "Serbia IPO electronic trademark application eApplication",
  },
  {
    id: "rs-trademark-search-name",
    targetId: "rs-zis-trademark-search",
    query: "Serbia E-register national trademarks search",
  },
  {
    id: "rs-trademark-fees-name",
    targetId: "rs-zis-trademark-fees",
    query: "Serbia trademark application registration fees RSD",
  },
  {
    id: "rs-trademark-classification-name",
    targetId: "rs-zis-trademark-classification",
    query: "Serbia Nice Classification 13 2026 trademarks",
  },
  {
    id: "rs-trademark-law-name",
    targetId: "rs-zis-trademark-law",
    query: "Serbia Trademark Law 6 2020 methodology opposition regulation",
  },
  {
    id: "rs-trademark-proceedings-name",
    targetId: "rs-zis-trademark-proceedings",
    query: "Serbia trademark opposition cancellation non-use forms instructions",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    serbia_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Serbia retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = replace_first(retrieval_test, 'expect(targets).toHaveLength(288);', 'expect(targets).toHaveLength(295);', 'foundational target count')
retrieval_test = replace_first(
    retrieval_test,
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(288);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(295);',
    'foundational probe count',
)
retrieval_test = replace_first(retrieval_test, '      288,\n', '      295,\n', 'foundational probe uniqueness count')
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "TR", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "TR", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "RS", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    'retrieval test Serbia jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
