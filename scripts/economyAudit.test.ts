import { expect, test } from 'vitest';
import { populateFootballerWorld } from '../src/core/footballerWorld';
import { evaluateExpectedMonthlySalary } from '../src/core/playerEconomy';
import { generateProfessionalClubPool } from '../src/core/professionalClubs';

const percentile = (sorted: number[], fraction: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;

test('reports canonical starting-world salary distribution', () => {
  const seed = 'economy-audit-v1';
  const clubs = generateProfessionalClubPool(seed);
  const world = populateFootballerWorld(clubs, seed);
  const report: Record<string, object> = {};
  for (const tier of [1, 2, 3, 4] as const) {
    const ids = world.clubs
      .filter((club) => club.leagueTier === tier)
      .flatMap((club) => club.squadPlayerIds ?? []);
    const salaries = ids
      .map((id) => world.footballerWorld[id]!.currentContract!.monthlySalary)
      .sort((a, b) => a - b);
    const mean = salaries.reduce((sum, salary) => sum + salary, 0) / salaries.length;
    const representative = world.clubs.find((club) => club.leagueTier === tier)!;
    const profile = world.footballerWorld[representative.squadPlayerIds![0]!]!.profile;
    report[`tier-${tier}`] = {
      min: salaries[0],
      median: percentile(salaries, 0.5),
      mean: Math.round(mean),
      p90: percentile(salaries, 0.9),
      max: salaries.at(-1),
      representative: Object.fromEntries(
        [50, 60, 70, 80].map((ovr) => [
          ovr,
          evaluateExpectedMonthlySalary({
            player: {
              ...profile,
              attributes: Object.fromEntries(
                Object.keys(profile.attributes).map((key) => [key, ovr]),
              ) as typeof profile.attributes,
            },
            club: representative,
            role: 'first_team_competition',
            date: '2027-07-01',
            reputation: Math.max(5, ovr - 25),
          }),
        ]),
      ),
    };
  }
  console.info('ECONOMY_AUDIT', JSON.stringify(report));
  expect(Object.keys(report)).toHaveLength(4);
});
