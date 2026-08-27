import type {
  CareerState,
  Fixture,
  MatchAppearance,
  ParticipationStatus,
  SeasonParticipationRecord,
  SquadRole,
} from '../types/domain';

export const getExpectedAvailableMinuteShare = (
  role: SquadRole,
): { min: number; target: number; max: number } =>
  ({
    development_player: { min: 0.25, target: 0.33, max: 0.4 },
    rotation: { min: 0.4, target: 0.5, max: 0.6 },
    first_team_competition: { min: 0.55, target: 0.625, max: 0.7 },
    important_player: { min: 0.7, target: 0.775, max: 0.85 },
    star_player: { min: 0.82, target: 0.9, max: 1 },
  })[role];

export const getSeasonAppearanceStats = (records: SeasonParticipationRecord[]) => {
  const played = records.filter((record) => record.minutes > 0);
  const ratings = played.flatMap((record) => (record.rating === undefined ? [] : [record.rating]));
  const result = {
    appearances: played.length,
    starts: played.filter((record) => record.started).length,
    substituteAppearances: played.filter((record) => !record.started).length,
    minutes: played.reduce((sum, record) => sum + record.minutes, 0),
    goals: played.reduce((sum, record) => sum + record.goals, 0),
    assists: played.reduce((sum, record) => sum + record.assists, 0),
    xG: played.reduce((sum, record) => sum + record.xG, 0),
    xA: played.reduce((sum, record) => sum + record.xA, 0),
    averageRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
  };
  const completedFixtures = records.filter((record) => record.fixtureStatus !== 'scheduled').length;
  if (
    result.starts < 0 ||
    result.starts > result.appearances ||
    result.appearances > completedFixtures
  )
    throw new Error('Fixture-ledger appearance invariant violated.');
  return result;
};

export const getParticipationTotals = getSeasonAppearanceStats;

export const getSeasonOutfieldStats = (records: SeasonParticipationRecord[]) => {
  const appearance = getSeasonAppearanceStats(records);
  const played = records.filter((record) => record.minutes > 0);
  return {
    ...appearance,
    keyPasses: played.reduce((sum, record) => sum + (record.keyPasses ?? 0), 0),
    defensiveActions: played.reduce((sum, record) => sum + (record.defensiveActions ?? 0), 0),
    yellowCards: played.reduce((sum, record) => sum + (record.yellowCards ?? 0), 0),
    redCards: played.filter((record) => record.redCard !== undefined).length,
  };
};

export const getSeasonGoalkeeperStats = (records: SeasonParticipationRecord[]) => {
  const appearance = getSeasonAppearanceStats(records);
  const played = records.filter((record) => record.minutes > 0);
  const detailed = played.flatMap((record) =>
    record.goalkeeperStats ? [record.goalkeeperStats] : [],
  );
  const saves = detailed.reduce((sum, stats) => sum + stats.saves, 0);
  const faced = detailed.reduce((sum, stats) => sum + stats.shotsOnTargetFaced, 0);
  const goalsConceded = detailed.reduce((sum, stats) => sum + stats.goalsConceded, 0);
  const xGA = detailed.reduce((sum, stats) => sum + stats.xGA, 0);
  return {
    ...appearance,
    goalsConceded,
    cleanSheets: detailed.filter((stats) => stats.cleanSheet).length,
    saves,
    savePercentage: faced ? (saves / faced) * 100 : 0,
    xGA: Number(xGA.toFixed(2)),
    goalsPrevented: Number((xGA - goalsConceded).toFixed(2)),
    errorsLeadingToGoal: detailed.reduce((sum, stats) => sum + stats.errorsLeadingToGoal, 0),
  };
};

export const availabilityStatus = (career: CareerState): ParticipationStatus | undefined => {
  if (
    (career.playerAvailability?.injuries ?? []).some(
      (injury) => injury.status === 'active' && injury.matchesRemaining > 0,
    )
  )
    return 'injured';
  if ((career.playerAvailability?.suspensionMatchesRemaining ?? 0) > 0) return 'suspended';
  if (career.player.fitness < 35) return 'unfit';
  return undefined;
};

export const participationFromAppearance = (
  career: CareerState,
  fixture: Fixture,
  appearance: MatchAppearance,
  plannedMinutes = appearance.minutes,
): SeasonParticipationRecord => ({
  fixtureId: fixture.id,
  seasonId: fixture.seasonId,
  competitionId: career.leagueSeason?.competition.id ?? fixture.competition,
  date: fixture.date,
  opponentId: fixture.opponent.id,
  venue: fixture.venue,
  competition: career.leagueSeason?.competition.name ?? fixture.competition,
  homeClubId: fixture.venue === 'home' ? career.currentClub.id : fixture.opponent.id,
  awayClubId: fixture.venue === 'away' ? career.currentClub.id : fixture.opponent.id,
  fixtureStatus: 'completed',
  status: appearance.minutes > 0 ? (appearance.started ? 'starter' : 'substitute') : 'unused_bench',
  plannedMinutes,
  minutes: appearance.minutes,
  started: appearance.started,
  appearanceMatchId: appearance.matchId,
  goals: appearance.goals,
  assists: appearance.assists,
  xG: appearance.minutes > 0 ? appearance.xG : 0,
  xA: appearance.minutes > 0 ? appearance.xA : 0,
  keyPasses: appearance.minutes > 0 ? appearance.keyPasses : 0,
  defensiveActions: appearance.minutes > 0 ? appearance.defensiveActions : 0,
  yellowCards: appearance.minutes > 0 ? (appearance.yellowCards ?? 0) : 0,
  ...(appearance.redCard ? { redCard: appearance.redCard } : {}),
  ...(appearance.rating === undefined ? {} : { rating: appearance.rating }),
});

