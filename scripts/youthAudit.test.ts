import { expect, test } from 'vitest';
import { getPolishU17TeamDefinitions } from '../src/content/world/polishU17';
import { getPlayerOverall } from '../src/core/playerOverall';
import { generateProfessionalClubPool } from '../src/core/professionalClubs';
import {
  createProceduralFootballerId,
  resolveProceduralFootballer,
} from '../src/core/proceduralFootballers';
import { RandomGenerator } from '../src/core/random/RandomGenerator';
import { deriveYouthTeamQuality, populatePolishU17World } from '../src/core/youthWorld';

type AuditPlayer = NonNullable<ReturnType<typeof resolveProceduralFootballer>>;
const overall = (player: AuditPlayer) =>
  getPlayerOverall(player.profile, player.profile.primaryPosition);
const percentile = (sorted: number[], fraction: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))]!;
const distribution = (players: AuditPlayer[]) => {
  const values = players.map(overall).sort((a, b) => a - b);
  const capacities = players
    .map((player) => Math.max(...Object.values(player.developmentProfile.familyCapacity)))
    .sort((a, b) => a - b);
  const ages = Object.fromEntries(
    [...new Set(players.map((player) => player.profile.age))]
      .sort((a, b) => a - b)
      .map((age) => [age, players.filter((player) => player.profile.age === age).length]),
  );
  const teenagers = players.filter((player) => player.profile.age <= 18);
  return {
    count: values.length,
    ovr: {
      min: values[0],
      mean: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
      median: percentile(values, 0.5),
      p75: percentile(values, 0.75),
      p90: percentile(values, 0.9),
      p95: percentile(values, 0.95),
      p99: percentile(values, 0.99),
      max: values.at(-1),
    },
    ages,
    teenageThresholds: Object.fromEntries(
      [60, 65, 68, 70].map((threshold) => {
        const count = teenagers.filter((player) => overall(player) >= threshold).length;
        return [
          `${threshold}+`,
          { count, percentage: Number(((count * 100) / teenagers.length).toFixed(2)) },
        ];
      }),
    ),
    maximumFamilyCapacity: {
      median: percentile(capacities, 0.5),
      p90: percentile(capacities, 0.9),
      p95: percentile(capacities, 0.95),
      p99: percentile(capacities, 0.99),
      max: capacities.at(-1),
    },
  };
};

test('deterministic youth quality audit', () => {
  const clubs = generateProfessionalClubPool('mfl-world-pl-2026-v2');
  const teams = getPolishU17TeamDefinitions(clubs);
  const starting = Object.values(populatePolishU17World(clubs, 'mfl-world-pl-2026-v2').footballers);
  const future = teams.flatMap((team) =>
    Array.from({ length: 10 }, (_, seasonIndex) =>
      Array.from({ length: 24 }, (_, slot) => {
        const position = [
          'goalkeeper',
          'center_back',
          'left_back',
          'right_back',
          'defensive_midfielder',
          'attacking_midfielder',
          'left_winger',
          'right_winger',
          'striker',
        ][slot % 9]!;
        return resolveProceduralFootballer(
          createProceduralFootballerId({
            kind: 'intake',
            ownerId: team.parentClubId ?? team.id,
            season: 2027 + seasonIndex,
            position: position as Parameters<typeof createProceduralFootballerId>[0]['position'],
            slot,
          }),
          clubs,
        )!;
      }),
    ).flat(),
  );
  const supplemental = clubs.flatMap((club) =>
    Array.from(
      { length: 20 },
      (_, slot) =>
        resolveProceduralFootballer(
          createProceduralFootballerId({
            kind: 'supplemental',
            ownerId: club.id,
            season: 2030,
            position: 'striker',
            slot,
          }),
          clubs,
        )!,
    ),
  );
  const oldFlatModel = teams
    .flatMap((team) => {
      const club = clubs.find((item) => item.id === team.parentClubId);
      const quality = club ? deriveYouthTeamQuality(club) : team.independentQuality!;
      return Array.from({ length: 240 }, (_, slot) => {
        const rng = RandomGenerator.fromSeed(`before:${team.id}:${slot}`);
        return Math.max(30, Math.min(70, quality + rng.int(-10, 10) + (slot % 6 === 0 ? 3 : 0)));
      });
    })
    .sort((a, b) => a - b);
  const mean = (values: number[]) =>
    Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
  const academyEffect = ([32, 48, 64] as const).map((quality) => {
    const selectedClub = clubs.reduce((best, club) =>
      Math.abs(deriveYouthTeamQuality(club) - quality) <
      Math.abs(deriveYouthTeamQuality(best) - quality)
        ? club
        : best,
    );
    const players = Array.from(
      { length: 2000 },
      (_, slot) =>
        resolveProceduralFootballer(
          createProceduralFootballerId({
            kind: 'intake',
            ownerId: selectedClub.id,
            season: 2050,
            position: 'striker',
            slot,
          }),
          clubs,
        )!,
    );
    return {
      requestedQuality: quality,
      actualQuality: deriveYouthTeamQuality(selectedClub),
      meanOvr: mean(players.map(overall)),
      meanMaxCapacity: mean(
        players.map((player) =>
          Math.max(...Object.values(player.developmentProfile.familyCapacity)),
        ),
      ),
    };
  });
  const report = {
    before: {
      model: 'legacy flat +/-10 target OVR',
      count: oldFlatModel.length,
      min: oldFlatModel[0],
      mean: mean(oldFlatModel),
      median: percentile(oldFlatModel, 0.5),
      p90: percentile(oldFlatModel, 0.9),
      p95: percentile(oldFlatModel, 0.95),
      p99: percentile(oldFlatModel, 0.99),
      max: oldFlatModel.at(-1),
    },
    after: {
      startingU17: distribution(starting),
      futureIntakes: distribution(future),
      supplemental: distribution(supplemental),
    },
    academyEffect,
  };
  console.info(JSON.stringify(report, null, 2));
  expect(
    report.after.futureIntakes.ovr.median - report.after.startingU17.ovr.median,
  ).toBeLessThanOrEqual(3);
  expect(report.after.futureIntakes.teenageThresholds['70+'].percentage).toBeLessThan(0.5);
  expect(report.after.supplemental.ovr.max).toBeLessThanOrEqual(64);
}, 30_000);
