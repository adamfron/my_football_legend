import type {
  CareerState,
  FastForwardEntry,
  Fixture,
  HistoryFact,
  MatchAppearance,
} from '../types/domain';
import {
  getCurrentCareerWeek,
  getCurrentFixture,
  advanceCareerWeek,
  recoverOrphanedSeasonOneRound,
} from './careerWeeks';
import { evaluateMatchImportance, settleLeagueRound } from './leagueSeason';
import { RandomGenerator } from './random/RandomGenerator';
import { getMatchEffortEffects } from './playerPreferences';
import { applyAppearanceConsequences } from './appearanceConsequences';
import { projectFixtureParticipation, startFixtureMatch } from './matchEngine';
import {
  applyMatchAvailabilityEffects,
  consumeUnavailableRound,
  getPlayerAvailability,
} from './playerAvailability';
import {
  nonAppearanceParticipation,
  participationFromAppearance,
  recordParticipation,
  updateSelectionStanding,
} from './seasonParticipation';
import { getPlayerOverall } from './playerOverall';

export const getCareerProgressBlocker = (career: CareerState): string | undefined => {
  if ((career.careerStatus ?? 'active') === 'retired') return 'career is retired';
  if (career.decisionPoint && career.decisionPoint.type !== 'checkpoint')
    return `${career.decisionPoint.type} requires resolution`;
  if (career.activeMatch) return 'an active match requires resolution';
  if (career.activeEvent) return 'an active event requires a choice';
  if (career.professionalOffers) return 'the transfer window requires an offer choice';
  if (career.seasonOutcome) return 'the season outcome requires summer-window initialization';
  const calendar = career.careerCalendar;
  if (!calendar) return 'career calendar is missing';
  const week = calendar.weeks[calendar.currentWeekIndex];
  if (!week) return `week ${calendar.currentWeekIndex} is missing from the career calendar`;
  return undefined;
};

export const assertCareerCanProgress = (career: CareerState): void => {
  const blocker = getCareerProgressBlocker(career);
  if (blocker) throw new Error(`Career cannot auto-progress: ${blocker}.`);
};

