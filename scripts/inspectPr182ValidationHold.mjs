import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import console from 'node:console';
import { configureMatchPolicy } from '../src/core/matchSimulation/roleExperiment.ts';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions.ts';
import { canReleaseControlledAction } from '../src/core/matchSimulation/decisionReadiness.ts';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { forecastWaiting } from '../src/core/matchSimulation/roleTactics.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { digest, pr182SourceHash, pr182CandidateHash } from './pr182Evidence.mjs';
const id = 'pr182-sealed-sw-2',
  policy = 'phase-role-hybrid-v1';
const input = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr182-evidence/validation.json.gz')),
).find((f) => f.design.id === id);
const freeze = JSON.parse(readFileSync('docs/performance/PR182-freeze.json'));
if (freeze.candidateHash !== pr182CandidateHash() || digest(input.state) !== input.inputHash)
  throw Error('Candidate/input mismatch');
let state = configureMatchPolicy(globalThis.structuredClone(input.state), policy);
while (state.time < 330) state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
const captured = globalThis.structuredClone(state),
  owner = state.players.find((p) => p.id === state.ball.ownerId);
if (!owner) throw Error('Expected reproduced owner');
writeFileSync(
  'docs/performance/pr182-evidence/validation-r3-sw2-hold-state.json.gz',
  gzipSync(JSON.stringify(state)),
);
const snapshot = (s) => {
  const p = s.players.find((p) => p.id === owner.id);
  return {
    at: s.time,
    owner: s.ball.ownerId,
    player: p,
    ball: s.ball,
    contact: s.controlledBallContact,
    preparation: s.onBallPreparation,
    geometry: p ? playerContactGeometry(p) : null,
    releasePossible: p ? canReleaseControlledAction(s, p) : false,
    waiting: p ? forecastWaiting(s, p).diagnostic : null,
    rank: p ? rankAvailableActionsForAI(s, p.id).slice(0, 8) : [],
  };
};
const before = snapshot(state),
  checkpoints = [],
  actions = {};
let releaseEligibleTicks = 0,
  eligibleSnapshot;
for (let tick = 0; tick < 1200; tick++) {
  const p = state.players.find((p) => p.id === owner.id);
  if (p && canReleaseControlledAction(state, p)) {
    releaseEligibleTicks++;
    eligibleSnapshot ??= snapshot(state);
  }
  const previous = state;
  state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  if (state.decisionIndex !== previous.decisionIndex)
    actions[state.latestAction?.type ?? 'none'] =
      (actions[state.latestAction?.type ?? 'none'] ?? 0) + 1;
  if ([79, 399, 1199].includes(tick)) checkpoints.push(snapshot(state));
}
const result = {
  method:
    'Post-validation diagnosis of a consumed primary R3 SW2 hold. Exact unchanged candidate and input, no repair, no independent frequency claim. Replay to 330s, then thirty physical seconds with actual release eligibility and action/ranking checkpoints.',
  id,
  policy,
  sourceHash: pr182SourceHash(),
  candidateHash: pr182CandidateHash(),
  inputHash: input.inputHash,
  capturedHash: digest(captured),
  finalHash: digest(state),
  before,
  releaseEligibleTicks,
  eligibleSnapshot,
  totalTicks: 1200,
  actions,
  checkpoints,
};
writeFileSync(
  'docs/performance/pr182-evidence/validation-r3-sw2-hold-diagnosis.json.gz',
  gzipSync(JSON.stringify(result)),
);
console.log(
  JSON.stringify({
    id,
    policy,
    owner: owner.id,
    releaseEligibleTicks,
    actions,
    before: {
      time: before.at,
      releasePossible: before.releasePossible,
      waiting: before.waiting,
      rank: before.rank.map((r) => ({ type: r.action.type, value: r.canonicalScore })),
    },
    after: { time: state.time, owner: state.ball.ownerId },
  }),
);
