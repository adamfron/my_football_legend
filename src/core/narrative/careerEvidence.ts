import type { CareerState, HistoryFact } from '../../types/domain';
import { hasCareerFactType } from '../history/careerMemory';

export const hasLevelMilestone = (
  career: CareerState,
  level: 'senior' | 'academy',
  metric: 'appearances' | 'starts' | 'goals' | 'assists',
) => {
  const type =
    metric === 'appearances'
      ? `${level}_debut`
      : metric === 'starts'
        ? `first_${level}_start`
        : `first_${level}_${metric === 'goals' ? 'goal' : 'assist'}`;
  return (
    hasCareerFactType(career, type) ||
    (career.completedSeasons ?? []).some(
      (s) => s.leagueLevel > 0 === (level === 'senior') && s.player[metric] > 0,
    ) ||
    (career.matchHistory ?? []).some(
      (m) =>
        m.teamLevel === level &&
        (metric === 'appearances'
          ? m.minutes > 0
          : metric === 'starts'
            ? m.started
            : m[metric] > 0),
    )
  );
};

/** Outcome ownership is captured before a transfer, retirement or rollover can change club identity. */
export const recordSeasonAchievements = (career: CareerState): CareerState => {
  const season = career.leagueSeason,
    outcome = career.seasonOutcome;
  if (!season?.completed || !outcome || season.controlledClubId !== career.currentClub.id)
    return career;
  const tier = outcome.previousLeagueTier ?? season.competition.tier;
  const types = ['season_completed'];
  const seasonsRecorded = new Set((career.completedSeasons ?? []).map((s) => s.seasonId));
  seasonsRecorded.add(season.id);
  if ([5, 10, 15, 20, 25].includes(seasonsRecorded.size)) types.push('career_longevity');
  if (outcome.competitionType === 'professional') {
    if (tier === 1 && outcome.finalPosition === 1) types.push('top_tier_champion');
    else if (tier && tier > 1 && outcome.finalPosition === 1) types.push('division_winner');
    if (outcome.leagueOutcome === 'promoted') types.push('club_promoted');
    if (outcome.leagueOutcome === 'relegated') types.push('club_relegated');
  }
  const facts: HistoryFact[] = types
    .filter(
      (type) =>
        !career.historyFacts.some(
          (f) =>
            f.factType === type &&
            (f.data.seasonId === season.id ||
              (f.season === career.currentSeason && f.clubs.includes(career.currentClub.id))),
        ),
    )
    .map((factType) => ({
      id: `season:${season.id}:${career.currentClub.id}:${factType}`,
      factType,
      season: career.currentSeason,
      date: season.endDate,
      actors: [career.player.id],
      targets: [],
      clubs: [career.currentClub.id],
      competitions: [season.competition.id],
      data: {
        seasonId: season.id,
        clubName: career.currentClub.name,
        competition: season.competition.name,
        finalPosition: outcome.finalPosition,
        completedSeasons: seasonsRecorded.size,
        fromTier: tier,
        toTier: outcome.nextLeagueTier,
      },
      causes: [],
      tags: [
        'career_transition',
        'season',
        ...(factType === 'season_completed' ? [] : ['milestone']),
      ],
      visibility: 'public',
      narrativeImportance: factType === 'season_completed' ? 60 : 95,
      emotionalTone:
        factType === 'club_relegated'
          ? 'negative'
          : factType === 'season_completed'
            ? 'neutral'
            : 'positive',
    }));
  return facts.length ? { ...career, historyFacts: [...career.historyFacts, ...facts] } : career;
};

