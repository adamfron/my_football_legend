import type { CareerState, ProfessionalClub, SquadRole } from '../types/domain';
import { getPlayerOverall } from './playerOverall';
import { RandomGenerator } from './random/RandomGenerator';
import { getSquadDerivedClubStrength } from './footballerWorld';

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

const positionGroup = (position: string): keyof ProfessionalClub['positionalNeeds'] =>
  position.includes('goal')
    ? 'goalkeeper'
    : position.includes('back')
      ? 'defense'
      : position.includes('mid') || position === 'left_winger' || position === 'right_winger'
        ? 'midfield'
        : 'attack';

export const getPlayerClubLevelDelta = (career: CareerState, club: ProfessionalClub) =>
  getPlayerOverall(career.player, career.player.primaryPosition) - getClubStrength(club);

/** Shared role evaluator used by offers, contracts and club presentation. */
export const getExpectedSquadRole = (career: CareerState, club: ProfessionalClub): SquadRole => {
  const need = club.positionalNeeds[positionGroup(career.player.primaryPosition)];
  const qualityGap = getPlayerClubLevelDelta(career, club);
  // Need and form may move a borderline player, never erase a large quality gap.
  const modifier = Math.max(-2, Math.min(2, (need.needLevel - 50) / 25));
  const adjusted = qualityGap + modifier;
  if (qualityGap >= 20 || adjusted >= 18) return 'star_player';
  if (adjusted >= 12) return 'important_player';
  if (adjusted >= 4) return 'first_team_competition';
  if (adjusted >= -5) return 'rotation';
  return 'development_player';
};

export const describePlayerClubLevel = (delta: number) =>
  delta >= 10
    ? 'Przerastasz poziom większości podstawowego składu'
    : delta >= -3
      ? 'Jesteś na poziomie podstawowych zawodników'
      : 'Musisz walczyć o miejsce';