const fact = (
  career: CareerState,
  factType: string,
  date: string,
  data: Record<string, unknown>,
  importance: number,
): HistoryFact => ({
  id: `fact_${factType}_${date}_${career.historyFacts.length}`,
  factType,
  season: career.currentSeason,
  date,
  actors: [career.player.id],
  targets: [],
  clubs: [career.currentClub.id],
  competitions: [career.leagueSeason?.competition.name ?? 'Rozgrywki klubowe'],
  data,
  causes: career.historyFacts.slice(-2).map((item) => item.id),
  tags: [factType],
  visibility: 'partial',
  narrativeImportance: importance,
  emotionalTone: 'neutral',
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const playerGroup = (position: string) =>
  position.includes('goal')
    ? 'goalkeeper'
    : position.includes('back')
      ? 'defender'
      : position.includes('mid')
        ? 'midfielder'
        : 'attacker';

export const simulateRoutinePlayerMatch = (
  career: CareerState,
  fixture: Fixture,
  projected = projectFixtureParticipation(career, fixture),
): CareerState => {
  if (
    career.seasonParticipation?.some(
      (row) => row.fixtureId === fixture.id && row.fixtureStatus === 'completed',
    )
  )
    return career;
  const rng = RandomGenerator.fromSeed(
    `${career.seed}:${career.currentSeason}:quick-player:${fixture.id}`,
  );
  const availability = getPlayerAvailability(career, fixture.date);
  if (!availability.available)
    return recordParticipation(
      consumeUnavailableRound(career, fixture.date),
      nonAppearanceParticipation(career, fixture),
    );
  const started = projected.started;
  const minutes = projected.plannedMinutes;
  const teamLevel =
    career.leagueSeason?.competition.category === 'professional' || career.careerSeasonNumber >= 2
      ? 'senior'
      : projected.teamLevel === 'senior'
        ? 'senior'
        : 'academy';
  const quality = getPlayerOverall(career.player, career.player.primaryPosition);
  const effort = getMatchEffortEffects(career.player.matchEffort ?? 3);
  const performance =
    (quality - fixture.opponent.strength) / 14 +
    (career.player.fitness - 60) / 30 +
    (career.player.morale - 50) / 35 +
    (rng.float() - 0.5) * 2.2 +
    effort.performanceModifier;
  const attacking = ['attacker', 'midfielder'].includes(playerGroup(career.player.primaryPosition));
  const goals =
    minutes &&
    attacking &&
    rng.float() <
      clamp(
        0.035 + minutes / 620 + career.player.attributes.finishing / 850 + performance / 20,
        0.01,
        0.42,
      )
      ? 1
      : 0;
  const assists =
    minutes &&
    playerGroup(career.player.primaryPosition) !== 'goalkeeper' &&
    rng.float() <
      clamp(
        0.025 + minutes / 760 + career.player.attributes.vision / 1000 + performance / 24,
        0.01,
        0.3,
      )
      ? 1
      : 0;
  const rating = minutes
    ? clamp(
        Math.round((6.15 + performance * 0.42 + goals * 0.75 + assists * 0.55) * 10) / 10,
        3.5,
        9.5,
      )
    : undefined;
  const rawAppearance: MatchAppearance = {
    matchId: teamLevel === 'academy' ? `academy_${fixture.id}` : fixture.id,
    date: fixture.date,
    opponentId: fixture.opponent.id,
    teamLevel,
    started,
    minutes,
    goals,
    assists,
    xG: minutes ? Math.round((0.03 + (minutes / 360) * (attacking ? 0.55 : 0.12)) * 100) / 100 : 0,
    xA: minutes ? Math.round((minutes / 420) * (attacking ? 0.42 : 0.24) * 100) / 100 : 0,
    keyPasses: minutes ? Math.max(0, Math.floor(minutes / 35 + performance + rng.float())) : 0,
    defensiveActions: minutes
      ? Math.max(
          0,
          Math.floor(
            minutes / (playerGroup(career.player.primaryPosition) === 'defender' ? 13 : 28) +
              performance +
              rng.float(),
          ),
        )
      : 0,
    saves:
      minutes && playerGroup(career.player.primaryPosition) === 'goalkeeper'
        ? Math.max(1, rng.int(1, 6))
        : 0,
    personalImpact: minutes ? Math.round((rating! - 6) * 2) : 0,
    ...(rating !== undefined ? { rating } : {}),
  };
  const effects = applyMatchAvailabilityEffects(career, rawAppearance, fixture.date);
  const appearance = effects.appearance;
  const priorSenior = (career.matchHistory ?? []).filter(
    (item) => item.teamLevel === 'senior' && item.minutes > 0,
  );
  const facts = [
    fact(
      career,
      'match_played',
      fixture.date,
      appearance as unknown as Record<string, unknown>,
      18,
    ),
  ];
  if (teamLevel === 'senior' && minutes && !priorSenior.length)
    facts.push(
      fact(career, 'senior_debut', fixture.date, { matchId: fixture.id, started, minutes }, 90),
    );
  if (teamLevel === 'senior' && started && !priorSenior.some((item) => item.started))
    facts.push(
      fact(career, 'first_senior_start', fixture.date, { matchId: fixture.id, minutes }, 92),
    );
  if (
    goals &&
    !(career.matchHistory ?? []).some((item) => item.teamLevel === teamLevel && item.goals)
  )
    facts.push(fact(career, `first_${teamLevel}_goal`, fixture.date, { matchId: fixture.id }, 88));
  if (
    assists &&
    !(career.matchHistory ?? []).some((item) => item.teamLevel === teamLevel && item.assists)
  )
    facts.push(
      fact(career, `first_${teamLevel}_assist`, fixture.date, { matchId: fixture.id }, 84),
    );
  const completed = applyAppearanceConsequences(
    {
      ...effects.career,
      player: {
        ...career.player,
        fitness: clamp(
          career.player.fitness - Math.round((minutes / 14) * effort.fitnessCostMultiplier),
          0,
          100,
        ),
        morale: clamp(
          career.player.morale + (rating && rating >= 7.2 ? 2 : rating && rating < 5.8 ? -2 : 0),
          0,
          100,
        ),
      },
      historyFacts: [...career.historyFacts, ...facts, ...effects.facts],
    },
    appearance,
  );
  return recordParticipation(
    {
      ...completed,
      selectionStanding: updateSelectionStanding(completed.selectionStanding, appearance.rating),
    },
    minutes > 0
      ? participationFromAppearance(completed, fixture, appearance, projected.plannedMinutes)
      : nonAppearanceParticipation(completed, fixture, projected.plannedMinutes),
  );
};

const logMatch = (career: CareerState, fixture: Fixture): FastForwardEntry => {
  const league = career.leagueSeason?.rounds
    .flatMap((round) => round.fixtures)
    .find((item) => item.id === fixture.id);
  const appearance = career.seasonParticipation?.find((item) => item.fixtureId === fixture.id);
  const home = fixture.venue === 'home' ? career.currentClub.name : fixture.opponent.name;
  const away = fixture.venue === 'away' ? career.currentClub.name : fixture.opponent.name;
  return {
    id: `log_${fixture.id}`,
    date: fixture.date,
    type: 'match',
    fixtureId: fixture.id,
    ...(appearance?.appearanceMatchId ? { appearanceMatchId: appearance.appearanceMatchId } : {}),
    summary: `${home} ${league?.homeGoals ?? 0}:${league?.awayGoals ?? 0} ${away}\n${appearance?.minutes ? `${appearance.minutes} min · ${appearance.goals} G · ${appearance.assists} A · ocena ${appearance.rating?.toFixed(1).replace('.', ',') ?? '—'}` : 'bez występu'}`,
  };
};

/**
 * Advances to one visible career moment. Quiet weeks may be crossed, but no more
 * than one controlled-player fixture is resolved and choices are never crossed.
 */
export const advanceSimulationStep = (initial: CareerState): CareerState => {
  assertCareerCanProgress(initial);
  let career: CareerState = recoverOrphanedSeasonOneRound({
    ...initial,
    decisionPoint: undefined,
    fastForwardLog: [],
  });
  // A decision can be resolved after its week was completed but before the cursor moved.
  // Normalize that valid checkpoint instead of returning the same completed week forever.
  while (getCurrentCareerWeek(career)?.completed) {
    const before = career.careerCalendar?.currentWeekIndex;
    career = advanceCareerWeek(career);
    if (career.careerCalendar?.currentWeekIndex === before) break;
  }
  assertCareerCanProgress(career);
  for (let step = 0; step < 8; step++) {
    const week = getCurrentCareerWeek(career);
    if (!week || week.completed) break;
    const fixture = getCurrentFixture(career);
    if (fixture) {
      const roundIndex =
        career.leagueSeason?.rounds.findIndex((r) => r.fixtures.some((f) => f.id === fixture.id)) ??
        0;
      const projection = projectFixtureParticipation(career, fixture);
      const expected = {
        teamLevel: projection.teamLevel,
        started: projection.started,
        willPlay: projection.willPlay,
      };
      const importance = evaluateMatchImportance(career, fixture, expected);
      if (
        career.player.matchPresentation !== 'simulate_all' &&
        importance !== 'routine' &&
        projection.willPlay
      )
        return {
          ...startFixtureMatch(career, { ...fixture, matchImportance: importance }),
          decisionPoint: { type: 'important_match', date: fixture.date, sourceId: fixture.id },
        };
      career = simulateRoutinePlayerMatch(career, fixture, projection);
      career = settleLeagueRound(career, roundIndex);
      career = {
        ...career,
        fastForwardLog: [...(career.fastForwardLog ?? []), logMatch(career, fixture)],
      };
      if (week.scheduledEventIds.length)
        return {
          ...career,
          decisionPoint: {
            type: 'off_field_event',
            date: week.startDate,
            sourceId: week.scheduledEventIds[0]!,
          },
        };
      const before = career.careerCalendar?.currentWeekIndex;
      career = advanceCareerWeek(career);
      if (career.leagueSeason?.completed)
        return {
          ...career,
          decisionPoint: {
            type: 'season_context',
            date: career.leagueSeason.endDate,
            sourceId: career.leagueSeason.id,
          },
        };
      if (career.careerCalendar?.currentWeekIndex === before)
        throw new Error(`Career progression stalled at week ${before}.`);
      return career;
    } else {
      career = {
        ...career,
        fastForwardLog: [
          ...(career.fastForwardLog ?? []),
          {
            id: `log_${week.id}`,
            date: week.startDate,
            type: 'quiet_week',
            summary: 'Tydzień bez meczu.',
          },
        ],
      };
    }
    if (week.scheduledEventIds.length)
      return {
        ...career,
        decisionPoint: {
          type: 'off_field_event',
          date: week.startDate,
          sourceId: week.scheduledEventIds[0]!,
        },
      };
    const before = career.careerCalendar?.currentWeekIndex;
    career = advanceCareerWeek(career);
    if (career.leagueSeason?.completed)
      return {
        ...career,
        decisionPoint: {
          type: 'season_context',
          date: career.leagueSeason.endDate,
          sourceId: career.leagueSeason.id,
        },
      };
    if (career.careerCalendar?.currentWeekIndex === before)
      throw new Error(
        `Career progression stalled at week ${before} in season ${career.currentSeason}; the week did not advance and the league is not complete.`,
      );
  }
  const current = getCurrentCareerWeek(career);
  return {
    ...career,
    decisionPoint: {
      type: 'checkpoint',
      date: current?.startDate ?? career.leagueSeason?.endDate ?? '2027-05-31',
      sourceId: current?.id ?? 'season_checkpoint',
    },
  };
};

/** Advances routine time until an actual player choice, never more than eight visible steps. */
export const advanceUntilDecision = (initial: CareerState, maxWeeks = 8): CareerState => {
  let career = initial;
  for (let step = 0; step < Math.max(1, Math.min(8, maxWeeks)); step++) {
    career = advanceSimulationStep(career);
    if (career.decisionPoint && career.decisionPoint.type !== 'checkpoint') return career;
    if (career.decisionPoint?.type === 'checkpoint')
      career = { ...career, decisionPoint: undefined };
  }
  return career;
};
