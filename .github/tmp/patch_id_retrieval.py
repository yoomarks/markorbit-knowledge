from pathlib import Path

path = Path('packages/persistence/src/retrieval-relevance-audit.ts')
text = path.read_text()
anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },\n'
if anchor not in text:
    raise SystemExit('Canada retrieval anchor not found')
block = r'''  {
    id: "id-trademarks-name",
    targetId: "id-djki-trademarks",
    query: "Indonesia DJKI trademark services registration search classification",
  },
  {
    id: "id-trademark-filing-name",
    targetId: "id-djki-trademark-filing",
    query: "Indonesia DJKI online trademark filing merek application procedure",
  },
  {
    id: "id-trademark-search-name",
    targetId: "id-djki-trademark-search",
    query: "Indonesia DJKI PDKI trademark search registered pending status",
  },
  {
    id: "id-trademark-fees-name",
    targetId: "id-djki-trademark-fees",
    query: "Indonesia DJKI trademark PNBP fees filing renewal opposition appeal",
  },
  {
    id: "id-trademark-classification-name",
    targetId: "id-djki-trademark-classification",
    query: "Indonesia DJKI Sistem Klasifikasi Merek Nice goods services",
  },
  {
    id: "id-trademark-law-name",
    targetId: "id-djki-trademark-law",
    query: "Indonesia Law 20 2016 trademarks geographical indications DJKI registration regulation",
  },
  {
    id: "id-trademark-examination-guidance-name",
    targetId: "id-djki-trademark-examination-guidance",
    query: "Indonesia DJKI substantive trademark examination technical guidance",
  },
  {
    id: "id-trademark-proceedings-name",
    targetId: "id-djki-trademark-proceedings",
    query: "Indonesia DJKI trademark opposition rebuttal hearing appeal forms procedures",
  },
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
