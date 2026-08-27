import type {
  CareerState,
  CareerWeek,
  Fixture,
  HistoryFact,
  MonthlyCheckpoint,
  PlayerFormBand,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
import { assignedRole } from './events/postSelectionPath';
import { createLeagueSeason, settleLeagueRound, VISTULA_NOVA_ID } from './leagueSeason';
import { applyTrainingDevelopmentCheckpoint } from './development';

const DAY = 86_400_000;
export const CAREER_LOOP_START = '2026-10-01';
export const CAREER_LOOP_END = '2027-05-31';
export const REGULAR_SEASON_EVENT_POOL = [
  'extra_training_offer',
  'recovery_needed',
  'side_job_offer',
  'development_purchase',
  'language_learning',
  'dietitian_contact',
  'competitor_conversation',
  'coach_minutes_tension',
] as const;
export const QUIET_WEEK_VARIANTS = [
  'week.training_focus',
  'week.role_unchanged',
  'week.patient_work',
  'week.recovery_and_tactics',
  'week.coach_observation',
] as const;

const iso = (date: Date) => date.toISOString().slice(0, 10);
// Avoid timezone-sensitive calendar arithmetic.
const plusDays = (date: string, days: number) =>
  iso(new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY));

export const generateFixtureSchedule = (seed: string, seasonId = '2026-27'): Fixture[] => {
  const season = createLeagueSeason(seed);
  return season.rounds.slice(4).map((round) => {
    const leagueFixture = round.fixtures.find(
      (item) => item.homeClubId === VISTULA_NOVA_ID || item.awayClubId === VISTULA_NOVA_ID,
    )!;
    const opponentId =
      leagueFixture.homeClubId === VISTULA_NOVA_ID
        ? leagueFixture.awayClubId
        : leagueFixture.homeClubId;
    const opponent = season.clubs.find((club) => club.clubId === opponentId)!;
    return {
      id: leagueFixture.id,
      seasonId,
      date: round.date,
      competition: 'league',
      opponent: {
        id: opponent.clubId,
        name: opponent.name,
        strength: opponent.strength,
        style:
          opponent.attackStrength >= opponent.defenseStrength ? 'odważny atak' : 'cierpliwa obrona',
        strengths: [opponent.attackStrength >= opponent.defenseStrength ? 'atak' : 'obrona'],
        weaknesses: [opponent.attackStrength < opponent.defenseStrength ? 'atak' : 'obrona'],
      },
      venue: leagueFixture.homeClubId === VISTULA_NOVA_ID ? 'home' : 'away',
      importance: 40,
      matchImportance: 'routine',
    };
  });
};

export const getPlayerForm = (career: CareerState): { value: number; band: PlayerFormBand } => {
  const recent = (career.matchHistory ?? []).slice(-5);
  const value = recent.length
    ? recent.reduce(
        (sum, appearance, index) =>
          sum + ((appearance.rating ?? 6) - 6) * (index + 1) + Math.min(2, appearance.minutes / 45),
        0,
      ) / recent.length
    : 0;
  return {
    value,
    band:
      value >= 3
        ? 'excellent'
        : value >= 1.5
          ? 'good'
          : value >= 0
            ? 'steady'
            : value >= -1.5
              ? 'uneven'
              : 'poor',
  };
};

export const shouldScheduleOffFieldEvent = (career: CareerState, week: CareerWeek): boolean => {
  const windows = [
    [3, 8],
    [17, 21],
    [27, 32],
  ] as const;
  return windows.some(([start, end], window) => {
    if (week.weekIndex < start || week.weekIndex > end) return false;
    const already = career.careerCalendar?.weeks.some(
      (item) =>
        item.weekIndex >= start && item.weekIndex < week.weekIndex && item.scheduledEventIds.length,
    );
    const chosen =
      start +
      RandomGenerator.fromSeed(
        `${career.seed}:event-window:${career.careerSeasonNumber}:${window}`,
      ).int(0, end - start);
    return !already && week.weekIndex === chosen;
  });
};

const selectVariant = (career: CareerState, weekId: string) => {
  const recent = career.recentVariantKeys ?? [];
  const available = QUIET_WEEK_VARIANTS.filter((key) => !recent.includes(key));
  return RandomGenerator.fromSeed(`${career.seed}:variant:${weekId}`).pick(
    available.length ? available : QUIET_WEEK_VARIANTS,
  );
};

