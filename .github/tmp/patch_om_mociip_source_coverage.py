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
oman_block = '''const MOCIIP_OM: Authority = {
  jurisdiction: "OM",
  authorityName: "Oman Ministry of Commerce, Industry and Investment Promotion (MoCIIP)",
  languages: ["ar-OM", "en"],
  verificationEvidenceUri: "https://gov.om/en/w/intellectual-property",
};

export const MOCIIP_OM_SOURCE_COVERAGE_TARGETS = [
  target(MOCIIP_OM, {
    id: "om-mociip-trademarks",
    family: "PORTAL",
    displayName: "Oman National Intellectual Property Office Trademark Services",
    canonicalUri: "https://gov.om/en/w/intellectual-property",
    entrypoints: [
      { uri: "https://gov.om/en/w/intellectual-property", label: "Gov.om intellectual-property service catalog" },
      { uri: "https://tejarah.gov.om/en/service-directory", label: "MoCIIP service directory" },
    ],
    verificationEvidenceUri: "https://gov.om/en/w/intellectual-property",
    notes:
      "The current Gov.om intellectual-property category aggregates National Intellectual Property Office trademark filing, search, opposition, renewal, recordal and hearing services administered by MoCIIP.",
  }),
  target(MOCIIP_OM, {
    id: "om-mociip-trademark-filing",
    family: "FILING",
    displayName: "Oman MoCIIP Apply for a Trademark",
    canonicalUri: "https://gov.om/en/w/apply-for-a-trademark",
    entrypoints: [
      { uri: "https://gov.om/en/w/apply-for-a-trademark", label: "National trademark application service" },
      { uri: "https://gov.om/en/w/register-collective-or-certification-trademarks-for-products-or-services-of-single-class", label: "Collective and certification trademark filing" },
    ],
    verificationEvidenceUri: "https://gov.om/en/w/apply-for-a-trademark",
    notes:
      "Gov.om's current national service enables filing a trademark for products or services of one class and identifies MoCIIP as the responsible authority; collective and certification marks have a separate official filing service.",
  }),
  target(MOCIIP_OM, {
    id: "om-mociip-trademark-search",
    family: "SEARCH",
    displayName: "Oman MoCIIP Verify Trademark Availability",
    canonicalUri: "https://gov.om/en/w/verify-trademark-availability",
    verificationEvidenceUri: "https://gov.om/en/w/verify-trademark-availability",
    notes:
      "The official availability service accepts a trademark search request to determine whether the mark already exists before registration filing.",
  }),
  target(MOCIIP_OM, {
    id: "om-mociip-trademark-fees",
    family: "FEES",
    displayName: "Oman MoCIIP Trademark Fees and Renewal Charges",
    canonicalUri: "https://gov.om/en/w/pay-renewal-delay-fine",
    entrypoints: [
      { uri: "https://gov.om/en/w/pay-renewal-delay-fine", label: "Trademark renewal and late-renewal charges" },
      { uri: "https://gov.om/en/w/request-to-record-the-transfer-of-trademark-ownership-in-the-register", label: "Trademark transfer and publication fees" },
      { uri: "https://gov.om/en/w/request-annotation-in-register-granting-right-to-use-a-trademark", label: "Trademark licence annotation and publication fees" },
      { uri: "https://gov.om/en/w/request-a-response-to-the-registrar-s-decision-for-acceptance-or-rejection", label: "Registrar-decision response fee" },
    ],
    verificationEvidenceUri: "https://gov.om/en/w/pay-renewal-delay-fine",
    notes:
      "Current Gov.om trademark services expose official transaction-specific fees, including renewal and late-renewal charges, transfer/publication fees, licence-annotation/publication fees and registrar-decision response fees. The catalog preserves live service pages rather than freezing amounts as permanent truth.",
  }),
  target(MOCIIP_OM, {
    id: "om-mociip-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Oman MoCIIP Nice Trademark Classification Practice",
    canonicalUri: "https://gov.om/en/w/apply-to-associate-your-trademark-with-another",
    entrypoints: [
      { uri: "https://gov.om/en/w/apply-to-associate-your-trademark-with-another", label: "Official Nice-class association service" },
      { uri: "https://gov.om/en/w/apply-for-a-trademark", label: "Single-class national trademark filing" },
    ],
    verificationEvidenceUri: "https://gov.om/en/w/apply-to-associate-your-trademark-with-another",
    notes:
      "MoCIIP's current trademark-association service expressly identifies the Nice international classification, while the national filing service is organized around products or services of a single class.",
  }),
  target(MOCIIP_OM, {
    id: "om-mociip-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Oman Trademark and Industrial Property Legislation",
    canonicalUri: "https://mjla.gov.om/laws/ar/1/show/154",
    entrypoints: [
      { uri: "https://mjla.gov.om/laws/ar/1/show/154", label: "Royal Decree 33/2017 issuing the GCC Trademark Law" },
      { uri: "https://www.mjla.gov.om/laws/1/show/95", label: "Royal Decree 67/2008 issuing the Industrial Property Rights Law" },
      { uri: "https://mjla.gov.om/laws/search", label: "Ministry of Justice and Legal Affairs legislation search" },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://mjla.gov.om/laws/ar/1/show/154",
    notes:
      "The Ministry of Justice and Legal Affairs publishes the GCC Trademark Law as issued in Oman by Royal Decree 33/2017 and the Industrial Property Rights Law issued by Royal Decree 67/2008, with downloadable legal texts and a live legislation search surface.",
  }),
  target(MOCIIP_OM, {
    id: "om-mociip-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Oman MoCIIP Trademark Opposition and Registrar Review Procedures",
    canonicalUri: "https://gov.om/en/w/object-to-the-registration-of-applications",
    entrypoints: [
      { uri: "https://gov.om/en/w/object-to-the-registration-of-applications", label: "Opposition to a published trademark application" },
      { uri: "https://gov.om/en/w/reply-to-objection-to-registration-of-requests", label: "Response to an opposition" },
      { uri: "https://gov.om/en/w/request-a-response-to-the-registrar-s-decision-for-acceptance-or-rejection", label: "Response to Registrar acceptance or rejection decision" },
      { uri: "https://gov.om/en/w/request-for-hearing", label: "Hearing request" },
    ],
    verificationEvidenceUri: "https://gov.om/en/w/object-to-the-registration-of-applications",
    notes:
      "Gov.om publishes separate National Intellectual Property Office services for opposing a trademark application published in the official gazette, replying to opposition, responding to Registrar decisions and requesting a hearing.",
  }),
  target(MOCIIP_OM, {
    id: "om-mjla-official-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Oman Ministry of Justice and Legal Affairs Official Gazette",
    canonicalUri: "https://mjla.gov.om/legislation/1",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://mjla.gov.om/legislation/1",
    notes:
      "The Ministry of Justice and Legal Affairs maintains the continuously updated Official Gazette library. MoCIIP trademark services explicitly tie published applications, transfers and licences to official-gazette publication, making this a high-value change-signal source.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', oman_block + 'const CIPO: Authority = {', 'insert Oman source block')
priority = replace_first(
    priority,
    '  ...MOCI_QA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...MOCI_QA_SOURCE_COVERAGE_TARGETS,\n  ...MOCIIP_OM_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Oman targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  MOCI_QA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  MOCI_QA_SOURCE_COVERAGE_TARGETS,\n  MOCIIP_OM_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Oman targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Oman targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  MOCI_QA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  MOCI_QA_SOURCE_COVERAGE_TARGETS,\n  MOCIIP_OM_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Oman targets',
)
priority_test = replace_first(
    priority_test,
    '  ["QA", MOCI_QA_SOURCE_COVERAGE_TARGETS, ["moci.gov.qa"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["QA", MOCI_QA_SOURCE_COVERAGE_TARGETS, ["moci.gov.qa"]],\n  ["OM", MOCIIP_OM_SOURCE_COVERAGE_TARGETS, ["gov.om", "mjla.gov.om"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Oman authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for forty-two priority national offices',
    'ships explicit, official, unique coverage for forty-three priority national offices',
    'priority office count label',
)
priority_test = replace_first(priority_test, 'toHaveLength(326)', 'toHaveLength(334)', 'priority target count')
priority_test = replace_first(priority_test, '      326,\n', '      334,\n', 'priority id uniqueness count')
priority_test = replace_first(priority_test, '    ).toBe(326);', '    ).toBe(334);', 'priority canonical uniqueness count')
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
oman_probes = '''  {
    id: "om-trademarks-name",
    targetId: "om-mociip-trademarks",
    query: "Oman National Intellectual Property Office MoCIIP trademark services",
  },
  {
    id: "om-trademark-filing-name",
    targetId: "om-mociip-trademark-filing",
    query: "Oman apply trademark MoCIIP national filing single class",
  },
  {
    id: "om-trademark-search-name",
    targetId: "om-mociip-trademark-search",
    query: "Oman verify trademark availability search before registration",
  },
  {
    id: "om-trademark-fees-name",
    targetId: "om-mociip-trademark-fees",
    query: "Oman trademark renewal transfer publication licence fees MoCIIP",
  },
  {
    id: "om-trademark-classification-name",
    targetId: "om-mociip-trademark-classification",
    query: "Oman trademark Nice international classification single class",
  },
  {
    id: "om-trademark-law-name",
    targetId: "om-mociip-trademark-law",
    query: "Oman Royal Decree 33 2017 GCC Trademark Law Industrial Property Rights 67 2008",
  },
  {
    id: "om-trademark-proceedings-name",
    targetId: "om-mociip-trademark-proceedings",
    query: "Oman trademark opposition objection registrar rejection hearing",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    oman_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Oman retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = replace_first(retrieval_test, 'expect(targets).toHaveLength(316);', 'expect(targets).toHaveLength(323);', 'foundational target count')
retrieval_test = replace_first(
    retrieval_test,
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(316);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(323);',
    'foundational probe count',
)
retrieval_test = replace_first(retrieval_test, '      316,\n', '      323,\n', 'foundational probe uniqueness count')
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "QA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "QA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "OM", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    'retrieval test Oman jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
