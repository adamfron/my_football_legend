import { describe, expect, it } from 'vitest';
import {
  createCareerState,
  generateStartingPlayerProfile,
  type CreatorInput,
} from './playerCreator';
import { advanceToNextCareerSeason, getCareerStage } from './careerSeasons';
import { getSeasonProgress } from './seasonProgress';

const input: CreatorInput = {
  firstName: 'Jan',
  lastName: 'Testowy',
  nationality: 'PL',
  age: 16,
  dominantFoot: 'right',
  customSeed: '',
  position: 'left_winger',
  heightCm: 174,
  weightKg: 68,
  seed: 'lifecycle',
};
const careerFor = (seed: string) =>
  createCareerState(generateStartingPlayerProfile({ ...input, seed }, seed, 0), seed);

describe('professional career lifecycle', () => {
  it('ages exactly once per rollover and never creates an age-41 season', () => {
    let career = careerFor('age-curve');
    for (let season = 2; season <= 25; season++) {
      const priorAge = career.player.age;
      career = advanceToNextCareerSeason(career);
      if (priorAge >= 40) break;
      expect(career.player.age).toBe(priorAge + 1);
      if (career.careerStatus === 'active') expect(career.careerSeasonNumber).toBe(season);
    }
    career = advanceToNextCareerSeason(career);
    expect(career.careerStatus).toBe('retired');
    expect(career.player.age).toBe(40);
    expect(career.careerSeasonNumber).toBe(25);
  });

  it('keeps progress monotonic within a season and resets only at rollover', () => {
    let career = careerFor('progress');
    const values = ['2026-07-01', '2026-10-01', '2027-02-01', '2027-06-30'].map(
      (currentDate) => getSeasonProgress((career = { ...career, currentDate })).progress,
    );
    expect(values.every((value, index) => index === 0 || value >= values[index - 1]!)).toBe(true);
    career = advanceToNextCareerSeason(career);
    expect(getSeasonProgress(career).progress).toBeLessThan(0.01);
  });

  it('resets seasonal availability counters but carries an outstanding suspension', () => {
    const career = {
      ...careerFor('discipline-rollover'),
      playerAvailability: {
        injuries: [],
        suspensionMatchesRemaining: 2,
        leagueYellowCards: 3,
        matchesMissedThroughSuspension: 4,
        matchesMissedThroughInjury: 1,
      },
    };
    const next = advanceToNextCareerSeason(career);
    expect(next.playerAvailability).toMatchObject({
      suspensionMatchesRemaining: 2,
      leagueYellowCards: 0,
      matchesMissedThroughSuspension: 0,
      matchesMissedThroughInjury: 0,
    });
  });

  it('audits 25 deterministic full careers for veteran decline and retirement', () => {
    let paceDeclines = 0;
    for (let seed = 0; seed < 25; seed++) {
      let career = careerFor(`full-career-${seed}`);
      const startingPace = career.player.attributes.pace;
      while (career.careerStatus !== 'retired') career = advanceToNextCareerSeason(career);
      expect(career.player.age).toBeLessThanOrEqual(40);
      expect(career.careerSeasonNumber).toBe(25);
      expect(getCareerStage({ ...career, careerSeasonNumber: 2 })).not.toBe('academy');
      if (career.player.attributes.pace < startingPace) paceDeclines++;
    }
    expect(paceDeclines).toBeGreaterThanOrEqual(20);
  });
});
