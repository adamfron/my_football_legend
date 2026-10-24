import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { strict as assert } from 'node:assert';
import process from 'node:process';
import console from 'node:console';
const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const stable = (v) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]]),
        )
      : x,
  );
const sha = (v) => createHash('sha256').update(stable(v)).digest('hex');
const oldHashes = {
  'pr146-flow-reference:a': '2a6a9a7abd3aa81def55965bc0ee1a06b708aa31156a6c1ba90afb964e523739',
  'pr146-flow-reference:b': '5e930dac7d25edda5a141eb87c4678d7a842d8bfe01f542295e8b539138141c0',
};
if (args.has('seed')) {
  const seed = args.get('seed'),
    root = resolve(args.get('engine-root'));
  const load = (p) => import(pathToFileURL(resolve(root, p)));
  const [{ createCanonicalWorldDatabase }, { createSingleMatchSession }, sim, flow] =
    await Promise.all([
      load('scripts/createCanonicalWorldDatabase.ts'),
      load('src/core/singleMatch.ts'),
      load('src/core/matchSimulation/matchSimulation.ts'),
      load('src/core/matchSimulation/matchFlowTelemetry.ts'),
    ]);
  const world = createCanonicalWorldDatabase();
  let state = sim.createOpenPlayMatchFixture(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0].id,
      awayClubId: world.clubs[1].id,
      seed,
      decisionPolicy: 'legacy-pr176',
      control: { mode: 'spectator' },
    }),
  );
  const inputSha256 = sha(state);
  let telemetry = flow.createMatchFlowTelemetry(seed);
  for (let i = 0; i < 2400; i++) {
    const before = state;
    state = sim.stepTacticalMatch(state, sim.FIXED_MATCH_DT);
    telemetry = flow.observeMatchFlow(telemetry, before, state);
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
      inputSha256,
      telemetrySha256: sha(telemetry),
      stateSha256: sha(state),
      telemetry,
    }),
  );
} else {
  const output = 'docs/performance/pr189/telemetry-reference.json';
  if (existsSync(output)) throw Error('Preserve reference evidence');
  const records = { before: [], after: [] };
  for (const [label, root] of [
    ['before', resolve(args.get('baseline-root'))],
    ['after', resolve('.')],
  ])
    for (let repeat = 1; repeat <= 2; repeat++)
      for (const seed of Object.keys(oldHashes)) {
        const result = JSON.parse(
          execFileSync(
            process.execPath,
            [
              '--experimental-transform-types',
              '--import',
              pathToFileURL(resolve('scripts/registerTypescriptLoader.mjs')).href,
              resolve('scripts/benchmarkPr189Telemetry.mjs'),
              `--engine-root=${root}`,
              `--seed=${seed}`,
            ],
            { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, windowsHide: true },
          ),
        );
        if (label === 'before')
          assert.equal(
            result.telemetrySha256,
            oldHashes[seed],
            'Pristine PR188 complete telemetry changed',
          );
        const previous = records[label].find((r) => r.seed === seed);
        if (previous)
          assert.equal(
            stable(previous.result),
            stable(result),
            'Fresh process complete payload differs',
          );
        records[label].push({ seed, repeat, result });
        console.log(`${label} ${seed}/${repeat}: ${result.telemetrySha256}`);
      }
  const comparisons = Object.keys(oldHashes).map((seed) => {
    const before = records.before.find((r) => r.seed === seed).result,
      after = records.after.find((r) => r.seed === seed).result;
    assert.deepEqual(Object.keys(before.telemetry).sort(), Object.keys(after.telemetry).sort());
    return {
      seed,
      before: before.telemetrySha256,
      after: after.telemetrySha256,
      identicalInput: before.inputSha256 === after.inputSha256,
      fields: Object.keys(after.telemetry).length,
      changedFields: Object.keys(before.telemetry).filter(
        (k) => stable(before.telemetry[k]) !== stable(after.telemetry[k]),
      ),
    };
  });
  writeFileSync(
    'docs/performance/pr189/telemetry-reference-payloads.json.gz',
    gzipSync(JSON.stringify(records)),
  );
  writeFileSync(
    output,
    JSON.stringify(
      {
        schemaVersion: 1,
        baselineCommit: 'a74be9ee846ac4958fd67e42795cf3d86946e937',
        ticks: 2400,
        classification:
          'eight fresh serial processes; full sorted telemetry, every schema and identity assertion retained; shared finite recovery intentionally changes football',
        comparisons,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(comparisons));
}
