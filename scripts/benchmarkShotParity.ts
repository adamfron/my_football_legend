import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { createTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import { runShotParityBenchmark } from '../src/core/matchSimulation/shotParityBenchmark';

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const config = z
  .object({
    repeats: z.coerce.number().int().min(1).max(128).default(16),
    seedFamily: z.string().min(1).default('pr151-shot-parity'),
  })
  .parse({ repeats: args.get('repeats'), seedFamily: args.get('seed-family') });
const world = createCanonicalWorldDatabase();
const template = createTacticalMatch(
  createSingleMatchSession(world, {
    homeClubId: world.clubs[0]!.id,
    awayClubId: world.clubs[1]!.id,
    seed: 'pr151-parity-template',
    control: { mode: 'spectator' },
  }),
);
const started = performance.now();
const summary = runShotParityBenchmark(template, config);
const result = { ...summary, runtimeMilliseconds: performance.now() - started };
const output = resolve(args.get('out') ?? '.benchmark-artifacts/pr151-shot-parity-summary.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  JSON.stringify(
    { ...result, fixtures: undefined, sharedInputs: undefined, groups: undefined, output },
    null,
    2,
  ),
);
if (
  summary.canonicalLaunchDifferences ||
  summary.targetMenuDifferences ||
  summary.keeperInputDifferences ||
  summary.physicalResultDifferences ||
  summary.human.unresolved ||
  summary.npc.unresolved
)
  process.exitCode = 1;
