import type { CareerState, ProfessionalClub, SquadRole } from '../types/domain';
import { getPlayerOverall } from './playerOverall';

export const getClubStrength = (
  club: Pick<ProfessionalClub, 'strengthRating' | 'overallStrength'>,
) => Math.max(0, Math.min(100, club.strengthRating ?? club.overallStrength ?? 50));

export const getClubStars = (strength: number) =>
  Math.round(Math.max(0, Math.min(100, strength)) / 10) / 2;

const positionGroup = (position: string): keyof ProfessionalClub['positionalNeeds'] =>
  position.includes('goal')
    ? 'goalkeeper'
    : position.includes('back')
      ? 'defense'
      : position.includes('mid') || position === 'winger'
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
