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
  getSquadDerivedClubStrength,
  resolveFootballer,
  type BestXIAssignment,
  type MatchBenchAssignment,
} from '../../core/footballerWorld';
import { getRankedFootballArchetypes } from '../../core/footballArchetypes';
import {
  compareCanonicalPositions,
  getMasteredPositions,
  positionCode,
  positionLabel,
} from '../../core/positionPresentation';
import { FootballerHoverCard } from '../shared/FootballerHoverCard';
import { SquadPitch } from './SquadPitch';
import { deriveSeasonPositionUsage } from '../../core/seasonParticipation';
import { getCurrentSquadSelectionContext } from '../../core/youthWorld';
import {
  coachProfileToPerson,
  deriveCanonicalCoachProfile,
  resolveCoachProfile,
} from '../../core/coachProfiles';

const tacticalStyleLabel = {
  possession: 'gra pozycyjna',
  balanced: 'zrównoważony',
  direct: 'gra bezpośrednia',
  counter_attacking: 'kontratak',
  pressing: 'pressing',
} as const;

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
  showAssignment = true,
}: {
  title: string;
  assignments?: readonly (BestXIAssignment | MatchBenchAssignment)[];
  players: FootballerProfile[];
  protagonistId: Id;
  open: (id: Id, anchor: DOMRect) => void;
  close: () => void;
  compact?: boolean;
  showAssignment?: boolean;
}) => (
  <section className={`squad-group ${compact ? 'reserve-group' : ''}`} data-squad-group={title}>
    <h3>
      {title}
      <span>{players.length}</span>
    </h3>
    <div className="squad-list-head">
      <span>Ust.</span>
      <span>Zawodnik</span>
      <span>Pozycje</span>
      <span>Wiek</span>
      <span>OVR</span>
      <span>Profil</span>
    </div>
    {players.map((player, index) => {
      const assignment = assignments?.[index];
      const position = showAssignment
        ? (assignment?.position ?? player.primaryPosition)
        : undefined;
      return (
        <div
          className={`squad-list-row ${player.id === protagonistId ? 'protagonist' : ''}`}
          key={player.id}
          data-footballer-id={player.id}
        >
          <b title={position ? positionLabel(position) : undefined}>
            {position ? positionCode(position) : '—'}
          </b>
          <PlayerName
            player={player}
            protagonist={player.id === protagonistId}
            open={open}
            close={close}
          />
          <span className="mastered-positions">
            {getMasteredPositions(player).map(positionCode).join(', ')}
          </span>
          <span>{player.age}</span>
          <strong>
            {showAssignment && assignment?.effectiveOverall !== undefined
              ? assignment.effectiveOverall
              : getPlayerOverall(player, player.primaryPosition)}
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
  const professionalCompetition = getCompetitionDefinition(
    professionalClub?.leagueTier ?? career.leagueSeason?.competition.tier ?? 4,
  );
  const selectionContext = getCurrentSquadSelectionContext(career);
  const strength = professionalClub
    ? getCareerClubStrength(career, professionalClub)
    : selectionContext
      ? (getSquadDerivedClubStrength(career, selectionContext) ?? 50)
      : 50;
  const formation = selectionContext
    ? getManagerPreferredFormation(selectionContext.managerId)
    : undefined;
  const coachProfile = professionalClub
    ? resolveCoachProfile(career, professionalClub.id)
    : selectionContext?.managerId
      ? deriveCanonicalCoachProfile(selectionContext.managerId)
      : undefined;
  const coachPerson = coachProfile
    ? coachProfileToPerson(
        coachProfile,
        { id: professionalClub?.id ?? club.id },
        career.currentDate ?? `${career.currentSeason}-07-01`,
      )
    : undefined;
  const hierarchy =
    selectionContext && formation
      ? deriveSquadHierarchy(career, selectionContext, formation)
      : undefined;
  const resolver = (id: Id) => resolveFootballer(career, id);
  const xiPlayers =
    hierarchy?.preferredXI
      .map((item) => resolver(item.footballerId))
      .filter((p): p is FootballerProfile => Boolean(p)) ?? [];
  const benchAssignments =
    hierarchy?.bench
      .slice()
      .sort(
        (a, b) =>
          compareCanonicalPositions(a.position, b.position) ||
          a.footballerId.localeCompare(b.footballerId),
      ) ?? [];
  const benchPlayers =
    benchAssignments
      .map((item) => resolver(item.footballerId))
      .filter((p): p is FootballerProfile => Boolean(p)) ?? [];
  const reservePlayers =
    hierarchy?.deepReserve
      .slice()
      .sort(
        (a, b) =>
          compareCanonicalPositions(a.primaryPosition, b.primaryPosition) ||
          a.id.localeCompare(b.id),
      ) ?? [];
  const currentSportingStatus = hierarchy
    ? getSportingStatus(hierarchy, career.player.id)
    : undefined;
  const currentManagerAssignment = hierarchy
    ? [...hierarchy.preferredXI, ...hierarchy.bench].find(
        (item) => item.footballerId === career.player.id,
      )?.position
    : undefined;
  const masteredPositions = getMasteredPositions(career.player);
  const positionUsage = deriveSeasonPositionUsage(career.seasonParticipation ?? []);
  const role = career.currentContract?.squadRole;
  const competitionPlayers = selectionContext
    ? getPositionalCompetition(
        career,
        selectionContext,
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
            {club.region}, {club.country} ·{' '}
            {professionalClub
              ? `${professionalCompetition.name} / poziom ${professionalCompetition.tier}`
              : (career.leagueSeason?.competition.name ?? 'Polska Liga U-17')}
          </span>
          <strong>{prestigeLabel(club.prestige)}</strong>
        </div>
        {selectionContext && (
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
              <dd>
                {professionalClub
                  ? qualityLabel(getClubDevelopmentEnvironment(professionalClub))
                  : qualityLabel(club.prestige)}
              </dd>
            </div>
            <div>
              <dt>MEDYCYNA</dt>
              <dd>
                {professionalClub ? qualityLabel(getClubMedicalQuality(professionalClub)) : '—'}
              </dd>
            </div>
          </dl>
        )}
      </header>
      {selectionContext && hierarchy && (
        <>
          <div className="club-squad-workspace">
            <SquadPitch
              formation={hierarchy.formation}
              assignments={hierarchy.preferredXI}
              resolvePlayer={resolver}
              protagonistId={career.player.id}
            />
            {coachProfile && coachPerson && (
              <div className="current-coach" aria-label="Aktualny trener">
                <b>TRENER</b>
                <span>
                  {coachPerson.firstName} {coachPerson.lastName} · {coachPerson.age} lat
                </span>
                <span>
                  {coachProfile.preferredFormation} ·{' '}
                  {tacticalStyleLabel[coachProfile.tacticalStyle]}
                </span>
              </div>
            )}
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
                assignments={benchAssignments}
                players={benchPlayers}
                protagonistId={career.player.id}
                open={(id, anchor) => setPreview({ id, anchor })}
                close={() => setPreview(undefined)}
                showAssignment={false}
              />
              <SquadGroup
                title="GŁĘBOKA REZERWA"
                players={reservePlayers}
                protagonistId={career.player.id}
                open={(id, anchor) => setPreview({ id, anchor })}
                close={() => setPreview(undefined)}
                compact
                showAssignment={false}
              />
            </div>
          </div>
          <div className="club-information-row">
            <section>
              <h3>TWOJA SYTUACJA</h3>
              <p>
                Pozycja nominalna: <b>{positionCode(career.player.primaryPosition)}</b> · OVR{' '}
                {getPlayerOverall(career.player, career.player.primaryPosition)}
              </p>
              <p>Opanowane pozycje: {masteredPositions.map(positionCode).join(', ')}</p>
              <p>
                Ustawienie trenera:{' '}
                <strong>
                  {currentManagerAssignment ? positionCode(currentManagerAssignment) : '—'}
                </strong>
              </p>
              {currentManagerAssignment &&
                !masteredPositions.includes(currentManagerAssignment) && (
                  <p className="position-warning">
                    Trener wykorzystuje Cię poza opanowanymi pozycjami.
                  </p>
                )}
              {!!positionUsage.length && (
                <p>
                  W tym sezonie:{' '}
                  {positionUsage
                    .map(
                      ({ position, starts, appearances }) =>
                        `${positionCode(position)} ${starts} startów · ${appearances} wyst.`,
                    )
                    .join(' · ')}
                </p>
              )}
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
                <b>Rozwój:</b>{' '}
                {professionalClub
                  ? qualityLabel(getClubDevelopmentEnvironment(professionalClub))
                  : qualityLabel(club.prestige)}{' '}
                · <b>Medycyna:</b>{' '}
                {professionalClub ? qualityLabel(getClubMedicalQuality(professionalClub)) : '—'}
              </p>
              <p>
                <b>Liga:</b>{' '}
                {leaguePosition ? `${leaguePosition}. miejsce` : 'przygotowania do sezonu'}
              </p>
            </section>
          </div>
        </>
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
