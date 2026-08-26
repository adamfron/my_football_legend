import type { CareerState, CompletedSeasonSnapshot, MatchAppearance } from '../types/domain';
import { getLeagueTable } from './leagueSeason';
import { getPlayerOverall } from './playerOverall';

export const createCompletedSeasonSnapshot = (career: CareerState): CompletedSeasonSnapshot => {
  const season = career.leagueSeason!;
  const row = getLeagueTable({ leagueSeason: season }).find(r => r.clubId === season.controlledClubId)!;
  const fixtures = (career.matchHistory ?? []).filter(m => m.date >= season.startDate && m.date <= season.endDate).map(m => ({ ...m }));
  const sum = (key: keyof MatchAppearance) => fixtures.reduce((n, m) => n + (typeof m[key] === 'number' ? Number(m[key]) : 0), 0);
  const ratings = fixtures.flatMap(m => m.rating === undefined ? [] : [m.rating]);
  const start = { ...(career.seasonStartingAttributes ?? career.player.attributes) };
  const end = { ...career.player.attributes };
  return { seasonId: season.id, seasonNumber: career.careerSeasonNumber, label: `${career.currentSeason}/${career.currentSeason + 1}`,
    age: career.player.age, clubId: career.currentClub.id, clubName: career.currentClub.name,
    leagueLevel: season.competition.tier ?? 0, leagueName: season.name, clubFinish: row.position, clubPoints: row.points,
    clubRecord: { won: row.won, drawn: row.drawn, lost: row.lost }, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst,
    player: { appearances: fixtures.filter(m => m.minutes > 0).length, starts: fixtures.filter(m => m.started).length,
      minutes: sum('minutes'), goals: sum('goals'), assists: sum('assists'), xG: sum('xG'), xA: sum('xA'),
      keyPasses: sum('keyPasses'), defensiveActions: sum('defensiveActions'), averageRating: ratings.length ? ratings.reduce((a,b)=>a+b,0)/ratings.length : 0,
      yellowCards: sum('yellowCards'), redCards: fixtures.filter(m => m.redCard).length,
      missedBySuspension: career.playerAvailability?.matchesMissedThroughSuspension ?? 0, missedByInjury: career.playerAvailability?.matchesMissedThroughInjury ?? 0 },
    development: { seasonStartAttributes: start, seasonEndAttributes: end,
      seasonStartOVR: getPlayerOverall({ ...career.player, attributes: start }, career.player.primaryPosition), seasonEndOVR: getPlayerOverall(career.player, career.player.primaryPosition) },
    fixtures, milestones: career.historyFacts.filter(f => f.season === career.currentSeason && f.narrativeImportance >= 80).map(f => f.id) };
};
