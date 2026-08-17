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
if "URSB_UG_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Uganda coverage already present")

ug_block = r'''const URSB_UG: Authority = {
  jurisdiction: "UG",
  authorityName: "Uganda Registration Services Bureau (URSB) – Intellectual Property Registry",
  languages: ["en"],
  verificationEvidenceUri: "https://iponline.ursb.go.ug/",
};

export const URSB_UG_SOURCE_COVERAGE_TARGETS = [
  target(URSB_UG, {
    id: "ug-ursb-trademark-portal",
    family: "PORTAL",
    displayName: "Uganda IP Online Registration Portal",
    canonicalUri: "https://iponline.ursb.go.ug/",
    verificationEvidenceUri: "https://iponline.ursb.go.ug/",
    notes:
      "Current official URSB IP Online portal linking IP application, the national IP register, trademark publications, applicable fees and agent services.",
  }),
  target(URSB_UG, {
    id: "ug-ursb-trademark-filing",
    family: "FILING",
    displayName: "Uganda IP Online Application Dashboard",
    canonicalUri: "https://iponline.ursb.go.ug/sp-ui-userdashboard",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://iponline.ursb.go.ug/services.html",
    notes:
      "Official Apply for IP transaction surface used for trademark applications and related online trademark services; authentication is handled by the URSB identity service.",
  }),
  target(URSB_UG, {
    id: "ug-ursb-trademark-search",
    family: "SEARCH",
    displayName: "Uganda Public Trademark Register Search",
    canonicalUri: "https://ipsearch.ursb.go.ug/wopublish-search/public/trademarks",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://iponline.ursb.go.ug/",
    notes:
      "Official public trademark-register search linked by URSB's IP Online portal as View IP Register; the stable route avoids session identifiers and transient query parameters.",
  }),
  target(URSB_UG, {
    id: "ug-ursb-trademark-fees",
    family: "FEES",
    displayName: "URSB Uganda Intellectual Property Fees",
    canonicalUri: "https://ursb.go.ug/intellectual-property-fees/",
    verificationEvidenceUri: "https://ursb.go.ug/intellectual-property-fees/",
    notes:
      "Current official fee table covering trademark filing, preliminary advice, search, certification, opposition, assignments, name changes and trademark renewal.",
  }),
  target(URSB_UG, {
    id: "ug-ursb-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "URSB Uganda Intellectual Property Acts and Regulations",
    canonicalUri: "https://ursb.go.ug/intellectual-property-acts-and-regulations/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ursb.go.ug/intellectual-property-acts-and-regulations/",
    notes:
      "Official URSB legislation library for Uganda intellectual-property statutes and regulations, including the Trademarks Act and implementing rules.",
  }),
  target(URSB_UG, {
    id: "ug-ursb-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "URSB Uganda Intellectual Property Rulings",
    canonicalUri: "https://ursb.go.ug/intellectual-property-rulings/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ursb.go.ug/intellectual-property-rulings/",
    notes:
      "Official Registrar rulings collection containing trademark opposition, cancellation, rectification and related adjudicative decisions.",
  }),
  target(URSB_UG, {
    id: "ug-ursb-trademark-maintenance",
    family: "MAINTENANCE",
    displayName: "URSB Uganda Trademark Forms and Maintenance",
    canonicalUri: "https://ursb.go.ug/intellectual-property-forms/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ursb.go.ug/intellectual-property-forms/",
    notes:
      "Official trademark form library covering renewal, late-renewal/restoration, assignments, registered users, name/address changes, rectification, alterations and extensions of time.",
  }),
  target(URSB_UG, {
    id: "ug-ursb-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Uganda Gazette Trademark Publications",
    canonicalUri: "https://uppc.go.ug/trademarks",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://iponline.ursb.go.ug/",
    notes:
      "URSB's official IP Online portal links the Uganda Printing and Publishing Corporation trademark-publications surface; retained as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", ug_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  ...URSB_UG_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "URSB_UG_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Uganda catalog export already present")
catalog = replace_once(
    catalog,
    "  INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  URSB_UG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
catalog = replace_once(
    catalog,
    "  INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  URSB_UG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog export",
)
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  INNORPI_TN_SOURCE_COVERAGE_TARGETS,\n  URSB_UG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["TN", INNORPI_TN_SOURCE_COVERAGE_TARGETS, ["innorpi.tn"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["TN", INNORPI_TN_SOURCE_COVERAGE_TARGETS, ["innorpi.tn"]],\n  ["UG", URSB_UG_SOURCE_COVERAGE_TARGETS, ["ursb.go.ug", "uppc.go.ug"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("seventy-four priority national offices", "seventy-five priority national offices")
priority_test = priority_test.replace("toHaveLength(604)", "toHaveLength(612)", 1)
priority_test = priority_test.replace("    604,\n", "    612,\n", 1)
priority_test = priority_test.replace(").toBe(604);", ").toBe(612);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "ug-ursb-trademark-portal-name" in retrieval:
    raise SystemExit("Uganda retrieval probes already present")
probes = r'''  {
    id: "ug-ursb-trademark-portal-name",
    targetId: "ug-ursb-trademark-portal",
    query: "Uganda IP Online Registration Portal trademarks",
  },
  {
    id: "ug-ursb-trademark-filing-name",
    targetId: "ug-ursb-trademark-filing",
    query: "Uganda apply for trademark online registration",
  },
  {
    id: "ug-ursb-trademark-search-name",
    targetId: "ug-ursb-trademark-search",
    query: "Uganda public trademark register search",
  },
  {
    id: "ug-ursb-trademark-fees-name",
    targetId: "ug-ursb-trademark-fees",
    query: "Uganda trademark application search opposition renewal fees",
  },
  {
    id: "ug-ursb-trademark-legal-texts-name",
    targetId: "ug-ursb-trademark-legal-texts",
    query: "Uganda Trademarks Act regulations URSB",
  },
  {
    id: "ug-ursb-trademark-proceedings-name",
    targetId: "ug-ursb-trademark-proceedings",
    query: "Uganda trademark opposition cancellation Registrar rulings",
  },
  {
    id: "ug-ursb-trademark-maintenance-name",
    targetId: "ug-ursb-trademark-maintenance",
    query: "Uganda trademark renewal restoration assignment change forms",
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
retrieval_test = retrieval_test.replace("toHaveLength(562)", "toHaveLength(569)", 2)
retrieval_test = retrieval_test.replace("      562,\n", "      569,\n", 1)
ug_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "UG", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "TN", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + ug_assertion, "retrieval Uganda jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Uganda URSB trademark source coverage patch applied")
