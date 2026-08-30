import { StarRating } from '../../components/StarRating';
import { getCompetitionDefinition } from '../../core/competitionStrength';
import { getLeagueTable } from '../../core/leagueSeason';
import { getPlayerOverall } from '../../core/playerOverall';
import { getClubDevelopmentEnvironment, getClubMedicalQuality } from '../../core/professionalClubs';
import {
  describePlayerClubLevel,
  getCareerClubStrength,
  getExpectedSquadRole,
  getPlayerClubLevelDelta,
} from '../../core/clubStrength';
import { squadRoleLabel } from '../../core/careerPresentation';
import type { CareerState } from '../../types/domain';
import { ClubCrest } from '../../components/ClubCrest';
import { resolveClubVisualIdentity } from '../../core/clubVisualIdentity';
import {
  getManagerPreferredFormation,
  resolveFootballer,
  selectBestXI,
} from '../../core/footballerWorld';
import { getRankedFootballArchetypes } from '../../core/footballArchetypes';

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
export const ClubView = ({ career }: { career: CareerState }) => {
  const club = career.currentClub;
  const professionalClub = career.currentProfessionalClub;
  const competition = getCompetitionDefinition(
    professionalClub?.leagueTier ?? career.leagueSeason?.competition.tier ?? 4,
  );
  const strength = professionalClub ? getCareerClubStrength(career, professionalClub) : 50;
  const formation = professionalClub
    ? getManagerPreferredFormation(professionalClub.managerId)
    : undefined;
  const bestXI = professionalClub
    ? new Set(
        selectBestXI(career, professionalClub, formation).assignments.map(
          (item) => item.footballerId,
        ),
      )
    : new Set<string>();
  const playerOVR = getPlayerOverall(career.player, career.player.primaryPosition);
  const currentRole = professionalClub
    ? getExpectedSquadRole(career, professionalClub)
    : career.currentContract?.squadRole;
  return (
    <div className="club-profile">
      <header className="club-header">
        <ClubCrest
          name={club.name}
          identity={resolveClubVisualIdentity(career.seed, professionalClub ?? club)}
        />
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
      {professionalClub?.squadPlayerIds && formation && (
        <section className="club-squad">
          <h3>Kadra pierwszego zespołu</h3>
          <p>
            Preferowana formacja trenera: <strong>{formation}</strong> · aktualna siła XI:{' '}
            <strong>{strength}</strong>
          </p>
          <table>
            <thead>
              <tr>
                <th>Zawodnik</th>
                <th>Wiek</th>
                <th>Pozycja</th>
                <th>OVR</th>
                <th>Profil</th>
              </tr>
            </thead>
            <tbody>
              {professionalClub.squadPlayerIds
                .map((id) => resolveFootballer(career, id))
                .filter((player) => Boolean(player))
                .sort(
                  (a, b) =>
                    getPlayerOverall(b!, b!.primaryPosition) -
                    getPlayerOverall(a!, a!.primaryPosition),
                )
                .map(
                  (player) =>
                    player && (
                      <tr
                        key={player.id}
                        className={bestXI.has(player.id) ? 'selected-xi' : undefined}
                      >
                        <td>
                          {bestXI.has(player.id) ? '● ' : ''}
                          {player.id === career.player.id ? '★ ' : ''}
                          {player.firstName} {player.lastName}
                        </td>
                        <td>{player.age}</td>
                        <td>{player.primaryPosition}</td>
                        <td>{getPlayerOverall(player, player.primaryPosition)}</td>
                        <td>
                          {getRankedFootballArchetypes(player as typeof career.player)[0]
                            ?.definition.label ?? '—'}
                        </td>
                      </tr>
                    ),
                )}
            </tbody>
          </table>
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
