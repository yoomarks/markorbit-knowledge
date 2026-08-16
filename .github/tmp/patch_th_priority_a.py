from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '\nconst CIPO: Authority = {'
if anchor not in text:
    raise SystemExit('CIPO anchor not found')
block = r'''

const DIP_TH: Authority = {
  jurisdiction: "TH",
  authorityName: "Department of Intellectual Property (DIP), Ministry of Commerce, Thailand",
  languages: ["th-TH", "en-US"],
  verificationEvidenceUri: "https://www.ipthailand.go.th/th/trademark.html",
};

export const DIP_TH_SOURCE_COVERAGE_TARGETS = [
  target(DIP_TH, {
    id: "th-dip-trademarks",
    family: "PORTAL",
    displayName: "Thailand DIP Trademark Portal",
    canonicalUri: "https://www.ipthailand.go.th/th/trademark.html",
    verificationEvidenceUri: "https://www.ipthailand.go.th/th/trademark.html",
    notes:
      "Thailand DIP's trademark portal links the national e-service, public search, procedures, forms, fees, goods/services resources, trademark law and examination guidance.",
  }),
  target(DIP_TH, {
    id: "th-dip-trademark-filing",
    family: "FILING",
    displayName: "Thailand DIP Trademark e-Filing",
    canonicalUri: "https://tm.ipthailand.go.th/",
    entrypoints: [
      {
        uri: "https://tm.ipthailand.go.th/",
        label: "Trademark electronic filing application",
      },
      {
        uri: "https://sso.ipthailand.go.th/login?app_id=1701000004&redirect_url=https%3A%2F%2Ftm.ipthailand.go.th%2F",
        label: "DIP single sign-on for trademark e-filing",
      },
      {
        uri: "https://ipthailand.go.th/th/dip-news/item/announctm_efilingemail20231228-copy.html",
        label: "Official e-filing rules and conditions",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri:
      "https://sso.ipthailand.go.th/login?app_id=1701000004&redirect_url=https%3A%2F%2Ftm.ipthailand.go.th%2F",
    notes:
      "DIP operates a dedicated electronic trademark filing service behind its official SSO and publishes formal rules governing electronic trademark applications and related requests.",
  }),
  target(DIP_TH, {
    id: "th-dip-trademark-search",
    family: "SEARCH",
    displayName: "Thailand DIP Public Trademark Search",
    canonicalUri: "https://search.ipthailand.go.th/trademark",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://search.ipthailand.go.th/trademark",
    notes:
      "DIP's public intellectual-property search exposes trademark records and mark-specific search fields through the official search.ipthailand.go.th service.",
  }),
  target(DIP_TH, {
    id: "th-dip-trademark-forms",
    family: "STATUS_AND_DOCUMENTS",
    displayName: "Thailand DIP Trademark Forms and Filing Guides",
    canonicalUri: "https://www.ipthailand.go.th/th/trademark-007.html",
    entrypoints: [
      {
        uri: "https://www.ipthailand.go.th/th/trademark-007.html",
        label: "Trademark forms, examples and completion guides",
      },
      {
        uri: "https://ipthailand.go.th/th/dip-law-2/item/anounce_tm20250116.html",
        label: "2025 DIP notification prescribing trademark application and related forms",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.ipthailand.go.th/th/trademark-007.html",
    notes:
      "DIP publishes the official ก.01 application, ก.02 opposition and other trademark forms together with examples, PDF/DOC assets and the current form-prescription notice.",
  }),
  target(DIP_TH, {
    id: "th-dip-trademark-fees",
    family: "FEES",
    displayName: "Thailand DIP Domestic Trademark Fees",
    canonicalUri: "https://www.ipthailand.go.th/th/trademark-006.html",
    verificationEvidenceUri: "https://www.ipthailand.go.th/th/trademark-006.html",
    notes:
      "DIP publishes the domestic trademark fee schedule for applications, oppositions, registrations, renewals and related requests. Amounts remain sourced evidence rather than frozen catalog truth.",
  }),
  // __TH_DIP_CONTINUE__
] satisfies readonly SourceCoverageTarget[];
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
