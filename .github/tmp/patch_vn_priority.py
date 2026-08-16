from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '\nconst CIPO: Authority = {'
if anchor not in text:
    raise SystemExit('CIPO anchor not found')
block = r'''

const IPVN_VN: Authority = {
  jurisdiction: "VN",
  authorityName: "Intellectual Property Office of Viet Nam (IP Viet Nam)",
  languages: ["vi-VN", "en-US"],
  verificationEvidenceUri: "https://ipvietnam.gov.vn/",
};

export const IPVN_VN_SOURCE_COVERAGE_TARGETS = [
  target(IPVN_VN, {
    id: "vn-ipvn-trademarks",
    family: "PORTAL",
    displayName: "Vietnam IPVN Trademark Portal",
    canonicalUri: "https://ipvietnam.gov.vn/",
    entrypoints: [
      { uri: "https://ipvietnam.gov.vn/", label: "IP Viet Nam official portal" },
      {
        uri: "https://ipvietnam.gov.vn/web/guest/nhan-hieu?inheritRedirect=true",
        label: "Vietnamese trademark service and information page",
      },
    ],
    verificationEvidenceUri: "https://ipvietnam.gov.vn/web/guest/nhan-hieu?inheritRedirect=true",
    notes:
      "IP Viet Nam's official portal and trademark page provide the national entry surface for trademark procedures, search tools, classifications, forms and official publications.",
  }),
  target(IPVN_VN, {
    id: "vn-ipvn-trademark-filing",
    family: "FILING",
    displayName: "Vietnam IPVN Trademark Filing, Forms and Procedures",
    canonicalUri: "https://ipvietnam.gov.vn/vi_VN/web/english/trademarks",
    mode: "MIXED",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://ipvietnam.gov.vn/vi_VN/web/english/trademarks",
    notes:
      "IP Viet Nam's trademark procedure page documents paper and online filing, processing stages, amendments, renewals and current industrial-property forms, including the form regime effective from July 2026.",
  }),
  target(IPVN_VN, {
    id: "vn-ipvn-trademark-search",
    family: "SEARCH",
    displayName: "Vietnam IPVN WIPO Publish Trademark Search",
    canonicalUri: "https://wipopublish.ipvietnam.gov.vn/",
    entrypoints: [
      {
        uri: "https://wipopublish.ipvietnam.gov.vn/",
        label: "National WIPO Publish industrial-property search",
      },
      {
        uri: "https://ipvietnam.gov.vn/web/guest/nhan-hieu?inheritRedirect=true",
        label: "IPVN trademark page identifying WIPO Publish as the national search tool",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://ipvietnam.gov.vn/web/guest/nhan-hieu?inheritRedirect=true",
    notes:
      "IP Viet Nam identifies WIPO Publish as its current industrial-property digital library for published and registered Vietnamese trademark records; IPLIB was retired in favor of this system.",
  }),
  target(IPVN_VN, {
    id: "vn-ipvn-trademark-fees",
    family: "FEES",
    displayName: "Vietnam IPVN Trademark Fees and Charges",
    canonicalUri: "https://www.ipvietnam.gov.vn/web/english/fees-and-charges1",
    entrypoints: [
      {
        uri: "https://www.ipvietnam.gov.vn/web/english/fees-and-charges1",
        label: "Official trademark fee and charge table",
      },
      {
        uri: "https://ipvietnam.gov.vn/vi_VN/web/english/trademarks",
        label: "Trademark procedure page with filing and examination charges",
      },
    ],
    verificationEvidenceUri: "https://www.ipvietnam.gov.vn/web/english/fees-and-charges1",
    notes:
      "IP Viet Nam publishes trademark-related filing, examination, publication, registration, renewal and post-registration fee information. Amounts remain sourced evidence rather than frozen catalog truth.",
  }),
  target(IPVN_VN, {
    id: "vn-ipvn-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Vietnam IPVN Nice Classification 13-2026",
    canonicalUri: "https://ipvietnam.gov.vn/web/guest/nhan-hieu?inheritRedirect=true",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://ipvietnam.gov.vn/web/guest/nhan-hieu?inheritRedirect=true",
    notes:
      "IP Viet Nam publishes the Vietnamese Nice Classification 13-2026 and states that it applies to trademark goods/services classification from 1 January 2026.",
  }),
  target(IPVN_VN, {
    id: "vn-ipvn-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Vietnam IPVN Intellectual Property Legal Documents",
    canonicalUri: "https://www.ipvietnam.gov.vn/en_US/web/english/legal-documents",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.ipvietnam.gov.vn/en_US/web/english/legal-documents",
    notes:
      "IP Viet Nam's legal-document library publishes the Intellectual Property Law framework, implementing decrees, circulars and industrial-property guidance relevant to trademark registration and enforcement.",
  }),
  target(IPVN_VN, {
    id: "vn-ipvn-industrial-property-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Vietnam IPVN Industrial Property Gazette",
    canonicalUri: "https://ipvietnam.gov.vn/cong-bao-so-huu-cong-nghiep1",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://ipvietnam.gov.vn/cong-bao-so-huu-cong-nghiep1",
    notes:
      "IP Viet Nam continuously publishes the Industrial Property Gazette, including trademark and geographical-indication volumes for applications and granted rights, making it a high-value publication change signal.",
  }),
] satisfies readonly SourceCoverageTarget[];
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
