import { describe, expect, it } from 'vitest';
import { deriveClubMatchRatings } from './clubStrength';
import { evolveClubStrength } from './clubWorld';
import { createLeagueSeason, simulateLeagueFixture } from './leagueSeason';
import { generateProfessionalClubPool } from './professionalClubs';

describe('canonical club simulation systems', () => {
  it('derives a deterministic balanced match profile from canonical strength', () => {
    const club = { ...generateProfessionalClubPool('profile')[0]!, strengthRating: 72 };
    const profile = deriveClubMatchRatings(club);
    expect(profile).toEqual(deriveClubMatchRatings(club));
    expect((profile.attackStrength + profile.defenseStrength) / 2).toBe(72);
  });

  it('uses canonical professional strengths and favours strength without eliminating upsets', () => {
    const clubs = generateProfessionalClubPool('sample')
      .slice(0, 16)
      .map((club, index) => ({
        ...club,
        strengthRating: index === 0 ? 80 : index === 1 ? 60 : 65,
      }));
    const season = createLeagueSeason('sample', { professional: true, professionalClubs: clubs });
    expect(season.clubs[0]!.strength).toBe(80);
    let strongWins = 0,
      weakWins = 0;
    for (let index = 0; index < 500; index++) {
      const fixture = {
        ...season.rounds
          .flatMap((round) => round.fixtures)
          .find(
            (item) =>
              [item.homeClubId, item.awayClubId].includes(clubs[0]!.id) &&
              [item.homeClubId, item.awayClubId].includes(clubs[1]!.id),
          )!,
        completed: false,
        homeClubId: clubs[0]!.id,
        awayClubId: clubs[1]!.id,
      };
      const result = simulateLeagueFixture(season, fixture, `stat-${index}`);
      if (result.homeGoals! > result.awayGoals!) strongWins++;
      if (result.awayGoals! > result.homeGoals!) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2);
    expect(weakWins).toBeGreaterThan(0);
  });

  it('evolves promotion/relegation gradually, deterministically and within bounds', () => {
    const club = {
      ...generateProfessionalClubPool('evolution')[20]!,
      financialLevel: 50,
      strengthRating: 70,
    };
    const promoted = evolveClubStrength(club, { previousTier: 2, nextTier: 1, finish: 2 }, 'same');
    const relegated = evolveClubStrength(
      club,
      { previousTier: 2, nextTier: 3, finish: 15 },
      'same',
    );
    expect(promoted).toEqual(
      evolveClubStrength(club, { previousTier: 2, nextTier: 1, finish: 2 }, 'same'),
    );
    expect(promoted.strengthRating).toBeGreaterThan(70);
    expect(relegated.strengthRating).toBeLessThan(70);
    expect(
      evolveClubStrength(
        { ...club, strengthRating: 92 },
        { previousTier: 2, nextTier: 1, finish: 1 },
        'cap',
      ).strengthRating,
    ).toBeLessThanOrEqual(92);
  });
});
