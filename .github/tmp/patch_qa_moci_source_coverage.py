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


TRADEMARK_SERVICES = "https://www.moci.gov.qa/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA%D9%86%D8%A7/%D8%A7%D9%84%D9%85%D8%B3%D8%AA%D8%AB%D9%85%D8%B1/%D8%AD%D9%82%D9%88%D9%82-%D8%A7%D9%84%D9%85%D9%84%D9%83%D9%8A%D8%A9-%D8%A7%D9%84%D9%81%D9%83%D8%B1%D9%8A%D8%A9/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA-%D8%AD%D9%82%D9%88%D9%82-%D8%A7%D9%84%D9%85%D9%84%D9%83%D9%8A%D8%A9-%D8%A7%D9%84%D9%81%D9%83%D8%B1%D9%8A%D8%A9-1/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA-%D8%A7%D9%84%D8%B9%D9%84%D8%A7%D9%85%D8%A7%D8%AA-%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9/"
TRADEMARK_DATABASE = "https://www.moci.gov.qa/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA%D9%86%D8%A7/%D8%A7%D9%84%D9%85%D8%B3%D8%AA%D8%AB%D9%85%D8%B1/%D8%AD%D9%82%D9%88%D9%82-%D8%A7%D9%84%D9%85%D9%84%D9%83%D9%8A%D8%A9-%D8%A7%D9%84%D9%81%D9%83%D8%B1%D9%8A%D8%A9/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA-%D8%AD%D9%82%D9%88%D9%82-%D8%A7%D9%84%D9%85%D9%84%D9%83%D9%8A%D8%A9-%D8%A7%D9%84%D9%81%D9%83%D8%B1%D9%8A%D8%A9-1/%D9%82%D8%A7%D8%B9%D8%AF%D8%A9-%D8%A8%D9%8A%D8%A7%D9%86%D8%A7%D8%AA-%D8%A7%D9%84%D8%B9%D9%84%D8%A7%D9%85%D8%A7%D8%AA-%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9/"
TRADEMARK_FEES = "https://www.moci.gov.qa/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA%D9%86%D8%A7/%D8%A7%D9%84%D9%85%D8%B3%D8%AA%D8%AB%D9%85%D8%B1/%D8%AD%D9%82%D9%88%D9%82-%D8%A7%D9%84%D9%85%D9%84%D9%83%D9%8A%D8%A9-%D8%A7%D9%84%D9%81%D9%83%D8%B1%D9%8A%D8%A9/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA-%D8%AD%D9%82%D9%88%D9%82-%D8%A7%D9%84%D9%85%D9%84%D9%83%D9%8A%D8%A9-%D8%A7%D9%84%D9%81%D9%83%D8%B1%D9%8A%D8%A9-1/%D8%A7%D9%84%D8%B1%D8%B3%D9%88%D9%85/"
TRANSACTION_FORMS = "https://www.moci.gov.qa/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA%D9%86%D8%A7/%D8%A7%D9%84%D9%85%D8%B3%D8%AA%D8%AB%D9%85%D8%B1/%D9%86%D9%85%D8%A7%D8%B0%D8%AC-%D8%A7%D9%84%D9%85%D8%B9%D8%A7%D9%85%D9%84%D8%A7%D8%AA/"
LAWS = "https://www.moci.gov.qa/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA%D9%86%D8%A7/%D8%A7%D9%84%D9%85%D8%B3%D8%AA%D8%AB%D9%85%D8%B1/%D9%82%D9%88%D8%A7%D9%86%D9%8A%D9%86-%D9%88%D8%A3%D9%86%D8%B8%D9%85%D8%A9/"

