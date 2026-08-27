# KG-008 merge gate

Do not merge the KG-008 pull request unless every triggered/relevant CI check is `success` on the exact current PR head and the branch is based on the current Knowledge `main`.

Required behavior evidence:

- metadata + `SQLITE_FTS5_BM25` composition only;
- FTS order preserved;
- duplicate documents collapsed;
- metadata-only matches appended deterministically;
- Reader and bounded local graph navigation available;
- graph never affects rank;
- vector search explicitly remains out of scope.
