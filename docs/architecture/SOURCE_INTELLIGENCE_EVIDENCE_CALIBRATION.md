# Source Intelligence Evidence Calibration

Status: D2.3 controlled calibration protocol

## Purpose

D2.2 proved that Source Intelligence v1.0.0 has useful relative ordering on real public sources, but its absolute operational Tier is compressed before immutable acquisition evidence exists. D2.3 measures the same governed Source immediately before and after a deliberately small real collection.

The purpose is not to tune weights until a desired Tier appears. The purpose is to determine whether the current single `priorityScore` remains semantically coherent once evidence maturity changes, or whether MarkOrbit Knowledge should expose two distinct outputs:

1. **Source Value Priority** — how useful the source appears for downstream professional knowledge acquisition.
2. **Evidence Maturity** — how much governed, fresh, provenance-backed evidence has actually been acquired for that source.

## Controlled loop

`Seed → bounded Discovery → explicit human calibration acceptance → Source/Profile/Graph → BEFORE assessment → explicit calibration-only collection authorization → Crawl4AI RawArtifact evidence → deterministic Source Graph extraction → AFTER assessment → delta report`

## First representative cohort

The default D2.3 cohort deliberately spans three different authority/value profiles already present in the D2.2 manifest:

- `uspto-trademarks` — primary official authority;
- `finnegan` — professional IP/law-firm source;
- `inta` — industry association/research source.

The human labels and authority levels remain explicit calibration inputs. They are not inferred by the evaluator and do not establish legal truth.

## Acquisition boundary

Every D2.3 collection is intentionally tiny:

- isolated calibration registry and artifact store;
- explicit candidate acceptance;
- explicit collection authorization after the BEFORE assessment;
- `crawl4ai-web@1.1.0` only;
- `maxDepth = 0`;
- `maxItems = 1` per source;
- `respectRobots = true`;
- attachments disabled;
- query URLs excluded;
- conservative rate limit;
- HTML and Markdown RawArtifacts retained as acquisition evidence;
- HTML RawArtifact is deterministically projected into the source-local Source Graph.

This protocol is evidence acquisition for calibration. It is not a general scheduling policy and it must not create recurring production collection.

## Truth and authority boundaries

A successful D2.3 run means only that MarkOrbit acquired and preserved evidence from a declared source and that Source Intelligence observed the changed evidence state.

It does **not** mean:

- the acquired statements are legally correct;
- a professional organization or person is globally verified;
- an observed contact is a qualified provider;
- the source should automatically join MGSN;
- an operational Tier equals legal authority;
- a high score authorizes future collection or protected execution.

Source-local Organization, Person and Contact observations remain evidence nodes. Cross-source entity resolution stays outside Knowledge.

## Measurements

For each source, the report records BEFORE and AFTER:

- `priorityScore` and `operationalTier`;
- recommended rescan;
- Relevance;
- Authority Signal;
- Freshness;
- Evidenceability;
- Novelty;
- Acquisition Cost;
- Source Graph node counts;
- RawArtifact counts and distinct hashes;
- RawArtifact-backed Source Graph provenance coverage.

The report also records dimension deltas and the exact bounded collection policy used.

## Decision rule

Do not change Source Intelligence weights merely because a primary official source does not become Tier A.

After the first real D2.3 cohort, review whether:

1. evidence acquisition materially increases Freshness, Evidenceability and Novelty as designed;
2. relative source value remains stable enough to be useful;
3. the same `priorityScore` is trying to answer two different operational questions.

If evidence maturity strongly moves Tier while the underlying source value has not changed, prefer separating **Source Value Priority** from **Evidence Maturity** instead of hiding the semantic conflict through weight tuning.

## Operator boundary

D2.3 recommendations remain advisory. No calibration result automatically:

- schedules a source;
- changes an authority level;
- accepts a new source;
- executes another collection;
- verifies legal truth;
- promotes a professional or organization.

A human/operator-controlled transition remains required for protected actions.
