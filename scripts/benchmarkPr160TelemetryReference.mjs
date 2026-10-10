import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const argumentsByName = new Map(
  process.argv.slice(2).map((argument) => {
    const [name, ...value] = argument.replace(/^--/, '').split('=');
    return [name, value.join('=')];
  }),
);
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
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sourceHash = (root) => {
  const paths = [];
  const walk = (relative) => {
    for (const item of readdirSync(resolve(root, relative), { withFileTypes: true })) {
      const path = `${relative}/${item.name}`;
      if (item.isDirectory()) walk(path);
      else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) paths.push(path);
    }
  };
  walk('src/core/matchSimulation');
  paths.push('src/core/singleMatch.ts', 'scripts/createCanonicalWorldDatabase.ts');
  const digest = createHash('sha256');
  for (const path of paths.sort())
    digest
      .update(path)
      .update('\0')
      .update(readFileSync(resolve(root, path)))
      .update('\0');
  return digest.digest('hex');
};
const previousHashes = {
  'pr146-flow-reference:a': '4f57214717cf0333e33d1f87efd6f558e3c93e2260454ed6de0391bbb9a09352',
  'pr146-flow-reference:b': 'fe08348ff81b80757263e317045b7700d0f1c1651efdb871b1fdcd532b61a1e0',
};

if (argumentsByName.has('worker')) {
  const root = resolve(argumentsByName.get('root'));
  const seed = argumentsByName.get('seed');
  const load = (path) => import(pathToFileURL(resolve(root, path)).href);
  const [{ createCanonicalWorldDatabase }, { createSingleMatchSession }, simulation, flow] =
    await Promise.all([
      load('scripts/createCanonicalWorldDatabase.ts'),
      load('src/core/singleMatch.ts'),
      load('src/core/matchSimulation/matchSimulation.ts'),
      load('src/core/matchSimulation/matchFlowTelemetry.ts'),
    ]);
  const world = createCanonicalWorldDatabase();
  let state = simulation.createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0].id,
      awayClubId: world.clubs[1].id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  let telemetry = flow.createMatchFlowTelemetry(seed);
  for (let tick = 0; tick < 2400; tick++) {
    const previous = state;
    state = simulation.stepTacticalMatch(state, simulation.FIXED_MATCH_DT);
    telemetry = flow.observeMatchFlow(telemetry, previous, state);
  }
  flow.assertTelemetryInvariants(telemetry);
  flow.matchFlowTelemetrySchema.parse(telemetry);
  assert.ok(!('restart' in telemetry.turnoverCauses));
  assert.equal(
    Object.values(telemetry.turnoverCauses).reduce((sum, count) => sum + count, 0),
    telemetry.observedPossessionLossIds.length,
  );
  assert.equal(telemetry.restartAwards, telemetry.observedRestartAwardIds.length);
  const sha256 = hash(stableJson(telemetry));
  writeFileSync(
    resolve(argumentsByName.get('output')),
    `${JSON.stringify({ seed, sha256, telemetry }, null, 2)}\n`,
  );
  console.log(`${seed}: ${sha256}`);
} else {
  const current = process.cwd();
  const baseline = resolve(argumentsByName.get('baseline') ?? '../pr160-baseline');
  const directory = resolve(argumentsByName.get('directory') ?? '../pr160-telemetry-reference');
  const output = resolve(
    argumentsByName.get('output') ?? 'docs/performance/PR160-telemetry-reference.json',
  );
  mkdirSync(directory, { recursive: true });
  const records = {};
  for (const [revision, root] of [
    ['before', baseline],
    ['after', current],
  ]) {
    const frozenHash = sourceHash(root);
    const outputs = [];
    for (let repetition = 1; repetition <= 2; repetition++) {
      for (const seed of Object.keys(previousHashes)) {
        const sampleOutput = resolve(directory, `${revision}-${seed.at(-1)}-${repetition}.json`);
        await new Promise((completed, failed) => {
          const child = spawn(
            process.execPath,
            [
              '--experimental-transform-types',
              '--import',
              './scripts/registerTypescriptLoader.mjs',
              fileURLToPath(import.meta.url),
              '--worker=true',
              `--root=${root}`,
              `--seed=${seed}`,
              `--output=${sampleOutput}`,
            ],
            { cwd: root, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true },
          );
          child.on('error', failed);
          child.on('exit', (code) =>
            code === 0 ? completed() : failed(new Error(`Telemetry worker exited ${code}`)),
          );
        });
        assert.equal(sourceHash(root), frozenHash, 'Source changed during telemetry reproduction.');
        const sample = JSON.parse(readFileSync(sampleOutput, 'utf8'));
        if (revision === 'before')
          assert.equal(sample.sha256, previousHashes[seed], 'Pristine PR159 reference mismatch.');
        const previous = outputs.find((record) => record.seed === seed);
        if (previous) assert.equal(stableJson(previous.telemetry), stableJson(sample.telemetry));
        outputs.push({ ...sample, repetition });
        console.log(`${revision} repetition ${repetition}: ${sample.sha256}`);
      }
    }
    records[revision] = { canonicalSourceHash: frozenHash, outputs };
  }
  const comparisons = Object.keys(previousHashes).map((seed) => {
    const before = records.before.outputs.find((record) => record.seed === seed);
    const after = records.after.outputs.find((record) => record.seed === seed);
    const fields = Object.keys(after.telemetry).sort();
    assert.equal(stableJson(Object.keys(before.telemetry).sort()), stableJson(fields));
    return {
      seed,
      beforeHash: before.sha256,
      afterHash: after.sha256,
      exportedFields: fields,
      unchangedFields: fields.filter(
        (field) => stableJson(before.telemetry[field]) === stableJson(after.telemetry[field]),
      ),
      changedFields: fields.filter(
        (field) => stableJson(before.telemetry[field]) !== stableJson(after.telemetry[field]),
      ),
    };
  });
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        experiment: 'PR160 complete telemetry reference (PR146 observer contract)',
        baselineCommit: '09c05fa',
        ticks: 2400,
        fixedStepSeconds: 0.025,
        repetitionsPerSeedAndRevision: 2,
        methodology:
          'Eight fresh sequential Node processes; same two seeds and full 2400-tick spectator fixture. All exported fields, schema and identity-ledger assertions retained.',
        checks: {
          pristinePR159ReferencesReproduced: true,
          completeSortedAllFieldRepeatIdentity: true,
          allExportedFieldsPreserved: true,
          runtimeSchemasPassed: true,
          telemetryInvariantsPassed: true,
          possessionIdentityLedgerPassed: true,
          restartIdentityLedgerPassed: true,
        },
        comparisons,
        records,
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify({ output, comparisons }, null, 2));
}
