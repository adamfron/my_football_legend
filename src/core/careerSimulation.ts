import type {
  CareerState,
  FastForwardEntry,
  Fixture,
  HistoryFact,
  LeagueFixture,
  MatchAppearance,
} from '../types/domain';
import { getCurrentCareerWeek, getCurrentFixture, advanceCareerWeek } from './careerWeeks';
import { evaluateMatchImportance, simulateLeagueFixture } from './leagueSeason';
import { RandomGenerator } from './random/RandomGenerator';
import {
  evaluateSquadOpportunity,
  startFixtureMatch,
  TOMASZ_RADECKI_PROFILE,
} from './septemberMatches';

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
  competitions: ['Liga regionalna'],
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

export const simulateRoutinePlayerMatch = (career: CareerState, fixture: Fixture): CareerState => {
  if ((career.matchHistory ?? []).some((appearance) => appearance.matchId === fixture.id))
    return career;
  const fixtureIndex =
    career.leagueSeason?.rounds.findIndex((round) =>
      round.fixtures.some((item) => item.id === fixture.id),
    ) ?? 0;
  const rng = RandomGenerator.fromSeed(`${career.seed}:quick-player:${fixture.id}`);
  const selection = evaluateSquadOpportunity(
    career,
    { fixtureIndex, opponent: fixture.opponent, venue: fixture.venue },
    TOMASZ_RADECKI_PROFILE,
  );
  const started = selection.status.endsWith('starter');
  const bench = selection.status.endsWith('bench');
  const played = started || (bench && rng.bool(0.68));
  const minutes = !played ? 0 : started ? rng.int(64, 90) : rng.int(8, 34);
  const teamLevel = selection.status.startsWith('senior') ? 'senior' : 'academy';
  const quality =
    Object.values(career.player.attributes).reduce((sum, value) => sum + value, 0) / 8;
  const performance =
    (quality - fixture.opponent.strength) / 14 +
    (career.player.fitness - 60) / 30 +
    (career.player.morale - 50) / 35 +
    (rng.float() - 0.5) * 2.2;
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
  const appearance: MatchAppearance = {
    matchId: fixture.id,
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
  return {
    ...career,
    player: {
      ...career.player,
      fitness: clamp(career.player.fitness - Math.round(minutes / 20) + 2, 20, 100),
      morale: clamp(
        career.player.morale + (rating && rating >= 7.2 ? 2 : rating && rating < 5.8 ? -2 : 0),
        0,
        100,
      ),
    },
    matchHistory: [...(career.matchHistory ?? []), appearance],
    historyFacts: [...career.historyFacts, ...facts],
  };
};

const completeLeagueRound = (career: CareerState, playerFixture?: Fixture): CareerState => {
  const season = career.leagueSeason;
  if (!season) return career;
  const roundIndex = playerFixture
    ? season.rounds.findIndex((round) =>
        round.fixtures.some((item) => item.id === playerFixture.id),
      )
    : season.currentRound;
  const round = season.rounds[roundIndex];
  if (!round) return career;
  const appearance =
    playerFixture && (career.matchHistory ?? []).find((item) => item.matchId === playerFixture.id);
  const fixtures = round.fixtures.map((leagueFixture): LeagueFixture => {
    if (leagueFixture.completed) return leagueFixture;
    const simulated = simulateLeagueFixture(season, leagueFixture, career.seed);
    return appearance && leagueFixture.id === playerFixture?.id
      ? { ...simulated, playerAppearanceMatchId: appearance.matchId }
      : simulated;
  });
  const completedRounds = season.rounds.map((item, index) =>
    index === roundIndex ? { ...item, fixtures, completed: true } : item,
  );
  const currentRound = Math.max(season.currentRound, roundIndex + 1);
  return {
    ...career,
    leagueSeason: {
      ...season,
      rounds: completedRounds,
      currentRound,
      completed: currentRound >= season.rounds.length,
    },
  };
};

const logMatch = (career: CareerState, fixture: Fixture): FastForwardEntry => {
  const league = career.leagueSeason?.rounds
    .flatMap((round) => round.fixtures)
    .find((item) => item.id === fixture.id);
  const appearance = career.matchHistory?.find((item) => item.matchId === fixture.id);
  const home = fixture.venue === 'home' ? 'Vistula Nova' : fixture.opponent.name;
  const away = fixture.venue === 'away' ? 'Vistula Nova' : fixture.opponent.name;
  return {
    id: `log_${fixture.id}`,
    date: fixture.date,
    type: 'match',
    fixtureId: fixture.id,
    ...(appearance ? { appearanceMatchId: appearance.matchId } : {}),
    summary: `${home} ${league?.homeGoals ?? 0}:${league?.awayGoals ?? 0} ${away} · ${appearance?.minutes ? `${appearance.minutes} min · ocena ${appearance.rating?.toFixed(1).replace('.', ',') ?? '—'}` : 'bez występu'}`,
  };
};

/** Advances routine time until an actual player choice, never more than eight weeks. */
export const advanceUntilDecision = (initial: CareerState, maxWeeks = 8): CareerState => {
  let career: CareerState = { ...initial, decisionPoint: undefined, fastForwardLog: [] };
  for (let step = 0; step < Math.max(1, Math.min(8, maxWeeks)); step++) {
    const week = getCurrentCareerWeek(career);
    if (!week || week.completed) break;
    const fixture = getCurrentFixture(career);
    if (fixture) {
      const importance = evaluateMatchImportance(career, fixture);
      if (importance !== 'routine')
        return {
          ...startFixtureMatch(career, { ...fixture, matchImportance: importance }),
          decisionPoint: { type: 'important_match', date: fixture.date, sourceId: fixture.id },
        };
      career = simulateRoutinePlayerMatch(career, fixture);
      career = completeLeagueRound(career, fixture);
      career = {
        ...career,
        fastForwardLog: [...(career.fastForwardLog ?? []), logMatch(career, fixture)],
      };
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
    if (career.careerCalendar?.currentWeekIndex === before) break;
    if (career.leagueSeason?.completed)
      return {
        ...career,
        decisionPoint: {
          type: 'season_context',
          date: career.leagueSeason.endDate,
          sourceId: career.leagueSeason.id,
        },
      };
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
