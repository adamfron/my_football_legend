import type {
  CareerState,
  Club,
  ClubCompetitiveProfile,
  MatchMomentResult,
  MatchTeamStats,
  PlayerPosition,
  SeasonPlayerSummary,
  SeasonSummary,
} from '../types/domain';
import { getSeasonOutfieldStats } from './seasonParticipation';

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
  const ledger =
    season === career.currentSeason
      ? (career.seasonParticipation ?? [])
      : ((career.completedSeasons ?? []).find((item) => item.label.startsWith(String(season)))
          ?.fixtures ?? []);
  const totals = getSeasonOutfieldStats(ledger);
  const rated = ledger.filter((m) => m.rating !== undefined && m.minutes > 0);
  const best = rated.reduce<(typeof rated)[number] | undefined>(
    (current, match) => (!current || match.rating! > current.rating! ? match : current),
    undefined,
  );
  return {
    ...totals,
    xG: round(totals.xG),
    xA: round(totals.xA),
    saves: ledger.reduce((sum, m) => sum + (m.goalkeeperStats?.saves ?? 0), 0),
    ...(rated.length
      ? { averageRating: round(rated.reduce((s, m) => s + m.rating!, 0) / rated.length, 1) }
      : {}),
    ...(best ? { bestRating: best.rating, bestMatchId: best.fixtureId } : {}),
    seniorAppearances: 0,
    academyAppearances: totals.appearances,
  };
};

export const getPlayerSeasonHistory = (career: CareerState) => {
  const seasons = new Set<number>([career.currentSeason]);
  for (const snapshot of career.completedSeasons ?? [])
    seasons.add(Number(snapshot.label.slice(0, 4)));
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
  const bestMatch = undefined;
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
