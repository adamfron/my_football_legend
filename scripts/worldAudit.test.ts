import { expect, test } from 'vitest';
import { generateProfessionalClubPool } from '../src/core/professionalClubs';
import {
  deriveSquadHierarchy,
  getSquadDerivedClubStrength,
  populateFootballerWorld,
} from '../src/core/footballerWorld';
import { getPlayerOverall } from '../src/core/playerOverall';
import { hasCoherentPrimaryPosition } from '../src/core/playerCreator';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';

test('deterministic persistent world audit', () => {
  const seed = 'world-audit-v1';
  const generated = populateFootballerWorld(generateProfessionalClubPool(seed), seed);
  const career = {
    player: { id: '__audit_protagonist__' },
    footballerWorld: generated.footballerWorld,
  } as Parameters<typeof getSquadDerivedClubStrength>[0];
  const players = Object.values(generated.footballerWorld);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const positionMeans = Object.fromEntries(
    [...new Set(players.map(({ profile }) => profile.primaryPosition))].map((position) => [
      position,
      mean(
        players
          .filter(({ profile }) => profile.primaryPosition === position)
          .map(({ profile }) => getPlayerOverall(profile, position)),
      ),
    ]),
  );
  const ages = { '17-20': 0, '21-25': 0, '26-30': 0, '31-36': 0 };
  for (const { profile } of players)
    ages[
      profile.age <= 20
        ? '17-20'
        : profile.age <= 25
          ? '21-25'
          : profile.age <= 30
            ? '26-30'
            : '31-36'
    ]++;
  const tierStrength = Object.fromEntries(
    [1, 2, 3, 4].map((tier) => {
      const clubs = generated.clubs.filter((club) => club.leagueTier === tier);
      return [
        tier,
        Number(
          (
            clubs.reduce((sum, club) => sum + getSquadDerivedClubStrength(career, club)!, 0) /
            clubs.length
          ).toFixed(1),
        ),
      ];
    }),
  );
  const mismatches = generated.clubs.map((club) =>
    Math.abs((club.strengthRating ?? 50) - getSquadDerivedClubStrength(career, club)!),
  );
  const report = {
    clubs: generated.clubs.length,
    footballers: players.length,
    meanSquadSize:
      generated.clubs.reduce((sum, club) => sum + club.squadPlayerIds!.length, 0) /
      generated.clubs.length,
    positions: players.reduce<Record<string, number>>((counts, item) => {
      counts[item.profile.primaryPosition] = (counts[item.profile.primaryPosition] ?? 0) + 1;
      return counts;
    }, {}),
    ages,
    meanOverallByTier: Object.fromEntries(
      [1, 2, 3, 4].map((tier) => [
        tier,
        Number(
          (
            generated.clubs
              .filter((club) => club.leagueTier === tier)
              .flatMap((club) => club.squadPlayerIds!)
              .reduce((sum, id) => {
                const p = generated.footballerWorld[id]!.profile;
                return sum + getPlayerOverall(p, p.primaryPosition);
              }, 0) /
            (16 * 24)
          ).toFixed(1),
        ),
      ]),
    ),
    derivedStrengthByTier: tierStrength,
    largestBootstrapMismatch: Math.max(...mismatches),
    serializedWorldBytes: JSON.stringify({
      footballerWorld: generated.footballerWorld,
      squads: generated.clubs.map((club) => club.squadPlayerIds),
    }).length,
  };
  console.info(JSON.stringify(report, null, 2));
  expect(report.footballers).toBe(1536);
  expect(
    Math.max(...Object.values(positionMeans)) - Math.min(...Object.values(positionMeans)),
  ).toBeLessThan(7);
  expect(positionMeans.goalkeeper).toBeLessThan(Math.max(...Object.values(positionMeans)));
  expect(positionMeans.striker).toBeGreaterThan(Math.min(...Object.values(positionMeans)));
  expect(
    players.filter(
      ({ profile, currentContract }) =>
        profile.age > 21 && currentContract.squadRole === 'development_player',
    ),
  ).toHaveLength(0);
  expect(
    players.filter(
      ({ profile, currentContract }) =>
        profile.primaryPosition === 'goalkeeper' && currentContract.squadRole === 'star_player',
    ).length,
  ).toBeLessThan(generated.clubs.length);
  expect(
    players.filter(({ profile }) => !hasCoherentPrimaryPosition(profile)).length / players.length,
  ).toBeLessThan(0.03);
  for (const club of generated.clubs) {
    const hierarchy = deriveSquadHierarchy(career, club);
    expect(hierarchy.bench.filter((item) => item.position === 'goalkeeper')).toHaveLength(1);
  }
}, 20_000);

test('canonical U-17 cohort audit', () => {
  const database = createCanonicalWorldDatabase();
  const cohorts = Object.entries(database.youthCohorts);
  const seniorIds = new Set(database.clubs.flatMap((club) => club.squadPlayerIds ?? []));
  const memberships = cohorts.flatMap(([, ids]) => ids);
  const youth = memberships.map((id) => {
    const footballer = database.footballers[id];
    expect(footballer, `missing footballer ${id}`).toBeDefined();
    return footballer!;
  });
  expect(cohorts, 'starting U-17 team count').toHaveLength(12);
  expect(cohorts.some(([key]) => key === 'u17:club_vistula_nova:2026')).toBe(true);
  expect(cohorts.filter(([key]) => key.startsWith('u17:u17_pro_'))).toHaveLength(11);
  for (const [key, ids] of cohorts) {
    expect(ids.length, `${key} squad size`).toBeGreaterThanOrEqual(22);
    expect(ids.length, `${key} squad size`).toBeLessThanOrEqual(25);
    expect(
      ids.filter((id) => database.footballers[id]!.profile.primaryPosition === 'goalkeeper').length,
      `${key} goalkeepers`,
    ).toBeGreaterThanOrEqual(2);
  }
  expect(new Set(memberships).size, 'duplicate youth membership').toBe(memberships.length);
  expect(
    memberships.filter((id) => seniorIds.has(id)),
    'senior/youth overlap',
  ).toHaveLength(0);
  expect(youth.every(({ profile }) => profile.age >= 15 && profile.age <= 17)).toBe(true);
  expect(youth.filter(({ profile }) => profile.age === 16).length).toBeGreaterThan(
    youth.length / 2,
  );
  expect(youth.every(({ developmentProfile }) => Boolean(developmentProfile))).toBe(true);
  expect(
    youth.every(({ currentContract, currentClubId }) => !currentContract && !currentClubId),
  ).toBe(true);
  expect(youth.filter(({ profile }) => !hasCoherentPrimaryPosition(profile))).toHaveLength(0);
  expect(JSON.stringify(createCanonicalWorldDatabase())).toBe(JSON.stringify(database));
});
