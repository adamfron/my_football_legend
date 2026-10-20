import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
import { pr172SourceHash } from './pr172Evidence.ts';
const receiptPrefix = process.argv.find((arg) => arg.startsWith('--prefix='))?.split('=')[1] ?? 'PR177';
if (!/^PR\d+$/.test(receiptPrefix)) throw new Error('Invalid receipt prefix');
import { createReformFixture } from './pr177Fixtures.ts';
import { enumerateStateValueActions } from '../src/core/matchSimulation/decisionPolicy.ts';
import { evaluateStateValueAction } from '../src/core/matchSimulation/decisionStateValue.ts';
import { deriveFeasiblePassPlans } from '../src/core/matchSimulation/passLaunchPlan.ts';
import { evaluatePassDecision } from '../src/core/matchSimulation/passDecision.ts';
import { resolveMatchAction, scoreActionForAI } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { evaluateTransitionOpportunity } from '../src/core/matchSimulation/attackingTransition.ts';

const original = JSON.parse(gunzipSync(readFileSync(receiptPrefix === 'PR178'
  ? 'docs/performance/pr178-evidence/historical-controlled-input.json.gz'
  : '../pr176-inputs/pr175-natural.json.gz')))[0];
const historicalSensitivity = JSON.parse(readFileSync('docs/performance/PR176-sensitivity.json', 'utf8')).rows.filter((r) => r.factor === 'passerGameReading');
const receiverId = historicalSensitivity[0].receiverId;
const reading = [];
for (const value of [20, 40, 60, 80, 99]) {
  const state = globalThis.structuredClone(original.state); state.decisionPolicy = 'state-value-v1';
  const actor = state.players.find((p) => p.id === original.actorId), receiver = state.players.find((p) => p.id === receiverId);
  actor.profile.attributes.gameReading = value;
  const target = receiver.position, deliveryPlan = deriveFeasiblePassPlans(state, actor, receiver, target, 'progressive')[0];
  const action = { type: 'pass', actorId: actor.id, receiverId, target, intent: 'progressive', deliveryPlan };
  const originalEligibility = evaluateStateValueAction(state, actor, action) ?? null;
  // Separate explicit prepared counterfactual: same positions, velocities, players, ball, time and
  // target. Only the already documented physical preparation clock/contact gate is settled.
  delete state.onBallPreparation; delete state.lastGroundContact;
  const prepared = evaluateStateValueAction(state, actor, action);
  reading.push({ value, historicalLegacyScore: historicalSensitivity.find((r) => r.value === value)?.passScore ?? null,
    target, receiverId, originalEligibility, preparedCounterfactual: prepared ?? null,
    preparedScore: scoreActionForAI(state, actor.id, action),
    forecast: evaluatePassDecision(state, actor, receiver, target, 'progressive', 'ground', deliveryPlan) });
}
const receiving = [];
for (const scenario of ['stationary-winger', 'covering-defender', 'diagonal-run']) {
  const { state, actor, runner } = createReformFixture(scenario);
  const spatial = enumerateStateValueActions(state, actor).filter((a) => a.type === 'pass' && a.receiverId === runner.id && a.requestedSpace);
  for (const action of spatial.slice(0, 2)) {
    let s = resolveMatchAction(state, action, 'dev_ai_selected');
    const passId = s.lastPassDiagnostic?.passId, checkpoints = [];
    let result = null;
    for (let tick = 0; tick < 320; tick++) {
      s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
      if (!result && s.lastResolvedPass?.passId === passId && s.lastResolvedPass.finalResult) result = globalThis.structuredClone(s.lastResolvedPass);
      if ([1, 4, 8, 20, 80, 200, 320].includes(tick + 1)) {
        const receiver = s.players.find((p) => p.id === runner.id);
        checkpoints.push({ seconds: (tick + 1) / 40, receiver: { position: receiver.position, velocity: receiver.velocity, target: receiver.target }, ball: s.ball });
      }
    }
    receiving.push({ scenario, originalPosition: runner.position, originalVelocity: runner.velocity, action, result, checkpoints });
  }
}
const recoveries = [];
for (const travelKind of ['corner_delivery', 'free_kick_delivery', 'cross']) {
  const { state, actor, opponents } = createReformFixture('corner-counter');
  state.possessionTeam = opponents[0].team; delete state.lastPossessionChange;
  state.ball = { x: actor.position.x - 0.35, y: actor.position.y, height: 0.11, velocity: { x: 2, y: 0, z: 0 },
    from: { x: actor.position.x - 8, y: actor.position.y }, target: actor.position,
    travelKind, sourceAction: 'cross', lastTouchPlayerId: opponents[0].id };
  const originalTeam = state.possessionTeam;
  let s = state, changed = null; const checkpoints = [];
  for (let tick = 0; tick < 320; tick++) {
    s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
    if (!changed && s.possessionTeam !== originalTeam) {
      const owner = s.players.find((p) => p.id === (s.ball.ownerId ?? s.lastPossessionChange?.winnerId));
      changed = { at: s.time, fact: s.lastPossessionChange, ownerId: owner?.id, exposure: owner ? evaluateTransitionOpportunity(s, owner) : null };
    }
    if ([80, 200, 320].includes(tick + 1)) checkpoints.push({ seconds: (tick + 1) / 40, ball: s.ball, possession: s.possessionTeam, action: s.latestAction,
      players: s.players.map((p) => ({ id: p.id, position: p.position, velocity: p.velocity })), loss: s.lastPossessionLoss });
  }
  recoveries.push({ travelKind, method: 'Actual canonical control of a prescribed incoming delivery; full preceding set-piece setup is not simulated', changed, checkpoints });
}
writeFileSync(`docs/performance/${receiptPrefix}-regressions.json`, JSON.stringify({ version: 1, reading, receiving, recoveries,
  ...(receiptPrefix === 'PR178' ? { sourceHash: pr172SourceHash() } : {}) }, null, 2) + '\n');
console.log(JSON.stringify({ reading: reading.map((r) => [r.value, r.preparedScore]), receiving: receiving.map((r) => [r.scenario, r.result?.finalResult]), recoveries: recoveries.map((r) => [r.travelKind, r.changed?.exposure?.active]) }));
