import assert from "node:assert/strict";
import test from "node:test";
import { CORE_DRIFT_STATES, classifyCoreDrift } from "./core-drift-gate.mjs";

const baseline = "1111111111111111111111111111111111111111";
const current = "2222222222222222222222222222222222222222";

function classify(overrides = {}) {
  return classifyCoreDrift({
    baseline,
    current,
    profileName: "managed-ai",
    changedPaths: [],
    ...overrides,
  });
}

test("exact audited Core main is NO_DRIFT", () => {
  const result = classify({ current: baseline });
  assert.equal(result.state, CORE_DRIFT_STATES.NO_DRIFT);
});

test("proven Lite Web-only drift is IRRELEVANT_DRIFT", () => {
  const result = classify({
    changedPaths: ["apps/lite-web/src/App.tsx", "apps/lite-web/tests/navigation.pw.ts"],
  });
  assert.equal(result.state, CORE_DRIFT_STATES.IRRELEVANT_DRIFT);
  assert.deepEqual(result.relevantPaths, []);
});

test("proven MarkReg Web-only drift is IRRELEVANT_DRIFT for every profile", () => {
  for (const profileName of ["core-intake", "managed-ai", "markreg-contract", "k-case-008"]) {
    const result = classify({
      profileName,
      changedPaths: [
        "apps/markreg-web/src/WorkspaceHome.tsx",
        "apps/markreg-web/src/api/formal-matter.ts",
      ],
    });
    assert.equal(result.state, CORE_DRIFT_STATES.IRRELEVANT_DRIFT);
    assert.deepEqual(result.relevantPaths, []);
  }
});

test("audited Order journey heading assertion drift is isolated for every profile", () => {
  for (const profileName of ["core-intake", "managed-ai", "markreg-contract", "k-case-008"]) {
    const result = classify({
      profileName,
      changedPaths: ["tests/e2e/order-journey-real-runtime.spec.ts"],
    });
    assert.equal(result.state, CORE_DRIFT_STATES.IRRELEVANT_DRIFT);
    assert.deepEqual(result.relevantPaths, []);
  }
});

test("exact-path isolation does not exempt similarly prefixed files", () => {
  for (const profileName of ["core-intake", "managed-ai", "markreg-contract", "k-case-008"]) {
    const filePath = "tests/e2e/order-journey-real-runtime.spec.ts.backup";
    const result = classify({ profileName, changedPaths: [filePath] });
    assert.equal(result.state, CORE_DRIFT_STATES.RELEVANT_DRIFT);
    assert.deepEqual(result.relevantPaths, [filePath]);
  }
});

test("proven MGSN service-only drift is IRRELEVANT_DRIFT", () => {
  const result = classify({
    changedPaths: [
      "services/mgsn/src/network-participation.ts",
      "services/mgsn/tests/network-participation.test.ts",
    ],
  });
  assert.equal(result.state, CORE_DRIFT_STATES.IRRELEVANT_DRIFT);
  assert.deepEqual(result.relevantPaths, []);
});

test("Capability Engine drift is relevant for Managed AI", () => {
  const result = classify({ changedPaths: ["services/capability-engine/src/index.ts"] });
  assert.equal(result.state, CORE_DRIFT_STATES.RELEVANT_DRIFT);
  assert.deepEqual(result.relevantPaths, ["services/capability-engine/src/index.ts"]);
});

test("Capability Engine-only drift is isolated from non-Capability acceptance profiles", () => {
  for (const profileName of ["core-intake", "markreg-contract", "k-case-008"]) {
    const result = classify({
      profileName,
      changedPaths: [
        "services/capability-engine/src/current-source-admission-evidence-v4.ts",
        "services/capability-engine/src/index.ts",
      ],
    });
    assert.equal(result.state, CORE_DRIFT_STATES.IRRELEVANT_DRIFT);
    assert.deepEqual(result.relevantPaths, []);
  }
});

