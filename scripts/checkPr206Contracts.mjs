import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { runEpisode, fixture } from './pr206Episodes.mjs';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { hash } from './pr199Evidence.mjs';
const fixed = [20, 85].flatMap((reading) =>
  [20, 85].map((touch) => {
    const f = fixture({ seed: 'pr206-identical-world', reading, touch });
    f.c.profile.attributes.gameReading = 55;
    f.c.profile.attributes.firstTouch = 55;
    return hash(f.state);
  }),
);
assert.equal(new Set(fixed).size, 1, 'Only gameReading and firstTouch may change');
const execute = (loader) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      ['--experimental-transform-types', '--import', loader, 'scripts/pr206Parity.mjs'],
      { encoding: 'utf8', windowsHide: true },
    ),
  );
assert.deepEqual(
  execute('./scripts/registerPr206Lab.mjs'),
  execute('./scripts/registerTypescriptLoader.mjs'),
  'Null hooks changed physical final state',
);
for (const geometry of [0, 1, 2]) {
  const config = { seed: `pr206-contract-${geometry}`, geometry, duration: 0.95 };
  const on = runEpisode(config).row,
    off = runEpisode({ ...config, scenario: 'ablation' }).row;
  assert.ok(on.qualifies);
  assert.equal(off.clocks.command, null);
  const l = on.frames.at(-1),
    r = off.frames.at(-1);
  assert.ok(distance(l.position, r.position) > 0.1, 'Preparation must physically change state');
  assert.deepEqual(runEpisode(config).row, on, 'Same-world determinism');
}
const late = runEpisode({ seed: 'pr206-late-contract', scenario: 'late', duration: 0.95 }).row;
assert.equal(late.qualifies, false);
assert.ok(late.clocks.command > late.clocks.aRelease);
const unseen = runEpisode({
  seed: 'pr206-unseen-contract',
  scenario: 'unseen_ball',
  duration: 0.95,
}).row;
assert.equal(unseen.clocks.firstObservation, null);
assert.equal(unseen.clocks.command, null);
console.log(
  'PR206 real recognition, command causation, negative controls, null-hook parity and same-world determinism PASS',
);
