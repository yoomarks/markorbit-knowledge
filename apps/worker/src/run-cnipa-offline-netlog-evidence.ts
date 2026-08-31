import {
  classifyCnipaOfflineNetLogFailure,
  cnipaOfflineNetLogFailureMessage,
  parseCnipaOfflineNetLogArguments,
} from "./cnipa-offline-netlog-cli";
import { sanitizeCnipaNetLog } from "./cnipa-offline-netlog-evidence";

async function main(): Promise<void> {
  const arguments_ = parseCnipaOfflineNetLogArguments(process.argv.slice(2));
  const summary = await sanitizeCnipaNetLog(arguments_);
  process.stdout.write(
    `${JSON.stringify({
      evidenceKind: summary.evidence_kind,
      sourceSha256: summary.source_sha256,
      captureMode: summary.capture_mode,
      matchedEndpointEventCount: summary.candidate_endpoint_url_events.reduce(
        (total, item) => total + item.url_event_count,
        0,
      ),
      observedRequestStartCount: summary.observed_request_start_events.length,
      staticApplicationAssetPathCount: summary.static_application_asset_path_count,
      staticApplicationAssetPathsTruncated: summary.static_application_asset_paths_truncated,
      networkRequestPerformed: false,
      headersPersisted: false,
      cookiesPersisted: false,
      queryValuesPersisted: false,
      responseBodyPersisted: false,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  const failureKind = classifyCnipaOfflineNetLogFailure(error);
  process.stderr.write(
    `${JSON.stringify({
      event: "cnipa.offline.netlog.sanitize.failed",
      failureKind,
      message: cnipaOfflineNetLogFailureMessage(failureKind),
    })}\n`,
  );
  process.exitCode = 1;
});
