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
if "UANIPIO_UA_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Ukraine coverage already present")

ua_block = r'''const UANIPIO_UA: Authority = {
  jurisdiction: "UA",
  authorityName: "Ukrainian National Office for Intellectual Property and Innovations (UANIPIO)",
  languages: ["uk", "en"],
  verificationEvidenceUri: "https://portal.nipo.gov.ua/uk/discovery-obj/tm-pro-torhovelni-marky",
};

export const UANIPIO_UA_SOURCE_COVERAGE_TARGETS = [
  target(UANIPIO_UA, {
    id: "ua-nipo-trademark-portal",
    family: "PORTAL",
    displayName: "Ukraine NIPO Trade Marks Portal",
    canonicalUri: "https://portal.nipo.gov.ua/uk/discovery-obj/tm-pro-torhovelni-marky",
    verificationEvidenceUri: "https://portal.nipo.gov.ua/uk/discovery-obj/tm-pro-torhovelni-marky",
    notes: "Current NIPO trademark landing page linking registration, search, fees, legislation and related official services.",
  }),
  target(UANIPIO_UA, {
    id: "ua-nipo-trademark-filing",
    family: "FILING",
    displayName: "Ukraine NIPO Electronic Application Filing",
    canonicalUri: "https://efiling.nipo.gov.ua/?locale=uk",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://efiling.nipo.gov.ua/users/login?locale=uk",
    notes: "Official electronic application system explicitly supporting signs for goods and services (trade marks).",
  }),
  target(UANIPIO_UA, {
    id: "ua-nipo-trademark-search",
    family: "SEARCH",
    displayName: "Ukraine NIPO Special Information System Search",
    canonicalUri: "https://sis.nipo.gov.ua/uk/search/simple/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://portal.nipo.gov.ua/discovery-obj/tm-poshuk-zareiestrovanykh-tm",
    notes: "Official SIS search for industrial-property objects, including trademark applications and registrations.",
  }),
  target(UANIPIO_UA, {
    id: "ua-nipo-trademark-fees",
    family: "FEES",
    displayName: "Ukraine NIPO Trademark Fees and State Duty",
    canonicalUri: "https://portal.nipo.gov.ua/uk/discovery-obj/tm-derzhavne-myto-i-zbory",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://portal.nipo.gov.ua/uk/discovery-obj/tm-derzhavne-myto-i-zbory",
    notes: "Current trademark fee and state-duty page, reflecting the applicable fee order and payment details.",
  }),
  target(UANIPIO_UA, {
    id: "ua-nipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Ukraine Nice Classification 13-2026",
    canonicalUri: "https://nice.nipo.gov.ua/",
    verificationEvidenceUri: "https://nice.nipo.gov.ua/",
    notes: "Official Ukrainian Nice Classification information system for the 13th edition, 2026 version, effective from 1 January 2026.",
  }),
  target(UANIPIO_UA, {
    id: "ua-nipo-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Ukraine NIPO Trademark Law and Legal Framework",
    canonicalUri: "https://nipo.gov.ua/torhovelni-marky/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://nipo.gov.ua/torhovelni-marky/",
    notes: "Official NIPO trademark legal framework page linking the Trademark Law, current filing/examination rules and fee regulation.",
  }),
  target(UANIPIO_UA, {
    id: "ua-nipo-trademark-examination-rules",
    family: "EXAMINATION_MANUAL",
    displayName: "Ukraine Trademark Filing and Examination Rules",
    canonicalUri: "https://nipo.gov.ua/novi-pidzakonni-npa/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://nipo.gov.ua/novi-pidzakonni-npa/",
    notes: "Official NIPO subordinate-regulation index listing the current trademark application, international-registration and examination rules approved by Order No. 19889 of 6 August 2024.",
  }),
  target(UANIPIO_UA, {
    id: "ua-nipo-trademark-appeals",
    family: "PROCEEDINGS",
    displayName: "Ukraine NIPO Appeal Chamber",
    canonicalUri: "https://nipo.gov.ua/apeliatsijna-palata-noiv/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://nipo.gov.ua/apeliatsijna-palata-noiv/",
    notes: "Official Appeal Chamber procedure for objections to NIPO decisions, invalidation applications and well-known trademark proceedings.",
  }),
  target(UANIPIO_UA, {
    id: "ua-nipo-trademark-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "Ukraine NIPO Official Bulletin",
    canonicalUri: "https://sis.nipo.gov.ua/uk/bulletin/",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "PDF"],
    verificationEvidenceUri: "https://sis.nipo.gov.ua/uk/bulletin/",
    notes: "Official SIS bulletin surface for industrial-property publication records; retained as a change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", ua_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...ILPO_IL_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...ILPO_IL_SOURCE_COVERAGE_TARGETS,\n  ...UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "UANIPIO_UA_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Ukraine catalog export already present")
catalog = replace_once(
    catalog,
    "  ILPO_IL_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  ILPO_IL_SOURCE_COVERAGE_TARGETS,\n  UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...ILPO_IL_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...ILPO_IL_SOURCE_COVERAGE_TARGETS,\n",
        "  ...ILPO_IL_SOURCE_COVERAGE_TARGETS,\n  ...UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  ILPO_IL_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  ILPO_IL_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  ILPO_IL_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  ILPO_IL_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  ILPO_IL_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  ILPO_IL_SOURCE_COVERAGE_TARGETS,\n  UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["IL", ILPO_IL_SOURCE_COVERAGE_TARGETS, ["gov.il", "justice.gov.il", "knesset.gov.il"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["IL", ILPO_IL_SOURCE_COVERAGE_TARGETS, ["gov.il", "justice.gov.il", "knesset.gov.il"]],\n  ["UA", UANIPIO_UA_SOURCE_COVERAGE_TARGETS, ["nipo.gov.ua"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("sixty-four priority national offices", "sixty-five priority national offices")
priority_test = priority_test.replace("toHaveLength(514)", "toHaveLength(523)", 1)
priority_test = priority_test.replace("    514,\n", "    523,\n", 1)
priority_test = priority_test.replace(").toBe(514);", ").toBe(523);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "ua-nipo-trademark-portal-name" in retrieval:
    raise SystemExit("Ukraine retrieval probes already present")
probes = r'''  {
    id: "ua-nipo-trademark-portal-name",
    targetId: "ua-nipo-trademark-portal",
    query: "торговельні марки NIPO Ukraine",
  },
  {
    id: "ua-nipo-trademark-filing-name",
    targetId: "ua-nipo-trademark-filing",
    query: "електронне подання заявки знак для товарів послуг",
  },
  {
    id: "ua-nipo-trademark-search-name",
    targetId: "ua-nipo-trademark-search",
    query: "пошук торговельна марка заявка реєстрація",
  },
  {
    id: "ua-nipo-trademark-fees-name",
    targetId: "ua-nipo-trademark-fees",
    query: "збори державне мито торговельна марка",
  },
  {
    id: "ua-nipo-trademark-classification-name",
    targetId: "ua-nipo-trademark-classification",
    query: "МКТП 13-2026 Nice Classification",
  },
  {
    id: "ua-nipo-trademark-legal-texts-name",
    targetId: "ua-nipo-trademark-legal-texts",
    query: "Закон охорону прав на знаки товарів послуг",
  },
  {
    id: "ua-nipo-trademark-examination-rules-name",
    targetId: "ua-nipo-trademark-examination-rules",
    query: "Правила подання заявки торговельну марку експертизи 19889",
  },
  {
    id: "ua-nipo-trademark-appeals-name",
    targetId: "ua-nipo-trademark-appeals",
    query: "Апеляційна палата торговельні марки заперечення",
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
retrieval_test = retrieval_test.replace("toHaveLength(482)", "toHaveLength(490)", 2)
retrieval_test = retrieval_test.replace("      482,\n", "      490,\n", 1)
ua_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "UA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "IL", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + ua_assertion, "retrieval Ukraine jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Ukraine NIPO source coverage patch applied")
