import { useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { StarRating } from '../../components/StarRating';
import { ClubCrest } from '../../components/ClubCrest';
import { getCompetitionDefinition } from '../../core/competitionStrength';
import { getLeagueTable } from '../../core/leagueSeason';
import { getPlayerOverall } from '../../core/playerOverall';
import { getClubDevelopmentEnvironment, getClubMedicalQuality } from '../../core/professionalClubs';
import { getCareerClubStrength } from '../../core/clubStrength';
import { sportingStatusLabel, squadRoleLabel } from '../../core/careerPresentation';
import type { CareerState, FootballerProfile, Id } from '../../types/domain';
import { resolveClubVisualIdentity } from '../../core/clubVisualIdentity';
import {
  deriveSquadHierarchy,
  getPositionalCompetition,
  getSportingStatus,
  getManagerPreferredFormation,
  resolveFootballer,
  type BestXIAssignment,
} from '../../core/footballerWorld';
import { getRankedFootballArchetypes } from '../../core/footballArchetypes';
import { positionCode, positionLabel } from '../shared/positionPresentation';
import { FootballerHoverCard } from '../shared/FootballerHoverCard';
import { SquadPitch } from './SquadPitch';

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
type Preview = { id: Id; anchor: DOMRect };

const PlayerName = ({
  player,
  protagonist,
  open,
  close,
}: {
  player: FootballerProfile;
  protagonist: boolean;
  open: (id: Id, anchor: DOMRect) => void;
  close: () => void;
}) => {
  const show = (event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) =>
    open(player.id, event.currentTarget.getBoundingClientRect());
  return (
    <button
      className="footballer-name"
      type="button"
      onMouseEnter={show}
      onFocus={show}
      onClick={show}
      onMouseLeave={close}
      onBlur={close}
    >
      {protagonist && <span aria-label="To ty">★ </span>}
      {player.firstName} {player.lastName}
    </button>
  );
};

const SquadGroup = ({
  title,
  assignments,
  players,
  protagonistId,
  open,
  close,
  compact = false,
}: {
  title: string;
  assignments?: readonly BestXIAssignment[];
  players: FootballerProfile[];
  protagonistId: Id;
  open: (id: Id, anchor: DOMRect) => void;
  close: () => void;
  compact?: boolean;
}) => (
  <section className={`squad-group ${compact ? 'reserve-group' : ''}`} data-squad-group={title}>
    <h3>
      {title}
      <span>{players.length}</span>
    </h3>
    <div className="squad-list-head">
      <span>Poz.</span>
      <span>Zawodnik</span>
      <span>Wiek</span>
      <span>OVR</span>
      <span>Profil</span>
    </div>
    {players.map((player, index) => {
      const assignment = assignments?.[index];
      const position = assignment?.position ?? player.primaryPosition;
      return (
        <div
          className={`squad-list-row ${player.id === protagonistId ? 'protagonist' : ''}`}
          key={player.id}
          data-footballer-id={player.id}
        >
          <b title={positionLabel(position)}>{positionCode(position)}</b>
          <PlayerName
            player={player}
            protagonist={player.id === protagonistId}
            open={open}
            close={close}
          />
          <span>{player.age}</span>
          <strong>
            {assignment?.effectiveOverall ?? getPlayerOverall(player, player.primaryPosition)}
          </strong>
          <span>{getRankedFootballArchetypes(player)[0]?.definition.label ?? '—'}</span>
        </div>
      );
    })}
  </section>
);

export const ClubView = ({ career }: { career: CareerState }) => {
  const [preview, setPreview] = useState<Preview>();
  const club = career.currentClub;
  const professionalClub = career.currentProfessionalClub;
  const competition = getCompetitionDefinition(
    professionalClub?.leagueTier ?? career.leagueSeason?.competition.tier ?? 4,
  );
  const strength = professionalClub ? getCareerClubStrength(career, professionalClub) : 50;
  const formation = professionalClub
    ? getManagerPreferredFormation(professionalClub.managerId)
    : undefined;
  const hierarchy =
    professionalClub && formation
      ? deriveSquadHierarchy(career, professionalClub, formation)
      : undefined;
  const resolver = (id: Id) => resolveFootballer(career, id);
  const xiPlayers =
    hierarchy?.preferredXI
      .map((item) => resolver(item.footballerId))
      .filter((p): p is FootballerProfile => Boolean(p)) ?? [];
  const benchPlayers =
    hierarchy?.bench
      .map((item) => resolver(item.footballerId))
      .filter((p): p is FootballerProfile => Boolean(p)) ?? [];
  const currentSportingStatus = hierarchy
    ? getSportingStatus(hierarchy, career.player.id)
    : undefined;
  const role = career.currentContract?.squadRole;
  const competitionPlayers = professionalClub
    ? getPositionalCompetition(
        career,
        professionalClub,
        career.player.primaryPosition,
        hierarchy,
      ).slice(0, 5)
    : [];
  const identity = resolveClubVisualIdentity(career.seed, professionalClub ?? club);
  const previewPlayer = preview ? resolver(preview.id) : undefined;
  const previewContract =
    previewPlayer?.id === career.player.id
      ? career.currentContract
      : career.footballerWorld?.[previewPlayer?.id ?? '']?.currentContract;
  const leaguePosition = career.leagueSeason
    ? getLeagueTable(career).find((row) => row.clubId === career.leagueSeason?.controlledClubId)
        ?.position
    : undefined;
  return (
    <div
      className="club-profile-redesign"
      style={
        {
          '--squad-primary': identity.primaryColor,
          '--squad-secondary': identity.secondaryColor,
        } as CSSProperties
      }
    >
      <header className="compact-club-header">
        <ClubCrest name={club.name} identity={identity} />
        <div className="club-heading">
          <h2>{club.name}</h2>
          <span>
            {club.region}, {club.country} · {competition.name} / poziom {competition.tier}
          </span>
          <strong>{prestigeLabel(club.prestige)}</strong>
        </div>
        {professionalClub && (
          <dl>
            <div>
              <dt>SIŁA</dt>
              <dd>
                <StarRating strength={strength} /> {Math.round(strength)}
              </dd>
            </div>
            <div>
              <dt>FORMACJA</dt>
              <dd>{formation ?? '—'}</dd>
            </div>
            <div>
              <dt>TRENING</dt>
              <dd>{qualityLabel(getClubDevelopmentEnvironment(professionalClub))}</dd>
            </div>
            <div>
              <dt>MEDYCYNA</dt>
              <dd>{qualityLabel(getClubMedicalQuality(professionalClub))}</dd>
            </div>
          </dl>
        )}
      </header>
      {professionalClub && hierarchy && (
        <>
          <div className="club-squad-workspace">
            <SquadPitch
              formation={hierarchy.formation}
              assignments={hierarchy.preferredXI}
              resolvePlayer={resolver}
              protagonistId={career.player.id}
            />
            <div className="grouped-squad-list">
              <SquadGroup
                title="PIERWSZA XI"
                assignments={hierarchy.preferredXI}
                players={xiPlayers}
                protagonistId={career.player.id}
                open={(id, anchor) => setPreview({ id, anchor })}
                close={() => setPreview(undefined)}
              />
              <SquadGroup
                title="ŁAWKA"
                assignments={hierarchy.bench}
                players={benchPlayers}
                protagonistId={career.player.id}
                open={(id, anchor) => setPreview({ id, anchor })}
                close={() => setPreview(undefined)}
              />
              <SquadGroup
                title="GŁĘBOKA REZERWA"
                players={hierarchy.deepReserve}
                protagonistId={career.player.id}
                open={(id, anchor) => setPreview({ id, anchor })}
                close={() => setPreview(undefined)}
                compact
              />
            </div>
          </div>
          <div className="club-information-row">
            <section>
              <h3>TWOJA SYTUACJA</h3>
              <p>
                <b>{positionLabel(career.player.primaryPosition)}</b> · OVR{' '}
                {getPlayerOverall(career.player, career.player.primaryPosition)}
              </p>
              <p>
                Status sportowy:{' '}
                <strong>
                  {currentSportingStatus ? sportingStatusLabel(currentSportingStatus) : '—'}
                </strong>
              </p>
              <p>Rola kontraktowa: {role ? squadRoleLabel(role) : '—'}</p>
            </section>
            <section>
              <h3>RYWALIZACJA NA POZYCJI</h3>
              {competitionPlayers.map(({ player, effectiveOverall, status }) => (
                <div
                  className={player.id === career.player.id ? 'protagonist' : ''}
                  key={player.id}
                >
                  <span>
                    {player.firstName} {player.lastName}
                  </span>
                  <b>{effectiveOverall} OVR</b>
                  <small>{sportingStatusLabel(status)}</small>
                </div>
              ))}
            </section>
            <section>
              <h3>TOŻSAMOŚĆ KLUBU</h3>
              <p>
                <b>DNA:</b> {club.dna.join(', ')}
              </p>
              <p>
                <b>Styl:</b> {club.playStyle} · <b>Młodzież:</b> {club.youthApproach}
              </p>
              <p>
                <b>Rozwój:</b> {qualityLabel(getClubDevelopmentEnvironment(professionalClub))} ·{' '}
                <b>Medycyna:</b> {qualityLabel(getClubMedicalQuality(professionalClub))}
              </p>
              <p>
                <b>Liga:</b>{' '}
                {leaguePosition ? `${leaguePosition}. miejsce` : 'przygotowania do sezonu'}
              </p>
            </section>
          </div>
        </>
      )}
      {!professionalClub && (
        <section className="academy-squad-fallback">
          <h3>AKADEMIA U-17</h3>
          <p>Kadra akademii nie jest jeszcze częścią zawodowego modelu składu.</p>
          <p>Informacje o klubie i bieżącym sezonie pozostają dostępne powyżej.</p>
        </section>
      )}
      {preview && previewPlayer && (
        <FootballerHoverCard
          player={previewPlayer}
          contract={previewContract}
          clubName={club.name}
          anchor={preview.anchor}
          onClose={() => setPreview(undefined)}
        />
      )}
    </div>
  );
};
