from pathlib import Path
p=Path('packages/persistence/src/retrieval-relevance-audit.ts')
s=p.read_text()
m='  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
assert m in s
b='''  { id: "ph-trademarks-name", targetId: "ph-ipophl-trademarks", query: "Philippines IPOPHL trademark services search filing publication maintenance" },\n  { id: "ph-trademark-filing-name", targetId: "ph-ipophl-trademark-filing", query: "Philippines IPOPHL eTMFile trademark online filing application" },\n  { id: "ph-trademark-search-name", targetId: "ph-ipophl-trademark-search", query: "Philippines IPOPHL trademark database search status application holder" },\n  { id: "ph-trademark-fees-name", targetId: "ph-ipophl-trademark-fees", query: "Philippines IPOPHL trademark fees filing renewal DAU publication" },\n  { id: "ph-trademark-classification-name", targetId: "ph-ipophl-trademark-classification", query: "Philippines IPOPHL Nice classification goods services eTMFile" },\n  { id: "ph-trademark-law-name", targetId: "ph-ipophl-trademark-law", query: "Philippines IP Code trademark regulations 2023 IPOPHL" },\n  { id: "ph-trademark-examination-guidelines-name", targetId: "ph-ipophl-trademark-examination-guidelines", query: "Philippines IPOPHL trademark examination guidelines Bureau Trademarks" },\n  { id: "ph-trademark-proceedings-name", targetId: "ph-ipophl-trademark-proceedings", query: "Philippines IPOPHL trademark opposition cancellation inter partes Bureau Legal Affairs" },\n'''
s=s.replace(m,b+m,1)
p.write_text(s)
