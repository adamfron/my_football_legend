import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase.ts';
import { createSingleMatchSession } from '../src/core/singleMatch.ts';
import {
  runBackgroundBenchmark,
  type BackgroundBenchmarkMode,
} from '../src/core/matchSimulation/index.ts';

const world = createCanonicalWorldDatabase();
const minutes = Number(process.env.MFL_BENCHMARK_MINUTES ?? 5) as 5 | 15 | 45;
const modes = (process.env.MFL_BENCHMARK_MODES ?? 'core,telemetry,moment,complete,profile').split(
  ',',
) as BackgroundBenchmarkMode[];
const pairings = [
  ['balanced-balanced', 0, 1],
  ['possession-balanced', 2, 1],
  ['possession-pressing', 2, 4],
  ['weak-weak', 62, 63],
  ['strong-weak', 0, 63],
] as const;
const reports = pairings.flatMap(([scenario, home, away]) =>
  modes.map((mode) => ({
    scenario,
    ...runBackgroundBenchmark(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[home]!.id,
        awayClubId: world.clubs[away]!.id,
        seed: `pr139:${scenario}:a`,
        control: { mode: 'spectator' as const },
      }),
      { canonicalMinutes: minutes, mode, batchTicks: 800 },
    ),
  })),
);
process.stdout.write(
  `${JSON.stringify({ methodology: 'no-render deterministic canonical fixed-step', minutes, reports }, null, 2)}\n`,
);
