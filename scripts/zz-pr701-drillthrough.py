from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    file_path.write_text(text.replace(old, new, 1))


replace_once(
    "apps/admin/src/server/producer-core-reliability-service.ts",
    '    resultStatus: ReadyPackageV2DeliverySubmission["result"] extends infer Result\n      ? Result extends { status: infer Status }\n        ? Status | null\n        : string | null\n      : string | null;\n',
    '    resultStatus: "RECEIVED" | "ACCEPTED" | "REJECTED" | null;\n',
    "bounded detail result status",
)

replace_once(
    "apps/admin/src/components/overview/producer-core-reliability.tsx",
    '                      <th className="pb-2 font-semibold">Attempts</th>\n',
    '                      <th className="pb-2 pr-4 font-semibold">Attempts</th>\n'
    '                      <th className="pb-2 font-semibold">Evidence</th>\n',
    "reconciliation evidence header",
)

replace_once(
    "apps/admin/src/components/overview/producer-core-reliability.tsx",
    '                        <td className="py-2">{item.attemptCount}</td>\n',
    '                        <td className="py-2 pr-4">{item.attemptCount}</td>\n'
    '                        <td className="py-2">\n'
    '                          <a\n'
    '                            href={`/api/knowledge/reliability/deliveries/${encodeURIComponent(item.submissionId)}?workspaceId=${encodeURIComponent(workspaceId)}&to=${encodeURIComponent(scorecard.window.to)}`}\n'
    '                            target="_blank"\n'
    '                            rel="noreferrer"\n'
    '                            aria-label={`${zh ? "查看证据" : "Inspect evidence"} ${item.submissionId}`}\n'
    '                            className="font-semibold text-blue-600 hover:text-blue-700"\n'
    '                          >\n'
    '                            {zh ? "证据" : "Evidence"}\n'
    '                          </a>\n'
    '                        </td>\n',
    "reconciliation evidence link",
)

replace_once(
    "apps/admin/src/components/overview/producer-core-reliability.tsx",
    '                      <th className="pb-2 pr-4 font-semibold">Prepared</th>\n'
    '                      <th className="pb-2 pr-4 font-semibold">Delivered</th>\n',
    '                      <th className="pb-2 pr-4 font-semibold">Prepared</th>\n'
    '                      <th className="pb-2 pr-4 font-semibold">Attempted</th>\n'
    '                      <th className="pb-2 pr-4 font-semibold">Delivered</th>\n',
    "binding attempted header",
)

replace_once(
    "apps/admin/src/components/overview/producer-core-reliability.tsx",
    '                        <td className="py-2 pr-4">{item.deliveryPrepared}</td>\n'
    '                        <td className="py-2 pr-4">{item.delivered}</td>\n',
    '                        <td className="py-2 pr-4">{item.deliveryPrepared}</td>\n'
    '                        <td className="py-2 pr-4">{item.deliveryAttempted}</td>\n'
    '                        <td className="py-2 pr-4">{item.delivered}</td>\n',
    "binding attempted value",
)
