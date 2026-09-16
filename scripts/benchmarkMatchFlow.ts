import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase.ts';
import { createSingleMatchSession } from '../src/core/singleMatch.ts';
import { runMatchFlowBatch } from '../src/core/matchSimulation/matchFlowCalibration.ts';

const world = createCanonicalWorldDatabase();
const pairings = [
  ['balanced-balanced', 0, 1],
  ['possession-balanced', 2, 1],
  ['direct-balanced', 3, 1],
  ['pressing-possession', 4, 2],
] as const;
const seconds = Number(process.env.MFL_BENCHMARK_SECONDS ?? 90 * 60);
const sessions = pairings.flatMap(([name, homeIndex, awayIndex]) =>
  ['a', 'b', 'c'].map((seed) =>
    createSingleMatchSession(world, {
      homeClubId: world.clubs[homeIndex]!.id,
      awayClubId: world.clubs[awayIndex]!.id,
      seed: `pr130:${name}:${seed}`,
      control: { mode: 'spectator' as const },
    }),
  ),
);
const result = runMatchFlowBatch({ canonicalSeconds: seconds, sessions });
const report = result.sessions.map(({ seed, telemetry, rates, shootingBuckets }) => ({
  seed,
  minutes: telemetry.canonicalMinutes,
  passes: {
    attempted: telemetry.passesAttempted,
    completed: telemetry.passesCompleted,
    completion: telemetry.passesAttempted
      ? telemetry.passesCompleted / telemetry.passesAttempted
      : 0,
    out: telemetry.passesOutOfPlay,
  },
  possessionChanges: telemetry.possessionChanges,
  interceptions: telemetry.turnoverCauses.interception,
  tackles: telemetry.turnoverCauses.tackle,
  restarts: telemetry.turnoverCauses.restart,
  spellSeconds: {
    mean: rates.averagePossessionEpisodeDuration,
    median: rates.medianPossessionSpell,
    p25:
      [...telemetry.possessionSpellDurations].sort((a, b) => a - b)[
        Math.floor(telemetry.possessionSpellDurations.length * 0.25)
      ] ?? 0,
    p75:
      [...telemetry.possessionSpellDurations].sort((a, b) => a - b)[
        Math.floor(telemetry.possessionSpellDurations.length * 0.75)
      ] ?? 0,
  },
  actionsPerPossession: telemetry.possessionChanges
    ? (telemetry.passesAttempted + telemetry.carries + telemetry.shots) /
      telemetry.possessionChanges
    : 0,
  boxEntries: telemetry.boxEntries,
  boxTouches: telemetry.boxTouches,
  carries: telemetry.carries,
  crosses: telemetry.crosses,
  shots: telemetry.shots,
  shootingBuckets,
}));
process.stdout.write(`${JSON.stringify({ seconds, matches: report }, null, 2)}\n`);
