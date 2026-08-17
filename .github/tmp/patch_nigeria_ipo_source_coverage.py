from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)


priority_path = "packages/persistence/src/priority-national-source-coverage.ts"
priority = read(priority_path)
if "IPO_NG_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Nigeria coverage already present")

ng_block = r'''const IPO_NG: Authority = {
  jurisdiction: "NG",
  authorityName:
    "Intellectual Property Office Nigeria – Trademark Registry, Federal Ministry of Industry, Trade and Investment",
  languages: ["en"],
  verificationEvidenceUri: "https://iponigeria.fmiti.gov.ng/",
};

export const IPO_NG_SOURCE_COVERAGE_TARGETS = [
  target(IPO_NG, {
    id: "ng-ipo-trademark-portal",
    family: "PORTAL",
    displayName: "IPO Nigeria Trademark Portal",
    canonicalUri: "https://iponigeria.fmiti.gov.ng/",
    verificationEvidenceUri: "https://iponigeria.fmiti.gov.ng/about/",
    notes:
      "Current official FMITI Commercial Law Department digital platform for Nigerian trademarks, patents and industrial designs, linking filing, search, publications and post-registration services.",
  }),
  target(IPO_NG, {
    id: "ng-ipo-trademark-filing",
    family: "FILING",
    displayName: "IPO Nigeria Online Filing Portal",
    canonicalUri: "https://portal.iponigeria.com/auth/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://iponigeria.fmiti.gov.ng/",
    notes:
      "Official transactional portal used to register IP rights, including new trademark applications, with authenticated filing and online payment workflows.",
  }),
  target(IPO_NG, {
    id: "ng-ipo-trademark-search",
    family: "SEARCH",
    displayName: "IPO Nigeria Trademark File and Status Search",
    canonicalUri: "https://portal.iponigeria.com/files/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://iponigeria.fmiti.gov.ng/",
    notes:
      "Official portal file search with advanced-search support and file ID, status, title, type and class fields; complements the availability-search workflow linked by IPO Nigeria.",
  }),
  target(IPO_NG, {
    id: "ng-ipo-trademark-fees",
    family: "FEES",
    displayName: "IPO Nigeria Trademark Services and Fees",
    canonicalUri: "https://iponigeria.fmiti.gov.ng/services-fees/",
    verificationEvidenceUri: "https://iponigeria.fmiti.gov.ng/services-fees/",
    notes:
      "Current official services-and-fees table covering availability search, registration, certificate, renewal, late renewal, appeal, opposition, status reports, recordals and certified copies.",
  }),
  target(IPO_NG, {
    id: "ng-ipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "IPO Nigeria Trademark Classification Guidance",
    canonicalUri: "https://iponigeria.fmiti.gov.ng/faqs/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN"],
    verificationEvidenceUri: "https://iponigeria.fmiti.gov.ng/faqs/",
    notes:
      "Official trademark FAQ states the Nigerian 45-class structure, with classes 1–34 for goods and 35–45 for services, and links the Office's trademark class guide.",
  }),
  target(IPO_NG, {
    id: "ng-ipo-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Nigeria Trademarks Act and Regulations",
    canonicalUri: "https://iponigeria.fmiti.gov.ng/resources/acts-regulations/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://iponigeria.fmiti.gov.ng/resources/acts-regulations/",
    notes:
      "Official IPO Nigeria legal-resources page publishing the Trademarks Act and related IP legislation governing registration and protection.",
  }),
  target(IPO_NG, {
    id: "ng-ipo-trademark-opposition",
    family: "PROCEEDINGS",
    displayName: "IPO Nigeria Trademark Opposition",
    canonicalUri: "https://portal.iponigeria.com/home/opposition/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://iponigeria.fmiti.gov.ng/",
    notes:
      "Official opposition workspace for published trademark applications, linked by the IPO Nigeria public portal and supported by the current services-and-fees table.",
  }),
  target(IPO_NG, {
    id: "ng-ipo-trademark-maintenance",
    family: "MAINTENANCE",
    displayName: "IPO Nigeria Trademark Renewal and Post-registration Services",
    canonicalUri: "https://iponigeria.fmiti.gov.ng/services/",
    verificationEvidenceUri: "https://iponigeria.fmiti.gov.ng/services/",
    notes:
      "Official trademark services page covering renewals and post-registration recordals including registered user, merger, assignment and applicant name/address changes.",
  }),
  target(IPO_NG, {
    id: "ng-ipo-trademark-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "IPO Nigeria Trademark Publication Journal",
    canonicalUri: "https://iponigeria.fmiti.gov.ng/resources/trademark-journal/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://iponigeria.fmiti.gov.ng/resources/trademark-journal/",
    notes:
      "Official year-selectable Trademark Publication Journal surface; retained as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", ng_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  ...IPO_NG_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "IPO_NG_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Nigeria catalog export already present")
catalog = replace_once(
    catalog,
    "  COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  IPO_NG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
catalog = replace_once(
    catalog,
    "  COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  IPO_NG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog export",
)
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  IPO_NG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["AZ", COPAT_AZ_SOURCE_COVERAGE_TARGETS, ["copat.gov.az", "copat.az"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["AZ", COPAT_AZ_SOURCE_COVERAGE_TARGETS, ["copat.gov.az", "copat.az"]],\n  ["NG", IPO_NG_SOURCE_COVERAGE_TARGETS, ["iponigeria.fmiti.gov.ng", "iponigeria.com"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("seventy-one priority national offices", "seventy-two priority national offices")
priority_test = priority_test.replace("toHaveLength(580)", "toHaveLength(589)", 1)
priority_test = priority_test.replace("    580,\n", "    589,\n", 1)
priority_test = priority_test.replace(").toBe(580);", ").toBe(589);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "ng-ipo-trademark-portal-name" in retrieval:
    raise SystemExit("Nigeria retrieval probes already present")
probes = r'''  {
    id: "ng-ipo-trademark-portal-name",
    targetId: "ng-ipo-trademark-portal",
    query: "IPO Nigeria Trademark Registry Federal Ministry Industry Trade Investment",
  },
  {
    id: "ng-ipo-trademark-filing-name",
    targetId: "ng-ipo-trademark-filing",
    query: "Nigeria online trademark application filing register IP rights",
  },
  {
    id: "ng-ipo-trademark-search-name",
    targetId: "ng-ipo-trademark-search",
    query: "Nigeria trademark file status search class title file ID",
  },
  {
    id: "ng-ipo-trademark-fees-name",
    targetId: "ng-ipo-trademark-fees",
    query: "Nigeria trademark availability search registration renewal opposition fees",
  },
  {
    id: "ng-ipo-trademark-classification-name",
    targetId: "ng-ipo-trademark-classification",
    query: "Nigeria trademark 45 classes goods services classification",
  },
  {
    id: "ng-ipo-trademark-legal-texts-name",
    targetId: "ng-ipo-trademark-legal-texts",
    query: "Nigeria Trademarks Act regulations official",
  },
  {
    id: "ng-ipo-trademark-opposition-name",
    targetId: "ng-ipo-trademark-opposition",
    query: "Nigeria trademark opposition published application",
  },
  {
    id: "ng-ipo-trademark-maintenance-name",
    targetId: "ng-ipo-trademark-maintenance",
    query: "Nigeria trademark renewal assignment recordal change applicant name address",
  },
'''
closing = "] satisfies readonly RetrievalRelevanceProbe[];"
pos = retrieval.find(closing)
if pos < 0:
    raise SystemExit("missing retrieval probe array closing")
retrieval = retrieval[:pos] + probes + retrieval[pos:]
write(retrieval_path, retrieval)

retrieval_test_path = "packages/persistence/tests/retrieval-relevance-audit.test.ts"
retrieval_test = read(retrieval_test_path)
retrieval_test = retrieval_test.replace("toHaveLength(541)", "toHaveLength(549)", 2)
retrieval_test = retrieval_test.replace("      541,\n", "      549,\n", 1)
ng_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "NG", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "AZ", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + ng_assertion, "retrieval Nigeria jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Nigeria IPO trademark source coverage patch applied")
