/* global console */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { gzipSync } from 'node:zlib';
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
  'pr146-flow-reference:a': 'ebfcf0b49864060e7f149252618373ee39fe30d84605d40c2fbd479345759937',
  'pr146-flow-reference:b': 'd8d15d8c173ec5bfc500accc20ff980f1d27efd84a472de79d1750f333e396ef',
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
      decisionPolicy: 'legacy-pr176',
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
            resolve('scripts/benchmarkPr182Telemetry.mjs'),
            `--engine-root=${root}`,
            `--seed=${key}`,
          ],
          { encoding: 'utf8', maxBuffer: 1024 * 1024 },
        );
        const output = JSON.parse(raw);
        if (label === 'before')
          assert.equal(output.sha256, seeds[key], 'Pristine PR181 golden mismatch');
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
    // Initial tactical destinations may change; the requested session and physical start factory are identical.
    const fields = Object.keys(before.telemetry).sort();
    assert.deepEqual(fields, Object.keys(after.telemetry).sort());
    return {
      seed,
      initialStateEqual: before.initialStateHash === after.initialStateHash,
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
    'docs/performance/PR182-telemetry-reference.json',
    JSON.stringify(
      {
        version: 1,
        baselineCommit: 'b9c7bfb8dd341f258d684f19fba1ebd4c849a888',
        finalSourceHash: pr172SourceHash(),
        method:
          'Fresh serial child process for each seed/repetition/engine. Same two 2400-tick explicit-legacy canonical fixtures as the complete telemetry reference test. Pristine PR181 exact old hashes required, complete telemetry and canonical states repeat exactly, every exported field and identity-ledger/schema invariant retained. Shared coaching, role allocation and physical preparation intentionally change trajectories; no field, tick or assertion removed. Default promotion is tested separately.',
        comparisons,
        records: Object.fromEntries(
          Object.entries(records).map(([label, rows]) => [
            label,
            rows.map(({ seed, repetition, output }) => ({
              seed,
              repetition,
              sha256: output.sha256,
              initialStateHash: output.initialStateHash,
              finalStateHash: output.finalStateHash,
            })),
          ]),
        ),
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    'docs/performance/pr182-evidence/telemetry-reference.json.gz',
    gzipSync(JSON.stringify(records)),
  );
}
