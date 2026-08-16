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
kuwait_block = '''const MOCI_KW: Authority = {
  jurisdiction: "KW",
  authorityName: "Kuwait Ministry of Commerce and Industry (MOCI)",
  languages: ["ar-KW", "en"],
  verificationEvidenceUri:
    "https://www.moci.gov.kw/en/e-service/automated-trademark-registration-services/",
};

export const MOCI_KW_SOURCE_COVERAGE_TARGETS = [
  target(MOCI_KW, {
    id: "kw-moci-trademarks",
    family: "PORTAL",
    displayName: "Kuwait MOCI Automated Trademark Registration Services",
    canonicalUri:
      "https://www.moci.gov.kw/en/e-service/automated-trademark-registration-services/",
    entrypoints: [
      {
        uri: "https://www.moci.gov.kw/en/e-service/automated-trademark-registration-services/",
        label: "Automated trademark services catalog",
      },
      { uri: "https://trademark.moci.gov.kw/", label: "Trademark transaction portal" },
      {
        uri: "https://e.gov.kw/sites/kgoarabic/Pages/eServices/MOCI/TrademarkRegistrationServices.aspx",
        label: "Kuwait Government Online trademark e-service gateway",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri:
      "https://www.moci.gov.kw/en/e-service/automated-trademark-registration-services/",
    notes:
      "MOCI's current automated trademark service catalog covers filing, examination, registration/certificates, renewal, amendments, cancellation, opposition/grievance, recordals and related trademark transactions.",
  }),
  target(MOCI_KW, {
    id: "kw-moci-trademark-filing",
    family: "FILING",
    displayName: "Kuwait MOCI Trademark Filing",
    canonicalUri: "https://www.moci.gov.kw/ar/es/c_service/detail/65452/",
    entrypoints: [
      {
        uri: "https://www.moci.gov.kw/ar/es/c_service/detail/65452/",
        label: "Current MOCI trademark deposit service",
      },
      {
        uri: "https://e.gov.kw/sites/kgoenglish/Pages/Services/MOCI/RegistrationDomesticBrand.aspx",
        label: "Kuwait Government Online local trademark registration",
      },
      {
        uri: "https://e.gov.kw/sites/kgoenglish/Pages/Services/MOCI/ApplicationForRegistrationForeignBrand.aspx",
        label: "Kuwait Government Online foreign trademark registration",
      },
    ],
    verificationEvidenceUri: "https://www.moci.gov.kw/ar/es/c_service/detail/65452/",
    notes:
      "The current MOCI filing service records applicant/representative requirements and filing documents; Kuwait Government Online separately preserves local and foreign filing procedures and evidence requirements.",
  }),
  target(MOCI_KW, {
    id: "kw-moci-trademark-search",
    family: "SEARCH",
    displayName: "Kuwait MOCI Preliminary Trademark Examination",
    canonicalUri: "https://www.moci.gov.kw/ar/es/c_service/detail/65481/",
    verificationEvidenceUri: "https://www.moci.gov.kw/ar/es/c_service/detail/65481/",
    notes:
      "MOCI publishes a dedicated preliminary trademark examination service for checking a mark before or alongside registration workflows.",
  }),
  target(MOCI_KW, {
    id: "kw-moci-trademark-fees",
    family: "FEES",
    displayName: "Kuwait Trademark Service Fees",
    canonicalUri:
      "https://e.gov.kw/sites/kgoenglish/Pages/Services/MOCI/ApplicationForRegistrationForeignBrand.aspx",
    entrypoints: [
      {
        uri: "https://e.gov.kw/sites/kgoenglish/Pages/Services/MOCI/ApplicationForRegistrationForeignBrand.aspx",
        label: "Government Online filing, publication and registration fees",
      },
      {
        uri: "https://www.moci.gov.kw/ar/es/c_service/detail/65443/",
        label: "Current MOCI registration/certificate service fee",
      },
      {
        uri: "https://www.moci.gov.kw/ar/es/c_service/detail/65459/",
        label: "Current MOCI late-renewal service fee",
      },
    ],
    verificationEvidenceUri:
      "https://e.gov.kw/sites/kgoenglish/Pages/Services/MOCI/ApplicationForRegistrationForeignBrand.aspx",
    notes:
      "Current official services expose transaction-specific trademark fees. The catalog keeps live government pages as fee evidence rather than freezing amounts as permanent legal truth.",
  }),
  target(MOCI_KW, {
    id: "kw-moci-trademark-renewal",
    family: "FILING",
    displayName: "Kuwait Trademark Registration and Renewal",
    canonicalUri:
      "https://e.gov.kw/sites/kgoenglish/Pages/Services/MOCI/RegistrationRenewalTradeMark.aspx",
    entrypoints: [
      {
        uri: "https://e.gov.kw/sites/kgoenglish/Pages/Services/MOCI/RegistrationRenewalTradeMark.aspx",
        label: "Government Online local/foreign trademark renewal",
      },
      {
        uri: "https://www.moci.gov.kw/ar/es/c_service/detail/65459/",
        label: "MOCI renewal within six-month post-expiry period",
      },
    ],
    verificationEvidenceUri:
      "https://e.gov.kw/sites/kgoenglish/Pages/Services/MOCI/RegistrationRenewalTradeMark.aspx",
    notes:
      "Kuwait Government Online records the ten-year trademark protection term and renewal window, while MOCI exposes the current post-expiry renewal transaction as a separate electronic service.",
  }),
  target(MOCI_KW, {
    id: "kw-moci-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Kuwait GCC Trademark Law and Implementing Regulation",
    canonicalUri:
      "https://moci.gov.kw/ar/knon-rkm-13-lsn-2015-blmofk-aal-knon-nthm-laalmt-ltgry-ldol-mgls/",
    entrypoints: [
      {
        uri: "https://moci.gov.kw/ar/knon-rkm-13-lsn-2015-blmofk-aal-knon-nthm-laalmt-ltgry-ldol-mgls/",
        label: "Law No. 13 of 2015 approving the GCC Trademark Law",
      },
      {
        uri: "https://www.moci.gov.kw/ar/knon-rkm-13-lsn-2015-blmofk-aal-knon-nthm-laalmt-ltgry-ldol-mgls/knon-laalmt-ltgry-lmohd/",
        label: "Unified GCC Trademark Law text",
      },
      { uri: "https://www.moci.gov.kw/ar/law/", label: "MOCI legal services and legislation hub" },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://moci.gov.kw/ar/knon-rkm-13-lsn-2015-blmofk-aal-knon-nthm-laalmt-ltgry-ldol-mgls/",
    notes:
      "MOCI publishes Law No. 13 of 2015 approving the unified GCC Trademark Law and exposes both the unified law and its implementing regulation from the official legislation surface.",
  }),
  target(MOCI_KW, {
    id: "kw-moci-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Kuwait MOCI Trademark Opposition, Grievance and Hearing Services",
    canonicalUri:
      "https://www.moci.gov.kw/ar/e-service/automated-trademark-registration-services/",
    entrypoints: [
      {
        uri: "https://www.moci.gov.kw/ar/e-service/automated-trademark-registration-services/",
        label: "Opposition, grievance and hearing service catalog",
      },
      { uri: "https://trademark.moci.gov.kw/", label: "Trademark proceedings transaction portal" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri:
      "https://www.moci.gov.kw/ar/e-service/automated-trademark-registration-services/",
    notes:
      "The automated MOCI catalog explicitly exposes grievance against refusal/conditional acceptance, opposition to accepted registrations and hearing-request workflows alongside the trademark transaction portal.",
  }),
  target(MOCI_KW, {
    id: "kw-kuwait-al-yawm-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Kuwait Al-Yawm Official Gazette - Trademark Publication Signal",
    canonicalUri: "https://kuwaitalyawm.media.gov.kw/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://kuwaitalyawm.media.gov.kw/",
    notes:
      "Kuwait Al-Yawm is the official gazette with continuously published current and archived issues. MOCI's automated trademark service explicitly ties trademark publication/refusal publication workflows to Kuwait Al-Yawm.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', kuwait_block + 'const CIPO: Authority = {', 'insert Kuwait source block')
priority = replace_first(
    priority,
    '  ...MOIC_BH_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...MOIC_BH_SOURCE_COVERAGE_TARGETS,\n  ...MOCI_KW_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Kuwait targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  MOIC_BH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  MOIC_BH_SOURCE_COVERAGE_TARGETS,\n  MOCI_KW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Kuwait targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Kuwait targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  MOIC_BH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  MOIC_BH_SOURCE_COVERAGE_TARGETS,\n  MOCI_KW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Kuwait targets',
)
priority_test = replace_first(
    priority_test,
    '  ["BH", MOIC_BH_SOURCE_COVERAGE_TARGETS, ["moic.gov.bh", "bahrain.bh", "legalaffairs.gov.bh"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["BH", MOIC_BH_SOURCE_COVERAGE_TARGETS, ["moic.gov.bh", "bahrain.bh", "legalaffairs.gov.bh"]],\n  ["KW", MOCI_KW_SOURCE_COVERAGE_TARGETS, ["moci.gov.kw", "e.gov.kw", "media.gov.kw"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Kuwait authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for forty-four priority national offices',
    'ships explicit, official, unique coverage for forty-five priority national offices',
    'priority office count label',
)
priority_test = replace_first(priority_test, 'toHaveLength(342)', 'toHaveLength(350)', 'priority target count')
priority_test = replace_first(priority_test, '      342,\n', '      350,\n', 'priority id uniqueness count')
priority_test = replace_first(priority_test, '    ).toBe(342);', '    ).toBe(350);', 'priority canonical uniqueness count')
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
kuwait_probes = '''  {
    id: "kw-trademarks-name",
    targetId: "kw-moci-trademarks",
    query: "Kuwait MOCI automated trademark registration services",
  },
  {
    id: "kw-trademark-filing-name",
    targetId: "kw-moci-trademark-filing",
    query: "Kuwait MOCI trademark filing deposit local foreign registration",
  },
  {
    id: "kw-trademark-search-name",
    targetId: "kw-moci-trademark-search",
    query: "Kuwait MOCI preliminary trademark examination search",
  },
  {
    id: "kw-trademark-fees-name",
    targetId: "kw-moci-trademark-fees",
    query: "Kuwait trademark filing publication registration renewal fees KD",
  },
  {
    id: "kw-trademark-renewal-name",
    targetId: "kw-moci-trademark-renewal",
    query: "Kuwait trademark renewal ten years six months MOCI",
  },
  {
    id: "kw-trademark-law-name",
    targetId: "kw-moci-trademark-law",
    query: "Kuwait Law 13 2015 unified GCC Trademark Law implementing regulation",
  },
  {
    id: "kw-trademark-proceedings-name",
    targetId: "kw-moci-trademark-proceedings",
    query: "Kuwait MOCI trademark opposition grievance refusal hearing",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    kuwait_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Kuwait retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = replace_first(retrieval_test, 'expect(targets).toHaveLength(330);', 'expect(targets).toHaveLength(337);', 'foundational target count')
retrieval_test = replace_first(
    retrieval_test,
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(330);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(337);',
    'foundational probe count',
)
retrieval_test = replace_first(retrieval_test, '      330,\n', '      337,\n', 'foundational probe uniqueness count')
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "BH", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "BH", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "KW", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    'retrieval test Kuwait jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
