from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '  // __ID_DJKI_CONTINUE__\n'
if anchor not in text:
    raise SystemExit('Indonesia continuation anchor not found')
block = r'''  target(DJKI_ID, {
    id: "id-djki-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Indonesia DJKI Trademark Classification System",
    canonicalUri: "https://skm.dgip.go.id/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://skm.dgip.go.id/",
    notes:
      "DJKI's official Sistem Klasifikasi Merek provides searchable Nice Classification classes and goods/services descriptions for national trademark specifications.",
  }),
  target(DJKI_ID, {
    id: "id-djki-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Indonesia DJKI Trademark Law and Registration Regulations",
    canonicalUri:
      "https://jdih.dgip.go.id/produk_hukum/view/id/24/t/undangundang%2Bnomor%2B20%2Btahun%2B2016%2Bt",
    entrypoints: [
      {
        uri: "https://jdih.dgip.go.id/produk_hukum/view/id/24/t/undangundang%2Bnomor%2B20%2Btahun%2B2016%2Bt",
        label: "Law No. 20 of 2016 on Trademarks and Geographical Indications",
      },
      {
        uri: "https://jdih.dgip.go.id/produk_hukum/view/id/41/t/peraturan%2Bmenteri%2Bhukum%2Bdan%2Bham%2Bnomor%2B67%2B%20tahun%2B2016%2Btentang%2Bpendaftaran%2Bmerek",
        label: "Ministerial Regulation No. 67 of 2016 on Trademark Registration",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://jdih.dgip.go.id/produk_hukum/view/id/24/t/undangundang%2Bnomor%2B20%2Btahun%2B2016%2Bt",
    notes:
      "DJKI's JDIH publishes the primary Trademark and Geographical Indications Law together with trademark-registration implementing regulations and related legal materials.",
  }),
  target(DJKI_ID, {
    id: "id-djki-trademark-examination-guidance",
    family: "EXAMINATION_MANUAL",
    displayName: "Indonesia DJKI Trademark Examination Technical Guidance",
    canonicalUri: "https://www.dgip.go.id/menu-utama/merek/petunjuk-teknis",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.dgip.go.id/menu-utama/merek/petunjuk-teknis",
    notes:
      "DJKI publishes technical guidance for substantive trademark examination, Madrid examination and quality-management examination practice as official examiner-facing source material.",
  }),
  target(DJKI_ID, {
    id: "id-djki-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Indonesia DJKI Trademark Opposition, Rebuttal and Appeal Procedures",
    canonicalUri: "https://www.dgip.go.id/menu-utama/merek/formulir-dan-format-surat",
    entrypoints: [
      {
        uri: "https://www.dgip.go.id/menu-utama/merek/formulir-dan-format-surat",
        label: "Official objection, appeal, hearing and rebuttal forms",
      },
      {
        uri: "https://dgip.go.id/menu-utama/merek/pasca-permohonan-merek",
        label: "Post-application procedures including rebuttal and hearing routes",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.dgip.go.id/menu-utama/merek/formulir-dan-format-surat",
    notes:
      "DJKI's official trademark forms and post-application guidance expose objection, rebuttal, hearing and appeal procedural materials without inferring rules beyond the published sources.",
  }),
  target(DJKI_ID, {
    id: "id-djki-trademark-official-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Indonesia DJKI Official Trademark Gazette",
    canonicalUri: "https://dgip.go.id/berita-resmi/berita-resmi-merek",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://dgip.go.id/berita-resmi/berita-resmi-merek",
    notes:
      "DJKI publishes Berita Resmi Merek issues as the official trademark publication surface, making the archive a high-value publication and change-signal source.",
  }),
'''
text = text.replace(anchor, block, 1)
path.write_text(text)
