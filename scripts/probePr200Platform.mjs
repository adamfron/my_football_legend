import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { withIntegrationProfile } from '../src/core/matchSimulation/integrationProfile.ts';
import { readDevelopmentInput } from './pr193Evidence.mjs';
import { ROOT, read, write, hash, identity } from './pr200Evidence.mjs';

// Engineering diagnostic only. Retain exact values rather than round away drift.
const body = (s) => ({
  ball: s.ball,
  players: s.players.map((p) => ({
    id: p.id,
    position: p.position,
    velocity: p.velocity,
    facingAngle: p.facingAngle,
    target: p.target,
  })),
});
const run = () => {
  const { input } = readDevelopmentInput('sw', 'state-value-v1');
  let state = withIntegrationProfile(
    globalThis.structuredClone(input),
    'canonical-pr199',
    'state-value-v1',
  );
  state.seed = 'pr200-development-sw-state-value-v1';
  const initialHash = hash(state),
    samples = [];
  for (let tick = 1; tick <= 4000; tick++) {
    state = step(state, 0.025);
    if (tick <= 40 || tick % 200 === 0)
      samples.push({
        tick,
        stateHash: hash(state),
        fields: Object.fromEntries(Object.entries(state).map(([key, value]) => [key, hash(value)])),
        body: body(state),
      });
  }
  return { initialHash, samples, finalHash: hash(state) };
};
const result = run();
assert.equal(hash(result), hash(run()), 'Same-platform canonical replay drift');
const path = `${ROOT}/platform-probe-win32-v2.json.gz`;
if (process.argv.includes('--record')) {
  assert.equal(process.platform, 'win32');
  write(path, { source: identity(), platform: process.platform, node: process.version, result });
} else {
  const original = read(path);
  const first = result.samples.find((s, i) => s.stateHash !== original.result.samples[i].stateHash);
  if (process.platform === original.platform && process.version === original.node)
    assert.equal(hash(result), hash(original.result), 'Recorded-platform checkpoint drift');
  console.log(
    'PR200 platform probe',
    JSON.stringify({
      platform: process.platform,
      node: process.version,
      initialHash: result.initialHash,
      expectedInitialHash: original.result.initialHash,
      samePlatformRepeat: true,
      firstDifferentTick: first?.tick ?? null,
      finalHash: result.finalHash,
      recordedFinalHash: original.result.finalHash,
    }),
  );
  if (first) {
    const old = original.result.samples.find((s) => s.tick === first.tick);
    console.log(
      'PR200 first different root fields',
      JSON.stringify(
        Object.keys(first.fields).filter((key) => first.fields[key] !== old.fields[key]),
      ),
    );
    for (const key of ['ball', 'players'])
      if (hash(first.body[key]) !== hash(old.body[key]))
        console.log(
          'PR200 platform first body difference',
          key,
          JSON.stringify({ actual: first.body[key], recorded: old.body[key] }),
        );
  }
}
console.log(
  'PR200 same-platform repeat PASS; cross-platform identity is separately reported, never rounded',
);
