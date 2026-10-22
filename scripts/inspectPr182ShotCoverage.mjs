import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import console from 'node:console';
import { configureMatchPolicy } from '../src/core/matchSimulation/roleExperiment.ts';
import {
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
import { digest, pr182CandidateHash, pr182SourceHash } from './pr182Evidence.mjs';
const policy = 'state-value-v1';
const input = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr182-evidence/validation.json.gz')),
)[0];
const observed = JSON.parse(
  gunzipSync(
    readFileSync(
      `../pr182-validation/${input.design.id}/${policy}/${input.design.id}-${policy}.json.gz`,
    ),
  ),
);
const freeze = JSON.parse(readFileSync('docs/performance/PR182-freeze.json'));
if (freeze.candidateHash !== pr182CandidateHash() || digest(input.state) !== input.inputHash)
  throw Error('Candidate/input mismatch');
const missing = observed.report.summary.canonicalStatistics.observedShotIds.filter(
  (id) => !observed.report.summary.shots.some((s) => s.shotId === id),
);
let state = configureMatchPolicy(globalThis.structuredClone(input.state), policy),
  ticks = 0,
  remaining = 0;
const recent = [],
  captured = [];
const snapshot = (s) => ({
  at: s.time,
  decision: s.decisionIndex,
  status: s.status,
  ball: s.ball,
  lastShot: s.lastShot,
  lastShotResult: s.lastShotResult,
  lastBallContact: s.lastBallContact,
  lastGroundContact: s.lastGroundContact,
  latestAction: s.latestAction,
  restart: s.restart?.type,
  players: s.players.map((p) => ({
    id: p.id,
    team: p.team,
    position: p.position,
    velocity: p.velocity,
  })),
  observedShots: s.statistics.observedShotIds,
  observedResults: s.statistics.observedShotResultIds,
});
while (!['full_time', 'abandoned'].includes(state.status) && state.time < 7200) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  const previous = state;
  state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  ticks++;
  const newMissing = missing.some(
    (id) =>
      state.statistics.observedShotIds.includes(id) &&
      !previous.statistics.observedShotIds.includes(id),
  );
  const projection = snapshot(state);
  if (newMissing) {
    captured.push(...recent);
    remaining = 120;
  }
  if (remaining > 0) {
    captured.push(projection);
    remaining--;
  }
  recent.push(projection);
  if (recent.length > 12) recent.shift();
}
assertMatchStatisticsInvariants(state.statistics, state);
if (
  digest(state) !== observed.finalHash ||
  ticks !== observed.ticks ||
  state.status !== 'full_time'
)
  throw Error('Complete selected-policy observer equality failed');
const result = {
  method:
    'Post-validation complete selected-policy replay with primary observers and profiler off. Passive short snapshots diagnose detailed-shot coverage; complete state and tick count must equal the frozen primary receipt. No engine changes or independent designs.',
  policy,
  id: input.design.id,
  sourceHash: pr182SourceHash(),
  candidateHash: pr182CandidateHash(),
  ticks,
  status: state.status,
  time: state.time,
  finalHash: digest(state),
  observedHash: observed.finalHash,
  observedTicks: observed.ticks,
  equal: true,
  missingDetailedShotIds: missing,
  captured,
};
writeFileSync(
  'docs/performance/pr182-evidence/selected-policy-full-replay-shot-coverage.json.gz',
  gzipSync(JSON.stringify(result)),
);
const { captured: omit, ...summary } = result;
void omit;
writeFileSync(
  'docs/performance/PR182-selected-integrity.json',
  JSON.stringify(
    { ...summary, allFiveWindows: 'PR182-integrity.json', snapshots: captured.length },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(summary));
