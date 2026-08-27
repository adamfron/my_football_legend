import type { CareerState, CompletedSeasonSnapshot } from '../types/domain';
import { getLeagueTable } from './leagueSeason';
import { getPlayerOverall } from './playerOverall';
import { getSeasonOutfieldStats } from './seasonParticipation';

export const createCompletedSeasonSnapshot = (career: CareerState): CompletedSeasonSnapshot => {
  const season = career.leagueSeason!;
  const row = getLeagueTable({ leagueSeason: season }).find(
    (r) => r.clubId === season.controlledClubId,
  )!;
  const fixtures = (career.seasonParticipation ?? []).map((m) => structuredClone(m));
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
      seasonStartAttributes: start,
      seasonEndAttributes: end,
      seasonStartOVR: getPlayerOverall(
        { ...career.player, attributes: start },
        career.player.primaryPosition,
      ),
      seasonEndOVR: getPlayerOverall(career.player, career.player.primaryPosition),
    },
    fixtures,
    milestones: career.historyFacts
      .filter((f) => f.season === career.currentSeason && f.narrativeImportance >= 80)
      .map((f) => f.id),
    seasonResult: career.seasonOutcome?.leagueOutcome,
  };
};
