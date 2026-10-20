import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
import { configureMatchPolicy } from '../src/core/matchSimulation/roleExperiment.ts';
import {
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation.ts';
import {
  enumerateStateValueActions,
  rankStateValueActions,
} from '../src/core/matchSimulation/decisionPolicy.ts';
import { evaluateStateValueAction } from '../src/core/matchSimulation/decisionStateValue.ts';
import { canReleaseControlledAction } from '../src/core/matchSimulation/decisionReadiness.ts';
import { tacticalRoleFor } from '../src/core/matchSimulation/tacticalRoles.ts';
import {
  deriveTacticalRolePhase,
  forecastWaiting,
} from '../src/core/matchSimulation/roleTactics.ts';
import { pr172Hash as sha, pr172SourceHash } from './pr172Evidence.ts';
const input = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr179-evidence/initial-states.json.gz')),
).find((f) => f.design.id === 'pr179-dev-ss-1');
let state = configureMatchPolicy(globalThis.structuredClone(input.state), 'role-intent-v1');
let holder,
  began = 0,
  holds = 0;
while (state.time < 7200 && !['full_time', 'abandoned'].includes(state.status ?? '')) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  const previous = state;
  state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  if (state === previous) throw new Error('Canonical prefix stalled');
  if (state.decisionIndex !== previous.decisionIndex) {
    const action = state.latestAction;
    if (action?.type === 'hold' && state.ball.ownerId === action.actorId) {
      if (holder !== action.actorId) {
        holder = action.actorId;
        began = state.time;
        holds = 0;
      }
      holds++;
    } else {
      holder = undefined;
      holds = 0;
    }
  }
  if (holder && state.ball.ownerId !== holder) {
    holder = undefined;
    holds = 0;
  }
  if (holder && state.time - began > 65 && holds > 5) break;
}
if (!holder || holds < 5) throw new Error('Failed to reproduce the observed R2 holding failure');
const owner = state.players.find((p) => p.id === holder);
const candidates = enumerateStateValueActions(state, owner),
  ranking = rankStateValueActions(state, owner);
const observation = {
  sourceHash: pr172SourceHash(),
  runtime: process.version,
  fixtureId: input.design.id,
  inputHash: input.inputHash,
  capturedAt: state.time,
  captureHash: sha(state),
  consecutiveHolds: holds,
  role: tacticalRoleFor(state, owner).id,
  phase: deriveTacticalRolePhase(state, owner.team),
  owner: {
    id: owner.id,
    team: owner.team,
    slot: owner.slot,
    position: owner.position,
    velocity: owner.velocity,
    target: owner.target,
    attributes: owner.profile.attributes,
  },
  ball: state.ball,
  pressure: state.currentPressure,
  physicallyAbleToRelease: canReleaseControlledAction(state, owner),
  contact: state.controlledBallContact,
  preparation: state.onBallPreparation,
  lastGroundContact: state.lastGroundContact,
  keeperIntervention: state.keeperIntervention,
  forecast: forecastWaiting(state, owner).diagnostic,
  generated: candidates.map((action) => ({
    action,
    evaluated: evaluateStateValueAction(state, owner, action) ?? null,
  })),
  ranking,
  continuation: [],
};
writeFileSync(
  'docs/performance/pr179-evidence/r2-new-hold-state.json.gz',
  gzipSync(JSON.stringify(state)),
);
for (const policy of [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
]) {
  let s = { ...globalThis.structuredClone(state), decisionPolicy: policy },
    tick = 0;
  const checkpoints = [];
  for (const seconds of [2, 5, 8]) {
    while (tick < seconds * 40) {
      s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
      tick++;
    }
    checkpoints.push({
      seconds,
      hash: sha(s),
      action: s.latestAction,
      ownerId: s.ball.ownerId,
      ball: s.ball,
      shot: s.lastShot,
      pass: s.lastPassDiagnostic,
      score: s.score,
    });
  }
  observation.continuation.push({ policy, checkpoints });
}
writeFileSync(
  'docs/performance/PR179-stagnation-investigation.json',
  JSON.stringify(observation, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    capturedAt: state.time,
    role: observation.role,
    holder,
    holds,
    physicallyAbleToRelease: observation.physicallyAbleToRelease,
    generated: candidates.length,
    evaluated: ranking.length,
    selected: ranking[0],
    forecast: observation.forecast,
  }),
);
