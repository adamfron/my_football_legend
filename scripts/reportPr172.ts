/** Collect integrity/verification receipts; never run the match engine or rewrite PR171. */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pr172Manifest } from './pr172Evidence';

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const rawDir = arg('raw-dir', '../pr172-final');
const verificationLog = arg('verify-log', '../pr172-verify-quiet.log');
const tacticsReplay = arg('tactics-replay', '../pr172-reproduced-tactics.json');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const write = (name: string, value: unknown) =>
  writeFileSync(`docs/performance/${name}.json`, JSON.stringify(value, null, 2) + '\n');
const manifest = pr172Manifest();
const frozen = read('docs/performance/PR172-baseline-manifest.json');
const evidence = frozen.evidence.map((entry: { name: string; sha256: string }) => {
  const actual = hash(readFileSync(`docs/performance/${entry.name}`));
  if (actual !== entry.sha256) throw new Error(`Historical evidence changed: ${entry.name}`);
  return { name: entry.name, sha256: actual, unchanged: true };
});
const states = frozen.states.map((entry: { name: string; sha256: string }) => {
  const actual = hash(gunzipSync(readFileSync(`docs/performance/pr172-states/${entry.name}.gz`)));
  if (actual !== entry.sha256) throw new Error(`Historical replay changed: ${entry.name}`);
  return { name: entry.name, sha256: actual, unchanged: true };
});
const fullMatches = [false, true].map((reversed) => {
  const receipt = read(`${rawDir}/confirm-youth_native-${reversed}.json`);
  const { observed, equivalence } = receipt;
  const plain = equivalence.disabled;
  if (
    !equivalence.completeCanonicalStateEqual ||
    observed.finalStateHash !== plain.finalStateHash ||
    observed.status !== 'full_time' ||
    plain.status !== 'full_time' ||
    receipt.manifest.sourceHash !== manifest.sourceHash
  )
    throw new Error(`Full-state observer mismatch: youth_native/${reversed}`);
  return {
    fixture: receipt.fixture,
    manifest: receipt.manifest,
    initialStateHash: observed.initialStateHash,
    finalStateHash: observed.finalStateHash,
    status: observed.status,
    time: observed.time,
    ticks: observed.ticks,
    completeCanonicalStateEqual: true,
  };
});
const short = read('../pr172-observer-final/equivalence-central_possession-false.json');
const hook = JSON.parse(
  gunzipSync(readFileSync('../pr172-hook-parity/central_possession-parity.json.gz')).toString(),
);
if (
  !short.equivalence.completeCanonicalStateEqual ||
  short.observed.finalStateHash !== hook.finalStateHash ||
  short.observed.initialStateHash !== hook.initialHash ||
  short.manifest.sourceHash !== manifest.sourceHash ||
  hook.manifest.sourceHash !== manifest.sourceHash
)
  throw new Error('Decision research loader changed the 60-second canonical continuation');
const recoveries = states.map((state: { name: string }) => {
  const receipt = read(`docs/performance/PR172-after-recovery-${state.name}`);
  if (receipt.status !== 'full_time' || receipt.manifest.sourceHash !== manifest.sourceHash)
    throw new Error(`Recovery incomplete: ${state.name}`);
  return {
    name: state.name,
    initialHash: receipt.initialHash,
    finalHash: receipt.finalHash,
    status: receipt.status,
    time: receipt.time,
    ticks: receipt.ticks,
    reloadChecks: receipt.reloadChecks,
    release: receipt.released,
  };
});
const tactical = read('docs/performance/PR172-tactical-experiments.json');
const reproduced = read(tacticsReplay);
if (tactical.rows.length !== 40 || !isDeepStrictEqual(tactical.rows, reproduced.rows))
  throw new Error('Frozen tactical experiments differ from the PR171 replay');
write('PR172-determinism', {
  version: 1,
  manifest,
  fullMatches,
  researchLoader: {
    scope:
      '60 canonical seconds, central_possession, original orientation; not a full-match loader test',
    initialStateHash: hook.initialHash,
    finalStateHash: hook.finalStateHash,
    seconds: hook.seconds,
    completeCanonicalStateEqual: true,
    modes: ['plain', 'existing observers with audit', 'decision-component Node loader'],
  },
  recoveries,
  frozenTacticsReplay: {
    baselineCommit: frozen.baselineCommit,
    states: 40,
    continuations: tactical.rows.reduce(
      (sum: number, row: { experiments: unknown[] }) => sum + row.experiments.length,
      0,
    ),
    allRankingsAndContinuationsExactlyEqual: true,
    scope:
      'Exact same frozen inputs in PR171 and final PR172; not a statement that natural match trajectories are unchanged',
  },
});
const logBytes = readFileSync(verificationLog);
const log = logBytes.toString();
const expected = [1779, 52, 4, 5];
const passed = [...log.matchAll(/Tests\s+(\d+) passed/g)].map((match) => Number(match[1]));
if (
  !isDeepStrictEqual(passed, expected) ||
  !log.includes('built in') ||
  /FAIL|ELIFECYCLE/.test(log)
)
  throw new Error('Incomplete or failing npm run verify log');
write('PR172-verification', {
  version: 1,
  manifest,
  command: 'npm run verify',
  status: 'passed',
  exitCode: 0,
  tests: { main: 1779, integration: 52, careerContract: 4, fullCareer: 5, total: 1840 },
  logSha256: hash(logBytes),
  checks: [
    'lint',
    'main tests',
    'match integration',
    'U-17 and senior canonical career contract',
    'full career',
    'TypeScript build',
    'Vite production build',
  ],
  historicalEvidence: evidence,
  historicalStates: states,
  additionalChecks: [
    'strict TypeScript for PR172 research scripts',
    'unchanged 12-fixture initial states and seeds',
    '16/16 full final matches',
    'full-state observer equality',
    'schema-validated replay/save/reload',
  ],
  earlierAttempts: [
    'New redundant long carry test exceeded its limit under concurrent research load; replaced with focused transition invariants, retaining all nine long probes opt-in.',
    'Existing full CPU-half penalty test exceeded 90 seconds while research was running; complete verify rerun quietly without changing test limits or workers.',
  ],
  browser: {
    status: 'blocked',
    reason:
      'Computer Use stopped browser control because it could not confidently determine the active browser URL. No manual browser smoke claimed.',
    automatedCoverage:
      'Shot aim DOM, goal-coordinate projection, renderer and career integration tests passed.',
  },
});
console.log('PR172 integrity, deterministic continuation and verification receipts passed');
