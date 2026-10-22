import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { digest, pr182SourceHash, pr182CandidateHash, pr182HarnessHash } from './pr182Evidence.mjs';
import {
  PRIMARY_DECISION_POLICIES,
  STATE_VALUE_CONFIG,
  DEFAULT_DECISION_POLICY,
} from '../src/core/matchSimulation/decisionPolicyConfig.ts';
const path = 'docs/performance/PR182-freeze.json';
if (existsSync(path)) throw Error('An existing freeze may not be overwritten');
if (existsSync('docs/performance/pr182-evidence/validation.json.gz'))
  throw Error('Validation was already opened');
const dirty = execFileSync(
  'git',
  ['status', '--porcelain', '--', 'src', 'scripts', 'package.json', 'package-lock.json'],
  { encoding: 'utf8' },
).trim();
if (dirty) throw Error('Commit production and harness before freezing: ' + dirty);
const reference = JSON.parse(readFileSync('docs/performance/PR181-reservation-proof.json'));
const archives = [
  'docs/performance/pr180-evidence/pr182-sealed.json.gz',
  'docs/performance/pr179-evidence/initial-states.json.gz',
].map((path) => {
  const sha256 = digest(readFileSync(path)),
    prior = reference.files.find((f) => f.path === path);
  if (!prior || prior.sha256 !== sha256) throw Error('Reserved archive differs from PR181 receipt');
  return { path, sha256, decodedBeforeFreeze: false };
});
const frozen = {
  schema: 'mfl-pr182-candidate-freeze-v1',
  frozenAtUtc: new Date().toISOString(),
  baseCommit: 'b9c7bfb8dd341f258d684f19fba1ebd4c849a888',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: pr182SourceHash(),
  candidateHash: pr182CandidateHash(),
  harnessHash: pr182HarnessHash(),
  workingTree: dirty,
  hashScope:
    'All production src .ts/.tsx (excluding tests), package.json and lockfile, normalized LF. Harness includes runner, preparation, spatial/lineage observers, reporting and performance/coaching/hold scripts.',
  allowedPostValidationSourceChange:
    'Only the literal DEFAULT_DECISION_POLICY selection may change after evaluation. candidateHash normalizes that single literal and must remain identical. No policy/coach/physics/observer tuning is permitted. Any behavioural repair needs unused inputs.',
  policies: PRIMARY_DECISION_POLICIES,
  policyConfiguration: STATE_VALUE_CONFIG,
  defaultBeforeEvaluation: DEFAULT_DECISION_POLICY,
  archives,
  fixtureInputs: JSON.parse(readFileSync('docs/performance/PR180-inputs.json')).pr182,
  cohort: {
    primary:
      'All twelve pr182-sealed designs, four SS, four SW, four WW; all five policies per exact transformed starting state.',
    additional:
      'Do not decode or run pr180-reserved designs from the older archive. They are not confirmation in this PR.',
    unit: 'Fixture design; 12 paired units, not 60 independent matches or individual actions/frames.',
    transform:
      'Attach canonical manager profile from each archived session; initialise empty coach observation and common collective roles. Preserve archived native attributes, physical bodies, formations, named benches, seed and laws. Hash complete transformed state and session before policy override.',
  },
  budgets: {
    physicsDt: 0.025,
    primaryMatches: 60,
    parallelProcesses: 10,
    expectedCpuSecondsPerMatch: [180, 400],
    cpuCeilingPerMatchSeconds: 600,
    wallCeilingPerChildSeconds: 900,
    maximumSimulatedSeconds: 7200,
    expectedTotalCpuHours: [3, 7],
    sampledRssMiBPerProcess: [300, 800],
    correctness:
      'Run the original full npm run verify without skipping suites or weakening assertions/timeouts; allow 30 minutes for the full command.',
    performance:
      'Twenty serial 120s windows (two per policy/source), three complete matched role-policy before/after workloads, and separate observer on/off window; no other simulation/test workers during serial trials.',
  },
  metrics: {
    official:
      'Canonical physical shots, goals, pass attempts/completions, possession, corners, cards, offside, tackles/interceptions and substitution facts. Crosses are not silently added to pass attempts.',
    flow: 'Unique first-time IDs, actual receptions/errors, possession durations, maximum/strict pathological holds, forward/final-third/box progression, natural restart and live/dead clock reconciliation.',
    spatial:
      'Public line gaps/shape exposure, depth targets and actual >0.5m beyond-release-line completions, wing intentions and actual marker passage, overlaps, box occupation, cross execution/receiver geometry, aerial opportunities versus actual body-contested contact and second balls.',
    tactics:
      'Role suitability/compatibility, changed/no-change decisions, halftime, score/dismissal and flank responses, role-sensitive legal changes, physical post-change movement and 30-second windows; controlled paired A-F continuations support local mechanism claims.',
    consequences:
      'Pass/shot/keeper lineage, turnover location and subsequent ten-second opponent shots, actual controlled counterattack progress; useful failed attacking risk is not an automatic regression.',
    uncertainty:
      'Paired fixture differences against legacy, all rows and strength strata, separate SW strong/weak sides; fixed-seed 4000-resample design bootstrap 95% intervals, exploratory and unadjusted for multiple endpoints.',
  },
  selection: {
    hardGates: [
      'Selected policy completes every primary fixture; no unexplained contact/ownership, law, clock, canonical event or career-result failure.',
      'Determinism, complete-state observer equality, human authority and exactly-once career checks pass.',
      'No reproducible unopposed physically executable stationary no-op sink lasting >120s with available meaningful alternatives. Strict >=30s holds and drift beyond the strict detector are still inspected and reported.',
      'Selected role policy complete serial CPU workload is no more than 35% above the same policy on PR181. A slower candidate remains experimental; no physics/tick reduction hides cost. Single workload uncertainty is disclosed.',
    ],
    football: [
      'A role candidate must improve actual shots and box progression over legacy in at least eight of twelve paired designs on each endpoint, without hiding failed weak-team fixtures.',
      'Inspect depth reception, wing play, role/movement coherence, defending/cover, conversion and natural restarts together. More completion, wins, goals or event volume alone cannot win.',
      'Compare nondominated eligible role candidates directly. Prefer fewer substantial no-op holds and coherent progression/variation; consider cost within the gate. Report disagreements/uncertainty rather than manufacture a scalar score.',
      'Strong preference for provisional player-facing promotion when correctness/cost gates and credible overall improvement support it. Legacy attacking inactivity is a weakness, not a reason for inertia.',
    ],
    knownDevelopmentLimits: [
      'High SS circulation, weak-team technical errors, rare contested aerial contacts, excessive live time and uncalibrated goal-proxy expectations.',
      'New WW frozen hold survives the 30-second R3 continuation under the strict <1m detector; other policies move out or change ownership. This remains a disclosed candidate warning, not an erased regression.',
    ],
    readiness:
      'READY / CONDITIONALLY READY / NOT READY refers to trust for later statistical summary calibration; provisional playability and a default promotion do not prove calibration.',
    hybrid:
      'No new hybrid is proposed; compare the five existing policy architectures on shared coaching/physics.',
  },
  runtime: process.version,
};
writeFileSync(path, JSON.stringify(frozen, null, 2) + '\n');
console.log(
  JSON.stringify({
    sourceCommit: frozen.sourceCommit,
    sourceHash: frozen.sourceHash,
    candidateHash: frozen.candidateHash,
    harnessHash: frozen.harnessHash,
    archives,
  }),
);
