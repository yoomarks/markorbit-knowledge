import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflow = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../.github/workflows/${name}`, import.meta.url)),
    "utf8",
  );

describe("ADK-06 live Environment boundary", () => {
  it("keeps provider credentials out of the owner-only dispatch workflow", () => {
    const ownerDispatch = workflow("adk-live-provider-owner-command.yml");

    expect(ownerDispatch).toContain("github.actor == github.repository_owner");
    expect(ownerDispatch).toContain("github.event.comment.body == '/adk06-live-run'");
    expect(ownerDispatch).toContain('confirm_live_provider_calls:"true"');
    expect(ownerDispatch).not.toContain("secrets.DEEPSEEK_API_KEY");
    expect(ownerDispatch).not.toContain("secrets.OPENAI_API_KEY");
    expect(ownerDispatch).not.toContain("secrets.ADK_LIVE_EVIDENCE_PASSPHRASE");
  });

  it("checks live secrets only inside the environment-bound acceptance job", () => {
    const liveAcceptance = workflow("adk-live-provider-acceptance.yml");

    expect(liveAcceptance).toContain("environment: adk-live");
    expect(liveAcceptance).toContain("DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}");
    expect(liveAcceptance).toContain("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}");
    expect(liveAcceptance).toContain(
      "ADK_LIVE_EVIDENCE_PASSPHRASE: ${{ secrets.ADK_LIVE_EVIDENCE_PASSPHRASE }}",
    );

    const exactMainGate = liveAcceptance.indexOf(
      "- name: Fail closed unless main, exact commit and frozen approval match",
    );
    const offPeakGate = liveAcceptance.indexOf(
      "- name: Enforce DeepSeek off-peak window before secrets are exposed",
    );
    const secretGate = liveAcceptance.indexOf(
      "- name: Fail closed unless provider and evidence secrets exist",
    );
    const providerExecution = liveAcceptance.indexOf(
      "- name: Execute real DeepSeek Flash plus OpenAI acceptance",
    );

    expect(exactMainGate).toBeGreaterThan(-1);
    expect(offPeakGate).toBeGreaterThan(exactMainGate);
    expect(secretGate).toBeGreaterThan(offPeakGate);
    expect(providerExecution).toBeGreaterThan(secretGate);
  });
});
