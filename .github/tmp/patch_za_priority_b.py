from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '  // __ZA_CIPC_CONTINUE__\n'
if anchor not in text:
    raise SystemExit('South Africa continuation anchor not found')
block = r'''  target(CIPC_ZA, {
    id: "za-cipc-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "South Africa CIPC Trade Marks Act and Regulations",
    canonicalUri: "https://iponline.cipc.co.za/Publications/Legislation.aspx",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://iponline.cipc.co.za/Publications/Legislation.aspx",
    notes:
      "CIPC IPOnline publishes the Trade Marks Act, 1993 (Act 194 of 1993) and the Trade Mark Regulations as the primary national legal framework for registration, register maintenance and disputes.",
  }),
  target(CIPC_ZA, {
    id: "za-cipc-trademark-maintenance",
    family: "MAINTENANCE",
    displayName: "South Africa CIPC Trade Mark Maintenance and Extensions",
    canonicalUri: "https://iponline.cipc.co.za/Trademarks/Maintenance/TMMaintenance.aspx",
    entrypoints: [
      {
        uri: "https://iponline.cipc.co.za/Trademarks/Maintenance/TMMaintenance.aspx",
        label: "IPOnline maintenance and document lodgement",
      },
      { uri: "https://www.cipc.co.za/?page_id=1539", label: "CIPC maintain a trade mark guidance" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://iponline.cipc.co.za/Trademarks/Maintenance/TMMaintenance.aspx",
    notes:
      "CIPC provides dedicated maintenance routes for priority documents, powers of attorney, extensions to prosecute or oppose, general document lodgement, renewals, restorations and amendments.",
  }),
  target(CIPC_ZA, {
    id: "za-cipc-trademark-guidelines-practice-notes",
    family: "POLICY_NOTICES",
    displayName: "South Africa CIPC Trade Mark Guidelines and Practice Notes",
    canonicalUri: "https://www.cipc.co.za/?page_id=4766",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.cipc.co.za/?page_id=4766",
    notes:
      "CIPC publishes trade mark guidelines and practice notes as official registrar-facing operational guidance supplementary to the Act and Regulations.",
  }),
  target(CIPC_ZA, {
    id: "za-cipc-ip-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "South Africa CIPC Intellectual Property Journal",
    canonicalUri: "https://iponline.cipc.co.za/Publications/JournalPublications.aspx",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.cipc.co.za/?page_id=4770",
    notes:
      "CIPC publishes the Intellectual Property Journal monthly; it includes trade mark acceptance and other advertised documents and is retained as a high-value publication change signal.",
  }),
'''
text = text.replace(anchor, block, 1)
path.write_text(text)
