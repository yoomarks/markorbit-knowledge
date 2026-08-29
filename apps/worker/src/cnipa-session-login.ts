import { loadCnipaBrowserSessionConfig } from "./config";
import { CnipaPlaywrightSessionExecutorFactory } from "./cnipa-playwright-session-executor";

async function main(): Promise<void> {
  const options = loadCnipaBrowserSessionConfig(process.env, { headless: false });
  const session = await new CnipaPlaywrightSessionExecutorFactory(options).create();
  process.stdout.write(
    "CNIPA operator login browser is open. Complete SSO/CAPTCHA manually, verify the authenticated portal, then press Ctrl+C to close and persist the browser profile. No session credential is printed or exported.\n",
  );

  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await session.close();
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "cnipa.session.login.failed",
      message: error instanceof Error ? error.message : "CNIPA login session failed",
    })}\n`,
  );
  process.exitCode = 1;
});
