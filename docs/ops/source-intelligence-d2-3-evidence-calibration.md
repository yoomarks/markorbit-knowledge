# Source Intelligence D2.3 Evidence Calibration Runbook

This runbook closes the remaining D2.3 validation gap: run a small, explicitly authorized real-source cohort through the existing Crawl4AI collection path, compare Source Intelligence before and after bounded raw evidence, and retain an auditable report.

## Safety boundary

This is an isolated calibration procedure, not a production auto-collection policy.

- Use an isolated registry/database. Never point the calibration at a production registry.
- Human candidate acceptance remains explicit.
- Collection authorization remains explicit.
- The calibration script pins `crawl4ai-web@1.1.0`.
- Each source is limited to `maxDepth=0` and `maxItems=1`.
- `robots.txt` is respected and the rate limit remains 6 requests/minute.
- The resulting tier is operational priority, not source authority or legal truth.
- No cross-source entity resolution and no automatic production scheduling are enabled by this procedure.

## Default cohort

The script defaults to three entries from `config/source-intelligence-calibration-cohort.json`:

- `uspto-trademarks`
- `finnegan`
- `inta`

At least two successful sources are required by default so one hostile or temporarily unavailable site does not invalidate the entire calibration.

## Preconditions

1. Node/pnpm dependencies are installed.
2. The admin/control plane is running against an isolated database.
3. Python and the Crawl4AI runtime dependencies required by `workers/crawl4ai/acquire.py` are available.
4. The control plane URL is reachable from the shell running the calibration.

Example local control plane URL: `http://127.0.0.1:3000`.

## Run the bounded evidence calibration

```bash
pnpm calibrate:source-intelligence:evidence -- \
  --base-url http://127.0.0.1:3000 \
  --output source-intelligence-evidence-calibration.json \
  --min-success 2
```

The script will discover candidates, explicitly accept only the selected calibration candidate, verify that acceptance alone leaves the plan paused, patch the isolated source metadata/policy, record a baseline Source Intelligence assessment, create a calibration worker, explicitly authorize collection, wait for the bounded run, verify HTML + Markdown raw artifacts, extract HTML into the source graph, and record the post-evidence assessment.

## Gate the resulting report

```bash
pnpm check:source-intelligence:evidence-report -- \
  --report source-intelligence-evidence-calibration.json \
  --min-success 2
```

The report gate fails if the calibration boundaries drift, the connector is not `crawl4ai-web@1.1.0`, expected HTML/Markdown evidence is missing, graph extraction did not occur, evidence counts regress, or fewer than the required number of sources succeed. By default, each successful source must also show a positive raw-artifact, provenance-node, or graph-node delta.

For forensic inspection of an older report where duplicate evidence is expected, the positive-delta requirement can be relaxed without relaxing the other boundaries:

```bash
pnpm check:source-intelligence:evidence-report -- \
  --report source-intelligence-evidence-calibration.json \
  --min-success 2 \
  --allow-zero-evidence-delta
```

## What to inspect

For every successful source, compare:

- priority score before/after;
- operational tier before/after;
- `EVIDENCEABILITY`, `FRESHNESS`, and `NOVELTY` dimension deltas;
- raw artifact count and bytes;
- raw provenance node count;
- total/relevant/retained graph node counts;
- reason-code changes;
- whether the observed movement is directionally sensible for the source category and authority level.

A calibration is not considered complete merely because collection succeeds. The important question is whether bounded real evidence changes the Source Intelligence assessment in a plausible, explainable way without violating governance boundaries.

## Failure handling

If one source fails because of robots policy, anti-bot behavior, transient networking, or site structure, retain the failure in the report. Do not weaken the production connector or bypass governance to force success. Use another pre-approved cohort entry if at least two valid observations cannot be obtained.

If the report gate detects boundary drift, stop the calibration and fix the code/configuration before collecting again.

## Completion record

Attach or archive the JSON report produced by the calibration and the output of the report gate. Record the cohort keys, timestamp, environment/registry identity, successful/failed count, score/tier transitions, evidence deltas, and any source-specific failure reason. These observations are the evidence required before deciding whether D2.3 scoring weights need adjustment or can be closed as calibrated.
