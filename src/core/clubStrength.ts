import type { CareerState, ProfessionalClub, SquadRole } from '../types/domain';
import { getEffectivePositionOverall, getPlayerOverall } from './playerOverall';
import { RandomGenerator } from './random/RandomGenerator';
import {
  deriveSquadHierarchy,
  getContextualSquadRole,
  getPositionalCompetition,
  getSportingStatus,
  getSquadDerivedClubStrength,
} from './footballerWorld';
import { resolveEffectiveProfessionalClub } from './worldDatabase';

/** Generation-only quality target used before a normalized senior squad exists. */
export const getBootstrapClubStrength = (
  club: Pick<ProfessionalClub, 'strengthRating' | 'overallStrength'>,
) => Math.max(0, Math.min(100, club.strengthRating ?? club.overallStrength ?? 50));

const liveStrengthCache = new WeakMap<object, Map<string, number>>();

/** The only live sporting-strength resolver. A broken professional squad is an integrity error. */
export const getCareerClubStrength = (career: CareerState, club: ProfessionalClub) => {
  if (!career.footballerWorld) return getBootstrapClubStrength(club);
  const storedClub = career.clubWorld?.find((item) => item.id === club.id);
  if (!storedClub || storedClub.squadPlayerIds === undefined) return getBootstrapClubStrength(club);
  const effective = resolveEffectiveProfessionalClub(career, club.id) ?? club;
  // An absent membership list is the explicit pre-normalization bootstrap boundary.
  // An initialized (including empty) list must satisfy the legal-XI invariant.
  if (effective.squadPlayerIds === undefined) return getBootstrapClubStrength(club);
  const key = `${career.seed}:${club.id}:${career.currentDate ?? ''}:${effective.managerId ?? ''}:${effective.squadPlayerIds.join(',')}`;
  let strengths = liveStrengthCache.get(career);
  if (!strengths) {
    strengths = new Map();
    liveStrengthCache.set(career, strengths);
  }
  const cached = strengths.get(key);
  if (cached !== undefined) return cached;
  const strength = getSquadDerivedClubStrength(career, effective);
  if (strength === undefined) {
    throw new Error(`Professional club ${club.id} has no canonical legal XI`);
  }
  strengths.set(key, strength);
  return strength;
};

export const getClubStars = (strength: number) =>
  Math.round(Math.max(0, Math.min(100, strength)) / 10) / 2;

/** One display policy for canonical (possibly fractional) club strength. */
export const getClubStrengthPresentation = (strength: number) => ({
  displayedInteger: Math.round(Math.max(0, Math.min(100, strength))),
  stars: getClubStars(strength),
});

/** Ephemeral match ratings: identity changes the balance, never the average quality. */
export const deriveBootstrapClubMatchRatings = (
  club: Pick<
    ProfessionalClub,
    'id' | 'playingStyle' | 'archetype' | 'strengthRating' | 'overallStrength'
  >,
) => {
  const strength = getBootstrapClubStrength(club);
  const rng = RandomGenerator.fromSeed(
    `club-match-profile:${club.id}:${club.playingStyle}:${club.archetype}`,
  );
  const styleBias = club.playingStyle.includes('pressing')
    ? 2
    : club.playingStyle.includes('posiadanie')
      ? 1
      : 0;
  const bias = Math.max(-5, Math.min(5, rng.int(-4, 4) + styleBias));
  return {
    strength,
    attackStrength: Math.max(1, Math.min(99, strength + bias)),
    defenseStrength: Math.max(1, Math.min(99, strength - bias)),
  };
};

/** Match profile centered on the same live canonical XI used by ClubView. */
export const deriveCareerClubMatchRatings = (career: CareerState, club: ProfessionalClub) => {
  const strength = getCareerClubStrength(career, club);
  const rng = RandomGenerator.fromSeed(
    `club-match-profile:${club.id}:${club.playingStyle}:${club.archetype}`,
  );
  const styleBias = club.playingStyle.includes('pressing')
    ? 2
    : club.playingStyle.includes('posiadanie')
      ? 1
      : 0;
  const bias = Math.max(-5, Math.min(5, rng.int(-4, 4) + styleBias));
  return {
    strength,
    attackStrength: Math.max(1, Math.min(99, strength + bias)),
    defenseStrength: Math.max(1, Math.min(99, strength - bias)),
  };
};

export const getPlayerClubLevelDelta = (career: CareerState, club: ProfessionalClub) =>
  getPlayerOverall(career.player, career.player.primaryPosition) -
  getCareerClubStrength(career, club);

/** Shared role evaluator used by offers, contracts and club presentation. */
export const getExpectedSquadRole = (career: CareerState, club: ProfessionalClub): SquadRole => {
  const effectiveClub = resolveEffectiveProfessionalClub(career, club.id) ?? club;
  if ((effectiveClub.squadPlayerIds?.length ?? 0) < 11) {
    const gap = getPlayerClubLevelDelta(career, club);
    if (gap >= 18) return 'star_player';
    if (gap >= 10) return 'important_player';
    if (gap >= 3) return 'first_team_competition';
    if (gap >= -5) return 'rotation';
    return career.player.age <= 21 ? 'development_player' : 'rotation';
  }
  const squadIds = [...new Set([...(effectiveClub.squadPlayerIds ?? []), career.player.id])];
  const projectedClub = { ...effectiveClub, squadPlayerIds: squadIds };
  const hierarchy = deriveSquadHierarchy(career, projectedClub);
  const status = getSportingStatus(hierarchy, career.player.id);
  const position =
    [...hierarchy.preferredXI, ...hierarchy.bench].find(
      (item) => item.footballerId === career.player.id,
    )?.position ?? career.player.primaryPosition;
  const playerOverall = getEffectivePositionOverall(career.player, position);
  const bestCompetitor = Math.max(
    0,
    ...getPositionalCompetition(career, projectedClub, position, hierarchy)
      .filter(({ player }) => player.id !== career.player.id)
      .map(({ effectiveOverall }) => effectiveOverall),
  );
  const margin = playerOverall - bestCompetitor;
  return getContextualSquadRole(status, career.player.age, margin);
};

export const describePlayerClubLevel = (delta: number) =>
  delta >= 10
    ? 'Przerastasz poziom większości podstawowego składu'
    : delta >= -3
      ? 'Jesteś na poziomie podstawowych zawodników'
      : 'Musisz walczyć o miejsce';
