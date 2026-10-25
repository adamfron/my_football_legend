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
  'pr146-flow-reference:a': '9a8ac72218c1641bc9f51eab45f1ee7c42b19f3506b4209efeabfb4d494b497e',
  'pr146-flow-reference:b': '2b5b93ed4e2891e7c17e374d1b6cb20f1cdf79e05f42d9035a43e3bfafdf1a6a',
};
if (args.has('seed')) {
  const seed = args.get('seed'),
    root = resolve(args.get('engine-root'));
  const load = (p) => import(pathToFileURL(resolve(root, p)));
  const [{ createCanonicalWorldDatabase }, { createSingleMatchSession }, sim, flow] =
    await Promise.all([
      import('./createCanonicalWorldDatabase.ts'),
      import('../src/core/singleMatch.ts'),
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
  const version = args.get('version') ?? 'final';
  const output = `docs/performance/pr190/telemetry-reference-${version}.json`;
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
              resolve('scripts/benchmarkPr190Telemetry.mjs'),
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
            'Pristine PR189 complete telemetry changed',
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
    `docs/performance/pr190/telemetry-reference-payloads-${version}.json.gz`,
    gzipSync(JSON.stringify(records)),
  );
  writeFileSync(
    output,
    JSON.stringify(
      {
        schemaVersion: 1,
        baselineCommit: '1af5b5c130b8707c9febb77b7bbc7cbc36bd0ea1',
        ticks: 2400,
        classification:
          'eight fresh serial processes; full sorted telemetry, every schema and identity assertion retained; shared physical reception and pass forecast intentionally change football',
        comparisons,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(comparisons));
}
