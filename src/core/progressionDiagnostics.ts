import type { CareerState, MatchState } from '../types/domain';
import { getCurrentCareerWeek, getCurrentFixture } from './careerWeeks';
import { MATCH_MOMENT_LIBRARY } from './matchEngine';

export const matchStateSummary = (match?: MatchState) =>
  match
    ? {
        id: match.id,
        minute: match.currentMinute,
        score: `${match.homeGoals}:${match.awayGoals}`,
        playerMinutes: match.playerMinutes,
        currentMomentId: match.currentMoment
          ? `${match.id}:${match.currentMoment.minute}`
          : undefined,
        definitionId: match.currentMoment?.definitionId,
        resolvedMoments: match.resolvedMoments.length,
        completed: match.completed,
      }
    : undefined;

export const diagnoseCareerProgression = (career: CareerState) => {
  const week = getCurrentCareerWeek(career);
  const fixture = getCurrentFixture(career);
  const reasons: string[] = [];
  const match = career.activeMatch;
  if (
    match &&
    !match.completed &&
    match.currentMoment &&
    !MATCH_MOMENT_LIBRARY.some((d) => d.id === match.currentMoment!.definitionId)
  )
    reasons.push('currentMatch has unresolved stale moment');
  if (!week && !career.leagueSeason?.completed && career.careerStatus !== 'retired')
    reasons.push('no current week');
  if (career.activeEvent && !career.activeEvent.definitionId)
    reasons.push('active event missing definition');
  if (career.leagueSeason?.completed && !career.seasonOutcome)
    reasons.push('season completed but rollover unavailable');
  return {
    careerSeasonNumber: career.careerSeasonNumber,
    currentSeason: career.currentSeason,
    currentClub: career.currentClub.id,
    careerWeek: week?.weekIndex,
    seasonProgress: career.leagueSeason?.currentRound,
    currentFixture: fixture?.id,
    activeEvent: career.activeEvent?.definitionId,
    currentMatch: matchStateSummary(match),
    summerWindow: career.careerPhase === 'summer_window',
    careerStatus: career.careerStatus,
    canAdvance: reasons.length === 0,
    reasons,
  };
};
