from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


path = Path("packages/persistence/src/producer-core-reliability-scorecard.ts")
text = path.read_text()

replacements = [
    (
        "binding cohort attempted field",
        "  deliveryPrepared: number;\n  delivered: number;",
        "  deliveryPrepared: number;\n  deliveryAttempted: number;\n  delivered: number;",
    ),
    (
        "first attempt helper",
        "function buildBindingCohorts(\n",
        "function firstTransportAttemptInWindow(\n"
        "  delivery: ProducerCoreReliabilityDeliveryEvidence,\n"
        "  window: { from: number; to: number },\n"
        "): boolean {\n"
        "  const firstAttempt = delivery.auditEvents\n"
        "    .filter((event) => event.type === \"TRANSPORT_ATTEMPT_STARTED\")\n"
        "    .slice()\n"
        "    .sort((left, right) => left.sequence - right.sequence)[0];\n"
        "  return firstAttempt ? inWindow(firstAttempt.recordedAt, window) : false;\n"
        "}\n\n"
        "function buildBindingCohorts(\n",
    ),
    (
        "binding attempted cohort",
        "      const bindingDeliveries = deliveries.filter(\n"
        "        (delivery) => bindingForDelivery(delivery, readyPackagesById) === bindingId,\n"
        "      );\n"
        "      const promotedToReadySamples = documents",
        "      const bindingDeliveries = deliveries.filter(\n"
        "        (delivery) => bindingForDelivery(delivery, readyPackagesById) === bindingId,\n"
        "      );\n"
        "      const attemptedBindingDeliveries = bindingDeliveries.filter((delivery) =>\n"
        "        firstTransportAttemptInWindow(delivery, window),\n"
        "      );\n"
        "      const promotedToReadySamples = documents",
    ),
    (
        "binding outcome loop",
        "      for (const delivery of bindingDeliveries) {\n",
        "      for (const delivery of attemptedBindingDeliveries) {\n",
    ),
    (
        "binding attempted count",
        "        deliveryPrepared: bindingDeliveries.filter((delivery) => {\n"
        "          const projection = projections.get(delivery.submission.submissionId);\n"
        "          return projection?.preparedAt ? inWindow(projection.preparedAt, window) : false;\n"
        "        }).length,\n"
        "        delivered,",
        "        deliveryPrepared: bindingDeliveries.filter((delivery) => {\n"
        "          const projection = projections.get(delivery.submission.submissionId);\n"
        "          return projection?.preparedAt ? inWindow(projection.preparedAt, window) : false;\n"
        "        }).length,\n"
        "        deliveryAttempted: attemptedBindingDeliveries.length,\n"
        "        delivered,",
    ),
    (
        "staging cutoff",
        "      matchesWorkspace(item, workspaceId) && (!bindingId || item.binding.bindingId === bindingId),\n",
        "      matchesWorkspace(item, workspaceId) &&\n"
        "      beforeTo(item.importedAt, window) &&\n"
        "      (!bindingId || item.binding.bindingId === bindingId),\n",
    ),
    (
        "verification cutoff",
        "    (item) => matchesWorkspace(item, workspaceId) && stagingById.has(item.vaultStagingDocumentId),\n",
        "    (item) =>\n"
        "      matchesWorkspace(item, workspaceId) &&\n"
        "      beforeTo(item.createdAt, window) &&\n"
        "      stagingById.has(item.vaultStagingDocumentId),\n",
    ),
    (
        "finalization cutoff",
        "    (item) => matchesWorkspace(item, workspaceId) && verificationIds.has(item.verificationId),\n",
        "    (item) =>\n"
        "      matchesWorkspace(item, workspaceId) &&\n"
        "      beforeTo(item.finalizedAt, window) &&\n"
        "      verificationIds.has(item.verificationId),\n",
    ),
    (
        "canonical cutoff",
        "      matchesWorkspace(item, workspaceId) &&\n      (!bindingId || item.origin.binding.bindingId === bindingId),\n",
        "      matchesWorkspace(item, workspaceId) &&\n"
        "      beforeTo(item.promotedAt, window) &&\n"
        "      (!bindingId || item.origin.binding.bindingId === bindingId),\n",
    ),
    (
        "ready package cutoff",
        "      matchesWorkspace(item, workspaceId) &&\n      (!bindingId || item.evidence.origin.binding.bindingId === bindingId),\n",
        "      matchesWorkspace(item, workspaceId) &&\n"
        "      beforeTo(item.createdAt, window) &&\n"
        "      (!bindingId || item.evidence.origin.binding.bindingId === bindingId),\n",
    ),
    (
        "delivery cutoff",
        "      item.submission.workspaceId === workspaceId && readyPackagesById.has(item.submission.readyPackageId),\n",
        "      item.submission.workspaceId === workspaceId &&\n"
        "      beforeTo(item.submission.createdAt, window) &&\n"
        "      readyPackagesById.has(item.submission.readyPackageId),\n",
    ),
    (
        "top-level attempt helper",
        "  const attemptedDeliveries = deliveries.filter((delivery) => {\n"
        "    const firstAttempt = delivery.auditEvents\n"
        "      .filter((event) => event.type === \"TRANSPORT_ATTEMPT_STARTED\")\n"
        "      .slice()\n"
        "      .sort((left, right) => left.sequence - right.sequence)[0];\n"
        "    return firstAttempt ? inWindow(firstAttempt.recordedAt, window) : false;\n"
        "  });",
        "  const attemptedDeliveries = deliveries.filter((delivery) =>\n"
        "    firstTransportAttemptInWindow(delivery, window),\n"
        "  );",
    ),
]

