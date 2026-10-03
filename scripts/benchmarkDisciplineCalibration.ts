import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import {
  calibrationBenchmarkConfigSchema,
  calibrationScenarioSchema,
  createCalibrationReport,
  createCalibrationSession,
  runCalibrationBenchmark,
  type CalibrationMatchResult,
  type CalibrationScenario,
} from './matchCalibrationBenchmark';

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const config = calibrationBenchmarkConfigSchema.parse({
  canonicalMinutes: Number(
    args.get('minutes') || process.env.MFL_DISCIPLINE_CALIBRATION_MINUTES || 45,
  ),
  batchTicks: Number(
    args.get('batch-ticks') || process.env.MFL_DISCIPLINE_CALIBRATION_BATCH_TICKS || 800,
  ),
});
const scenarios = z
  .array(calibrationScenarioSchema)
  .nonempty()
  .parse(
    (
      args.get('scenarios') ||
      process.env.MFL_DISCIPLINE_CALIBRATION_SCENARIOS ||
      'balanced-balanced,weak-strong,aggressive-defenders'
    ).split(','),
  );
const seeds = z
  .array(z.string().min(1))
  .nonempty()
  .parse((args.get('seeds') || process.env.MFL_DISCIPLINE_CALIBRATION_SEEDS || 'a,b,c').split(','));
const world = createCanonicalWorldDatabase();
const controlledPosition = z
  .enum(['central_midfielder', 'left_back', 'striker'])
  .optional()
  .parse(args.get('position'));
const outputPath = args.get('output') || process.env.MFL_DISCIPLINE_CALIBRATION_OUTPUT;
const revision = args.get('revision') || 'working-tree';
const matches: CalibrationMatchResult[] = [];
const failures: { scenario: CalibrationScenario; seed: string; error: string }[] = [];
const reportJson = () =>
  JSON.stringify(createCalibrationReport(matches, config, revision, failures), null, 2) + '\n';
const saveProgress = () => {
  if (!outputPath) return;
  mkdirSync(resolve(outputPath, '..'), { recursive: true });
  writeFileSync(outputPath, reportJson());
};
for (const scenario of scenarios) {
  for (const seed of seeds) {
    process.stderr.write(
      `PR148 ${scenario}:${seed}, ${config.canonicalMinutes} canonical minutes\n`,
    );
    try {
      const result = runCalibrationBenchmark(
        createCalibrationSession(world, scenario, seed, controlledPosition),
        scenario,
        config,
      );
      matches.push(result);
      process.stderr.write(
        `${result.canonicalMinutes.toFixed(2)}min, ${(result.performance.elapsedMs / 1000).toFixed(2)}s, fouls/yellows/reds ${result.raw.fouls}/${result.raw.yellowCards}/${result.raw.redCards}, passes/touches ${result.raw.passesAttempted}/${result.raw.touches}, decisions ${result.agency.meaningfulHumanDecisions}\n`,
      );
    } catch (error) {
      const message = (error instanceof Error ? (error.stack ?? error.message) : String(error))
        .replaceAll(pathToFileURL(process.cwd()).href, '<repository>')
        .replaceAll(process.cwd(), '<repository>')
        .replaceAll(process.cwd().replaceAll('\\', '/'), '<repository>');
      failures.push({ scenario, seed: `pr148:${scenario}:${seed}`, error: message });
      process.stderr.write(`FAILED ${scenario}:${seed}: ${message}\n`);
    }
    saveProgress();
  }
}
process.stdout.write(reportJson());
if (failures.length) process.exitCode = 1;
