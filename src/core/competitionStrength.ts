export interface CompetitionDefinition {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  strengthRating: number;
  reputation: number;
  promotionTier?: 1 | 2 | 3;
  relegationTier?: 2 | 3 | 4;
}

/** The single authoritative definition of the Polish professional pyramid. */
export const POLISH_LEAGUE_PYRAMID: readonly CompetitionDefinition[] = [
  {
    id: 'pl-1',
    name: 'Polska Liga Elitarna',
    tier: 1,
    strengthRating: 71,
    reputation: 82,
    relegationTier: 2,
  },
  {
    id: 'pl-2',
    name: 'Polska Liga Krajowa',
    tier: 2,
    strengthRating: 64,
    reputation: 66,
    promotionTier: 1,
    relegationTier: 3,
  },
  {
    id: 'pl-3',
    name: 'Polska Liga Regionalna',
    tier: 3,
    strengthRating: 57,
    reputation: 48,
    promotionTier: 2,
    relegationTier: 4,
  },
  {
    id: 'pl-4',
    name: 'Polska Liga Okręgowa',
    tier: 4,
    strengthRating: 51,
    reputation: 32,
    promotionTier: 3,
  },
] as const;

export const getCompetitionDefinition = (tier: number) =>
  POLISH_LEAGUE_PYRAMID[Math.max(1, Math.min(4, Math.round(tier))) - 1]!;

/** @deprecated Use POLISH_LEAGUE_PYRAMID/getCompetitionDefinition. */
export const COMPETITION_STRENGTH = Object.fromEntries(
  POLISH_LEAGUE_PYRAMID.map((competition) => [competition.tier, competition]),
) as Record<1 | 2 | 3 | 4, CompetitionDefinition>;

export const getCompetitionStrength = (competition: { strengthRating?: number; tier?: number }) =>
  competition.strengthRating ?? getCompetitionDefinition(competition.tier ?? 3).strengthRating;
