import process from 'node:process';
import console from 'node:console';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { evaluatePassDecision } from '../src/core/matchSimulation/passDecision.ts';
import { beginVerticalJump } from '../src/core/matchSimulation/bodyMechanics.ts';
import { traceRequest } from './pr197Trace.mjs';
import { sourceIdentity, argumentsMap, finish } from './pr197Evidence.mjs';
const args = argumentsMap(),
  identity = sourceIdentity(),
  rows = [];
const conditions = [
  'low_ground',
  'above_foot',
  'descending',
  'aerial_access',
  'late_jump',
  'facing_away',
  'accelerating',
  'two_defenders',
  'overhit_request',
  'outside_foot_geometry',
  'strong_aerial_defender',
];
for (const condition of conditions)
  for (const skill of [20, 60, 100]) {
    const f = createCalibrationFixture({
      scenario: 'long_pass',
      attacker: 80,
      defender: skill,
      seed: 'pr197-interception-' + condition,
    });
    const a = f.state.players.find((p) => p.id === f.actorId),
      r = f.state.players.find((p) => p.id === f.receiverId),
      d = f.state.players.find((p) => p.id === f.defenderId);
    for (const [i, p] of f.state.players.filter((p) => p.team !== a.team).entries()) {
      p.position = { x: 100, y: 3 + i * 5.5 };
      p.target = { ...p.position };
      p.anchor = { ...p.position };
      p.neutralAnchor = { ...p.position };
    }
    d.position = { x: 60, y: 30 };
    d.target = { ...d.position };
    d.facingAngle = Math.PI / 2;
    if (condition === 'low_ground') f.action.delivery = 'ground';
    if (['descending', 'aerial_access', 'strong_aerial_defender'].includes(condition))
      d.position = { x: 78, y: 26 };
    if (condition === 'strong_aerial_defender') {
      d.profile.attributes.jumping = 100;
      d.profile.attributes.heading = 100;
      d.profile.attributes.gameReading = 100;
    }
    if (condition === 'late_jump')
      d.verticalJump = beginVerticalJump(d, { armAssistance: true, approach: false });
    if (condition === 'facing_away') d.facingAngle = -Math.PI / 2;
    if (condition === 'accelerating') d.velocity = { x: 5, y: 0 };
    if (condition === 'two_defenders') {
      const other = f.state.players.find(
        (p) => p.team !== a.team && p.id !== d.id && p.slot.position !== 'goalkeeper',
      );
      other.position = { x: 78, y: 26 };
      other.target = { ...other.position };
    }
    if (condition === 'overhit_request') f.action.target = { x: 103, y: 3 };
    if (condition === 'outside_foot_geometry') {
      f.action.delivery = 'ground';
      d.position = { x: 62, y: 35 };
    }
    for (const model of ['baseline', 'height', 'physical']) {
      const state = {
        ...f.state,
        experimentalHeightAwarePassing: model !== 'baseline',
        experimentalDefensiveReception: model === 'physical',
      };
      const forecast = evaluatePassDecision(
        state,
        a,
        r,
        f.action.target,
        f.action.intent,
        f.action.delivery,
      );
      const trial = traceRequest({ ...f, state });
      rows.push({ condition, skill, model, forecast, ...trial.row });
    }
    console.log('interception', rows.length, condition);
  }
finish(
  `docs/performance/pr197/interception-${args.get('version') ?? 'v1'}.json.gz`,
  {
    schema: 'pr197-interception-v1',
    source: identity,
    method:
      'Controlled initial geometry, three defender bands and separate forecast-only/physical switches. Scene names are hypotheses; actual canonical contacts and controls decide the outcome.',
    blocker:
      'A new autonomous jump scheduler is not implemented. late_jump begins an actual existing preparation lifecycle; no future takeoff is granted by the forecast.',
    rows,
  },
  { memory: process.memoryUsage(), cpu: process.cpuUsage() },
  args.has('check'),
);
