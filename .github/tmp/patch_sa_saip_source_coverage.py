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
saudi_block = '''const SAIP_SA: Authority = {
  jurisdiction: "SA",
  authorityName: "Saudi Authority for Intellectual Property (SAIP)",
  languages: ["ar-SA", "en"],
  verificationEvidenceUri: "https://www.saip.gov.sa/en/services/trademarks",
};

export const SAIP_SA_SOURCE_COVERAGE_TARGETS = [
  target(SAIP_SA, {
    id: "sa-saip-trademarks",
    family: "PORTAL",
    displayName: "SAIP Trademark Services",
    canonicalUri: "https://www.saip.gov.sa/en/services/trademarks",
    verificationEvidenceUri: "https://www.saip.gov.sa/en/services/trademarks",
    notes:
      "The current SAIP trademark hub is the official service directory for Saudi trademark protection, registration, management, search and Gazette services.",
  }),
  target(SAIP_SA, {
    id: "sa-saip-trademark-filing",
    family: "FILING",
    displayName: "SAIP Unified Intellectual Property Platform - Trademark Filing",
    canonicalUri: "https://eservices.saip.gov.sa/",
    entrypoints: [
      { uri: "https://eservices.saip.gov.sa/", label: "Unified Intellectual Property Platform" },
      {
        uri: "https://www.saip.gov.sa/en/services/trademarks/%D8%AA%D8%B3%D8%AC%D9%8A%D9%84-%D8%B9%D9%84%D8%A7%D9%85%D8%A9-%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9",
        label: "Trademark Registration service and filing steps",
      },
      { uri: "https://tm.saip.gov.sa/", label: "Legacy trademark platform for pre-19 December 2023 filings" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.saip.gov.sa/en/services/trademarks/%D8%AA%D8%B3%D8%AC%D9%8A%D9%84-%D8%B9%D9%84%D8%A7%D9%85%D8%A9-%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9",
    notes:
      "SAIP routes trademark registrations filed from 19 December 2023 onward through the Unified IP Platform while retaining the legacy trademark portal for earlier filings and related procedures.",
  }),
  target(SAIP_SA, {
    id: "sa-saip-trademark-search",
    family: "SEARCH",
    displayName: "SAIP Search Platform for Registered Trademarks",
    canonicalUri: "https://www.saip.gov.sa/en/services/trademarks/trademark1",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.saip.gov.sa/en/services/trademarks/trademark1",
    notes:
      "The official free search service provides access to Saudi national trademark-registration databases and points users to the current and legacy trademark platforms according to the 19 December 2023 migration boundary.",
  }),
  target(SAIP_SA, {
    id: "sa-saip-trademark-fees",
    family: "FEES",
    displayName: "SAIP Trademark Registration Fees",
    canonicalUri:
      "https://www.saip.gov.sa/en/services/trademarks/%D8%AA%D8%B3%D8%AC%D9%8A%D9%84-%D8%B9%D9%84%D8%A7%D9%85%D8%A9-%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9",
    entrypoints: [
      {
        uri: "https://www.saip.gov.sa/en/services/trademarks/%D8%AA%D8%B3%D8%AC%D9%8A%D9%84-%D8%B9%D9%84%D8%A7%D9%85%D8%A9-%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9",
        label: "Registration application, publication and certificate fees",
      },
      { uri: "https://www.saip.gov.sa/en/services/trademarks/trademark", label: "Trademark renewal and publication fees" },
    ],
    verificationEvidenceUri:
      "https://www.saip.gov.sa/en/services/trademarks/%D8%AA%D8%B3%D8%AC%D9%8A%D9%84-%D8%B9%D9%84%D8%A7%D9%85%D8%A9-%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9",
    notes:
      "The current registration service publishes a 1,000 SAR application fee, 500 SAR publication fee and 5,000 SAR registration/certificate fee; the renewal service separately publishes renewal and late-renewal charges.",
  }),
  target(SAIP_SA, {
    id: "sa-saip-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "SAIP Nice Classification Practice",
    canonicalUri: "https://www.saip.gov.sa/en/services/trademarks/trademark%40%40",
    entrypoints: [
      {
        uri: "https://www.saip.gov.sa/en/services/trademarks/trademark%40%40",
        label: "Trademark goods/services limitation service using Nice classes",
      },
      {
        uri: "https://www.saip.gov.sa/api/resources/tools-and-research/public-consultations/nice-classification-ce34",
        label: "SAIP Nice Classification policy material",
      },
    ],
    verificationEvidenceUri: "https://www.saip.gov.sa/en/services/trademarks/trademark%40%40",
    notes:
      "SAIP explicitly classifies trademarks into 45 classes under the International Classification of Goods and Services (Nice Agreement). This current trademark-service surface is used instead of unrelated or stale classification labels elsewhere on the site.",
  }),
  target(SAIP_SA, {
    id: "sa-saip-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "SAIP Intellectual Property Laws and Regulations - Trademarks",
    canonicalUri: "https://www.saip.gov.sa/en/resources/lows-and-regulations/systems-and-regulations",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.saip.gov.sa/en/resources/lows-and-regulations/systems-and-regulations",
    notes:
      "SAIP's official laws-and-regulations surface publishes Saudi intellectual-property legislation and implementing materials, including the trademark category and applicable regulations.",
  }),
  target(SAIP_SA, {
    id: "sa-saip-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "SAIP Trademark Litigation and Administrative Paths",
    canonicalUri: "https://www.saip.gov.sa/en/resources/lows-and-regulations/litigation-paths",
    entrypoints: [
      {
        uri: "https://www.saip.gov.sa/en/resources/lows-and-regulations/litigation-paths",
        label: "Trademark appeal, objection, cancellation and infringement paths",
      },
      {
        uri: "https://www.saip.gov.sa/en/services/trademarks/%D8%AA%D8%B3%D8%AC%D9%8A%D9%84-%D8%B9%D9%84%D8%A7%D9%85%D8%A9-%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9",
        label: "Registration publication and objection timeline",
      },
    ],
    verificationEvidenceUri: "https://www.saip.gov.sa/en/resources/lows-and-regulations/litigation-paths",
    notes:
      "SAIP publishes distinct trademark paths for appeal, objection, cancellation and infringement; accepted applications are published for 60 days before final registration if no objection is filed.",
  }),
  target(SAIP_SA, {
    id: "sa-saip-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "SAIP IPN Trademark Gazette",
    canonicalUri: "https://www.saip.gov.sa/en/services/trademarks/trademark-IPN-Trademark-gazette",
    entrypoints: [
      {
        uri: "https://www.saip.gov.sa/en/services/trademarks/trademark-IPN-Trademark-gazette",
        label: "IPN Trademark Gazette service",
      },
      { uri: "https://ipn.saip.gov.sa/", label: "Intellectual Property Gazette search" },
      { uri: "https://www.saip.gov.sa/en/resources/tools-and-research/gazette", label: "Gazette and legacy IP Newspaper split" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "PDF"],
    verificationEvidenceUri: "https://www.saip.gov.sa/en/services/trademarks/trademark-IPN-Trademark-gazette",
    notes:
      "The digital IPN Trademark Gazette publishes trademark applications and procedures. SAIP's Gazette resources distinguish applications filed on or after 19 December 2023 from earlier trademark records handled through the legacy IP Newspaper.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', saudi_block + 'const CIPO: Authority = {', 'insert Saudi source block')
priority = replace_first(
    priority,
    '  ...ZIS_RS_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...ZIS_RS_SOURCE_COVERAGE_TARGETS,\n  ...SAIP_SA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Saudi targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  ZIS_RS_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  ZIS_RS_SOURCE_COVERAGE_TARGETS,\n  SAIP_SA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Saudi targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Saudi targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  ZIS_RS_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  ZIS_RS_SOURCE_COVERAGE_TARGETS,\n  SAIP_SA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Saudi targets',
)
priority_test = replace_first(
    priority_test,
    '  ["RS", ZIS_RS_SOURCE_COVERAGE_TARGETS, ["zis.gov.rs"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["RS", ZIS_RS_SOURCE_COVERAGE_TARGETS, ["zis.gov.rs"]],\n  ["SA", SAIP_SA_SOURCE_COVERAGE_TARGETS, ["saip.gov.sa"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Saudi authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for thirty-nine priority national offices',
    'ships explicit, official, unique coverage for forty priority national offices',
    'priority office count label',
)
priority_test = replace_first(priority_test, 'toHaveLength(300)', 'toHaveLength(308)', 'priority target count')
priority_test = replace_first(priority_test, '      300,\n', '      308,\n', 'priority id uniqueness count')
priority_test = replace_first(priority_test, '    ).toBe(300);', '    ).toBe(308);', 'priority canonical uniqueness count')
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
saudi_probes = '''  {
    id: "sa-trademarks-name",
    targetId: "sa-saip-trademarks",
    query: "Saudi Authority Intellectual Property trademark services",
  },
  {
    id: "sa-trademark-filing-name",
    targetId: "sa-saip-trademark-filing",
    query: "SAIP Unified Intellectual Property Platform trademark registration filing",
  },
  {
    id: "sa-trademark-search-name",
    targetId: "sa-saip-trademark-search",
    query: "SAIP search platform registered trademarks Saudi national database",
  },
  {
    id: "sa-trademark-fees-name",
    targetId: "sa-saip-trademark-fees",
    query: "SAIP trademark registration application publication certificate fees SAR",
  },
  {
    id: "sa-trademark-classification-name",
    targetId: "sa-saip-trademark-classification",
    query: "Saudi SAIP Nice Classification 45 classes goods services trademark",
  },
  {
    id: "sa-trademark-law-name",
    targetId: "sa-saip-trademark-law",
    query: "Saudi SAIP trademark laws regulations intellectual property",
  },
  {
    id: "sa-trademark-proceedings-name",
    targetId: "sa-saip-trademark-proceedings",
    query: "SAIP trademark appeal objection cancellation litigation paths",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    saudi_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Saudi retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = replace_first(retrieval_test, 'expect(targets).toHaveLength(295);', 'expect(targets).toHaveLength(302);', 'foundational target count')
retrieval_test = replace_first(
    retrieval_test,
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(295);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(302);',
    'foundational probe count',
)
retrieval_test = replace_first(retrieval_test, '      295,\n', '      302,\n', 'foundational probe uniqueness count')
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "RS", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "RS", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "SA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    'retrieval test Saudi jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