test("MarkReg-only drift is isolated from Core Intake and Managed AI", () => {
  for (const profileName of ["core-intake", "managed-ai"]) {
    const result = classify({
      profileName,
      changedPaths: [
        "services/markreg/src/formal-matter-evidence-read.ts",
        "services/markreg/src/main.ts",
      ],
    });
    assert.equal(result.state, CORE_DRIFT_STATES.IRRELEVANT_DRIFT);
    assert.deepEqual(result.relevantPaths, []);
  }
});

test("shared contracts drift is relevant for every profile", () => {
  for (const profileName of ["core-intake", "managed-ai", "markreg-contract", "k-case-008"]) {
    const result = classify({
      profileName,
      changedPaths: ["packages/contracts/src/index.ts"],
    });
    assert.equal(result.state, CORE_DRIFT_STATES.RELEVANT_DRIFT);
  }
});

test("Core receiver drift is relevant for Core Intake", () => {
  const result = classify({
    profileName: "core-intake",
    changedPaths: ["services/core/src/index.ts"],
  });
  assert.equal(result.state, CORE_DRIFT_STATES.RELEVANT_DRIFT);
});

test("MarkReg drift is relevant for MarkReg and K-CASE profiles", () => {
  for (const profileName of ["markreg-contract", "k-case-008"]) {
    const result = classify({
      profileName,
      changedPaths: ["services/markreg/src/formal-matter.ts"],
    });
    assert.equal(result.state, CORE_DRIFT_STATES.RELEVANT_DRIFT);
  }
});

test("persistence and migration drift is relevant for K-CASE", () => {
  for (const filePath of [
    "packages/persistence/src/index.ts",
    "infrastructure/persistence/migrations/9999_example.sql",
  ]) {
    const result = classify({
      profileName: "k-case-008",
      changedPaths: [filePath],
    });
    assert.equal(result.state, CORE_DRIFT_STATES.RELEVANT_DRIFT);
  }
});

test("mixed isolated and shared drift remains RELEVANT_DRIFT", () => {
  const result = classify({
    changedPaths: ["apps/lite-web/src/App.tsx", "pnpm-lock.yaml"],
  });
  assert.equal(result.state, CORE_DRIFT_STATES.RELEVANT_DRIFT);
  assert.deepEqual(result.relevantPaths, ["pnpm-lock.yaml"]);
});

test("mixed MarkReg Web and shared-contract drift remains RELEVANT_DRIFT", () => {
  for (const profileName of ["core-intake", "managed-ai", "markreg-contract", "k-case-008"]) {
    const result = classify({
      profileName,
      changedPaths: ["apps/markreg-web/src/WorkspaceHome.tsx", "packages/contracts/package.json"],
    });
    assert.equal(result.state, CORE_DRIFT_STATES.RELEVANT_DRIFT);
    assert.deepEqual(result.relevantPaths, ["packages/contracts/package.json"]);
  }
});

test("non-ancestor history fails closed as UNKNOWN_DRIFT", () => {
  const result = classify({ isAncestor: false, changedPaths: ["apps/lite-web/src/App.tsx"] });
  assert.equal(result.state, CORE_DRIFT_STATES.UNKNOWN_DRIFT);
});

test("incomplete comparison fails closed as UNKNOWN_DRIFT", () => {
  const result = classify({
    comparisonComplete: false,
    changedPaths: ["apps/lite-web/src/App.tsx"],
  });
  assert.equal(result.state, CORE_DRIFT_STATES.UNKNOWN_DRIFT);
});

test("an advanced commit with no tree changes is irrelevant drift", () => {
  const result = classify({ changedPaths: [] });
  assert.equal(result.state, CORE_DRIFT_STATES.IRRELEVANT_DRIFT);
});

test("invalid commit identity fails closed", () => {
  const result = classify({ current: "not-a-sha" });
  assert.equal(result.state, CORE_DRIFT_STATES.UNKNOWN_DRIFT);
});
