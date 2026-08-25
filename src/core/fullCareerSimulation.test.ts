import { describe, expect, it } from 'vitest';
import { advanceCareerWeek, getCurrentCareerWeek, getCurrentFixture } from './careerWeeks';
import { advanceCareerFlow } from './careerFlow';
import { advanceUntilDecision, simulateRoutinePlayerMatch } from './careerSimulation';
import {
  acceptProfessionalOffer,
  continueWithProfessionalTrial,
  stayAtCurrentClub,
} from './careerSeasons';
import { settleLeagueRound } from './leagueSeason';
import { getSeasonPlayerSummary } from './matchFeedback';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { auditCareerSeason } from './seasonAudit';
import { getCareerCurrentDate, getSeasonProgress } from './seasonProgress';

const createCareer = (seed: string) => {
  const career = createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Audyt',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'central_midfielder',
        heightCm: 178,
        weightKg: 70,
        seed,
      },
      seed,
      0,
    ),
    seed,
  );
  return continueWithProfessionalTrial({
    ...career,
    seasonOutcome: { finalPosition: 6, champion: false, competitionType: 'academy' },
  });
};

const diagnostics = (career: ReturnType<typeof createCareer>) => ({
  seed: career.seed,
  season: career.careerSeasonNumber,
  age: career.player.age,
  date: getCareerCurrentDate(career),
  phase: career.careerPhase,
  weekIndex: career.careerCalendar?.currentWeekIndex,
  leagueRound: career.leagueSeason?.currentRound,
  activeEvent: career.activeEvent?.id,
  activeMatch: career.activeMatch?.id,
  offers: career.professionalOffers?.length ?? 0,
});

describe('deterministic full-career audit', () => {
  it('plays 25 professional careers to retirement without calendar deadlocks', () => {
    for (let seedIndex = 0; seedIndex < 25; seedIndex++) {
      let career = createCareer(`full-simulation-${seedIndex}`);
      let iterations = 0;
      let priorDate = getCareerCurrentDate(career);
      const rolledSeasons = new Set<number>();

      while (career.careerStatus !== 'retired' && iterations++ < 2_000) {
        const seasonNumber = career.careerSeasonNumber;
        const seasonYear = career.currentSeason;
        const age = career.player.age;
        let priorProgress = getSeasonProgress(career).progress;

        while (!career.seasonOutcome && iterations++ < 2_000) {
          const week = getCurrentCareerWeek(career);
          expect(week, JSON.stringify(diagnostics(career))).toBeDefined();
          const fixture = getCurrentFixture(career);
          if (fixture) {
            career = simulateRoutinePlayerMatch(career, fixture);
            const roundIndex = career.leagueSeason!.rounds.findIndex((round) =>
              round.fixtures.some((item) => item.id === fixture.id),
            );
            career = settleLeagueRound(career, roundIndex);
          }
          career = advanceCareerWeek(career);
          const progress = getSeasonProgress(career).progress;
          expect(progress, JSON.stringify(diagnostics(career))).toBeGreaterThanOrEqual(
            priorProgress,
          );
          expect(
            getCareerCurrentDate(career) >= priorDate,
            JSON.stringify(diagnostics(career)),
          ).toBe(true);
          priorDate = getCareerCurrentDate(career);
          priorProgress = progress;
        }

        expect(rolledSeasons.has(seasonYear), JSON.stringify(diagnostics(career))).toBe(false);
        rolledSeasons.add(seasonYear);
        expect(getSeasonProgress(career)).toMatchObject({ progress: 1, phase: 'summer_window' });
        const summary = getSeasonPlayerSummary(career, seasonYear);
        if (summary.minutes === 0) expect(summary).toMatchObject({ yellowCards: 0, redCards: 0 });
        expect(auditCareerSeason(career).professionalAppearanceMarkedAcademy).toBe(false);

        career = advanceCareerFlow(career);
        const offer = career.professionalOffers?.[0];
        career = offer ? acceptProfessionalOffer(career, offer.id) : stayAtCurrentClub(career);
        if (career.careerStatus === 'active') {
          expect(career.careerSeasonNumber).toBe(seasonNumber + 1);
          expect(career.player.age).toBe(age + 1);
          expect(career.currentSeason).toBe(seasonYear + 1);
          expect(getSeasonProgress(career).progress).toBe(0);
          expect(career.leagueSeason?.competition.category).toBe('professional');
        }
      }
      expect(iterations, JSON.stringify(diagnostics(career))).toBeLessThan(2_000);
      expect(career.careerStatus, JSON.stringify(diagnostics(career))).toBe('retired');
      expect(career.player.age).toBeLessThanOrEqual(40);
    }
  }, 30_000);

  it('moves past an already-completed checkpoint week instead of returning it unchanged', () => {
    let career = createCareer('completed-week-regression');
    career = advanceCareerWeek(career);
    const completedIndex = career.careerCalendar!.currentWeekIndex;
    career = {
      ...career,
      careerCalendar: {
        ...career.careerCalendar!,
        weeks: career.careerCalendar!.weeks.map((week, index) =>
          index === completedIndex ? { ...week, completed: true } : week,
        ),
      },
    };
    const advanced = advanceUntilDecision(career, 1);
    expect(advanced.careerCalendar!.currentWeekIndex).toBeGreaterThan(completedIndex);
  });
});
