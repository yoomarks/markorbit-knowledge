from pathlib import Path
p=Path('packages/persistence/src/retrieval-relevance-audit.ts')
s=p.read_text()
m='  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
assert m in s
b='''  { id: "my-trademarks-name", targetId: "my-myipo-trademarks", query: "Malaysia MyIPO trademark public services filing search journal" },\n  { id: "my-trademark-filing-name", targetId: "my-myipo-trademark-filing", query: "Malaysia MyIPO applying trademark IP Online filing preliminary advice" },\n  { id: "my-trademark-search-name", targetId: "my-myipo-trademark-search", query: "Malaysia MyIPO official trademark search IP Online" },\n  { id: "my-trademark-fees-name", targetId: "my-myipo-trademark-fees", query: "Malaysia MyIPO trademark forms fees Trademarks Act 2019" },\n  { id: "my-trademark-classification-name", targetId: "my-myipo-trademark-classification", query: "Malaysia MyIPO goods services pre approved Nice classification" },\n  { id: "my-trademark-law-name", targetId: "my-myipo-trademark-law", query: "Malaysia Trademarks Act 2019 regulations MyIPO law" },\n  { id: "my-trademark-guidelines-2026-name", targetId: "my-myipo-trademark-guidelines-2026", query: "Malaysia MyIPO Guidelines Trademark 2019 VA1 2026" },\n  { id: "my-trademark-proceedings-name", targetId: "my-myipo-trademark-proceedings", query: "Malaysia MyIPO trademark opposition hearing appeal renewal proceedings" },\n'''
s=s.replace(m,b+m,1)
p.write_text(s)
