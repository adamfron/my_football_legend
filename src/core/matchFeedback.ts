import type {
  CareerState,
  Club,
  ClubCompetitiveProfile,
  MatchAppearance,
  MatchMomentResult,
  MatchTeamStats,
  PlayerPosition,
  SeasonPlayerSummary,
  SeasonSummary,
} from '../types/domain';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export const evaluateMatchRating = (input: {
  position: PlayerPosition | string;
  minutes: number;
  results: MatchMomentResult[];
  goalsFor?: number;
  goalsAgainst?: number;
}): number | undefined => {
  if (input.minutes <= 0) return undefined;
  let value = 6;
  for (const result of input.results) {
    const importance = result.moment.minute >= 75 ? 1.12 : 1;
    const outcome = (
      { excellent: 0.48, good: 0.25, mixed: 0, poor: -0.22, costly: -0.55 } as const
    )[result.tier];
    value += outcome * importance + result.personalImpact * 0.035;
    value += result.goals * 0.72 + result.assists * 0.48 + result.keyPasses * 0.1;
    value += result.xA * (result.assists ? 0.15 : 0.42);
    if (result.xG > 0 && result.goals === 0 && ['poor', 'costly'].includes(result.tier))
      value -= result.xG * 0.62;
    if (String(input.position).includes('midfielder'))
      value += result.defensiveActions * 0.12 + result.keyPasses * 0.08;
    if (['center_back', 'full_back'].includes(String(input.position)))
      value += result.defensiveActions * 0.2;
    if (String(input.position).includes('goalkeeper'))
      value += result.saves * 0.16 - (result.tier === 'costly' ? 0.3 : 0);
  }
  if (input.minutes >= 60 && input.results.length === 0) value -= 0.15;
  return round(clamp(value, 3, 10), 1);
};

export const describePerformance = (rating: number | undefined, minutes: number, won: boolean) => {
  if (rating === undefined) return 'Bez występu';
  if (minutes < 20 && rating >= 6.7) return 'Obiecujące wejście z ławki';
  if (rating >= 8.5) return 'Znakomity występ';
  if (rating >= 7.6) return won ? 'Bardzo mocny występ' : 'Dobry występ mimo porażki';
  if (rating >= 6.9) return 'Dobry występ';
  if (rating >= 6.3) return 'Solidny występ';
  if (rating >= 5.6) return 'Nierówny mecz';
  return rating >= 4.6 ? 'Trudny występ' : 'Bardzo słaby występ';
};

export const getSeasonPlayerSummary = (
  career: CareerState,
  season: number,
): SeasonPlayerSummary => {
  const matches = (career.matchHistory ?? []).filter(
    (m) => m.date >= `${season}-07-01` && m.date <= `${season + 1}-06-30`,
  );
  const rated = matches.filter((m) => m.rating !== undefined);
  const best = rated.reduce<MatchAppearance | undefined>(
    (current, match) => (!current || match.rating! > current.rating! ? match : current),
    undefined,
  );
  return {
    appearances: matches.filter((m) => m.minutes > 0).length,
    starts: matches.filter((m) => m.started && m.minutes > 0).length,
    substituteAppearances: matches.filter((m) => !m.started && m.minutes > 0).length,
    minutes: matches.reduce((s, m) => s + m.minutes, 0),
    goals: matches.reduce((s, m) => s + m.goals, 0),
    assists: matches.reduce((s, m) => s + m.assists, 0),
    xG: round(matches.reduce((s, m) => s + m.xG, 0)),
    xA: round(matches.reduce((s, m) => s + m.xA, 0)),
    keyPasses: matches.reduce((s, m) => s + m.keyPasses, 0),
    defensiveActions: matches.reduce((s, m) => s + m.defensiveActions, 0),
    saves: matches.reduce((s, m) => s + m.saves, 0),
    yellowCards: matches.reduce((s, m) => s + (m.minutes > 0 ? (m.yellowCards ?? 0) : 0), 0),
    redCards: matches.filter((m) => m.minutes > 0 && m.redCard !== undefined).length,
    ...(rated.length
      ? { averageRating: round(rated.reduce((s, m) => s + m.rating!, 0) / rated.length, 1) }
      : {}),
    ...(best ? { bestRating: best.rating, bestMatchId: best.matchId } : {}),
    seniorAppearances: matches.filter((m) => m.minutes > 0 && m.teamLevel === 'senior').length,
    academyAppearances: matches.filter((m) => m.minutes > 0 && m.teamLevel === 'academy').length,
  };
};

export const getPlayerSeasonHistory = (career: CareerState) => {
  const seasons = new Set<number>([career.currentSeason]);
  for (const match of career.matchHistory ?? []) {
    const year = Number(match.date.slice(0, 4));
    seasons.add(match.date.slice(5, 7) < '07' ? year - 1 : year);
  }
  return [...seasons]
    .sort((a, b) => b - a)
    .map((season) => ({
      season,
      label: `${season}/${String(season + 1).slice(-2)}`,
      statistics: getSeasonPlayerSummary(career, season),
    }));
};

export const buildSeasonSummary = (career: CareerState, season: number): SeasonSummary => {
  const statistics = getSeasonPlayerSummary(career, season);
  const bestMatch = (career.matchHistory ?? []).find((m) => m.matchId === statistics.bestMatchId);
  const facts = career.historyFacts.filter((f) => f.season === season);
  return {
    statistics,
    ...(bestMatch ? { bestMatch } : {}),
    majorFacts: facts.filter((f) => f.narrativeImportance >= 60),
    attributeChanges: facts
      .filter((f) => f.factType === 'attribute_changed')
      .map((f) => f.data as unknown as SeasonSummary['attributeChanges'][number]),
    unlockedPlayStyles: facts
      .filter((f) => f.factType === 'play_style_unlocked')
      .map((f) => f.data as unknown as SeasonSummary['unlockedPlayStyles'][number]),
  };
};

export const getClubStrengthPresentation = (club: Club, profile: ClubCompetitiveProfile) => {
  const overall =
    profile.overallStrength >= 65
      ? 'należy do najmocniejszych zespołów swojego poziomu'
      : profile.overallStrength >= 52
        ? 'należy do solidnych zespołów swojego poziomu'
        : 'wciąż buduje pozycję na swoim poziomie';
  const strongest = Object.entries(profile.positionalUnits).sort(
    (a, b) => b[1].starterQuality - a[1].starterQuality,
  )[0]![0];
  const names: Record<string, string> = {
    goalkeeper: 'Obsada bramki',
    defense: 'Obrona',
    midfield: 'Środek pola',
    attack: 'Atak',
  };
  return {
    overall: `${club.name} ${overall}.`,
    formation: `${names[strongest]} jest jedną z mocniejszych części drużyny.`,
    competition:
      profile.positionalUnits[strongest as keyof typeof profile.positionalUnits].depth === 'deep'
        ? 'Na twojej pozycji konkurencja pozostaje duża.'
        : 'Droga do regularnej gry pozostaje otwarta.',
  };
};

export const normalizeTeamStats = (stats: { home: MatchTeamStats; away: MatchTeamStats }) => ({
  home: {
    ...stats.home,
    shotsOnTarget: Math.min(stats.home.shots, stats.home.shotsOnTarget),
    xG: Math.max(0, round(stats.home.xG)),
  },
  away: {
    ...stats.away,
    possession: 100 - stats.home.possession,
    shotsOnTarget: Math.min(stats.away.shots, stats.away.shotsOnTarget),
    xG: Math.max(0, round(stats.away.xG)),
  },
});
