from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '  // __TH_DIP_CONTINUE__\n'
if anchor not in text:
    raise SystemExit('Thailand continuation anchor not found')
block = r'''  target(DIP_TH, {
    id: "th-dip-trademark-goods-services",
    family: "GOODS_SERVICES_ID",
    displayName: "Thailand DIP Recommended Trademark Goods and Services",
    canonicalUri: "https://catalog.ipthailand.go.th/th/dataset/dip_04010201",
    entrypoints: [
      {
        uri: "https://catalog.ipthailand.go.th/th/dataset/dip_04010201",
        label: "DIP Trademark Division recommended goods/services dataset",
      },
      {
        uri: "https://tmsearch.ipthailand.go.th/",
        label: "Trademark goods/services search linked by the official dataset",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "XLSX"],
    verificationEvidenceUri: "https://catalog.ipthailand.go.th/th/dataset/dip_04010201",
    notes:
      "The DIP Trademark Division publishes a current recommended goods/services dataset and links the official trademark search surface used for Thailand specifications.",
  }),
  target(DIP_TH, {
    id: "th-dip-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Thailand DIP Trademark Act and Regulations",
    canonicalUri: "https://www.ipthailand.go.th/en/dip-law-2/category/law-001.html",
    entrypoints: [
      {
        uri: "https://www.ipthailand.go.th/th/dip-law-2/item/trademark-act-b-e-2534-amended-by-trademark-act-no-2-b-e-2543-and-trademark-act-no-3-b-e-2559.html",
        label: "Trademark Act B.E. 2534 as amended through No. 3 B.E. 2559",
      },
      {
        uri: "https://www.ipthailand.go.th/th/dip-law-2/category/%E0%B8%81%E0%B8%8E%E0%B8%81%E0%B8%A3%E0%B8%B0%E0%B8%97%E0%B8%A3%E0%B8%A7%E0%B8%87-ministerial-regulations-2.html",
        label: "Trademark-related ministerial regulations",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.ipthailand.go.th/en/dip-law-2/category/law-001.html",
    notes:
      "DIP's trademark-law library groups the Trademark Act, ministerial regulations, Ministry of Commerce notifications, DIP rules, Trademark Board materials and registrar notifications.",
  }),
  target(DIP_TH, {
    id: "th-dip-trademark-examination-manual",
    family: "EXAMINATION_MANUAL",
    displayName: "Thailand DIP Trademark Registration Examination Manual 2022",
    canonicalUri: "https://www.ipthailand.go.th/th/revision.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.ipthailand.go.th/th/revision.html",
    notes:
      "DIP publishes its trademark registration examination manual (2565/2022 edition) as the dedicated national examination-practice source.",
  }),
  target(DIP_TH, {
    id: "th-dip-trademark-policy-notices",
    family: "POLICY_NOTICES",
    displayName: "Thailand DIP Trademark Policy and Procedure Notifications",
    canonicalUri:
      "https://www.ipthailand.go.th/en/dip-law-2/category/%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B8%81%E0%B8%B2%E0%B8%A8%E0%B8%81%E0%B8%A3%E0%B8%A1%E0%B8%97%E0%B8%A3%E0%B8%B1%E0%B8%9E%E0%B8%A2%E0%B9%8C%E0%B8%AA%E0%B8%B4%E0%B8%99%E0%B8%97%E0%B8%B2%E0%B8%87%E0%B8%9B%E0%B8%B1%E0%B8%8D%E0%B8%8D%E0%B8%B2-notifications-of-dip-2.html",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.ipthailand.go.th/en/dip-law-2/category/%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B8%81%E0%B8%B2%E0%B8%A8%E0%B8%81%E0%B8%A3%E0%B8%A1%E0%B8%97%E0%B8%A3%E0%B8%B1%E0%B8%9E%E0%B8%A2%E0%B9%8C%E0%B8%AA%E0%B8%B4%E0%B8%99%E0%B8%97%E0%B8%B2%E0%B8%87%E0%B8%9B%E0%B8%B1%E0%B8%8D%E0%B8%8D%E0%B8%B2-notifications-of-dip-2.html",
    notes:
      "DIP continuously publishes operational notifications affecting trademark filing and registrar/Trademark Board communications, including 2026 notices; retain this surface as a policy change signal.",
  }),
'''
text = text.replace(anchor, block, 1)
path.write_text(text)