export const nonAppearanceParticipation = (
  career: CareerState,
  fixture: Fixture,
  plannedMinutes = 0,
): SeasonParticipationRecord => ({
  fixtureId: fixture.id,
  seasonId: fixture.seasonId,
  competitionId: career.leagueSeason?.competition.id ?? fixture.competition,
  date: fixture.date,
  opponentId: fixture.opponent.id,
  venue: fixture.venue,
  competition: career.leagueSeason?.competition.name ?? fixture.competition,
  homeClubId: fixture.venue === 'home' ? career.currentClub.id : fixture.opponent.id,
  awayClubId: fixture.venue === 'away' ? career.currentClub.id : fixture.opponent.id,
  fixtureStatus: 'completed',
  status: availabilityStatus(career) ?? (plannedMinutes > 0 ? 'unused_bench' : 'not_selected'),
  plannedMinutes,
  minutes: 0,
  started: false,
  goals: 0,
  assists: 0,
  xG: 0,
  xA: 0,
});

/** Idempotently writes the one authoritative row for a fixture. */
export const recordParticipation = (
  career: CareerState,
  record: SeasonParticipationRecord,
): CareerState => {
  const records = career.seasonParticipation ?? [];
  const index = records.findIndex((item) => item.fixtureId === record.fixtureId);
  const seasonParticipation =
    index < 0 ? [...records, record] : records.map((item, i) => (i === index ? record : item));
  if (
    new Set(seasonParticipation.map((item) => item.fixtureId)).size !== seasonParticipation.length
  )
    throw new Error('Duplicate season participation fixture.');
  return { ...career, seasonParticipation };
};

/** Creates the season ledger up front; completed rows are never overwritten. */
export const initializeSeasonParticipation = (career: CareerState): CareerState => {
  const season = career.leagueSeason;
  if (!season) return career;
  const existing = new Map((career.seasonParticipation ?? []).map((row) => [row.fixtureId, row]));
  const fixtures = season.rounds
    .flatMap((round) => round.fixtures)
    .filter((fixture) =>
      [fixture.homeClubId, fixture.awayClubId].includes(season.controlledClubId),
    );
  return {
    ...career,
    seasonParticipation: fixtures.map(
      (fixture) =>
        existing.get(fixture.id) ?? {
          fixtureId: fixture.id,
          seasonId: season.id,
          competitionId: season.competition.id,
          date: fixture.date,
          homeClubId: fixture.homeClubId,
          awayClubId: fixture.awayClubId,
          opponentId:
            fixture.homeClubId === season.controlledClubId
              ? fixture.awayClubId
              : fixture.homeClubId,
          venue: fixture.homeClubId === season.controlledClubId ? 'home' : 'away',
          competition: season.competition.name,
          fixtureStatus: 'scheduled',
          status: 'not_selected',
          plannedMinutes: 0,
          minutes: 0,
          started: false,
          goals: 0,
          assists: 0,
          xG: 0,
          xA: 0,
        },
    ),
  };
};

export const updateSelectionStanding = (standing: number | undefined, rating: number | undefined) =>
  Math.max(
    0,
    Math.min(
      100,
      Math.round((standing ?? 50) + (rating === undefined ? -0.25 : (rating - 6.5) * 1.5)),
    ),
  );

export const getInjuryDescription = (
  career: Pick<CareerState, 'playerAvailability'>,
): string | undefined => {
  const injury = career.playerAvailability?.injuries.find(
    (item) => item.status === 'active' && item.matchesRemaining > 0,
  );
  if (!injury) return undefined;
  const areas: Record<string, string> = {
    thigh: 'mięśnia uda',
    knee: 'kolana',
    ankle: 'stawu skokowego',
    calf: 'łydki',
    hamstring: 'mięśnia dwugłowego',
    foot: 'stopy',
  };
  const severity = {
    knock: 'stłuczenie',
    minor: 'lekki uraz',
    moderate: 'umiarkowany uraz',
    major: 'poważny uraz',
  }[injury.severity];
  return `${injury.severity === 'minor' ? 'Naciągnięcie' : 'Uraz'} ${areas[injury.bodyArea ?? ''] ?? injury.bodyArea ?? 'mięśniowy'} — ${severity} — przewidywany powrót: około ${injury.matchesRemaining} ${injury.matchesRemaining === 1 ? 'meczu' : 'meczów'}.`;
};
