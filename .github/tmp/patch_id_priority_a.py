from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '\nconst CIPO: Authority = {'
if anchor not in text:
    raise SystemExit('CIPO anchor not found')
block = r'''

const DJKI_ID: Authority = {
  jurisdiction: "ID",
  authorityName: "Directorate General of Intellectual Property (DJKI), Ministry of Law of Indonesia",
  languages: ["id-ID"],
  verificationEvidenceUri: "https://www.dgip.go.id/menu-utama/merek/pengenalan",
};

export const DJKI_ID_SOURCE_COVERAGE_TARGETS = [
  target(DJKI_ID, {
    id: "id-djki-trademarks",
    family: "PORTAL",
    displayName: "Indonesia DJKI Trademark Portal",
    canonicalUri: "https://www.dgip.go.id/menu-utama/merek/pengenalan",
    entrypoints: [
      {
        uri: "https://www.dgip.go.id/menu-utama/merek/pengenalan",
        label: "Trademark overview and service navigation",
      },
      { uri: "https://www.dgip.go.id/", label: "DJKI official portal" },
    ],
    verificationEvidenceUri: "https://www.dgip.go.id/menu-utama/merek/pengenalan",
    notes:
      "DJKI's trademark portal provides the national trademark overview and links filing requirements, fees, classification and registration services.",
  }),
  target(DJKI_ID, {
    id: "id-djki-trademark-filing",
    family: "FILING",
    displayName: "Indonesia DJKI Online Trademark Filing",
    canonicalUri: "https://merek.dgip.go.id/",
    entrypoints: [
      { uri: "https://merek.dgip.go.id/", label: "Official online trademark account and filing system" },
      {
        uri: "https://www.dgip.go.id/index.php/menu-utama/merek/syarat-prosedur",
        label: "Official new-trademark filing requirements and workflow",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.dgip.go.id/index.php/menu-utama/merek/syarat-prosedur",
    notes:
      "DJKI's filing guidance directs applicants to the national online trademark system and documents the application, class selection, billing, attachment and receipt workflow.",
  }),
  target(DJKI_ID, {
    id: "id-djki-trademark-search",
    family: "SEARCH",
    displayName: "Indonesia DJKI PDKI Trademark Search",
    canonicalUri: "https://pdki-indonesia.dgip.go.id/",
    entrypoints: [
      {
        uri: "https://pdki-indonesia.dgip.go.id/",
        label: "Pangkalan Data Kekayaan Intelektual public search",
      },
      {
        uri: "https://dgip.go.id/faq/daftar-faq/merek/Merek-Publikasi",
        label: "Official guidance identifying PDKI for registered and pending trademark search",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://dgip.go.id/faq/daftar-faq/merek/Merek-Publikasi",
    notes:
      "DJKI identifies PDKI as the public database for searching registered trademarks and pending applications and for checking current trademark status.",
  }),
  target(DJKI_ID, {
    id: "id-djki-trademark-fees",
    family: "FEES",
    displayName: "Indonesia DJKI Trademark Fees",
    canonicalUri: "https://dgip.go.id/menu-utama/merek/biaya",
    verificationEvidenceUri: "https://dgip.go.id/menu-utama/merek/biaya",
    notes:
      "DJKI publishes the current trademark PNBP schedule under PP No. 45 of 2024, including filing, renewal, opposition, appeal, recordal and written-classification services. Amounts remain sourced evidence rather than frozen catalog truth.",
  }),
  // __ID_DJKI_CONTINUE__
] satisfies readonly SourceCoverageTarget[];
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
