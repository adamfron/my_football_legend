import assert from 'node:assert/strict';
import console from 'node:console';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { sampleCanonicalOutcome } from '../src/core/matchSimulation/canonicalOutcome.ts';
import {
  createSensor,
  sampleSensor,
  physicalBall,
  predictFlightBelief,
} from './pr199FlightLab.mjs';
import { hash, finish, identity, options } from './pr199Evidence.mjs';
const source = identity(),
  rows = [];
for (const scenario of ['good_shot', 'blocked_shot', 'rebound'])
  for (const sample of [0, 1]) {
    const f = createCalibrationFixture({
      scenario,
      attacker: 80,
      defender: 60,
      seed: `pr199-neutrality-${sample}`,
      mirror: sample === 1,
    });
    const initial = resolveMatchAction(f.state, f.action, 'autonomous_npc');
    assert.ok(initial.ball.shot);
    const runs = [];
    for (const mode of ['bare', 'passive', 'hostile-copy']) {
      let state = globalThis.structuredClone(initial);
      const keeper = state.players.find(
        (p) => p.team === 'away' && p.slot.position === 'goalkeeper',
      );
      const sensor = createSensor(keeper, state.seed),
        samples = [];
      for (let tick = 0; tick < 160; tick++) {
        if (mode !== 'bare') {
          const p = state.players.find((p) => p.id === keeper.id);
          if (p) sampleSensor(sensor, p, physicalBall(state.ball), state.time, true);
          const payload = globalThis.structuredClone({
            belief: sensor.belief,
            forecast: predictFlightBelief(sensor.belief, state.time),
          });
          if (mode === 'hostile-copy' && payload.belief) {
            payload.belief.position.x = -999;
            payload.belief.observations = 999;
          }
        }
        const before = state;
        state = step(state, 0.025);
        samples.push(sampleCanonicalOutcome(before, state, 'original-delivery-v3'));
        if (state.postGoal) break;
      }
      runs.push({
        mode,
        finalHash: hash(state),
        samplesHash: hash(samples),
        score: state.score,
        shot: state.lastShot ?? null,
      });
    }
    for (const r of runs.slice(1)) {
      assert.equal(r.finalHash, runs[0].finalHash);
      assert.equal(r.samplesHash, runs[0].samplesHash);
    }
    rows.push({ scenario, sample, inputHash: hash(initial), runs });
  }
finish(`neutrality-${options.get('version') ?? 'v1'}.json.gz`, {
  schema: 'pr199-native-observer-neutrality-v1',
  source,
  method:
    'Six actual native shot continuations, each bare versus passive flight sensor/forecast logger versus hostile copies. No actor observation hook is installed. Complete canonical physical/sample hashes must agree.',
  rows,
});
console.log('PR199 bare/passive/hostile keeper observer neutrality PASS', rows.length, 'triplets');
