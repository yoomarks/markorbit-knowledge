# KG-008 acceptance checklist

- [x] metadata matching remains available
- [x] indexed canonical content is searched through `SQLITE_FTS5_BM25`
- [x] same staging document is deduplicated across channels
- [x] full-text order is preserved
- [x] metadata-only matches append deterministically
- [x] full-text evidence exposes score, snippet and heading path
- [x] Reader navigation is available
- [x] bounded local graph navigation is available
- [x] graph does not influence rank
- [x] vector search is explicitly out of scope for KG-008
- [ ] exact current PR head has all triggered/relevant CI checks `success`