export const initializeCurrentCareerWeek = (career: CareerState): CareerState => {
  if (
    career.careerCalendar ||
    !career.historyFacts.some((fact) => fact.factType === 'september_2026_completed')
  )
    return career;
  const leagueSeason = createLeagueSeason(career.seed);
  const fixtures = generateFixtureSchedule(career.seed);
  const weekCount = Math.ceil(
    (new Date(`${CAREER_LOOP_END}T00:00:00Z`).getTime() -
      new Date(`${CAREER_LOOP_START}T00:00:00Z`).getTime()) /
      (7 * DAY),
  );
  const weeks: CareerWeek[] = Array.from({ length: weekCount }, (_, weekIndex) => {
    const startDate = plusDays(CAREER_LOOP_START, weekIndex * 7);
    const fixtureIds = fixtures
      .filter((fixture) => fixture.date >= startDate && fixture.date <= plusDays(startDate, 6))
      .map((fixture) => fixture.id);
    return {
      id: `week_2026_${weekIndex + 1}`,
      seasonId: '2026-27',
      weekIndex,
      startDate,
      endDate: plusDays(startDate, 6),
      phase: 'regular_season',
      fixtureIds,
      scheduledEventIds: [],
      completedEventIds: [],
      completed: false,
    };
  });
  const septemberMatches = (career.matchHistory ?? []).filter((match) =>
    match.date.startsWith('2026-09'),
  );
  const calendar = {
    seasonId: '2026-27',
    currentWeekIndex: 0,
    weeks,
    fixtures,
    monthlyCheckpoints: [],
    availableThrough: CAREER_LOOP_END,
  };
  let base: CareerState = {
    ...career,
    leagueSeason,
    careerCalendar: calendar,
    seasonStartingAttributes: career.seasonStartingAttributes ?? { ...career.player.attributes },
  };
  for (let index = 0; index < 4; index++) {
    const appearance = septemberMatches[index];
    const matchFact =
      appearance &&
      career.historyFacts.find(
        (item) => item.factType === 'match_played' && item.data.matchId === appearance.matchId,
      );
    const known =
      appearance?.teamLevel === 'senior' &&
      matchFact &&
      Number.isFinite(Number(matchFact.data.homeGoals))
        ? {
            homeGoals: Number(matchFact.data.homeGoals),
            awayGoals: Number(matchFact.data.awayGoals),
            playerAppearanceMatchId: appearance.matchId,
          }
        : undefined;
    base = settleLeagueRound(base, index, known);
  }
  return initializeWeekContent(base, 0);
};

/** Assigns all deterministic content when a week becomes current, never at completion time. */
export const initializeWeekContent = (career: CareerState, index: number): CareerState => {
  const calendar = career.careerCalendar;
  const week = calendar?.weeks[index];
  if (!calendar || !week || week.completed || week.summaryVariantKey) return career;
  const eligibleEvents = REGULAR_SEASON_EVENT_POOL.filter((id) => {
    const funds = (career.finances ?? []).reduce((sum, item) => sum + item.amount, 0);
    const recentMinutes = (career.matchHistory ?? [])
      .slice(-5)
      .reduce((sum, item) => sum + item.minutes, 0);
    if (id === 'recovery_needed') return career.player.fitness < 72 || recentMinutes > 260;
    if (id === 'coach_minutes_tension') return recentMinutes < 90;
    if (id === 'side_job_offer') return funds < 500;
    if (id === 'development_purchase') return funds >= 100;
    if (id === 'competitor_conversation')
      return career.significantPeople.some((person) => person.role.includes('player'));
    return !career.historyFacts.some(
      (fact) => fact.factType === 'regular_season_decision' && fact.data.eventId === id,
    );
  });
  const scheduledEventIds = shouldScheduleOffFieldEvent(career, week)
    ? [
        RandomGenerator.fromSeed(
          `${career.seed}:regular-event:${career.careerSeasonNumber}:${week.id}`,
        ).pick(eligibleEvents.length ? eligibleEvents : REGULAR_SEASON_EVENT_POOL),
      ]
    : [];
  const updated = { ...week, scheduledEventIds, summaryVariantKey: selectVariant(career, week.id) };
  return {
    ...career,
    careerCalendar: {
      ...calendar,
      weeks: calendar.weeks.map((item, i) => (i === index ? updated : item)),
    },
  };
};

export const getCurrentCareerWeek = (career: CareerState) =>
  career.careerCalendar?.weeks[career.careerCalendar.currentWeekIndex];
export const getCurrentFixture = (career: CareerState) => {
  const week = getCurrentCareerWeek(career);
  return career.careerCalendar?.fixtures.find((fixture) => week?.fixtureIds.includes(fixture.id));
};

/** Repairs the narrowly scoped PR #16 save gap without inventing an appearance. */
export const recoverOrphanedSeasonOneRound = (career: CareerState): CareerState => {
  const season = career.leagueSeason;
  const calendar = career.careerCalendar;
  if (!season || !calendar || season.id !== '2026-27' || season.rounds.length !== 22) return career;
  const frontier = calendar.weeks[calendar.currentWeekIndex]?.startDate;
  if (!frontier) return career;
  return season.rounds.reduce(
    (state, round, index) =>
      !round.completed && round.date < frontier ? settleLeagueRound(state, index) : state,
    career,
  );
};

