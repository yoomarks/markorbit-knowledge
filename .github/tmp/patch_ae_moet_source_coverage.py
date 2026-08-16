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
uae_block = '''const MOET_AE: Authority = {
  jurisdiction: "AE",
  authorityName: "Ministry of Economy & Tourism (MoET)",
  languages: ["ar-AE", "en"],
  verificationEvidenceUri: "https://www.moet.gov.ae/en/w/trademark-services-1",
};

export const MOET_AE_SOURCE_COVERAGE_TARGETS = [
  target(MOET_AE, {
    id: "ae-moet-trademarks",
    family: "PORTAL",
    displayName: "UAE MoET Trademark Services",
    canonicalUri: "https://www.moet.gov.ae/en/w/trademark-services-1",
    verificationEvidenceUri: "https://www.moet.gov.ae/en/w/trademark-services-1",
    notes:
      "The current Ministry of Economy & Tourism trademark-services hub is the official directory for UAE trademark registration, inquiry, renewal, recordals, opposition, cancellation and related procedures.",
  }),
  target(MOET_AE, {
    id: "ae-moet-trademark-filing",
    family: "FILING",
    displayName: "UAE MoET Register Trademark",
    canonicalUri: "https://www.moet.gov.ae/en/w/register-trademark%C2%A0",
    entrypoints: [
      {
        uri: "https://www.moet.gov.ae/en/w/register-trademark%C2%A0",
        label: "Current national trademark registration service",
      },
      {
        uri: "https://www.moet.gov.ae/en/services",
        label: "MoET eServices catalog and trademark service entry",
      },
    ],
    verificationEvidenceUri: "https://www.moet.gov.ae/en/w/register-trademark%C2%A0",
    notes:
      "The current registration service documents filing requirements, examination, official-bulletin publication, a 30-day objection period and final registration; owners outside the UAE must file through a registration agent.",
  }),
  target(MOET_AE, {
    id: "ae-moet-trademark-search",
    family: "SEARCH",
    displayName: "UAE MoET Trademark Inquiry",
    canonicalUri: "https://www.moet.gov.ae/en/w/trademark-inquiry",
    verificationEvidenceUri: "https://www.moet.gov.ae/en/w/trademark-inquiry",
    notes:
      "The official Trademark Inquiry service provides immediate Ministry search results for companies, establishments and individuals through the MoET website and smart app.",
  }),
  target(MOET_AE, {
    id: "ae-moet-trademark-fees",
    family: "FEES",
    displayName: "UAE MoET Trademark Fees",
    canonicalUri: "https://www.moet.gov.ae/en/w/pay-publishing-fees-for-trademark-registration",
    entrypoints: [
      {
        uri: "https://www.moet.gov.ae/en/w/register-trademark%C2%A0",
        label: "Examination, publication and final registration fees",
      },
      {
        uri: "https://www.moet.gov.ae/en/w/pay-publishing-fees-for-trademark-registration",
        label: "Publication fee and late-payment penalty",
      },
      {
        uri: "https://www.moet.gov.ae/en/w/renew-registration-of-trademark",
        label: "Trademark renewal and late-renewal fees",
      },
    ],
    verificationEvidenceUri: "https://www.moet.gov.ae/en/w/register-trademark%C2%A0",
    notes:
      "Current MoET service pages publish the national examination, publication, registration, renewal and late-payment charges; fee evidence is kept on live service pages rather than frozen into the catalog as permanent legal truth.",
  }),
  target(MOET_AE, {
    id: "ae-moet-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "UAE MoET Nice Classification Practice",
    canonicalUri: "https://www.moet.gov.ae/en/trademark-services",
    entrypoints: [
      {
        uri: "https://www.moet.gov.ae/en/trademark-services",
        label: "Current trademark service surface",
      },
      {
        uri: "https://www.moet.gov.ae/en/w/register-trademark%C2%A0",
        label: "Registration requirements for classified goods and services",
      },
    ],
    verificationEvidenceUri: "https://www.moet.gov.ae/en/trademark-services",
    notes:
      "MoET identifies the Nice Classification (NCL) as the classification system used for trademark goods and services. The catalog deliberately avoids freezing a specific Nice edition as permanent current truth.",
  }),
  target(MOET_AE, {
    id: "ae-moet-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "UAE MoET Intellectual Property Legislations - Trademarks",
    canonicalUri: "https://www.moet.gov.ae/en/intellectual-property-legislations",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.moet.gov.ae/en/intellectual-property-legislations",
    notes:
      "The official IP legislation hub publishes Federal Decree-Law No. 36 of 2021 on Trademarks, Cabinet Decision No. 57 of 2022 on its Executive Regulations and later Ministry fee/agent measures.",
  }),
  target(MOET_AE, {
    id: "ae-moet-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "UAE MoET Trademark Opposition and Review Procedures",
    canonicalUri: "https://www.moet.gov.ae/en/w/trademark-objection-request",
    entrypoints: [
      {
        uri: "https://www.moet.gov.ae/en/w/trademark-objection-request",
        label: "Trademark objection request",
      },
      {
        uri: "https://www.moet.gov.ae/en/w/responding-to-an-objection-against-the-acceptance-of-trademark-registration",
        label: "Response to trademark objection",
      },
      {
        uri: "https://www.moet.gov.ae/en/w/register-trademark%C2%A0",
        label: "Registration rejection appeal and publication-objection timeline",
      },
    ],
    verificationEvidenceUri: "https://www.moet.gov.ae/en/w/trademark-objection-request",
    notes:
      "MoET publishes separate objection and objection-response procedures, while the current registration service records the 30-day objection window and the administrative appeal path after rejection.",
  }),
  target(MOET_AE, {
    id: "ae-moet-trademark-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "UAE MoET Trademark Bulletin",
    canonicalUri: "https://www.moet.gov.ae/en/our-publications",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.moet.gov.ae/en/our-publications",
    notes:
      "The official publications surface continuously publishes numbered UAE Trademark Bulletin issues. Publication of an accepted mark starts the current 30-day objection period documented by MoET.",
  }),
+] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', uae_block + 'const CIPO: Authority = {', 'insert UAE source block')
priority = replace_first(
    priority,
    '  ...SAIP_SA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...SAIP_SA_SOURCE_COVERAGE_TARGETS,\n  ...MOET_AE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate UAE targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  SAIP_SA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  SAIP_SA_SOURCE_COVERAGE_TARGETS,\n  MOET_AE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import UAE targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export UAE targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  SAIP_SA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  SAIP_SA_SOURCE_COVERAGE_TARGETS,\n  MOET_AE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import UAE targets',
)
priority_test = replace_first(
    priority_test,
    '  ["SA", SAIP_SA_SOURCE_COVERAGE_TARGETS, ["saip.gov.sa"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["SA", SAIP_SA_SOURCE_COVERAGE_TARGETS, ["saip.gov.sa"]],\n  ["AE", MOET_AE_SOURCE_COVERAGE_TARGETS, ["moet.gov.ae"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test UAE authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for forty priority national offices',
    'ships explicit, official, unique coverage for forty-one priority national offices',
    'priority office count label',
)
priority_test = replace_first(priority_test, 'toHaveLength(308)', 'toHaveLength(316)', 'priority target count')
priority_test = replace_first(priority_test, '      308,\n', '      316,\n', 'priority id uniqueness count')
priority_test = replace_first(priority_test, '    ).toBe(308);', '    ).toBe(316);', 'priority canonical uniqueness count')
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
uae_probes = '''  {
    id: "ae-trademarks-name",
    targetId: "ae-moet-trademarks",
    query: "UAE Ministry Economy Tourism trademark services registration renewal opposition",
  },
  {
    id: "ae-trademark-filing-name",
    targetId: "ae-moet-trademark-filing",
    query: "UAE MoET register trademark application examination publication",
  },
  {
    id: "ae-trademark-search-name",
    targetId: "ae-moet-trademark-search",
    query: "UAE MoET trademark inquiry search service",
  },
  {
    id: "ae-trademark-fees-name",
    targetId: "ae-moet-trademark-fees",
    query: "UAE trademark examination publication registration renewal fees AED MoET",
  },
  {
    id: "ae-trademark-classification-name",
    targetId: "ae-moet-trademark-classification",
    query: "UAE Ministry Economy Nice Classification trademark goods services",
  },
  {
    id: "ae-trademark-law-name",
    targetId: "ae-moet-trademark-law",
    query: "UAE Federal Decree Law 36 2021 trademarks Cabinet Decision 57 2022",
  },
  {
    id: "ae-trademark-proceedings-name",
    targetId: "ae-moet-trademark-proceedings",
    query: "UAE MoET trademark opposition objection response appeal procedure",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    uae_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert UAE retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = replace_first(retrieval_test, 'expect(targets).toHaveLength(302);', 'expect(targets).toHaveLength(309);', 'foundational target count')
retrieval_test = replace_first(
    retrieval_test,
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(302);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(309);',
    'foundational probe count',
)
retrieval_test = replace_first(retrieval_test, '      302,\n', '      309,\n', 'foundational probe uniqueness count')
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "SA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "SA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "AE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    'retrieval test UAE jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