/** Old duplicated firsts remain in the save as evidence, but present only the earliest event. */
export const getDistinctCareerFacts = (facts: HistoryFact[]) => {
  const seen = new Set<string>();
  return [...facts]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .filter((f) => {
      const key = /^(first_(senior|academy)_|senior_debut$|academy_debut$)/.test(f.factType)
        ? `${f.factType}:${f.actors[0] ?? ''}`
        : [
              'top_tier_champion',
              'division_winner',
              'club_promoted',
              'club_relegated',
              'season_completed',
            ].includes(f.factType)
          ? `${f.factType}:${f.data.seasonId ?? f.season}:${f.clubs[0] ?? ''}`
          : f.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/** A small lifetime threshold set, based on snapshots plus the authoritative current ledger. */
export const recordParticipationMilestones = (career: CareerState): CareerState => {
  const archived = [
    ...new Map((career.completedSeasons ?? []).map((s) => [s.seasonId, s])).values(),
  ];
  const rows = archived.some((s) => s.seasonId === career.leagueSeason?.id)
    ? []
    : (career.seasonParticipation ?? []).filter(
        (r) => (r.canonicalStats?.minutesPlayed ?? r.minutes) > 0,
      );
  const totals = {
    appearances: archived.reduce((n, s) => n + s.player.appearances, 0) + rows.length,
    starts:
      archived.reduce((n, s) => n + s.player.starts, 0) + rows.filter((r) => r.started).length,
    goals: archived.reduce((n, s) => n + s.player.goals, 0) + rows.reduce((n, r) => n + r.goals, 0),
    assists:
      archived.reduce((n, s) => n + s.player.assists, 0) + rows.reduce((n, r) => n + r.assists, 0),
    cleanSheets:
      archived.reduce(
        (n, s) =>
          n +
          s.matches.filter(
            (m) =>
              m.minutes > 0 &&
              m.goalkeeper?.cleanSheet &&
              m.metricsSource !== 'canonical_plus_summary',
          ).length,
        0,
      ) +
      rows.filter(
        (r) =>
          r.goalkeeperStats?.cleanSheet ||
          (r.assignedPosition === 'goalkeeper' &&
            r.metricsSource === 'canonical' &&
            (r.canonicalStats?.minutesPlayed ?? r.minutes) >= 60 &&
            r.canonicalStats?.goalsConceded === 0),
      ).length,
  };
  const thresholds = {
    appearances: [50, 100, 250, 500],
    starts: [100, 250],
    goals: [50, 100, 200],
    assists: [50, 100, 200],
    cleanSheets: [50, 100],
  };
  const facts: HistoryFact[] = [];
  for (const metric of Object.keys(thresholds) as Array<keyof typeof totals>)
    for (const threshold of thresholds[metric]) {
      const id = `career_threshold:${career.player.id}:${metric}:${threshold}`;
      const latest = rows.at(-1);
      const contribution = !latest
        ? 0
        : metric === 'appearances'
          ? 1
          : metric === 'starts'
            ? Number(latest.started)
            : metric === 'cleanSheets'
              ? Number(
                  Boolean(
                    latest.goalkeeperStats?.cleanSheet ||
                      (latest.assignedPosition === 'goalkeeper' &&
                        latest.metricsSource === 'canonical' &&
                        (latest.canonicalStats?.minutesPlayed ?? latest.minutes) >= 60 &&
                        latest.canonicalStats?.goalsConceded === 0),
                  ),
                )
              : latest[metric];
      if (
        totals[metric] < threshold ||
        totals[metric] - contribution >= threshold ||
        career.historyFacts.some((f) => f.id === id)
      )
        continue;
      facts.push({
        id,
        factType: 'career_stat_milestone',
        season: career.currentSeason,
        date: latest?.date ?? career.currentDate ?? `${career.currentSeason}-07-01`,
        actors: [career.player.id],
        targets: [],
        clubs: [career.currentClub.id],
        competitions: career.leagueSeason ? [career.leagueSeason.competition.id] : [],
        data: {
          metric,
          threshold,
          clubName: career.currentClub.name,
          fixtureId: latest?.fixtureId,
        },
        causes: [],
        tags: ['milestone', 'statistics'],
        visibility: 'public',
        narrativeImportance: 80,
        emotionalTone: 'positive',
      });
    }
  // Youth debut has no separate owner in the legacy summary runner.
  if (
    career.leagueSeason?.competition.category === 'youth' &&
    rows.length &&
    !hasCareerFactType(career, 'academy_debut') &&
    !archived.some((s) => s.leagueLevel === 0 && s.player.appearances > 0)
  ) {
    const first = rows[0]!;
    facts.push({
      id: `career_debut:${career.player.id}:academy`,
      factType: 'academy_debut',
      season: career.currentSeason,
      date: first.date,
      actors: [career.player.id],
      targets: [],
      clubs: [career.currentClub.id],
      competitions: [career.leagueSeason.competition.id],
      data: { fixtureId: first.fixtureId, clubName: career.currentClub.name },
      causes: [],
      tags: ['milestone', 'match'],
      visibility: 'public',
      narrativeImportance: 65,
      emotionalTone: 'positive',
    });
  }
  return facts.length ? { ...career, historyFacts: [...career.historyFacts, ...facts] } : career;
};
