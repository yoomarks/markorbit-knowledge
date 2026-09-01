import {
  classifyCnipaOfflineResponseBundleFailure,
  cnipaOfflineResponseBundleFailureMessage,
  parseCnipaOfflineResponseBundleArguments,
} from "./cnipa-offline-response-bundle-cli";
import { assessCnipaOfflineResponseBundle } from "./cnipa-offline-response-bundle";

async function main(): Promise<void> {
  const arguments_ = parseCnipaOfflineResponseBundleArguments(process.argv.slice(2));
  const { manifest } = await assessCnipaOfflineResponseBundle({
    descriptorPath: arguments_.descriptorPath,
    outputDirectory: arguments_.outputDirectory,
  });
  const counts = manifest.entries.reduce(
    (result, entry) => {
      result[entry.assessmentStatus] += 1;
      return result;
    },
    {
      CONFORMS_STATIC_EXPECTED_SHAPE: 0,
      MISMATCH_STATIC_EXPECTED_SHAPE: 0,
      INSUFFICIENT_EMPTY_LIST: 0,
      INVALID_JSON: 0,
    },
  );

  process.stdout.write(
    `${JSON.stringify({
      schema: manifest.schema,
      entryCount: manifest.entryCount,
      assessmentCounts: counts,
      networkRequestPerformed: manifest.networkRequestPerformed,
      requestHeadersRead: manifest.requestHeadersRead,
      cookiesRead: manifest.cookiesRead,
      credentialValuesPersisted: manifest.credentialValuesPersisted,
      responseValuesPersistedInManifest: manifest.responseValuesPersistedInManifest,
      verificationPromotionPerformed: manifest.verificationPromotionPerformed,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  const failureKind = classifyCnipaOfflineResponseBundleFailure(error);
  process.stderr.write(
    `${JSON.stringify({
      event: "cnipa.offline.response-bundle.assess.failed",
      failureKind,
      message: cnipaOfflineResponseBundleFailureMessage(failureKind),
    })}\n`,
  );
  process.exitCode = 1;
});
