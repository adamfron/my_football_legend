import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { performanceObserverModeSchema } from '../src/core/matchSimulation/performanceProfiling';
import {
  assertCanonicalBenchmarkEquality,
  performanceBenchmarkConfigSchema,
  runPerformanceBenchmark,
} from './performanceBenchmark';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const minutes = z.coerce
  .number()
  .positive()
  .max(90)
  .parse(args.get('minutes') || process.env.MFL_PERFORMANCE_MINUTES || 10);
const modes = z
  .array(performanceObserverModeSchema)
  .nonempty()
  .parse(
    (
      args.get('modes') ||
      process.env.MFL_PERFORMANCE_MODES ||
      'release_minimal,normal,dev,capture'
    ).split(','),
  );
const seed = args.get('seed') || process.env.MFL_PERFORMANCE_SEED || 'pr146-performance:balanced:a';
const world = createCanonicalWorldDatabase();
const spectator = createSingleMatchSession(world, {
  homeClubId: world.clubs[0]!.id,
  awayClubId: world.clubs[1]!.id,
  seed,
  control: { mode: 'spectator' },
});
const player =
  spectator.home.players.find((p) => p.profile.primaryPosition === 'central_midfielder') ??
  spectator.home.players.find((p) => p.profile.primaryPosition !== 'goalkeeper')!;
const session = createSingleMatchSession(world, {
  ...spectator.setup,
  control: {
    mode: 'player',
    clubId: spectator.home.club.id,
    footballerId: player.footballerId,
    forceIntoXI: false,
  },
});
const outputPath = args.get('output') || process.env.MFL_PERFORMANCE_OUTPUT;
const exportDirectory = args.get('export-dir') || process.env.MFL_PERFORMANCE_EXPORT_DIR;
const results = modes.map((mode) => {
  process.stderr.write(`PR146 ${mode}: ${minutes} canonical minutes, seed ${seed}\n`);
  const { result, exportJson } = runPerformanceBenchmark(
    session,
    performanceBenchmarkConfigSchema.parse({
      canonicalMinutes: minutes,
      mode,
      batchTicks: Number(args.get('batch-ticks') || process.env.MFL_PERFORMANCE_BATCH_TICKS || 20),
      profilingEnabled:
        (args.get('profile') || process.env.MFL_PERFORMANCE_PROFILE || 'true') !== 'false',
      sampleEveryTicks: Number(
        args.get('sample-every') || process.env.MFL_PERFORMANCE_SAMPLE_EVERY || 37,
      ),
    }),
  );
  let saveMs = 0;
  if (exportDirectory) {
    mkdirSync(exportDirectory, { recursive: true });
    const started = performance.now();
    writeFileSync(resolve(exportDirectory, `${mode}-${minutes}min-evidence.json`), exportJson);
    saveMs = performance.now() - started;
  }
  process.stderr.write(
    `${mode}: ${(result.elapsedMs / 1000).toFixed(2)}s, ${result.canonicalSpeed.toFixed(1)}x, late/early ${result.lateToEarlyCostRatio.toFixed(2)}\n`,
  );
  return { ...result, save: { performed: Boolean(exportDirectory), elapsedMs: saveMs } };
});
const maximumAgeRatio =
  args.get('assert-age-ratio') || process.env.MFL_PERFORMANCE_ASSERT_AGE_RATIO;
if (maximumAgeRatio) {
  const maximum = z.coerce.number().positive().parse(maximumAgeRatio);
  for (const result of results)
    if (result.lateToEarlyCostRatio > maximum)
      throw new Error(
        `${result.config.mode} late/early cost ${result.lateToEarlyCostRatio.toFixed(2)} exceeds ${maximum}`,
      );
}
const report = {
  methodology:
    'single canonical fixed-step engine; identical controlled player and deterministic explicit DEV choices; inclusive sampled spans; no rendering or RAF; export excluded from simulation timing',
  environment: {
    node: process.version,
    platform: platform(),
    osRelease: release(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
    revision: args.get('revision') || process.env.MFL_PERFORMANCE_REVISION || 'working-tree',
  },
  videoCapture: {
    measured: false,
    reason:
      'Headless harness has no pitch canvas or MediaRecorder; browser-only cost must be measured separately.',
  },
  canonicalInvariant: assertCanonicalBenchmarkEquality(results),
  results,
};
const json = JSON.stringify(report, null, 2) + '\n';
if (outputPath) {
  mkdirSync(resolve(outputPath, '..'), { recursive: true });
  writeFileSync(outputPath, json);
}
process.stdout.write(json);
