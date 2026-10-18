/* global console */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { pr172SourceHash } from './pr172Evidence.ts';
import { strict as assert } from 'node:assert';

const argument = (key) =>
  process.argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const stableJson = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
const hash = (value) => createHash('sha256').update(stableJson(value)).digest('hex');
const seeds = {
  'pr146-flow-reference:a': '82f33657a3d7a0af9586db12f432e8234e0743056382989faef4378e6392b430',
  'pr146-flow-reference:b': '3f1d83f95cc0795806c523398dae71850b3bd901e74b56ea189b33c33fa5f416',
};
const seed = argument('seed');
if (seed) {
  assert(seed in seeds);
  const root = resolve(argument('engine-root'));
  const load = (path) => import(pathToFileURL(resolve(root, path)).href);
  const [{ createCanonicalWorldDatabase }, { createSingleMatchSession }, sim, flow] =
    await Promise.all([
      load('scripts/createCanonicalWorldDatabase.ts'),
      load('src/core/singleMatch.ts'),
      load('src/core/matchSimulation/matchSimulation.ts'),
      load('src/core/matchSimulation/matchFlowTelemetry.ts'),
    ]);
  const world = createCanonicalWorldDatabase();
  let state = sim.createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0].id,
      awayClubId: world.clubs[1].id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  const initialStateHash = hash(state);
  let telemetry = flow.createMatchFlowTelemetry(seed);
  for (let tick = 0; tick < 2400; tick++) {
    const previous = state;
    state = sim.stepTacticalMatch(state, sim.FIXED_MATCH_DT);
    telemetry = flow.observeMatchFlow(telemetry, previous, state);
  }
  flow.assertTelemetryInvariants(telemetry);
  flow.matchFlowTelemetrySchema.parse(telemetry);
  assert(!('restart' in telemetry.turnoverCauses));
  assert.equal(
    Object.values(telemetry.turnoverCauses).reduce((n, v) => n + v, 0),
    telemetry.observedPossessionLossIds.length,
  );
  assert.equal(telemetry.restartAwards, telemetry.observedRestartAwardIds.length);
  process.stdout.write(
    JSON.stringify({
      seed,
      initialStateHash,
      finalStateHash: hash(state),
      sha256: hash(telemetry),
      telemetry,
    }),
  );
} else {
  const baseline = argument('baseline-root');
  assert(baseline, '--baseline-root is required');
  const records = {};
  for (const [label, root] of [
    ['before', resolve(baseline)],
    ['after', resolve('.')],
  ]) {
    records[label] = [];
    for (let repetition = 1; repetition <= 2; repetition++)
      for (const key of Object.keys(seeds)) {
        const raw = execFileSync(
          process.execPath,
          [
            '--experimental-transform-types',
            '--import',
            pathToFileURL(resolve('scripts/registerTypescriptLoader.mjs')).href,
            resolve('scripts/benchmarkPr174Telemetry.mjs'),
            `--engine-root=${root}`,
            `--seed=${key}`,
          ],
          { encoding: 'utf8', maxBuffer: 1024 * 1024 },
        );
        const output = JSON.parse(raw);
        if (label === 'before')
          assert.equal(output.sha256, seeds[key], 'Pristine PR173 golden mismatch');
        const previous = records[label].find((r) => r.seed === key);
        if (previous)
          assert.equal(stableJson(previous.output), stableJson(output), 'Complete repeat differs');
        records[label].push({ seed: key, repetition, output });
        console.log(`${label} ${key} repeat ${repetition}: ${output.sha256}`);
      }
  }
  const comparisons = Object.keys(seeds).map((seed) => {
    const before = records.before.find((r) => r.seed === seed).output,
      after = records.after.find((r) => r.seed === seed).output;
    assert.equal(before.initialStateHash, after.initialStateHash);
    const fields = Object.keys(before.telemetry).sort();
    assert.deepEqual(fields, Object.keys(after.telemetry).sort());
    return {
      seed,
      beforeHash: before.sha256,
      afterHash: after.sha256,
      fields,
      changedFields: fields.filter(
        (k) => stableJson(before.telemetry[k]) !== stableJson(after.telemetry[k]),
      ),
    };
  });
  mkdirSync('docs/performance', { recursive: true });
  writeFileSync(
    'docs/performance/PR174-telemetry-reference.json',
    JSON.stringify(
      {
        version: 1,
        baselineCommit: 'c4991232cefff1a26fbacd599bd8700e46d76d52',
        finalSourceHash: pr172SourceHash(),
        method:
          'Fresh serial child process for each seed/repetition/engine. Same two 2400-tick canonical fixtures as the complete telemetry reference test. Pristine PR173 exact old hashes required, complete telemetry and canonical states repeat exactly, every exported field and identity-ledger/schema invariant retained. Bounded cooperative movement and contextual decisions intentionally change trajectories; no field or assertion removed.',
        comparisons,
        records,
      },
      null,
      2,
    ) + '\n',
  );
}
