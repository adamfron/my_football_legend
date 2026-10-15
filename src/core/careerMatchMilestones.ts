import type { CareerState, HistoryFact } from '../types/domain';
import type { CareerMatchResult } from './careerMatchContract';

/** Reuse existing milestone vocabulary; the receipt owns the match, these facts own provenance. */
export const recordCanonicalCareerMilestones = (
  prior: CareerState,
  next: CareerState,
  result: CareerMatchResult,
): CareerState => {
  const participant = result.participants.find((p) => p.id === prior.player.id);
  if (!participant || participant.stats.minutesPlayed <= 0) return next;
  const level = prior.leagueSeason?.competition.category === 'professional' ? 'senior' : 'academy';
  const previous = (prior.matchHistory ?? []).filter((m) => m.teamLevel === level);
  const archived = (prior.completedSeasons ?? []).filter(
    (s) => s.leagueLevel > 0 === (level === 'senior'),
  );
  const conditions: Array<[string, boolean, number]> = [
    [
      'senior_debut',
      level === 'senior' &&
        !previous.some((m) => m.minutes > 0) &&
        !archived.some((s) => s.player.appearances > 0),
      90,
    ],
    [
      'first_senior_start',
      level === 'senior' &&
        participant.started &&
        !previous.some((m) => m.started) &&
        !archived.some((s) => s.player.starts > 0),
      92,
    ],
    [
      `first_${level}_goal`,
      participant.stats.goals > 0 &&
        !previous.some((m) => m.goals > 0) &&
        !archived.some((s) => s.player.goals > 0),
      level === 'senior' ? 92 : 68,
    ],
    [
      `first_${level}_assist`,
      participant.stats.assists > 0 &&
        !previous.some((m) => m.assists > 0) &&
        !archived.some((s) => s.player.assists > 0),
      level === 'senior' ? 88 : 65,
    ],
  ];
  const facts: HistoryFact[] = conditions
    .filter(([type, eligible]) => eligible && !prior.historyFacts.some((f) => f.factType === type))
    .map(([factType, , narrativeImportance]) => ({
      id: `canonical_milestone:${factType}:${prior.player.id}`,
      factType,
      season: prior.currentSeason,
      date: result.fixture.date,
      actors: [prior.player.id],
      targets: [],
      clubs: [prior.currentClub.id],
      competitions: [result.fixture.competitionId],
      data: {
        matchId: result.completedMatchId,
        fixtureId: result.fixture.id,
        source: result.continuation ? 'canonical_plus_summary' : 'canonical',
        minutes: participant.stats.minutesPlayed,
        started: participant.started,
      },
      causes: [`canonical_match:${result.fixture.id}`],
      tags: ['match', 'milestone', 'canonical'],
      visibility: 'public',
      narrativeImportance,
      emotionalTone: 'positive',
    }));
  return facts.length ? { ...next, historyFacts: [...next.historyFacts, ...facts] } : next;
};