priority = priority_path.read_text()
qatar_block = f'''const MOCI_QA: Authority = {{
  jurisdiction: "QA",
  authorityName: "Qatar Ministry of Commerce and Industry (MOCI)",
  languages: ["ar-QA", "en"],
  verificationEvidenceUri: "https://www.moci.gov.qa/en/our-services/investor/intellectual-property-rights/",
}};

export const MOCI_QA_SOURCE_COVERAGE_TARGETS = [
  target(MOCI_QA, {{
    id: "qa-moci-trademarks",
    family: "PORTAL",
    displayName: "Qatar MOCI Intellectual Property Rights - Trademarks",
    canonicalUri: "https://www.moci.gov.qa/en/our-services/investor/intellectual-property-rights/",
    verificationEvidenceUri: "https://www.moci.gov.qa/en/our-services/investor/intellectual-property-rights/",
    notes:
      "The current MOCI intellectual-property hub identifies national trademark protection, Madrid protection and official trademark-database access; MOCI is Qatar's national trademark Office of origin under Madrid.",
  }}),
  target(MOCI_QA, {{
    id: "qa-moci-trademark-filing",
    family: "FILING",
    displayName: "Qatar MOCI Trademark Registration Services",
    canonicalUri: "{TRADEMARK_SERVICES}",
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "{TRADEMARK_SERVICES}",
    notes:
      "The current MOCI trademark-services surface documents electronic application, examination, publication for 60 days, final registration, ten-year protection and post-registration services.",
  }}),
  target(MOCI_QA, {{
    id: "qa-moci-trademark-search",
    family: "SEARCH",
    displayName: "Qatar MOCI Trademark Database",
    canonicalUri: "{TRADEMARK_DATABASE}",
    entrypoints: [
      {{ uri: "{TRADEMARK_DATABASE}", label: "MOCI trademark database page" }},
      {{ uri: "https://branddb.wipo.int/", label: "Global Brand Database used for QA self-search" }},
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "{TRADEMARK_DATABASE}",
    notes:
      "MOCI's current database page routes users to the Global Brand Database; the trademark-services page instructs users to select office QA for free immediate searching of registered and published marks.",
  }}),
  target(MOCI_QA, {{
    id: "qa-moci-trademark-fees",
    family: "FEES",
    displayName: "Qatar MOCI Trademark Service Fees",
    canonicalUri: "{TRADEMARK_FEES}",
    entrypoints: [
      {{ uri: "{TRADEMARK_FEES}", label: "Trademark fees" }},
      {{ uri: "{TRADEMARK_SERVICES}", label: "Current trademark service fee details" }},
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "{TRADEMARK_FEES}",
    notes:
      "Current MOCI service guidance publishes core national registration fees of QAR 1,000 for filing, QAR 500 for publication and QAR 3,000 for final registration/certificate, alongside renewal, opposition and recordal charges.",
  }}),
  target(MOCI_QA, {{
    id: "qa-moci-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Qatar MOCI Nice Goods and Services Classification",
    canonicalUri: "{TRANSACTION_FORMS}",
    entrypoints: [
      {{ uri: "{TRANSACTION_FORMS}", label: "MOCI transaction forms including Nice goods/services list" }},
      {{ uri: "https://www.moci.gov.qa/en/our-services/investor/intellectual-property-rights/protect-your-trademark-overseas-using-the-madrid-system/", label: "Current MOCI goods/services and Madrid guidance" }},
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "DOCX"],
    verificationEvidenceUri: "{TRANSACTION_FORMS}",
    notes:
      "MOCI's current transaction-forms surface publishes the goods-and-services list according to the Nice Classification; Madrid guidance preserves the national application's classified goods/services as the basic list.",
  }}),
  target(MOCI_QA, {{
    id: "qa-moci-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Qatar MOCI Trademark Laws and Regulations",
    canonicalUri: "{LAWS}",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "{LAWS}",
    notes:
      "The current MOCI legal surface lists Law No. 9 of 2002, GCC Trademark Law No. 7 of 2014, relevant implementing decisions and Ministerial Decision No. 60 of 2024 on MOCI service fees.",
  }}),
  target(MOCI_QA, {{
    id: "qa-moci-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Qatar MOCI Trademark Opposition, Grievance and Recordal Forms",
    canonicalUri: "https://www.moci.gov.qa/en/our-services/investor/forms/",
    entrypoints: [
      {{ uri: "https://www.moci.gov.qa/en/our-services/investor/forms/", label: "Trademark forms and instructions" }},
      {{ uri: "{TRADEMARK_SERVICES}", label: "Opposition, grievance, cancellation and recordal procedures" }},
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "DOCX"],
    verificationEvidenceUri: "https://www.moci.gov.qa/en/our-services/investor/forms/",
    notes:
      "MOCI publishes trademark grievance, opposition, opposition-response, hearing, renewal, deletion, licensing and ownership-transfer forms; the current services page publishes the corresponding fees and procedural steps.",
  }}),
  target(MOCI_QA, {{
    id: "qa-moci-industrial-property-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Qatar MOCI Industrial Property Gazette",
    canonicalUri: "https://www.moci.gov.qa/en/media-center/statistics-and-reports/industrial-property-gazette/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.moci.gov.qa/en/media-center/statistics-and-reports/industrial-property-gazette/",
    notes:
      "The national Industrial Property Gazette publishes trademark sections and current issues. It is distinct from MOCI's separate Madrid trademark Gazette and is the national publication surface tied to the 60-day publication/opposition period.",
  }}),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', qatar_block + 'const CIPO: Authority = {', 'insert Qatar source block')
priority = replace_first(
    priority,
    '  ...MOET_AE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...MOET_AE_SOURCE_COVERAGE_TARGETS,\n  ...MOCI_QA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Qatar targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  MOET_AE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  MOET_AE_SOURCE_COVERAGE_TARGETS,\n  MOCI_QA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Qatar targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Qatar targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  MOET_AE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  MOET_AE_SOURCE_COVERAGE_TARGETS,\n  MOCI_QA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Qatar targets',
)
priority_test = replace_first(
    priority_test,
    '  ["AE", MOET_AE_SOURCE_COVERAGE_TARGETS, ["moet.gov.ae"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["AE", MOET_AE_SOURCE_COVERAGE_TARGETS, ["moet.gov.ae"]],\n  ["QA", MOCI_QA_SOURCE_COVERAGE_TARGETS, ["moci.gov.qa"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Qatar authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for forty-one priority national offices',
    'ships explicit, official, unique coverage for forty-two priority national offices',
    'priority office count label',
)
priority_test = replace_first(priority_test, 'toHaveLength(316)', 'toHaveLength(324)', 'priority target count')
priority_test = replace_first(priority_test, '      316,\n', '      324,\n', 'priority id uniqueness count')
priority_test = replace_first(priority_test, '    ).toBe(316);', '    ).toBe(324);', 'priority canonical uniqueness count')
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
qatar_probes = '''  {
    id: "qa-trademarks-name",
    targetId: "qa-moci-trademarks",
    query: "Qatar MOCI intellectual property trademark protection",
  },
  {
    id: "qa-trademark-filing-name",
    targetId: "qa-moci-trademark-filing",
    query: "Qatar MOCI trademark registration filing publication 60 days",
  },
  {
    id: "qa-trademark-search-name",
    targetId: "qa-moci-trademark-search",
    query: "Qatar MOCI trademark database QA published registered marks",
  },
  {
    id: "qa-trademark-fees-name",
    targetId: "qa-moci-trademark-fees",
    query: "Qatar MOCI trademark fees 1000 500 3000 QAR",
  },
  {
    id: "qa-trademark-classification-name",
    targetId: "qa-moci-trademark-classification",
    query: "Qatar MOCI Nice classification goods services trademarks",
  },
  {
    id: "qa-trademark-law-name",
    targetId: "qa-moci-trademark-law",
    query: "Qatar trademark Law 9 2002 GCC Law 7 2014 MOCI",
  },
  {
    id: "qa-trademark-proceedings-name",
    targetId: "qa-moci-trademark-proceedings",
    query: "Qatar MOCI trademark opposition grievance hearing forms",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    qatar_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Qatar retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = replace_first(retrieval_test, 'expect(targets).toHaveLength(309);', 'expect(targets).toHaveLength(316);', 'foundational target count')
retrieval_test = replace_first(
    retrieval_test,
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(309);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(316);',
    'foundational probe count',
)
retrieval_test = replace_first(retrieval_test, '      309,\n', '      316,\n', 'foundational probe uniqueness count')
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "AE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "AE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "QA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    'retrieval test Qatar jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
