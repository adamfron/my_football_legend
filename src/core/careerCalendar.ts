import type {
  CareerCalendarState,
  CareerState,
  Fixture,
  HistoryFact,
  ScheduledCalendarEvent,
  SeasonParticipationRecord,
} from '../types/domain';

export const sortFixtures = (fixtures: Fixture[]) =>
  [...fixtures].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
export const sortCalendarEvents = (events: ScheduledCalendarEvent[]) =>
  [...events].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

/** Rebuilds operational buckets. Dates remain owned by fixtures/calendar events. */
export const rebuildWeekBuckets = (calendar: CareerCalendarState): CareerCalendarState => ({
  ...calendar,
  weeks: calendar.weeks.map((week) => ({
    ...week,
    fixtureIds: sortFixtures(calendar.fixtures)
      .filter((fixture) => fixture.date >= week.startDate && fixture.date <= week.endDate)
      .map((fixture) => fixture.id),
    scheduledEventIds: sortCalendarEvents(calendar.scheduledEvents)
      .filter(
        (event) =>
          event.status === 'scheduled' &&
          event.date >= week.startDate &&
          event.date <= week.endDate,
      )
      .map((event) => event.eventDefinitionId),
    completedEventIds: sortCalendarEvents(calendar.scheduledEvents)
      .filter(
        (event) =>
          event.status === 'completed' &&
          event.date >= week.startDate &&
          event.date <= week.endDate,
      )
      .map((event) => event.eventDefinitionId),
  })),
});

export interface CalendarConflict {
  date: string;
  fixtureIds: string[];
  kind: 'fixture_date_collision';
}
export const detectCalendarConflict = (
  calendar: CareerCalendarState,
  date: string,
  exceptFixtureId?: string,
): CalendarConflict | undefined => {
  const fixtureIds = calendar.fixtures
    .filter((fixture) => fixture.date === date && fixture.id !== exceptFixtureId)
    .map((fixture) => fixture.id)
    .sort();
  return fixtureIds.length ? { date, fixtureIds, kind: 'fixture_date_collision' } : undefined;
};

const scheduledParticipation = (
  career: CareerState,
  fixture: Fixture,
): SeasonParticipationRecord => ({
  fixtureId: fixture.id,
  seasonId: fixture.seasonId,
  competitionId: fixture.competition,
  date: fixture.date,
  opponentId: fixture.opponent.id,
  venue: fixture.venue,
  competition: fixture.competition,
  fixtureStatus: 'scheduled',
  status: 'not_selected',
  plannedMinutes: 0,
  minutes: 0,
  started: false,
  goals: 0,
  assists: 0,
  xG: 0,
  xA: 0,
  homeClubId: fixture.venue === 'home' ? career.currentClub.id : fixture.opponent.id,
  awayClubId: fixture.venue === 'away' ? career.currentClub.id : fixture.opponent.id,
});

/** Atomic fixture + ledger insertion. Existing identity is idempotent. */
export const scheduleFixture = (career: CareerState, fixture: Fixture): CareerState => {
  if (!career.careerCalendar)
    throw new Error('Cannot schedule a fixture without a career calendar.');
  const existing = career.careerCalendar.fixtures.find((item) => item.id === fixture.id);
  if (existing) return career;
  const calendar = rebuildWeekBuckets({
    ...career.careerCalendar,
    fixtures: sortFixtures([...career.careerCalendar.fixtures, fixture]),
  });
  return {
    ...career,
    careerCalendar: calendar,
    seasonParticipation: [
      ...(career.seasonParticipation ?? []),
      scheduledParticipation(career, fixture),
    ],
  };
};

export const scheduleEvent = (
  career: CareerState,
  event: Omit<ScheduledCalendarEvent, 'status'> & { status?: ScheduledCalendarEvent['status'] },
): CareerState => {
  if (!career.careerCalendar)
    throw new Error('Cannot schedule an event without a career calendar.');
  if (career.careerCalendar.scheduledEvents.some((item) => item.id === event.id)) return career;
  return {
    ...career,
    careerCalendar: rebuildWeekBuckets({
      ...career.careerCalendar,
      scheduledEvents: sortCalendarEvents([
        ...career.careerCalendar.scheduledEvents,
        { ...event, status: event.status ?? 'scheduled' },
      ]),
    }),
  };
};

export type RescheduleReason =
  | 'competition_conflict'
  | 'weather'
  | 'stadium_issue'
  | 'extraordinary_event'
  | 'other';
export const rescheduleFixture = (
  career: CareerState,
  fixtureId: string,
  newDate: string,
  reason: RescheduleReason,
): CareerState => {
  const calendar = career.careerCalendar;
  if (!calendar) throw new Error('Cannot reschedule without a career calendar.');
  const fixture = calendar.fixtures.find((item) => item.id === fixtureId);
  if (!fixture) throw new Error(`Unknown fixture: ${fixtureId}`);
  const row = career.seasonParticipation?.find((item) => item.fixtureId === fixtureId);
  const leagueFixture = career.leagueSeason?.rounds
    .flatMap((round) => round.fixtures)
    .find((item) => item.id === fixtureId);
  if (row?.fixtureStatus === 'completed' || leagueFixture?.completed)
    throw new Error('Completed historical fixtures cannot be rescheduled.');
  const oldDate = fixture.date;
  if (oldDate === newDate) return career;
  const fact: HistoryFact = {
    id: `fact_fixture_rescheduled_${fixtureId}_${newDate}`,
    factType: 'fixture_rescheduled',
    season: career.currentSeason,
    date: career.currentDate ?? calendar.currentDate,
    actors: [],
    targets: [fixtureId],
    clubs: [career.currentClub.id],
    competitions: [fixture.competition],
    data: { fixtureId, oldDate, newDate, reason },
    causes: [],
    tags: ['calendar', 'fixture_reschedule'],
    visibility: 'public',
    narrativeImportance: 30,
    emotionalTone: 'neutral',
  };
  const nextLeague =
    career.leagueSeason && leagueFixture
      ? {
          ...career.leagueSeason,
          rounds: career.leagueSeason.rounds.map((round) => ({
            ...round,
            fixtures: round.fixtures.map((item) =>
              item.id === fixtureId ? { ...item, date: newDate } : item,
            ),
          })),
        }
      : career.leagueSeason;
  return {
    ...career,
    leagueSeason: nextLeague,
    historyFacts: career.historyFacts.some((item) => item.id === fact.id)
      ? career.historyFacts
      : [...career.historyFacts, fact],
    seasonParticipation: (career.seasonParticipation ?? []).map((item) =>
      item.fixtureId === fixtureId ? { ...item, date: newDate, fixtureStatus: 'scheduled' } : item,
    ),
    careerCalendar: rebuildWeekBuckets({
      ...calendar,
      fixtures: sortFixtures(
        calendar.fixtures.map((item) =>
          item.id === fixtureId ? { ...item, date: newDate } : item,
        ),
      ),
    }),
  };
};

export const postponeFixture = rescheduleFixture;

export const completeScheduledEvent = (
  career: CareerState,
  eventDefinitionId: string,
  factId?: string,
): CareerState => {
  const calendar = career.careerCalendar;
  if (!calendar) return career;
  return {
    ...career,
    careerCalendar: rebuildWeekBuckets({
      ...calendar,
      scheduledEvents: calendar.scheduledEvents.map((event) =>
        event.eventDefinitionId === eventDefinitionId && event.status === 'scheduled'
          ? { ...event, status: 'completed' as const, ...(factId ? { factId } : {}) }
          : event,
      ),
    }),
  };
};
