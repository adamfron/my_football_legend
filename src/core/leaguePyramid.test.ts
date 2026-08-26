import { describe, expect, it } from 'vitest';
import { getProfessionalCompetitionName, resolveLeagueTierAfterSeason } from './leagueSeason';
import { describeLeagueLevelChange } from './careerPresentation';

describe('Polish professional league pyramid', () => {
  it.each([
    [1, 'Polska Liga Elitarna'],
    [2, 'Polska Liga Krajowa'],
    [3, 'Polska Liga Regionalna'],
    [4, 'Polska Liga Okręgowa'],
  ])('names tier %i', (tier, name) => {
    expect(getProfessionalCompetitionName(tier)).toBe(name);
  });

  it('promotes the top two and relegates the bottom two', () => {
    expect(resolveLeagueTierAfterSeason(3, 1)).toEqual({
      previousLeagueTier: 3,
      nextLeagueTier: 2,
      leagueOutcome: 'promoted',
    });
    expect(resolveLeagueTierAfterSeason(2, 12)).toEqual({
      previousLeagueTier: 2,
      nextLeagueTier: 3,
      leagueOutcome: 'relegated',
    });
  });

  it('protects the top and bottom boundaries', () => {
    expect(resolveLeagueTierAfterSeason(1, 1)).toMatchObject({
      nextLeagueTier: 1,
      leagueOutcome: 'champion',
    });
    expect(resolveLeagueTierAfterSeason(4, 12)).toMatchObject({
      nextLeagueTier: 4,
      leagueOutcome: 'stayed',
    });
  });

  it('describes numeric movement without treating it as a value judgement', () => {
    expect(describeLeagueLevelChange(3, 2)).toBe('↑ liga wyżej');
    expect(describeLeagueLevelChange(3, 3)).toBe('— ten sam poziom');
    expect(describeLeagueLevelChange(2, 4)).toBe('↓ 2 poziomy niżej');
  });
});