const checkpoint = (career: CareerState, month: string): MonthlyCheckpoint => {
  const matches = (career.matchHistory ?? []).filter((match) => match.date.startsWith(month));
  const ratings = matches.flatMap((match) => (match.rating === undefined ? [] : [match.rating]));
  const highlight = career.historyFacts
    .filter((fact) => fact.date.startsWith(month))
    .sort((a, b) => b.narrativeImportance - a.narrativeImportance)[0];
  return {
    id: `checkpoint_${month}`,
    month,
    appearances: matches.length,
    minutes: matches.reduce((s, m) => s + m.minutes, 0),
    goals: matches.reduce((s, m) => s + m.goals, 0),
    assists: matches.reduce((s, m) => s + m.assists, 0),
    ...(ratings.length
      ? { averageRating: ratings.reduce((a, b) => a + b, 0) / ratings.length }
      : {}),
    form: getPlayerForm(career).band,
    role: assignedRole(career) ?? 'academy_squad',
    ...(highlight ? { highlightFactId: highlight.id } : {}),
  };
};

export const completeCareerWeek = (career: CareerState): CareerState => {
  const prepared = career.careerCalendar
    ? initializeWeekContent(career, career.careerCalendar.currentWeekIndex)
    : career;
  const calendar = prepared.careerCalendar;
  const week = getCurrentCareerWeek(prepared);
  if (!calendar || !week || week.completed || (career.activeMatch && !career.activeMatch.completed))
    return career;
  const completed = { ...week, completed: true, completedEventIds: week.scheduledEventIds };
  const facts: HistoryFact[] = prepared.historyFacts.some((f) => f.id === `fact_${week.id}`)
    ? prepared.historyFacts
    : [
        ...prepared.historyFacts,
        {
          id: `fact_${week.id}`,
          factType: 'career_week_completed',
          season: prepared.currentSeason,
          date: week.endDate,
          actors: [prepared.player.id],
          targets: [],
          clubs: [prepared.currentClub.id],
          competitions: [],
          data: {
            fixtureIds: week.fixtureIds,
            eventIds: week.scheduledEventIds,
            variantKey: week.summaryVariantKey,
          },
          causes: [],
          tags: ['regular_week'],
          visibility: 'partial',
          narrativeImportance: 12,
          emotionalTone: 'neutral',
        },
      ];
  const recentVariantKeys = [
    ...(prepared.recentVariantKeys ?? []).filter(
      (key): key is string => typeof key === 'string' && key.trim().length > 0,
    ),
    ...(typeof week.summaryVariantKey === 'string' && week.summaryVariantKey.trim()
      ? [week.summaryVariantKey]
      : []),
  ].slice(-3);
  return {
    ...prepared,
    activeMatch: undefined,
    currentDate:
      !career.currentDate || week.endDate > career.currentDate ? week.endDate : career.currentDate,
    historyFacts: facts,
    recentVariantKeys,
    careerCalendar: {
      ...calendar,
      weeks: calendar.weeks.map((item) => (item.id === week.id ? completed : item)),
    },
  };
};

export const advanceCareerWeek = (career: CareerState): CareerState => {
  const completedCareer = completeCareerWeek(recoverOrphanedSeasonOneRound(career));
  const calendar = completedCareer.careerCalendar;
  const current = getCurrentCareerWeek(completedCareer);
  if (!calendar || !current?.completed) return completedCareer;
  if (calendar.currentWeekIndex >= calendar.weeks.length - 1) {
    if (completedCareer.leagueSeason && !completedCareer.leagueSeason.completed)
      throw new Error('Career calendar ended before every league round was settled.');
    return completedCareer;
  }
  const nextIndex = calendar.currentWeekIndex + 1;
  let checkpoints = calendar.monthlyCheckpoints;
  let developedCareer = completedCareer;
  const next = calendar.weeks[nextIndex]!;
  const currentMonth = current.startDate.slice(0, 7);
  if (
    next.startDate.slice(0, 7) !== currentMonth &&
    !checkpoints.some((item) => item.month === currentMonth)
  ) {
    developedCareer = applyTrainingDevelopmentCheckpoint(completedCareer, currentMonth);
    checkpoints = [...checkpoints, checkpoint(developedCareer, currentMonth)];
  }
  return initializeWeekContent(
    {
      ...developedCareer,
      player: {
        ...developedCareer.player,
        fitness: Math.min(
          100,
          developedCareer.player.fitness +
            { recovery: 14, balanced: 10, extra_work: 6 }[
              developedCareer.trainingApproach ?? 'balanced'
            ],
        ),
      },
      currentDate:
        !developedCareer.currentDate || next.startDate > developedCareer.currentDate
          ? next.startDate
          : developedCareer.currentDate,
      careerCalendar: { ...calendar, currentWeekIndex: nextIndex, monthlyCheckpoints: checkpoints },
    },
    nextIndex,
  );
};
