// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { advanceCareerWeek, getCurrentCareerWeek, getCurrentFixture } from './careerWeeks';
import { advanceCareerFlow } from './careerFlow';
import {
  advanceSimulationStep,
  advanceUntilDecision,
  simulateRoutinePlayerMatch,
} from './careerSimulation';
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
        position: 'attacking_midfielder',
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
const assertAudit = (
  condition: boolean,
  message: string,
  career: ReturnType<typeof createCareer>,
) => {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(diagnostics(career))}`);
};

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
          assertAudit(Boolean(week), 'missing career week', career);
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
          assertAudit(progress >= priorProgress, 'season progress moved backwards', career);
          assertAudit(
            getCareerCurrentDate(career) >= priorDate,
            'career date moved backwards',
            career,
          );
          priorDate = getCareerCurrentDate(career);
          priorProgress = progress;
        }

        assertAudit(!rolledSeasons.has(seasonYear), 'season boundary ran twice', career);
        rolledSeasons.add(seasonYear);
        const completedProgress = getSeasonProgress(career);
        assertAudit(
          completedProgress.progress === 1 && completedProgress.phase === 'summer_window',
          'completed season did not reach its summer window',
          career,
        );
        const summary = getSeasonPlayerSummary(career, seasonYear);
        if (summary.minutes === 0)
          assertAudit(
            summary.yellowCards === 0 && summary.redCards === 0,
            'non-participant received cards',
            career,
          );
        assertAudit(
          !auditCareerSeason(career).professionalAppearanceMarkedAcademy,
          'professional appearance was marked as academy',
          career,
        );

        career = advanceCareerFlow(career);
        const offer = career.professionalOffers?.[0];
        career = offer ? acceptProfessionalOffer(career, offer.id) : stayAtCurrentClub(career);
        if (career.careerStatus === 'active') {
          assertAudit(
            career.careerSeasonNumber === seasonNumber + 1,
            'career season did not advance once',
            career,
          );
          assertAudit(career.player.age === age + 1, 'player did not age once', career);
          assertAudit(
            career.currentSeason === seasonYear + 1,
            'calendar season did not advance once',
            career,
          );
          assertAudit(
            getSeasonProgress(career).progress === 0,
            'new season did not start at zero progress',
            career,
          );
          assertAudit(
            career.leagueSeason?.competition.category === 'professional',
            'new season is not professional',
            career,
          );
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
      // This fixture exercises completed-week normalization, not a player choice.
      decisionPoint: undefined,
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

  it('does not cross a real unresolved development decision in a simulation step', () => {
    const fresh = createCareer('development-event-blocker');
    expect(fresh.decisionPoint).toBeUndefined();
    const career = {
      ...fresh,
      decisionPoint: {
        type: 'development_event' as const,
        date: fresh.currentDate!,
        sourceId: 'scheduled_training_choice',
      },
    };

    expect(career.decisionPoint?.type).toBe('development_event');
    expect(() => advanceSimulationStep(career)).toThrow(
      'Career cannot auto-progress: development_event requires resolution.',
    );
  });
});
