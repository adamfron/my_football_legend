// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
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
import { measureCareerSaveSections, serializeCareerSave } from './persistence';
import { NPC_RETIREMENT_HARD_MAX_AGE } from './npcRetirement';
import { getProfileAge } from './age';
import { auditSeniorWorld } from './worldIntegrity';

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

const soakMode =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.MFL_FULL_CAREER_SOAK === '1';
const fullCareerSeeds = Array.from({ length: soakMode ? 25 : 3 }, (_, index) => index);
const soakTiming = {
  fullCareerMs: 0,
  summerRolloverMs: 0,
  summerRollovers: 0,
  worstSummerRolloverMs: 0,
};

afterAll(() => {
  if (!soakMode) return;
  console.info('full-career soak timing', {
    seeds: fullCareerSeeds.length,
    totalFullCareerMs: Math.round(soakTiming.fullCareerMs),
    averageSummerMarketAndRolloverMs: Math.round(
      soakTiming.summerRolloverMs / Math.max(1, soakTiming.summerRollovers),
    ),
    worstSummerMarketAndRolloverMs: Math.round(soakTiming.worstSummerRolloverMs),
    measuredSummerRollovers: soakTiming.summerRollovers,
  });
});

describe('deterministic full-career audit', () => {
  it.each(fullCareerSeeds)(
    'plays professional career %i to retirement without calendar deadlocks',
    (seedIndex) => {
      const fullCareerStartedAt = performance.now();
      let career = createCareer(`full-simulation-${seedIndex}`);
      let iterations = 0;
      let priorDate = getCareerCurrentDate(career);
      const rolledSeasons = new Set<number>();

      while (career.careerStatus !== 'retired' && iterations++ < 2_000) {
        const seasonNumber = career.careerSeasonNumber;
        const seasonYear = career.currentSeason;
        const age = career.player.age;
        let priorProgress = getSeasonProgress(career).progress;
        const fixtureRoundById = new Map(
          career.leagueSeason!.rounds.flatMap((round) =>
            round.fixtures.map((fixture) => [fixture.id, round.index] as const),
          ),
        );

        while (!career.seasonOutcome && iterations++ < 2_000) {
          const week = getCurrentCareerWeek(career);
          assertAudit(Boolean(week), 'missing career week', career);
          const fixture = getCurrentFixture(career);
          if (fixture) {
            career = simulateRoutinePlayerMatch(career, fixture);
            const roundIndex = fixtureRoundById.get(fixture.id) ?? -1;
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
        expect(Object.keys(career.worldDelta?.footballerAttributeOverrides ?? {})).toHaveLength(0);
        if (career.careerStatus === 'active') {
          const population = auditSeniorWorld(career);
          expect(population.clubsBelow11).toBe(0);
          expect(population.clubsWithoutGoalkeeper).toBe(0);
          expect(population.clubsWithoutTenOutfield).toBe(0);
          expect(population.duplicateActiveSeniorMemberships).toBe(0);
          expect(population.activeUnattachedSeniorFootballers).toBeLessThanOrEqual(2);
        }
        const offer = career.professionalOffers?.[0];
        const summerRolloverStartedAt = performance.now();
        career = offer ? acceptProfessionalOffer(career, offer.id) : stayAtCurrentClub(career);
        const summerRolloverMs = performance.now() - summerRolloverStartedAt;
        soakTiming.summerRolloverMs += summerRolloverMs;
        soakTiming.summerRollovers++;
        soakTiming.worstSummerRolloverMs = Math.max(
          soakTiming.worstSummerRolloverMs,
          summerRolloverMs,
        );
        if (seedIndex === 0 && career.careerSeasonNumber === 15)
          console.info(
            '15-season save bytes',
            new TextEncoder().encode(serializeCareerSave(career)).byteLength,
          );
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
      for (const club of career.clubWorld ?? []) {
        const squad = career.worldDelta?.squadOverrides[club.id] ?? club.squadPlayerIds ?? [];
        for (const id of squad) {
          const footballer =
            career.worldDelta?.footballerOverrides[id] ??
            career.worldDelta?.newFootballers[id] ??
            career.footballerWorld?.[id];
          if (footballer && id !== career.player.id)
            expect(
              getProfileAge(footballer.profile, getCareerCurrentDate(career)),
            ).toBeLessThanOrEqual(NPC_RETIREMENT_HARD_MAX_AGE);
        }
      }
      if (seedIndex === 0)
        console.info('long-career lifecycle metrics', {
          seasons: career.careerSeasonNumber,
          saveBytes: new TextEncoder().encode(serializeCareerSave(career)).byteLength,
          newFootballers: Object.keys(career.worldDelta?.newFootballers ?? {}).length,
          fullFootballerOverrides: Object.keys(career.worldDelta?.footballerOverrides ?? {}).length,
          compactStateOverrides: Object.keys(career.worldDelta?.footballerStateOverrides ?? {})
            .length,
          youthCohortIds: Object.values(career.worldDelta?.youthCohortOverrides ?? {}).flat()
            .length,
          retiredIds: career.worldDelta?.retiredFootballerIds.length ?? 0,
          marketExitCount: career.worldDelta?.professionalMarketExitCount ?? 0,
          transferRecords: career.worldDelta?.npcTransferRecords?.length ?? 0,
          historyFacts: career.historyFacts.length,
          squadOverrides: Object.keys(career.worldDelta?.squadOverrides ?? {}).length,
          latestSummerMarket: career.worldDelta?.summerMarketDiagnostics,
          population: auditSeniorWorld(career),
          naturalDevelopmentOverrides: Object.keys(
            career.worldDelta?.footballerAttributeOverrides ?? {},
          ).length,
          saveSections: measureCareerSaveSections(career),
        });
      if (seedIndex === 0)
        expect(new TextEncoder().encode(serializeCareerSave(career)).byteLength).toBeLessThan(
          3_000_000,
        );
      soakTiming.fullCareerMs += performance.now() - fullCareerStartedAt;
    },
    30_000,
  );

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
