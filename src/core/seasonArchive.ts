import type { CareerState, CompletedSeasonSnapshot } from '../types/domain';
import { getLeagueTable } from './leagueSeason';
import { getPlayerOverall } from './playerOverall';
import { getSeasonOutfieldStats, participationMinutes } from './seasonParticipation';

export const createCompletedSeasonSnapshot = (career: CareerState): CompletedSeasonSnapshot => {
  const season = career.leagueSeason!;
  const row = getLeagueTable({ leagueSeason: season }).find(
    (r) => r.clubId === season.controlledClubId,
  )!;
  const fixtures = career.seasonParticipation ?? [];
  const participation = getSeasonOutfieldStats(fixtures);
  const start = { ...(career.seasonStartingAttributes ?? career.player.attributes) };
  const end = { ...career.player.attributes };
  return {
    seasonId: season.id,
    seasonNumber: career.careerSeasonNumber,
    label: `${career.currentSeason}/${career.currentSeason + 1}`,
    age: career.player.age,
    clubId: career.currentClub.id,
    clubName: career.currentClub.name,
    leagueLevel: season.competition.tier ?? 0,
    leagueName: season.competition.name,
    leagueTier: season.competition.tier,
    clubFinish: row.position,
    clubPoints: row.points,
    clubRecord: { won: row.won, drawn: row.drawn, lost: row.lost },
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    player: {
      ...participation,
      missedBySuspension: career.playerAvailability?.matchesMissedThroughSuspension ?? 0,
      missedByInjury: career.playerAvailability?.matchesMissedThroughInjury ?? 0,
    },
    development: {
      seasonEndAttributes: end,
      seasonStartOVR: getPlayerOverall(
        { ...career.player, attributes: start },
        career.player.primaryPosition,
      ),
      seasonEndOVR: getPlayerOverall(career.player, career.player.primaryPosition),
    },
    matches: fixtures.map((match) => ({
      matchId: match.fixtureId,
      date: match.date,
      opponentId: match.opponentId,
      venue: match.venue,
      ...(match.score ? { score: match.score } : {}),
      started: match.started,
      substitute: !match.started && participationMinutes(match) > 0,
      status: match.status,
      ...(match.metricsSource ? { metricsSource: match.metricsSource } : {}),
      ...(match.participationEvidence
        ? { participationEvidence: match.participationEvidence }
        : {}),
      ...(match.ratingProvenance ? { ratingProvenance: match.ratingProvenance } : {}),
      ...(match.assignedPosition ? { assignedPosition: match.assignedPosition } : {}),
      minutes: participationMinutes(match),
      goals: match.goals,
      assists: match.assists,
      ...(match.rating !== undefined ? { rating: match.rating } : {}),
      ...(match.yellowCards ? { yellowCards: match.yellowCards } : {}),
      ...(match.redCard ? { redCard: match.redCard } : {}),
      ...(match.canonicalStats && match.assignedPosition === 'goalkeeper'
        ? {
            goalkeeper: {
              saves: match.canonicalStats.saves,
              goalsConceded: match.canonicalStats.goalsConceded,
              cleanSheet:
                match.metricsSource !== 'canonical_plus_summary' &&
                participationMinutes(match) >= 60 &&
                match.canonicalStats.goalsConceded === 0,
            },
          }
        : match.goalkeeperStats
          ? {
              goalkeeper: {
                saves: match.goalkeeperStats.saves,
                goalsConceded: match.goalkeeperStats.goalsConceded,
                cleanSheet: match.goalkeeperStats.cleanSheet,
              },
            }
          : {}),
    })),
    milestones: career.historyFacts
      .filter((f) => f.season === career.currentSeason && f.narrativeImportance >= 80)
      .map((f) => f.id),
    seasonResult: career.seasonOutcome?.leagueOutcome,
  };
};
