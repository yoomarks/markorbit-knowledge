import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CORE_DRIFT_STATES = Object.freeze({
  NO_DRIFT: 'NO_DRIFT',
  IRRELEVANT_DRIFT: 'IRRELEVANT_DRIFT',
  RELEVANT_DRIFT: 'RELEVANT_DRIFT',
  UNKNOWN_DRIFT: 'UNKNOWN_DRIFT'
});

const PROVEN_ISOLATED_PREFIXES = Object.freeze(['apps/lite-web/', 'services/mgsn/']);

export const CORE_DRIFT_PROFILES = Object.freeze({
  'managed-ai': Object.freeze({ isolatedPrefixes: PROVEN_ISOLATED_PREFIXES }),
  'markreg-contract': Object.freeze({ isolatedPrefixes: PROVEN_ISOLATED_PREFIXES }),
  'k-case-008': Object.freeze({ isolatedPrefixes: PROVEN_ISOLATED_PREFIXES })
});

const SHA_40 = /^[0-9a-f]{40}$/i;
const MAX_CHANGED_PATHS = 5000;
const MAX_GIT_OUTPUT_BYTES = 4 * 1024 * 1024;

function isProvenIsolatedPath(filePath, profile) {
  return profile.isolatedPrefixes.some((prefix) => filePath.startsWith(prefix));
}

export function classifyCoreDrift({
  baseline,
  current,
  profileName,
  isAncestor = true,
  comparisonComplete = true,
  changedPaths = []
}) {
  const profile = CORE_DRIFT_PROFILES[profileName];
  if (!profile) throw new Error(`Unknown Core drift profile: ${profileName}`);
  if (!SHA_40.test(baseline) || !SHA_40.test(current)) {
    return { state: CORE_DRIFT_STATES.UNKNOWN_DRIFT, relevantPaths: [], isolatedPaths: [] };
  }
  if (baseline === current) {
    return { state: CORE_DRIFT_STATES.NO_DRIFT, relevantPaths: [], isolatedPaths: [] };
  }
  if (!isAncestor || !comparisonComplete || changedPaths.length > MAX_CHANGED_PATHS) {
    return { state: CORE_DRIFT_STATES.UNKNOWN_DRIFT, relevantPaths: [], isolatedPaths: [] };
  }

  const uniquePaths = [...new Set(changedPaths)].sort();
  const isolatedPaths = [];
  const relevantPaths = [];
  for (const filePath of uniquePaths) {
    if (isProvenIsolatedPath(filePath, profile)) isolatedPaths.push(filePath);
    else relevantPaths.push(filePath);
  }

  if (relevantPaths.length > 0) {
    return { state: CORE_DRIFT_STATES.RELEVANT_DRIFT, relevantPaths, isolatedPaths };
  }
  return { state: CORE_DRIFT_STATES.IRRELEVANT_DRIFT, relevantPaths, isolatedPaths };
}

function runGit(repoDir, args, allowedStatuses = [0]) {
  const result = spawnSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
    maxBuffer: MAX_GIT_OUTPUT_BYTES
  });
  if (result.error) throw result.error;
  if (!allowedStatuses.includes(result.status ?? -1)) {
    const stderr = result.stderr?.trim();
    throw new Error(`git ${args.join(' ')} failed with status ${result.status}${stderr ? `: ${stderr}` : ''}`);
  }
  return result;
}

function writeOutputs(outputPath, state, current) {
  if (!outputPath) return;
  appendFileSync(outputPath, `drift_state=${state}\ncore_ref_to_test=${current}\n`, 'utf8');
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Arguments must be provided as --name value pairs.');
    }
    values.set(key.slice(2), value);
  }
  return {
    repo: values.get('repo'),
    baseline: values.get('baseline'),
    profileName: values.get('profile'),
    githubOutput: values.get('github-output')
  };
}

export function evaluateCoreRepository({ repo, baseline, profileName, githubOutput }) {
  if (!repo || !baseline || !profileName) {
    throw new Error('--repo, --baseline, and --profile are required.');
  }
  if (!SHA_40.test(baseline)) throw new Error('The audited Core baseline must be a full 40-character SHA.');
  if (!CORE_DRIFT_PROFILES[profileName]) throw new Error(`Unknown Core drift profile: ${profileName}`);

  const repoDir = path.resolve(repo);
  runGit(repoDir, ['fetch', '--quiet', '--filter=blob:none', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  const current = runGit(repoDir, ['rev-parse', 'refs/remotes/origin/main']).stdout.trim();
  if (!SHA_40.test(current)) throw new Error('Unable to resolve the current Core main SHA.');

  let classification;
  if (baseline === current) {
    classification = classifyCoreDrift({ baseline, current, profileName });
  } else {
    try {
      runGit(repoDir, ['cat-file', '-e', `${baseline}^{commit}`]);
    } catch {
      classification = classifyCoreDrift({
        baseline,
        current,
        profileName,
        comparisonComplete: false
      });
    }

    if (!classification) {
      const ancestor = runGit(repoDir, ['merge-base', '--is-ancestor', baseline, current], [0, 1]);
      if (ancestor.status !== 0) {
        classification = classifyCoreDrift({
          baseline,
          current,
          profileName,
          isAncestor: false
        });
      } else {
        const diff = runGit(repoDir, ['diff', '--name-only', '--no-renames', '-z', baseline, current, '--']);
        if (Buffer.byteLength(diff.stdout, 'utf8') >= MAX_GIT_OUTPUT_BYTES) {
          classification = classifyCoreDrift({
            baseline,
            current,
            profileName,
            comparisonComplete: false
          });
        } else {
          const changedPaths = diff.stdout.split('\0').filter(Boolean);
          classification = classifyCoreDrift({
            baseline,
            current,
            profileName,
            changedPaths
          });
        }
      }
    }
  }

  console.log(`Core audited baseline: ${baseline}`);
  console.log(`Core current main:     ${current}`);
  console.log(`Core drift profile:    ${profileName}`);
  console.log(`Core drift state:      ${classification.state}`);
  const allPaths = [...classification.isolatedPaths, ...classification.relevantPaths].sort();
  if (allPaths.length > 0) {
    console.log('Changed Core paths:');
    for (const filePath of allPaths) {
      const marker = classification.relevantPaths.includes(filePath) ? 'RELEVANT' : 'PROVEN_ISOLATED';
      console.log(`- [${marker}] ${filePath}`);
    }
  }

  writeOutputs(githubOutput, classification.state, current);

  if (classification.state === CORE_DRIFT_STATES.RELEVANT_DRIFT) {
    console.error('::error::Core changed on a watched/default-relevant path. Audit the new boundary and update the baseline before proceeding.');
    return 1;
  }
  if (classification.state === CORE_DRIFT_STATES.UNKNOWN_DRIFT) {
    console.error('::error::Core drift could not be proven safe. Failing closed.');
    return 1;
  }
  if (classification.state === CORE_DRIFT_STATES.IRRELEVANT_DRIFT) {
    console.log('Core advanced only on explicitly proven isolated paths; test the current Core main without mutating the audited baseline.');
  }
  return 0;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    process.exitCode = evaluateCoreRepository(args);
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
