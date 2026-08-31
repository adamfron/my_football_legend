import { useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { StarRating } from '../../components/StarRating';
import { ClubCrest } from '../../components/ClubCrest';
import { getCompetitionDefinition } from '../../core/competitionStrength';
import { getLeagueTable } from '../../core/leagueSeason';
import { getEffectivePositionOverall, getPlayerOverall } from '../../core/playerOverall';
import { getClubDevelopmentEnvironment, getClubMedicalQuality } from '../../core/professionalClubs';
import { getCareerClubStrength, getExpectedSquadRole } from '../../core/clubStrength';
import { squadRoleLabel } from '../../core/careerPresentation';
import type { CareerState, FootballerProfile, Id } from '../../types/domain';
import { resolveClubVisualIdentity } from '../../core/clubVisualIdentity';
import {
  deriveSquadHierarchy,
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
type HierarchyName = 'XI' | 'ławka' | 'głęboka rezerwa';
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
  const hierarchyById = new Map<Id, HierarchyName>([
    ...xiPlayers.map((p) => [p.id, 'XI'] as const),
    ...benchPlayers.map((p) => [p.id, 'ławka'] as const),
    ...(hierarchy?.deepReserve ?? []).map((p) => [p.id, 'głęboka rezerwa'] as const),
  ]);
  const currentHierarchy = hierarchyById.get(career.player.id) ?? 'głęboka rezerwa';
  const role = professionalClub
    ? getExpectedSquadRole(career, professionalClub)
    : career.currentContract?.squadRole;
  const competitionPlayers = professionalClub
    ? (professionalClub.squadPlayerIds ?? [])
        .map(resolver)
        .filter((p): p is FootballerProfile => Boolean(p))
        .filter(
          (p) =>
            p.positionFamiliarity[career.player.primaryPosition] >= 0.3 ||
            p.primaryPosition === career.player.primaryPosition,
        )
        .sort(
          (a, b) =>
            getEffectivePositionOverall(b, career.player.primaryPosition) -
              getEffectivePositionOverall(a, career.player.primaryPosition) ||
            a.id.localeCompare(b.id),
        )
        .slice(0, 5)
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
                : '—'}
            </dd>
          </div>
          <div>
            <dt>MEDYCYNA</dt>
            <dd>
              {professionalClub ? qualityLabel(getClubMedicalQuality(professionalClub)) : '—'}
            </dd>
          </div>
        </dl>
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
              <p>Rola: {role ? squadRoleLabel(role) : '—'}</p>
              <p>
                Hierarchia: <strong>{currentHierarchy.toLocaleUpperCase('pl')}</strong>
              </p>
            </section>
            <section>
              <h3>RYWALIZACJA NA POZYCJI</h3>
              {competitionPlayers.map((player) => (
                <div
                  className={player.id === career.player.id ? 'protagonist' : ''}
                  key={player.id}
                >
                  <span>
                    {player.firstName} {player.lastName}
                  </span>
                  <b>{getEffectivePositionOverall(player, career.player.primaryPosition)} OVR</b>
                  <small>{hierarchyById.get(player.id) ?? 'rezerwa'}</small>
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
