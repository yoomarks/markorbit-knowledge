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
if "QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Kazakhstan coverage already present")

kz_block = r'''const QAZPATENT_KZ: Authority = {
  jurisdiction: "KZ",
  authorityName: "National Institute of Intellectual Property (Qazpatent)",
  languages: ["kk", "ru", "en"],
  verificationEvidenceUri: "https://kazpatent.kz/en/ip-objects/trademark",
};

export const QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS = [
  target(QAZPATENT_KZ, {
    id: "kz-qazpatent-trademark-portal",
    family: "PORTAL",
    displayName: "Kazakhstan Qazpatent Trademark Portal",
    canonicalUri: "https://kazpatent.kz/en/ip-objects/trademark",
    verificationEvidenceUri: "https://kazpatent.kz/en/ip-objects/trademark",
    notes:
      "Current Qazpatent trademark portal linking applicant, owner, filing, fee, classification, regulatory and maintenance resources. The site flags trademark-law amendments effective from 25 January 2026.",
  }),
  target(QAZPATENT_KZ, {
    id: "kz-qazpatent-trademark-filing",
    family: "FILING",
    displayName: "Kazakhstan Qazpatent Trademark Electronic Filing",
    canonicalUri: "https://newcab.kazpatent.kz/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://kazpatent.kz/en/ip-objects/trademark/applicants/gosudarstvennaya-usluga-registraciya-tovarnogo-znaka",
    notes:
      "Current Qazpatent public-service guidance directs applicants to the newcab.kazpatent.kz information system for electronic trademark submissions and payment.",
  }),
  target(QAZPATENT_KZ, {
    id: "kz-qazpatent-trademark-search",
    family: "SEARCH",
    displayName: "Kazakhstan Qazpatent State Register Search",
    canonicalUri: "https://gosreestr.kazpatent.kz/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://kazpatent.kz/en/ip-objects/trademark/general-information/what-trademark",
    notes:
      "Qazpatent maintains the State Register of Trademarks and identifies its official state-register system as the source for checking current registrations; the dynamic register may require browser rendering.",
  }),
  target(QAZPATENT_KZ, {
    id: "kz-qazpatent-trademark-fees",
    family: "FEES",
    displayName: "Kazakhstan Qazpatent Trademark Fees",
    canonicalUri: "https://kazpatent.kz/en/ip-objects/trademark/applicants/quny",
    verificationEvidenceUri: "https://kazpatent.kz/en/ip-objects/trademark/applicants/quny",
    notes:
      "Current trademark fee table reflecting the Qazpatent prices effective from 1 January 2026, including per-class and per-item charges and renewal fees.",
  }),
  target(QAZPATENT_KZ, {
    id: "kz-qazpatent-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Kazakhstan Qazpatent Nice Classification Guidance",
    canonicalUri:
      "https://kazpatent.kz/en/ip-objects/trademark/applicants/tauarlar-men-qyzmetterdin-halyqaralyq-zhiktemesi",
    verificationEvidenceUri:
      "https://kazpatent.kz/en/ip-objects/trademark/applicants/tauarlar-men-qyzmetterdin-halyqaralyq-zhiktemesi",
    notes: "Official Qazpatent trademark applicant page for the International (Nice) Classification of Goods and Services.",
  }),
  target(QAZPATENT_KZ, {
    id: "kz-qazpatent-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Kazakhstan Qazpatent Trademark Regulatory Documents",
    canonicalUri:
      "https://kazpatent.kz/en/ip-objects/trademark/general-information/normativtik-quzhattar",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://kazpatent.kz/en/ip-objects/trademark/general-information/normativtik-quzhattar",
    notes:
      "Official Qazpatent legal index linking the Trademark Law, examination rules, State Register rules and related trademark regulations.",
  }),
  target(QAZPATENT_KZ, {
    id: "kz-qazpatent-trademark-examination",
    family: "EXAMINATION_MANUAL",
    displayName: "Kazakhstan Qazpatent Trademark Examination Stages",
    canonicalUri: "https://kazpatent.kz/en/ip-objects/trademark/applicants/kezenderi",
    verificationEvidenceUri: "https://kazpatent.kz/en/ip-objects/trademark/applicants/kezenderi",
    notes:
      "Official examination-stage guidance describing preliminary and full examination and the statutory examination framework for trademark applications.",
  }),
  target(QAZPATENT_KZ, {
    id: "kz-qazpatent-trademark-renewal",
    family: "MAINTENANCE",
    displayName: "Kazakhstan Qazpatent Trademark Renewal",
    canonicalUri:
      "https://kazpatent.kz/en/ip-objects/trademark/owners/tauar-tanbasyn-tirkeudin-qoldanylu-merzimin-uzartu-tartibi",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://kazpatent.kz/en/ip-objects/trademark/owners/tauar-tanbasyn-tirkeudin-qoldanylu-merzimin-uzartu-tartibi",
  }),
  target(QAZPATENT_KZ, {
    id: "kz-qazpatent-electronic-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "Kazakhstan Qazpatent Electronic Bulletin – Industrial Property",
    canonicalUri: "https://kazpatent.kz/en/electronic-bulletin",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://kazpatent.kz/en/ip-objects/trademark/general-information/what-trademark",
    notes:
      "Qazpatent identifies publication of the official electronic bulletin Industrial Property, including registered trademarks, as an institutional function; retain the bulletin index as a change signal.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", kz_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...TIPO_TW_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...TIPO_TW_SOURCE_COVERAGE_TARGETS,\n  ...QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Kazakhstan catalog export already present")
catalog = replace_once(
    catalog,
    "  TIPO_TW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  TIPO_TW_SOURCE_COVERAGE_TARGETS,\n  QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...TIPO_TW_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...TIPO_TW_SOURCE_COVERAGE_TARGETS,\n",
        "  ...TIPO_TW_SOURCE_COVERAGE_TARGETS,\n  ...QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  TIPO_TW_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  TIPO_TW_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  TIPO_TW_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  TIPO_TW_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  TIPO_TW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  TIPO_TW_SOURCE_COVERAGE_TARGETS,\n  QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["TW", TIPO_TW_SOURCE_COVERAGE_TARGETS, ["tipo.gov.tw"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["TW", TIPO_TW_SOURCE_COVERAGE_TARGETS, ["tipo.gov.tw"]],\n  ["KZ", QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS, ["kazpatent.kz"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("sixty-six priority national offices", "sixty-seven priority national offices")
priority_test = priority_test.replace("toHaveLength(533)", "toHaveLength(542)", 1)
priority_test = priority_test.replace("    533,\n", "    542,\n", 1)
priority_test = priority_test.replace(").toBe(533);", ").toBe(542);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "kz-qazpatent-trademark-portal-name" in retrieval:
    raise SystemExit("Kazakhstan retrieval probes already present")
probes = r'''  {
    id: "kz-qazpatent-trademark-portal-name",
    targetId: "kz-qazpatent-trademark-portal",
    query: "Qazpatent trademark Kazakhstan",
  },
  {
    id: "kz-qazpatent-trademark-filing-name",
    targetId: "kz-qazpatent-trademark-filing",
    query: "electronic trademark application newcab",
  },
  {
    id: "kz-qazpatent-trademark-search-name",
    targetId: "kz-qazpatent-trademark-search",
    query: "State Register of Trademarks search",
  },
  {
    id: "kz-qazpatent-trademark-fees-name",
    targetId: "kz-qazpatent-trademark-fees",
    query: "trademark fee 2026 Nice class item",
  },
  {
    id: "kz-qazpatent-trademark-classification-name",
    targetId: "kz-qazpatent-trademark-classification",
    query: "International Nice Classification goods services",
  },
  {
    id: "kz-qazpatent-trademark-legal-texts-name",
    targetId: "kz-qazpatent-trademark-legal-texts",
    query: "Trademark Law examination rules State Register",
  },
  {
    id: "kz-qazpatent-trademark-examination-name",
    targetId: "kz-qazpatent-trademark-examination",
    query: "trademark preliminary full examination stages",
  },
  {
    id: "kz-qazpatent-trademark-renewal-name",
    targetId: "kz-qazpatent-trademark-renewal",
    query: "trademark extension renewal registration",
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
retrieval_test = retrieval_test.replace("toHaveLength(499)", "toHaveLength(507)", 2)
retrieval_test = retrieval_test.replace("      499,\n", "      507,\n", 1)
kz_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "KZ", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "TW", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + kz_assertion, "retrieval Kazakhstan jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Kazakhstan Qazpatent source coverage patch applied")
