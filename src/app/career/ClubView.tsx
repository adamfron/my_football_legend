import { StarRating } from '../../components/StarRating';
import { getCompetitionDefinition } from '../../core/competitionStrength';
import { getLeagueTable } from '../../core/leagueSeason';
import { getPlayerOverall } from '../../core/playerOverall';
import { getClubDevelopmentEnvironment, getClubMedicalQuality } from '../../core/professionalClubs';
import {
  describePlayerClubLevel,
  getClubStrength,
  getExpectedSquadRole,
  getPlayerClubLevelDelta,
} from '../../core/clubStrength';
import { squadRoleLabel } from '../../core/careerPresentation';
import type { CareerState } from '../../types/domain';

const prestigeLabel = (prestige: number) =>
  prestige < 25
    ? 'klub lokalny'
    : prestige < 45
      ? 'rozpoznawalny klub regionalny'
      : prestige < 60
        ? 'stabilny klub krajowy'
        : prestige < 75
          ? 'klub o wysokiej renomie'
          : prestige < 90
            ? 'krajowa potęga'
            : 'światowa marka';
const qualityLabel = (quality: number) =>
  quality >= 85
    ? 'elitarne'
    : quality >= 70
      ? 'bardzo dobre'
      : quality >= 55
        ? 'dobre'
        : quality >= 40
          ? 'przeciętne'
          : 'podstawowe';
const ClubCrest = ({ name }: { name: string }) => (
  <svg className="club-crest" viewBox="0 0 100 120" role="img" aria-label={`Herb ${name}`}>
    <path
      d="M12 10h76v48c0 29-18 45-38 54C30 103 12 87 12 58z"
      fill="#123727"
      stroke="#44d19d"
      strokeWidth="5"
    />
    <path d="M25 24h50v16H25zM28 51l22 35 22-35" fill="#44d19d" />
    <text x="50" y="103" textAnchor="middle" fontSize="14" fontWeight="900" fill="#eef7f1">
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase()}
    </text>
  </svg>
);
export const ClubView = ({ career }: { career: CareerState }) => {
  const club = career.currentClub;
  const professionalClub = career.currentProfessionalClub;
  const competition = getCompetitionDefinition(
    professionalClub?.leagueTier ?? career.leagueSeason?.competition.tier ?? 4,
  );
  const strength = professionalClub ? getClubStrength(professionalClub) : 50;
  const playerOVR = getPlayerOverall(career.player, career.player.primaryPosition);
  const currentRole = professionalClub
    ? getExpectedSquadRole(career, professionalClub)
    : career.currentContract?.squadRole;
  return (
    <div className="club-profile">
      <header className="club-header">
        <ClubCrest name={club.name} />
        <div>
          <h2>{club.name}</h2>
          <p>
            {club.region}, {club.country}
          </p>
          <p>
            {competition.name} — poziom {competition.tier}
          </p>
          <p>
            <StarRating strength={strength} /> · Siła klubu: {Math.round(strength)}/100
          </p>
          {professionalClub && (
            <p>
              Trening: {qualityLabel(getClubDevelopmentEnvironment(professionalClub))} · Zaplecze
              medyczne: {qualityLabel(getClubMedicalQuality(professionalClub))}
            </p>
          )}
          <strong>{prestigeLabel(club.prestige)}</strong>
        </div>
      </header>
      {career.currentContract && (
        <section>
          <h3>Twoja obecna rola</h3>
          <p>
            {currentRole
              ? squadRoleLabel(currentRole)
              : squadRoleLabel(career.currentContract!.squadRole)}
          </p>
          <p>
            OVR zawodnika: {playerOVR} · siła klubu: {Math.round(strength)}
          </p>
          <strong>
            {professionalClub
              ? describePlayerClubLevel(getPlayerClubLevelDelta(career, professionalClub))
              : describePlayerClubLevel(playerOVR - strength)}
          </strong>
        </section>
      )}
      <section>
        <h3>Tożsamość klubu</h3>
        <p>
          <strong>DNA:</strong> {club.dna.join(', ')}.
        </p>
        <p>
          <strong>Styl gry:</strong> {club.playStyle}.
        </p>
        <p>
          <strong>Młodzież:</strong> {club.youthApproach}.
        </p>
        <p>
          <strong>Sytuacja:</strong>{' '}
          {career.leagueSeason
            ? `${getLeagueTable(career).find((row) => row.clubId === career.leagueSeason?.controlledClubId)?.position ?? '—'}. miejsce w bieżącym sezonie.`
            : 'Trwa przygotowanie do kolejnego sezonu.'}
        </p>
      </section>
      {club.seasonHistory.length > 0 && (
        <section>
          <h3>Ostatni sezon</h3>
          {club.seasonHistory.map((s) => (
            <p key={s.season}>
              {s.season}: {s.placement ? `${s.placement}. miejsce. ` : ''}
              {s.summary}
            </p>
          ))}
        </section>
      )}
    </div>
  );
};
