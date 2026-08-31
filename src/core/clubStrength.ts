import type { CareerState, ProfessionalClub, SquadRole } from '../types/domain';
import { getEffectivePositionOverall, getPlayerOverall } from './playerOverall';
import { RandomGenerator } from './random/RandomGenerator';
import {
  deriveSquadHierarchy,
  getManagerPreferredFormation,
  getSportingStatus,
  getSquadDerivedClubStrength,
} from './footballerWorld';

export const getClubStrength = (
  club: Pick<ProfessionalClub, 'strengthRating' | 'overallStrength'>,
) => Math.max(0, Math.min(100, club.strengthRating ?? club.overallStrength ?? 50));

/** Live squad strength when normalized cards exist; legacy rating is bootstrap/fallback only. */
export const getCareerClubStrength = (
  career: Pick<CareerState, 'player' | 'footballerWorld'>,
  club: ProfessionalClub,
) => getSquadDerivedClubStrength(career, club) ?? getClubStrength(club);

export const getClubStars = (strength: number) =>
  Math.round(Math.max(0, Math.min(100, strength)) / 10) / 2;

/** Ephemeral match ratings: identity changes the balance, never the average quality. */
export const deriveClubMatchRatings = (
  club: Pick<
    ProfessionalClub,
    'id' | 'playingStyle' | 'archetype' | 'strengthRating' | 'overallStrength'
  >,
) => {
  const strength = getClubStrength(club);
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
  getPlayerOverall(career.player, career.player.primaryPosition) - getClubStrength(club);

/** Shared role evaluator used by offers, contracts and club presentation. */
export const getExpectedSquadRole = (career: CareerState, club: ProfessionalClub): SquadRole => {
  if ((club.squadPlayerIds?.length ?? 0) < 11) {
    const gap = getPlayerClubLevelDelta(career, club);
    if (gap >= 18) return 'star_player';
    if (gap >= 10) return 'important_player';
    if (gap >= 3) return 'first_team_competition';
    if (gap >= -5) return 'rotation';
    return 'development_player';
  }
  const squadIds = [...new Set([...(club.squadPlayerIds ?? []), career.player.id])];
  const projectedClub = { ...club, squadPlayerIds: squadIds };
  const hierarchy = deriveSquadHierarchy(
    career,
    projectedClub,
    getManagerPreferredFormation(club.managerId),
  );
  const status = getSportingStatus(hierarchy, career.player.id);
  const playerOverall = getPlayerOverall(career.player, career.player.primaryPosition);
  const bestCompetitor = Math.max(
    0,
    ...(club.squadPlayerIds ?? [])
      .filter((id) => id !== career.player.id)
      .map((id) => career.footballerWorld?.[id]?.profile)
      .filter(
        (player): player is NonNullable<typeof player> =>
          Boolean(player) && player!.positionFamiliarity[career.player.primaryPosition] >= 0.3,
      )
      .map((player) => getEffectivePositionOverall(player, career.player.primaryPosition)),
  );
  const margin = playerOverall - bestCompetitor;
  if (status === 'starting_xi' && margin >= 8) return 'star_player';
  if (status === 'starting_xi') return 'important_player';
  if (status === 'bench' && margin >= -4) return 'first_team_competition';
  if (status === 'bench') return 'rotation';
  return 'development_player';
};

export const describePlayerClubLevel = (delta: number) =>
  delta >= 10
    ? 'Przerastasz poziom większości podstawowego składu'
    : delta >= -3
      ? 'Jesteś na poziomie podstawowych zawodników'
      : 'Musisz walczyć o miejsce';
