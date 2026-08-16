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
turkey_block = '''const TURKPATENT_TR: Authority = {
  jurisdiction: "TR",
  authorityName: "Turkish Patent and Trademark Office (TÜRKPATENT)",
  languages: ["tr-TR", "en"],
  verificationEvidenceUri: "https://www.turkpatent.gov.tr/en/trademark",
};

export const TURKPATENT_TR_SOURCE_COVERAGE_TARGETS = [
  target(TURKPATENT_TR, {
    id: "tr-turkpatent-trademarks",
    family: "PORTAL",
    displayName: "TÜRKPATENT Trademark Information",
    canonicalUri: "https://www.turkpatent.gov.tr/en/trademark",
    verificationEvidenceUri: "https://www.turkpatent.gov.tr/en/trademark",
    notes:
      "The current official trademark hub explains direct and Madrid filing, examination, publication, opposition, appeals, registration and renewal under Industrial Property Code No. 6769.",
  }),
  target(TURKPATENT_TR, {
    id: "tr-turkpatent-trademark-filing",
    family: "FILING",
    displayName: "TÜRKPATENT EPATS Trademark e-Filing",
    canonicalUri: "https://epats.turkpatent.gov.tr/",
    entrypoints: [
      { uri: "https://epats.turkpatent.gov.tr/", label: "EPATS e-government filing system" },
      { uri: "https://www.turkpatent.gov.tr/en/trademark", label: "Official trademark filing guidance" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.turkpatent.gov.tr/en/trademark",
    notes:
      "TÜRKPATENT accepts national trademark applications through its EPATS e-government service; applicants domiciled outside Türkiye must generally act through an authorized trademark attorney unless using Madrid.",
  }),
  target(TURKPATENT_TR, {
    id: "tr-turkpatent-trademark-search",
    family: "SEARCH",
    displayName: "TÜRKPATENT Trademark Search and File Tracking",
    canonicalUri: "https://www.turkpatent.gov.tr/arastirma-yap",
    entrypoints: [
      { uri: "https://www.turkpatent.gov.tr/arastirma-yap", label: "Trademark search and file tracking" },
      { uri: "https://www.turkpatent.gov.tr/en", label: "TÜRKPATENT search entrypoint" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.turkpatent.gov.tr/arastirma-yap",
    notes:
      "The official search surface supports trademark name, applicant, announcement bulletin, registration bulletin and class-based queries.",
  }),
  target(TURKPATENT_TR, {
    id: "tr-turkpatent-trademark-fees",
    family: "FEES",
    displayName: "TÜRKPATENT 2026 Trademark Fees",
    canonicalUri: "https://www.turkpatent.gov.tr/en/trademark-fees",
    verificationEvidenceUri: "https://www.turkpatent.gov.tr/en/trademark-fees",
    notes:
      "The current official fee table publishes 2026 trademark filing, registration, opposition, renewal, recordal, cancellation-request and related charges in Turkish lira.",
  }),
  target(TURKPATENT_TR, {
    id: "tr-turkpatent-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "TÜRKPATENT Nice Classification Guidance",
    canonicalUri: "https://www.turkpatent.gov.tr/tr/marka-nice-siniflandirma",
    entrypoints: [
      {
        uri: "https://www.turkpatent.gov.tr/tr/marka-nice-siniflandirma",
        label: "Nice Classification guidance",
      },
      { uri: "https://www.wipo.int/classifications/nice/", label: "Latest WIPO Nice edition linked by TÜRKPATENT" },
    ],
    verificationEvidenceUri: "https://www.turkpatent.gov.tr/tr/marka-nice-siniflandirma",
    notes:
      "TÜRKPATENT directs applicants to the latest WIPO Nice Classification and complementary MGS/TMclass tools instead of freezing a stale edition in the national canonical source.",
  }),
  target(TURKPATENT_TR, {
    id: "tr-turkpatent-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "TÜRKPATENT Industrial Property Legislation",
    canonicalUri: "https://www.turkpatent.gov.tr/tr/mevzuat",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.turkpatent.gov.tr/tr/mevzuat",
    notes:
      "The official legislation hub publishes Industrial Property Code No. 6769, its implementing regulation, trademark goods/services classification communiqué and the 2026 TÜRKPATENT fee tariff.",
  }),
  target(TURKPATENT_TR, {
    id: "tr-turkpatent-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "TÜRKPATENT Trademark Opposition, Appeals and Cancellation Proceedings",
    canonicalUri: "https://www.turkpatent.gov.tr/yeniden-inceleme-ve-degerlendirme",
    entrypoints: [
      {
        uri: "https://www.turkpatent.gov.tr/yeniden-inceleme-ve-degerlendirme",
        label: "Re-Examination and Evaluation Department",
      },
      {
        uri: "https://www.turkpatent.gov.tr/en/trademark",
        label: "Trademark opposition and appeal procedure",
      },
      {
        uri: "https://www.turkpatent.gov.tr/en/trademark-fees",
        label: "2026 opposition, appeal and cancellation fees",
      },
    ],
    verificationEvidenceUri: "https://www.turkpatent.gov.tr/yeniden-inceleme-ve-degerlendirme",
    notes:
      "Trademark applications are open to opposition after bulletin publication, first-instance decisions may be appealed, and the Re-Examination and Evaluation Board issues the Office's final decisions; the 2026 fee schedule also includes administrative trademark cancellation requests.",
  }),
  target(TURKPATENT_TR, {
    id: "tr-turkpatent-official-trademark-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "TÜRKPATENT Official Trademark Bulletin",
    canonicalUri: "https://www.turkpatent.gov.tr/bultenler",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.turkpatent.gov.tr/bultenler",
    notes:
      "The official bulletins surface continuously publishes Resmi Marka Bülteni issues; 2026 issues include No. 497 dated 27 July 2026. Publication triggers the trademark opposition window and records registrations.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(
    priority,
    'const CIPO: Authority = {',
    turkey_block + 'const CIPO: Authority = {',
    'insert Türkiye source block',
)
priority = replace_first(
    priority,
    '  ...VPB_LT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...VPB_LT_SOURCE_COVERAGE_TARGETS,\n  ...TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Türkiye targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  VPB_LT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  VPB_LT_SOURCE_COVERAGE_TARGETS,\n  TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Türkiye targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Türkiye targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  VPB_LT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  VPB_LT_SOURCE_COVERAGE_TARGETS,\n  TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Türkiye targets',
)
priority_test = replace_first(
    priority_test,
    '  ["LT", VPB_LT_SOURCE_COVERAGE_TARGETS, ["vpb.lrv.lt"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["LT", VPB_LT_SOURCE_COVERAGE_TARGETS, ["vpb.lrv.lt"]],\n  ["TR", TURKPATENT_TR_SOURCE_COVERAGE_TARGETS, ["turkpatent.gov.tr"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Türkiye authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for thirty-seven priority national offices',
    'ships explicit, official, unique coverage for thirty-eight priority national offices',
    'priority office count label',
)
priority_test = replace_first(priority_test, 'toHaveLength(284)', 'toHaveLength(292)', 'priority target count')
priority_test = replace_first(priority_test, '      284,\n', '      292,\n', 'priority target id uniqueness count')
priority_test = replace_first(priority_test, '    ).toBe(284);', '    ).toBe(292);', 'priority canonical uniqueness count')
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
turkey_probes = '''  {
    id: "tr-trademarks-name",
    targetId: "tr-turkpatent-trademarks",
    query: "Türkiye trademark TÜRKPATENT application examination opposition",
  },
  {
    id: "tr-trademark-filing-name",
    targetId: "tr-turkpatent-trademark-filing",
    query: "TÜRKPATENT EPATS trademark application",
  },
  {
    id: "tr-trademark-search-name",
    targetId: "tr-turkpatent-trademark-search",
    query: "TÜRKPATENT trademark research file tracking classes bulletin",
  },
  {
    id: "tr-trademark-fees-name",
    targetId: "tr-turkpatent-trademark-fees",
    query: "TÜRKPATENT 2026 trademark fees opposition cancellation",
  },
  {
    id: "tr-trademark-classification-name",
    targetId: "tr-turkpatent-trademark-classification",
    query: "TÜRKPATENT Nice classification goods services MGS TMclass",
  },
  {
    id: "tr-trademark-law-name",
    targetId: "tr-turkpatent-trademark-law",
    query: "6769 Industrial Property Code trademark regulation Türkiye",
  },
  {
    id: "tr-trademark-proceedings-name",
    targetId: "tr-turkpatent-trademark-proceedings",
    query: "TÜRKPATENT trademark opposition appeal re-examination cancellation",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    turkey_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Türkiye retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = replace_first(retrieval_test, 'expect(targets).toHaveLength(281);', 'expect(targets).toHaveLength(288);', 'foundational target count')
retrieval_test = replace_first(
    retrieval_test,
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(281);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(288);',
    'foundational probe count',
)
retrieval_test = replace_first(retrieval_test, '      281,\n', '      288,\n', 'foundational probe uniqueness count')
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "LT", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "LT", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "TR", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    'retrieval test Türkiye jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
