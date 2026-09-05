import { getCareerClubStrength } from '../../core/clubStrength';
import { resolveCoachProfile, coachProfileToPerson } from '../../core/coachProfiles';
import { getProfessionalCompetitionName } from '../../core/leagueSeason';
import { getPlayerOverall } from '../../core/playerOverall';
import {
  createCareerWorldFootballerResolver,
  resolveEffectiveProfessionalClub,
} from '../../core/worldDatabase';
import type { CareerState, ProfessionalClub } from '../../types/domain';
import { positionCode } from '../../core/positionPresentation';
import { StarRating } from '../../components/StarRating';

export const ClubPreview = ({
  career,
  club,
  children,
}: {
  career: CareerState;
  club: ProfessionalClub;
  children?: React.ReactNode;
}) => {
  const effective = resolveEffectiveProfessionalClub(career, club.id) ?? club;
  const resolve = createCareerWorldFootballerResolver(career, { cache: true });
  const players = (effective.squadPlayerIds ?? [])
    .map((id) => (id === career.player.id ? career.player : resolve(id)?.profile))
    .filter((p): p is CareerState['player'] => Boolean(p));
  const ranked = players
    .map((player) => ({ player, overall: getPlayerOverall(player, player.primaryPosition) }))
    .sort((a, b) => b.overall - a.overall || a.player.id.localeCompare(b.player.id));
  const talent = ranked.filter(({ player }) => player.age <= 21)[0];
  const coach = resolveCoachProfile(career, club.id);
  const person = coach
    ? coachProfileToPerson(coach, club, career.currentDate ?? `${career.currentSeason}-07-01`)
    : undefined;
  return (
    <span className="club-strength-tooltip" tabIndex={0}>
      {children ?? club.name}
      <span className="club-strength-tooltip__content club-preview" aria-hidden="true">
        <b>{club.name}</b>
        <span>{getProfessionalCompetitionName(club.leagueTier)}</span>
        <span>
          <StarRating strength={getCareerClubStrength(career, club)} /> ·{' '}
          {getCareerClubStrength(career, club)}/100
        </span>
        {coach && person && (
          <span>
            Trener: {person.firstName} {person.lastName} · {coach.preferredFormation} ·{' '}
            {coach.tacticalStyle}
          </span>
        )}
        <span>
          Najlepsi:{' '}
          {ranked
            .slice(0, 3)
            .map(
              ({ player, overall }) =>
                `${player.firstName} ${player.lastName} (${positionCode(player.primaryPosition)} ${overall})`,
            )
            .join(', ')}
        </span>
        {talent && (
          <span>
            Talent U21: {talent.player.firstName} {talent.player.lastName} · {talent.overall} OVR
          </span>
        )}
      </span>
    </span>
  );
};
