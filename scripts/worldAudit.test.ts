import { expect, test } from 'vitest';
import { generateProfessionalClubPool } from '../src/core/professionalClubs';
import { getSquadDerivedClubStrength, populateFootballerWorld } from '../src/core/footballerWorld';
import { getPlayerOverall } from '../src/core/playerOverall';

test('deterministic persistent world audit', () => {
  const seed = 'world-audit-v1';
  const generated = populateFootballerWorld(generateProfessionalClubPool(seed), seed);
  const career = {
    player: { id: '__audit_protagonist__' },
    footballerWorld: generated.footballerWorld,
  } as Parameters<typeof getSquadDerivedClubStrength>[0];
  const players = Object.values(generated.footballerWorld);
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
}, 20_000);