for label, old, new in replacements:
    text = replace_once(text, old, new, label)
path.write_text(text)

test_path = Path("packages/persistence/src/producer-core-reliability-scorecard.test.ts")
tests = test_path.read_text()
if 'it("excludes evidence that first becomes durable after the historical cutoff"' in tests:
    raise SystemExit("historical cutoff tests already exist")
marker = "\n});\n"
insert_at = tests.rfind(marker)
if insert_at < 0:
    raise SystemExit("outer describe terminator not found")
additions = r'''

  it("excludes evidence that first becomes durable after the historical cutoff", () => {
    const evidence = baseEvidence();
    evidence.canonicalDocuments = [
      canonical({ promotedAt: "2026-09-03T00:30:00.000Z" }),
    ];
    evidence.readyPackages = [readyPackage({ createdAt: "2026-09-03T00:40:00.000Z" })];
    evidence.deliveries = [
      delivery([
        audit(1, "PREPARED", "2026-09-03T00:50:00.000Z"),
        audit(2, "TRANSPORT_ATTEMPT_STARTED", "2026-09-03T01:00:00.000Z", {
          attemptNumber: 1,
        }),
      ]),
    ];

    const scorecard = buildProducerCoreReliabilityScorecard(
      { workspaceId: WORKSPACE, window: WINDOW },
      evidence,
    );

    expect(scorecard.funnel.observed).toBe(0);
    expect(scorecard.funnel.promoted).toBe(0);
    expect(scorecard.funnel.readyPackageCreated).toBe(0);
    expect(scorecard.funnel.deliveryPrepared).toBe(0);
    expect(scorecard.delivery.attemptedCohortSize).toBe(0);
    expect(scorecard.cohorts.byBinding).toEqual([]);
  });

  it("anchors binding delivery outcomes to the same first-attempt window as the top-level cohort", () => {
    const events = [
      audit(1, "PREPARED", "2026-09-01T00:50:00.000Z"),
      audit(2, "TRANSPORT_ATTEMPT_STARTED", "2026-09-01T00:55:00.000Z", {
        attemptNumber: 1,
      }),
      audit(3, "TRANSPORT_RESULT_RECORDED", "2026-09-01T01:05:00.000Z", {
        attemptNumber: 1,
        resultStatus: "ACCEPTED",
      }),
      audit(4, "FINALIZED", "2026-09-01T01:06:00.000Z", {
        attemptNumber: 1,
        resultStatus: "ACCEPTED",
      }),
    ];
    const scorecard = buildProducerCoreReliabilityScorecard(
      {
        workspaceId: WORKSPACE,
        window: {
          from: "2026-09-01T01:00:00.000Z",
          to: "2026-09-02T00:00:00.000Z",
        },
      },
      baseEvidence(events),
    );

    expect(scorecard.delivery.attemptedCohortSize).toBe(0);
    expect(scorecard.cohorts.byBinding[0]).toMatchObject({
      bindingId: BINDING,
      deliveryAttempted: 0,
      delivered: 0,
      consumerRejected: 0,
      outcomeUnknown: 0,
    });
  });
'''
tests = tests[:insert_at] + additions + tests[insert_at:]
test_path.write_text(tests)
