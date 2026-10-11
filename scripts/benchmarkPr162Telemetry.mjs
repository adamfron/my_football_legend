import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
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
  const digest = createHash('sha256');
  for (const path of paths.sort())
    digest
      .update(path.replace('src/core/matchSimulation/', ''))
      .update('\0')
      .update(readFileSync(resolve(root, path)))
      .update('\0');
  return digest.digest('hex');
};
const previousHashes = {
  'pr146-flow-reference:a': 'ced0737b03698f104bd1134a570f07497749ec1da53a32757875f90b41673468',
  'pr146-flow-reference:b': 'b245012ab69a7176d043866f0bb0002dd3724e6c440d88044905efe1a03335b6',
};
const records = {};
for (const [revision, root] of [
  ['before', resolve(repo, '../pr162-baseline')],
  ['after', repo],
]) {
  const load = (path) => import(pathToFileURL(resolve(root, path)).href);
  const [{ createCanonicalWorldDatabase }, { createSingleMatchSession }, simulation, flow] =
    await Promise.all([
      load('scripts/createCanonicalWorldDatabase.ts'),
      load('src/core/singleMatch.ts'),
      load('src/core/matchSimulation/matchSimulation.ts'),
      load('src/core/matchSimulation/matchFlowTelemetry.ts'),
    ]);
  const outputs = [];
  for (let repetition = 0; repetition < 2; repetition++) {
    for (const seed of Object.keys(previousHashes)) {
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
      if ('restart' in telemetry.turnoverCauses)
        throw new Error('Restart entered football turnover causes');
      if (
        Object.values(telemetry.turnoverCauses).reduce((sum, count) => sum + count, 0) !==
        telemetry.observedPossessionLossIds.length
      )
        throw new Error('Possession identity ledger mismatch');
      if (telemetry.restartAwards !== telemetry.observedRestartAwardIds.length)
        throw new Error('Restart identity ledger mismatch');
      const json = stableJson(telemetry);
      const digest = hash(json);
      if (revision === 'before' && digest !== previousHashes[seed])
        throw new Error(`Pristine PR161 reference mismatch ${seed}: ${digest}`);
      const previous = outputs.find((output) => output.seed === seed);
      if (previous && stableJson(previous.telemetry) !== json)
        throw new Error(`Complete repeat mismatch ${revision} ${seed}`);
      outputs.push({ seed, repetition: repetition + 1, sha256: digest, telemetry });
      console.log(`${revision} ${seed} repetition ${repetition + 1}: ${digest}`);
    }
  }
  records[revision] = { engineRoot: root, canonicalSourceHash: sourceHash(root), outputs };
}
const comparisons = Object.keys(previousHashes).map((seed) => {
  const before = records.before.outputs.find((output) => output.seed === seed);
  const after = records.after.outputs.find((output) => output.seed === seed);
  const beforeFields = Object.keys(before.telemetry).sort();
  const afterFields = Object.keys(after.telemetry).sort();
  if (stableJson(beforeFields) !== stableJson(afterFields))
    throw new Error(`Exported telemetry fields changed for ${seed}`);
  return {
    seed,
    beforeHash: before.sha256,
    afterHash: after.sha256,
    exportedFields: afterFields,
    unchangedFields: afterFields.filter(
      (field) => stableJson(before.telemetry[field]) === stableJson(after.telemetry[field]),
    ),
    changedFields: afterFields.filter(
      (field) => stableJson(before.telemetry[field]) !== stableJson(after.telemetry[field]),
    ),
  };
});
const report = {
  experiment: 'PR162 complete telemetry reference (PR146 observer contract)',
  baselineCommit: '4d61ee8e0214bd230b27bbbc41a7b7024411afd8',
  ticks: 2400,
  fixedStepSeconds: 0.025,
  repetitionsPerSeedAndRevision: 2,
  checks: {
    pristinePR161ReferencesReproduced: true,
    completeSortedAllFieldRepeatIdentity: true,
    allExportedFieldsPreserved: true,
    runtimeSchemasPassed: true,
    telemetryInvariantsPassed: true,
    possessionIdentityLedgerPassed: true,
    restartIdentityLedgerPassed: true,
  },
  comparisons,
  records,
};
const output = resolve(repo, 'docs/performance/PR162-telemetry-reference.json');
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(output);
