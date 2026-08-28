import { useMemo, useState } from 'react';
import { previewRandomSequence } from '../devtools/randomPreview';
import { validateSampleContent } from '../schemas/validateContent';
import { missingLocalizationKeys, translate } from '../core/narrative/localization';
import { getFactPresentation } from '../core/narrative/factPresentation';
import { MatchMomentumChart } from '../components/MatchMomentumChart';
import { CompactFixtureList, type CompactFixtureItem } from '../components/CompactFixtureList';
import { ClubStrengthTooltip } from '../components/ClubStrengthTooltip';
import { getRadarAxes } from '../core/radar';
import { getSeasonGoalkeeperStats } from '../core/seasonParticipation';
import { aggregateDevelopment } from '../core/seasonDevelopment';
import { diagnoseCareerProgression, matchStateSummary } from '../core/progressionDiagnostics';
import { createCompletedSeasonSnapshot } from '../core/seasonArchive';
import {
  buildSeasonSummary,
  describePerformance,
  getSeasonPlayerSummary,
} from '../core/matchFeedback';
import {
  formatAttributeDelta,
  getMonthlyDevelopmentSummary,
  getSeasonAttributeDelta,
  getSeasonOverallDelta,
} from '../core/developmentFeedback';
import { getUnlockedPlayStyles, PLAY_STYLE_PRESENTATION } from '../core/playStyles';
import { auditRepeatedPlayerFacingText } from '../core/narrative/repeatedTextAudit';
import matchLocalization from '../content/localization/pl/events.match.json';
import {
  attributeKeys,
  canReroll,
  createCareerState,
  defaultBodyForPosition,
  generateStartingPlayerProfile,
  getAllowedWeightRange,
  identityInputSchema,
  makeReadableSeed,
  MAX_PROFILE_VARIANTS,
  positionIds,
  profileInputSchema,
  STARTING_AGE,
  type CreatorInput,
  type IdentityInput,
  type PositionId,
  type StartingPlayerProfile,
} from '../core/playerCreator';
import { deleteCareer, hasValidCareer, loadCareer, saveCareer } from '../core/persistence';
import { advanceCareerFlow } from '../core/careerFlow';
import { getEventDefinition } from '../core/events/eventRegistry';
import { resolveEventChoice } from '../core/events/resolveEventChoice';
import { getAvailableDecisions } from '../core/events/decisionAvailability';
import { advanceActiveEvent, applyEventResolution } from '../core/events/applyEventResolution';
import {
  advanceMatch,
  MATCH_MOMENT_LIBRARY,
  opportunityDescription,
  resolveMatchDecision,
} from '../core/matchEngine';
import { advanceCareerWeek, getCurrentCareerWeek, getCurrentFixture } from '../core/careerWeeks';
import { getCareerMilestones } from '../core/narrative/careerMilestones';
import { getSeasonHonours } from '../core/history/careerHistory';
import { advanceUntilDecision } from '../core/careerSimulation';
import { getLeagueTable, getProfessionalCompetitionName } from '../core/leagueSeason';
import { getClubLeagueTier } from '../core/professionalClubs';
import {
  describePlayerClubLevel,
  getClubStrength,
  getExpectedSquadRole,
  getPlayerClubLevelDelta,
} from '../core/clubStrength';
import { StarRating } from '../components/StarRating';
import { getClubDevelopmentEnvironment, getClubMedicalQuality } from '../core/professionalClubs';
import { getCompetitionDefinition } from '../core/competitionStrength';
import { availabilityState, getPlayerAvailability } from '../core/playerAvailability';
import { getSeasonProgress } from '../core/seasonProgress';
import { getInjuryDescription } from '../core/seasonParticipation';
import { MATCH_EFFORT_LABELS, TRAINING_EFFORT_LABELS } from '../core/playerPreferences';
import {
  acceptProfessionalOffer,
  continueWithProfessionalTrial,
  stayAtCurrentClub,
  retireCareer,
} from '../core/careerSeasons';
import { getPlayerOverall } from '../core/playerOverall';
import { acceptRenegotiatedContract, requestContractRenegotiation } from '../core/contracts';
import {
  clubArchetypeLabel,
  getCareerHeader,
  getCareerSubtitle,
  getCurrentHeadCoach,
  squadRoleLabel,
} from '../core/careerPresentation';
import {
  getRegularSeasonEvent,
  resolveRegularSeasonEvent,
} from '../core/events/regularSeasonEvents';
import type { CareerState, EventDecision, PlayerAttributes } from '../types/domain';
import { getMatchTransitionHistory, isDevToolsEnabled, recordMatchTransition } from './devTools';
import './App.css';

const infoKey = 'mfl.localSaveInfoDismissed';
const baseTabs = [
  ['game', 'nav.game'],
  ['player', 'nav.player'],
  ['club', 'nav.club'],
  ['season', 'nav.season'],
  ['history', 'nav.history'],
] as const;
const devtoolsTab = ['devtools', 'nav.devtools'] as const;
const RADAR_RADIUS = 75;
const RADAR_LABEL_RADIUS = 104;
const RADAR_MARGIN = 44;
const RADAR_CENTER = RADAR_RADIUS + RADAR_MARGIN;
const RADAR_VIEWBOX_SIZE = (RADAR_RADIUS + RADAR_MARGIN) * 2;

type TabId = (typeof baseTabs)[number][0] | (typeof devtoolsTab)[0];
type ProfileFormState = { position: PositionId; heightCm: string; weightKg: string };
type FieldErrors = Partial<
  Record<
    | 'firstName'
    | 'lastName'
    | 'nationality'
    | 'dominantFoot'
    | 'customSeed'
    | 'heightCm'
    | 'weightKg'
    | 'position',
    string[]
  >
>;

const tParam = (key: string, params: Record<string, string>) =>
  translate(key, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, translate(v)])));
const initials = (first: string, last: string) =>
  `${first[0] ?? 'M'}${last[0] ?? 'F'}`.toUpperCase();
const emptyErrors = () => ({}) as FieldErrors;
const addIssues = (issues: { path: PropertyKey[]; message: string }[]) =>
  issues.reduce<FieldErrors>((acc, issue) => {
    const key = issue.path[0] as keyof FieldErrors;
    acc[key] = [...(acc[key] ?? []), issue.message];
    return acc;
  }, {});

const RadarChart = ({
  attributes,
  baseline,
}: {
  attributes: PlayerAttributes;
  baseline?: PlayerAttributes | undefined;
}) => {
  const axes = getRadarAxes(attributes);
  const polygon = (values: ReturnType<typeof getRadarAxes>) =>
    values
      .map(({ value }, index) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
        const radius = (value / 100) * RADAR_RADIUS;
        return `${RADAR_CENTER + Math.cos(angle) * radius},${RADAR_CENTER + Math.sin(angle) * radius}`;
      })
      .join(' ');
  return (
    <figure className="radar">
      <svg
        viewBox={`0 0 ${RADAR_VIEWBOX_SIZE} ${RADAR_VIEWBOX_SIZE}`}
        role="img"
        aria-label="Porównanie profilu atrybutów"
      >
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <circle
            key={scale}
            cx={RADAR_CENTER}
            cy={RADAR_CENTER}
            r={RADAR_RADIUS * scale}
            fill="none"
            stroke="rgba(255,255,255,.14)"
          />
        ))}
        {axes.map(({ label }, index) => {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length;
          return (
            <g key={label}>
              <line
                x1={RADAR_CENTER}
                y1={RADAR_CENTER}
                x2={RADAR_CENTER + Math.cos(angle) * RADAR_RADIUS}
                y2={RADAR_CENTER + Math.sin(angle) * RADAR_RADIUS}
                stroke="rgba(255,255,255,.12)"
              />
              <text
                x={RADAR_CENTER + Math.cos(angle) * RADAR_LABEL_RADIUS}
                y={RADAR_CENTER + Math.sin(angle) * RADAR_LABEL_RADIUS}
                textAnchor="middle"
              >
                {label}
              </text>
            </g>
          );
        })}
        {baseline && (
          <polygon
            points={polygon(getRadarAxes(baseline))}
            fill="rgba(148,163,184,.05)"
            stroke="#94a3b8"
            strokeWidth="1.5"
          />
        )}
        <polygon
          points={polygon(axes)}
          fill="rgba(68, 209, 157, .35)"
          stroke="#44d19d"
          strokeWidth="3"
        />
      </svg>
      <figcaption>
        {axes.map(({ label, value }) => `${label} ${Math.round(value)}`).join(', ')}
      </figcaption>
      {baseline && (
        <div className="radar-legend">
          <span>— początek sezonu</span>
          <strong>— koniec sezonu</strong>
        </div>
      )}
    </figure>
  );
};

const PlayerCard = ({
  profile,
  seed,
  baseline,
}: {
  profile: StartingPlayerProfile;
  seed: string;
  baseline?: PlayerAttributes | undefined;
}) => (
  <section className="card">
    <div className={`portrait portrait-${seed.length % 4}`}>
      <span>{initials(profile.player.firstName, profile.player.lastName)}</span>
    </div>
    <div>
      <h3>
        {profile.player.firstName} {profile.player.lastName}
      </h3>
      <p>
        {profile.player.age} lat · {translate(`nationality.${profile.player.nationality}`)} ·{' '}
        {translate(`position.${profile.player.primaryPosition}`)}
      </p>
      <p>
        {profile.player.heightCm} cm · {profile.player.weightKg} kg ·{' '}
        {translate(profile.player.traits[0] === 'foot_left' ? 'foot.left' : 'foot.right')}
      </p>
      <p>{tParam(profile.profileDescriptionKey, profile.profileDescriptionParams)}</p>
      <p>
        <strong>Seed kariery:</strong> <code>{seed}</code>
      </p>
      <p>
        <strong>Pierwszy klub:</strong> Vistula Nova
      </p>
    </div>
    <RadarChart attributes={profile.player.attributes} baseline={baseline} />
    <ul className="attrs">
      {attributeKeys.map((key) => (
        <li key={key}>
          <span>{translate(`attribute.${key}`)}</span>
          <strong>
            {profile.player.attributes[key]}{' '}
            {formatAttributeDelta(
              getSeasonAttributeDelta(profile.player.attributes, baseline, key),
            )}
          </strong>
        </li>
      ))}
    </ul>
  </section>
);
const FieldError = ({ errors }: { errors?: string[] | undefined }) =>
  errors?.map((error) => (
    <p className="field-error" key={error}>
      {error}
    </p>
  )) ?? null;

const resultText = (outcome: unknown) => translate(`events.result.${String(outcome)}`);
const visibleDecisions = (career: CareerState, decisions: EventDecision[]) => {
  const outcome = career.historyFacts.find((f) => f.factType === 'academy_selection_result')?.data
    .selectionOutcome;
  const invited = outcome === 'player_invited' || outcome === 'both_invited';
  const domainAvailable = career.activeEvent
    ? getAvailableDecisions(career, career.activeEvent, decisions)
    : [];
  return domainAvailable.filter((d) =>
    career.activeEvent?.definitionId === 'academy_selection_response'
      ? invited
        ? [
            'respond_seek_expectations',
            'respond_stay_grounded',
            'respond_acknowledge_rival',
          ].includes(d.id)
        : ['respond_request_plan', 'respond_return_to_work', 'respond_challenge_decision'].includes(
            d.id,
          )
      : true,
  );
};
const personName = (career: CareerState, id: string) =>
  id === career.player.id
    ? `${career.player.firstName} ${career.player.lastName}`
    : career.significantPeople.find((p) => p.id === id)
      ? `${career.significantPeople.find((p) => p.id === id)!.firstName} ${career.significantPeople.find((p) => p.id === id)!.lastName}`
      : '';
const playerStatus = (career: CareerState) => {
  const availability = getPlayerAvailability(
    career,
    getCurrentCareerWeek(career)?.startDate ?? '2027-05-31',
  );
  if (availability.status === 'suspended')
    return `Zawieszony (${availability.suspensionMatchesRemaining} mecz)`;
  if (availability.status === 'injured')
    return `Kontuzjowany (około ${availability.injury.matchesRemaining} mecz.)`;
  if (availability.status === 'knock')
    return `Drobny uraz (około ${availability.injury.matchesRemaining} mecz.)`;
  return career.careerCalendar ? 'Zdrowy' : 'Oczekuje na rozpoczęcie sezonu';
};
const eventParams = (career: CareerState) => {
  const rival = career.significantPeople.find((p) => p.role === 'academy_rival');
  const coach =
    getCurrentHeadCoach(career) ?? career.significantPeople.find((p) => p.role === 'coach');
  return {
    rivalFirstName: rival?.firstName ?? 'Konkurent',
    rivalFullName: rival ? `${rival.firstName} ${rival.lastName}` : 'Konkurent',
    coachFullName: coach ? `${coach.firstName} ${coach.lastName}` : 'Trener',
    clubName: career.currentClub.name,
  };
};
const formatDate = (date: string) =>
  new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00Z`),
  );
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
const ClubProfile = ({ career }: { career: CareerState }) => {
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

const EventCard = ({
  career,
  onCareer,
}: {
  career: CareerState;
  onCareer: (career: CareerState) => void;
}) => {
  const event = career.activeEvent;
  if (!event && career.careerCalendar)
    return <CareerWeekGame career={career} onCareer={onCareer} />;
  if (!event)
    return (
      <section>
        <p>Trwa przygotowanie kolejnego etapu kariery.</p>
      </section>
    );
  const definition = getEventDefinition(event.definitionId);
  const people = Object.values(event.cast)
    .map((id) => personName(career, id))
    .filter(Boolean);
  const params = eventParams(career);
  return (
    <section>
      <p>
        {String(event.context.date)} · {translate(String(event.context.stageKey))}
      </p>
      <h2>{translate(definition.localizationKeys.title, params)}</h2>
      <p>{translate(definition.localizationKeys.summary, params)}</p>
      <h3>{translate('events.ui.people')}</h3>
      <p>{people.join(', ')}</p>
      <h3>{translate('events.ui.whatYouKnow')}</h3>
      <ul>
        {definition.playerInformationKeys.map((k) => (
          <li key={k}>{translate(k, params)}</li>
        ))}
      </ul>
      {event.result ? (
        <div className="result">
          <h3>{translate('events.ui.result')}</h3>
          <p>{resultText(event.result.objectiveOutcome)}</p>
          <button onClick={() => onCareer(advanceActiveEvent(career))}>
            {translate('events.ui.next')}
          </button>
        </div>
      ) : (
        <>
          <p className="decision-note">{translate('events.ui.possibleConsequences')}</p>
          <div className="choices">
            {visibleDecisions(career, definition.decisions).map((decision) => (
              <article className="decision-card" key={decision.id}>
                <h3>{translate(decision.labelKey)}</h3>
                <p className="decision-description">{translate(decision.descriptionKey)}</p>
                <div className="decision-consequences">
                  <section className="possible-benefits">
                    <h4>{translate('events.ui.pros')}</h4>
                    {decision.visiblePros.map((k) => (
                      <p key={k}>{translate(k)}</p>
                    ))}
                  </section>
                  <section className="possible-risks">
                    <h4>{translate('events.ui.cons')}</h4>
                    {decision.visibleCons.map((k) => (
                      <p key={k}>{translate(k)}</p>
                    ))}
                  </section>
                </div>
                <button
                  onClick={() =>
                    onCareer(applyEventResolution(career, resolveEventChoice(career, decision)))
                  }
                >
                  {translate('events.ui.choose')}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

const CareerWeekGame = ({
  career,
  onCareer,
}: {
  career: CareerState;
  onCareer: (career: CareerState) => void;
}) => {
  const [progressionError, setProgressionError] = useState<string>();
  const week = getCurrentCareerWeek(career);
  const fixture = getCurrentFixture(career);
  const gameFixtureItems: CompactFixtureItem[] = (
    career.leagueSeason?.rounds.flatMap((round) => round.fixtures) ?? []
  )
    .filter((item) =>
      [item.homeClubId, item.awayClubId].includes(career.leagueSeason!.controlledClubId),
    )
    .filter((item) => item.completed || item.date >= (career.currentDate ?? week?.startDate ?? ''))
    .slice(-6)
    .map((item) => ({
      fixture: item,
      opponentName:
        career.leagueSeason!.clubs.find(
          (club) =>
            club.clubId ===
            (item.homeClubId === career.leagueSeason!.controlledClubId
              ? item.awayClubId
              : item.homeClubId),
        )?.name ?? 'Rywal',
      venue: item.homeClubId === career.leagueSeason!.controlledClubId ? 'home' : 'away',
      participation: career.seasonParticipation!.find((record) => record.fixtureId === item.id)!,
    }));
  if (!week || career.leagueSeason?.completed)
    return <SeasonEndSummary career={career} onCareer={onCareer} />;
  if (career.activeMatch) return <MatchGame career={career} onCareer={onCareer} />;
  if (career.decisionPoint?.type === 'off_field_event') {
    const event = getRegularSeasonEvent(career.decisionPoint.sourceId);
    if (!event) return null;
    return (
      <section>
        <p>{formatDate(career.decisionPoint.date)} · poza boiskiem</p>
        <h2>{event.title}</h2>
        <p>{event.situation}</p>
        <div className="choices">
          {event.decisions.map((decision) => (
            <article className="decision-card" key={decision.id}>
              <h3>{decision.label}</h3>
              <section className="possible-benefits">
                <h4>Możesz zyskać</h4>
                <p>{decision.gain}</p>
              </section>
              <section className="possible-risks">
                <h4>Ryzykujesz</h4>
                <p>{decision.risk}</p>
              </section>
              <button
                onClick={() => {
                  const sourceId = career.decisionPoint!.sourceId;
                  const updatedWeeks = career.careerCalendar!.weeks.map((item) =>
                    item.id === week.id
                      ? {
                          ...item,
                          scheduledEventIds: [],
                          completedEventIds: [...item.completedEventIds, sourceId],
                        }
                      : item,
                  );
                  onCareer({
                    ...resolveRegularSeasonEvent(career, sourceId, decision.id, week.startDate),
                    careerCalendar: { ...career.careerCalendar!, weeks: updatedWeeks },
                  });
                }}
              >
                Wybierz
              </button>
            </article>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section>
      <p>
        {formatDate(week.startDate)}–{formatDate(week.endDate)} · tydzień {week.weekIndex + 1}
      </p>
      <h2>{fixture ? 'Nadchodzi kolejny mecz' : 'Tydzień treningowy'}</h2>
      {fixture ? (
        <>
          <p>
            {fixture.opponent.name} · {fixture.venue === 'home' ? 'dom' : 'wyjazd'} · liga
          </p>
          <p>{opportunityDescription(career)}</p>
        </>
      ) : (
        <p>Weekend bez spotkania pozwala skupić się na treningu i regeneracji.</p>
      )}
      {!fixture && <p>Tydzień upłynął głównie na treningach. Sztab nadal obserwuje twoją pracę.</p>}
      {(career.fastForwardLog ?? []).length > 0 && (
        <aside className="mini-card">
          <h3>Co wydarzyło się po drodze</h3>
          <CompactFixtureList items={gameFixtureItems} />
        </aside>
      )}
      <h3>Najbliższe tygodnie</h3>
      <ul>
        {career.careerCalendar!.weeks.slice(week.weekIndex, week.weekIndex + 3).map((nextWeek) => {
          const nextFixture = career.careerCalendar!.fixtures.find((item) =>
            nextWeek.fixtureIds.includes(item.id),
          );
          return (
            <li key={nextWeek.id}>
              {formatDate(nextWeek.startDate)} —{' '}
              {nextFixture
                ? `${nextFixture.opponent.name} (${nextFixture.venue === 'home' ? 'dom' : 'wyjazd'})`
                : 'brak meczu'}
            </li>
          );
        })}
      </ul>
      {progressionError && (
        <p className="field-error" role="alert">
          Nie udało się kontynuować kariery. Spróbuj ponownie lub wczytaj zapis.
          {isDevToolsEnabled() ? ` ${progressionError}` : ''}
        </p>
      )}
      <button
        onClick={() => {
          try {
            setProgressionError(undefined);
            onCareer(advanceUntilDecision({ ...career, decisionPoint: undefined }));
          } catch (error) {
            setProgressionError(error instanceof Error ? error.message : String(error));
          }
        }}
      >
        Symuluj do następnego wydarzenia
      </button>
    </section>
  );
};

const attributeLabels: Record<keyof PlayerAttributes, string> = {
  technique: 'Technika',
  vision: 'Przegląd gry',
  pace: 'Szybkość',
  stamina: 'Wytrzymałość',
  finishing: 'Wykończenie',
  defending: 'Obrona',
  leadership: 'Przywództwo',
  composure: 'Opanowanie',
  spatialAwareness: 'Orientacja przestrzenna',
  determination: 'Determinacja',
  ambition: 'Ambicja',
  professionalism: 'Profesjonalizm',
};

const SeasonEndSummary = ({
  career,
  onCareer,
}: {
  career: CareerState;
  onCareer: (career: CareerState) => void;
}) => {
  const table = getLeagueTable(career);
  const club = table.find((row) => row.clubId === career.leagueSeason?.controlledClubId);
  const summary = buildSeasonSummary(career, career.currentSeason);
  const availability = availabilityState(career);
  const position = club?.position ?? 12;
  const archived =
    career.completedSeasons?.find((item) => item.seasonId === career.leagueSeason?.id) ??
    createCompletedSeasonSnapshot(career);
  const development = aggregateDevelopment(
    archived.development.seasonStartAttributes,
    archived.development.seasonEndAttributes,
  );
  const fixtureItems: CompactFixtureItem[] = (
    career.leagueSeason?.rounds.flatMap((round) => round.fixtures) ?? []
  )
    .filter((fixture) =>
      [fixture.homeClubId, fixture.awayClubId].includes(career.leagueSeason!.controlledClubId),
    )
    .map((fixture) => ({
      fixture,
      opponentName:
        career.leagueSeason!.clubs.find(
          (club) =>
            club.clubId ===
            (fixture.homeClubId === career.leagueSeason!.controlledClubId
              ? fixture.awayClubId
              : fixture.homeClubId),
        )?.name ?? 'Rywal',
      venue: fixture.homeClubId === career.leagueSeason!.controlledClubId ? 'home' : 'away',
      participation: archived.fixtures.find((item) => item.fixtureId === fixture.id)!,
    }));
  return (
    <section>
      <h2>
        {career.careerSeasonNumber === 1 ? 'Podsumowanie sezonu akademii' : 'Podsumowanie sezonu'}{' '}
        {getSeasonProgress(career).seasonLabel}
      </h2>
      <h3>Klub</h3>
      <p>
        {position}. miejsce · {club?.points ?? 0} pkt · {club?.won ?? 0}/{club?.drawn ?? 0}/
        {club?.lost ?? 0} (W/R/P) · bramki {club?.goalsFor ?? 0}:{club?.goalsAgainst ?? 0}
      </p>
      <p>
        <strong>
          {career.seasonOutcome?.leagueOutcome === 'promoted'
            ? `Awans do: ${getProfessionalCompetitionName(career.seasonOutcome.nextLeagueTier ?? 3)}`
            : career.seasonOutcome?.leagueOutcome === 'relegated'
              ? `Spadek do: ${getProfessionalCompetitionName(career.seasonOutcome.nextLeagueTier ?? 3)}`
              : career.seasonOutcome?.leagueOutcome === 'champion'
                ? `Mistrzostwo: ${career.leagueSeason?.competition.name}`
                : `Utrzymanie: ${career.leagueSeason?.competition.name}`}
        </strong>
      </p>
      <h3>Zawodnik</h3>
      <p>
        Występy: {summary.statistics.appearances} · starty: {summary.statistics.starts} ·{' '}
        {summary.statistics.minutes} min
      </p>
      <p>
        {summary.statistics.goals} G · {summary.statistics.assists} A · xG{' '}
        {summary.statistics.xG.toFixed(2).replace('.', ',')} · xA{' '}
        {summary.statistics.xA.toFixed(2).replace('.', ',')} · średnia{' '}
        {summary.statistics.averageRating?.toFixed(1).replace('.', ',') ?? '—'}
      </p>
      <p>
        Kartki: {summary.statistics.yellowCards} żółtych · {summary.statistics.redCards} czerwonych
        · opuszczone: {availability.matchesMissedThroughSuspension} przez zawieszenie,{' '}
        {availability.matchesMissedThroughInjury} przez uraz
      </p>
      <h3>Rozwój</h3>
      <RadarChart
        attributes={archived.development.seasonEndAttributes}
        baseline={archived.development.seasonStartAttributes}
      />
      <p>
        <strong>
          OVR {archived.development.seasonStartOVR} → {archived.development.seasonEndOVR} (
          {archived.development.seasonEndOVR - archived.development.seasonStartOVR >= 0 ? '+' : ''}
          {archived.development.seasonEndOVR - archived.development.seasonStartOVR})
        </strong>
      </p>
      {development.length ? (
        development.map((change) => (
          <p key={change.attribute}>
            {attributeLabels[change.attribute]} {change.before} → {change.after} (
            {change.delta > 0 ? '+' : ''}
            {change.delta})
          </p>
        ))
      ) : (
        <p>W tym sezonie nie doszło do trwałej zmiany atrybutów.</p>
      )}
      <h3>Występy</h3>
      <CompactFixtureList items={fixtureItems} />
      <h3>Kamienie milowe</h3>
      {getCareerMilestones(career)
        .slice(-6)
        .map((item) => (
          <p key={item.fact.id}>
            {getFactPresentation(career, item.fact)?.title ?? item.fact.factType}
          </p>
        ))}
      <h3>{career.currentContract ? 'Twój obecny kontrakt' : 'Obecna sytuacja'}</h3>
      {career.currentContract && (
        <article className="mini-card">
          <h3>{career.currentClub.name}</h3>
          <p>
            <strong>Pensja:</strong> {career.currentContract.monthlySalary.toLocaleString('pl-PL')}{' '}
            PLN / mies.
          </p>
          <p>
            <strong>Umowa do:</strong> {career.currentContract.endDate}
          </p>
          <p>
            <strong>Obecny status w zespole:</strong>{' '}
            {squadRoleLabel(
              career.currentProfessionalClub
                ? getExpectedSquadRole(career, career.currentProfessionalClub)
                : career.currentContract.squadRole,
            )}
          </p>
          {career.currentProfessionalClub &&
            getExpectedSquadRole(career, career.currentProfessionalClub) !==
              career.currentContract.squadRole && (
              <p>Rola przy podpisaniu umowy: {squadRoleLabel(career.currentContract.squadRole)}</p>
            )}
          {career.currentContract.endDate > `${career.currentSeason + 1}-06-30` && (
            <button onClick={() => onCareer(stayAtCurrentClub(career))}>
              Pozostań na obecnej umowie
            </button>
          )}
          {career.renegotiation?.season !== career.currentSeason && (
            <button onClick={() => onCareer(requestContractRenegotiation(career))}>
              Poproś o renegocjację
            </button>
          )}
          {career.renegotiation?.season === career.currentSeason && (
            <p>
              {career.renegotiation.result === 'rejected'
                ? 'Klub odrzucił prośbę. Obecna umowa pozostaje bez zmian.'
                : career.renegotiation.result === 'conditional'
                  ? 'Klub proponuje podwyżkę pod warunkiem przedłużenia umowy.'
                  : 'Klub proponuje poprawione warunki.'}
            </p>
          )}
          {career.renegotiation?.proposedContract && (
            <>
              <p>
                Nowa pensja:{' '}
                {career.renegotiation.proposedContract.monthlySalary.toLocaleString('pl-PL')} PLN /
                mies. · do {career.renegotiation.proposedContract.endDate}
              </p>
              <button onClick={() => onCareer(acceptRenegotiatedContract(career))}>
                Zaakceptuj nowe warunki
              </button>
            </>
          )}
          {career.professionalOffers?.find((offer) => offer.offerType === 'renewal') && (
            <button
              onClick={() =>
                onCareer(
                  acceptProfessionalOffer(
                    career,
                    career.professionalOffers!.find((offer) => offer.offerType === 'renewal')!.id,
                  ),
                )
              }
            >
              Przedłuż kontrakt
            </button>
          )}
        </article>
      )}
      <h3>Oferty innych klubów</h3>
      {(career.professionalOffers ?? []).length ? (
        <div className="offer-grid">
          {career
            .professionalOffers!.filter((offer) => offer.offerType !== 'renewal')
            .map((offer) => (
              <article className="mini-card offer-card" key={offer.id}>
                <h3>{offer.club.name}</h3>
                {offer.offerType === 'renewal' && (
                  <p>
                    <strong>Obecny klub</strong>
                  </p>
                )}
                <p>{getProfessionalCompetitionName(getClubLeagueTier(offer.club))}</p>
                <p>
                  Poziom {getClubLeagueTier(offer.club)} ·{' '}
                  <StarRating strength={getClubStrength(offer.club)} /> · Siła klubu:{' '}
                  {Math.round(getClubStrength(offer.club))}/100
                </p>
                <p>
                  Trening: {qualityLabel(getClubDevelopmentEnvironment(offer.club))} · Medycyna:{' '}
                  {qualityLabel(getClubMedicalQuality(offer.club))}
                </p>
                <p>
                  <strong>Transfer:</strong>{' '}
                  {offer.transferKind === 'free'
                    ? 'Wolny transfer'
                    : `Szacowane odstępne: ${(offer.estimatedTransferFee ?? 0).toLocaleString('pl-PL')} PLN`}
                </p>
                <p>
                  {getClubLeagueTier(offer.club) <= 2
                    ? 'Ambitny klub zawodowy'
                    : 'Solidny klub zawodowy'}
                </p>
                <p>
                  <strong>Rola:</strong> {squadRoleLabel(offer.contract.squadRole)}
                </p>
                <p>
                  <strong>Pensja:</strong> {offer.contract.monthlySalary.toLocaleString('pl-PL')}{' '}
                  PLN / mies.
                </p>
                <p>
                  <strong>Kontrakt:</strong> do {offer.contract.endDate}
                </p>
                <h4>Dlaczego interesują się tobą</h4>
                {offer.interestReasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                <p>
                  <strong>Konkurencja:</strong> {offer.competitionAssessment}
                </p>
                <p>
                  <strong>Filozofia:</strong> {clubArchetypeLabel(offer.club.archetype)}
                </p>
                <p>
                  <strong>Szansa:</strong> {offer.opportunity}
                </p>
                <p>
                  <strong>Ryzyko:</strong> {offer.risk}
                </p>
                <button onClick={() => onCareer(acceptProfessionalOffer(career, offer.id))}>
                  {offer.offerType === 'renewal' ? 'Pozostań w klubie' : 'Podpisz kontrakt'}
                </button>
              </article>
            ))}
        </div>
      ) : career.careerSeasonNumber === 1 ? (
        <article className="mini-card">
          <h4>Ścieżka próbna</h4>
          <p>Vistula Nova zapewni ci testy w małym klubie zawodowym. Kariera trwa dalej.</p>
          <button onClick={() => onCareer(continueWithProfessionalTrial(career))}>
            Przejdź testy
          </button>
        </article>
      ) : (
        <p>
          Brak nowych ofert. Możesz kontynuować w obecnym klubie lub szukać klubu jako wolny
          zawodnik.
        </p>
      )}
      {career.careerSeasonNumber >= 2 && !career.professionalOffers?.length && (
        <button onClick={() => onCareer(stayAtCurrentClub(career))}>
          Pozostań w {career.currentClub.name}
        </button>
      )}
      {career.player.age >= 33 && (
        <button onClick={() => onCareer(retireCareer(career))}>Zakończ karierę</button>
      )}
    </section>
  );
};

const CareerHud = ({ career }: { career: CareerState }) => {
  const season = getSeasonProgress(career);
  const availability = getPlayerAvailability(career, season.currentDate);
  const health = !availability.available
    ? availability.status === 'suspended'
      ? 'Zawieszony'
      : 'Kontuzjowany'
    : career.player.health < 70
      ? 'Uraz'
      : 'Zdrowy';
  return (
    <section className="career-hud" aria-label="Status kariery">
      <strong>
        Sezon {season.careerSeasonNumber} · {season.seasonLabel} · {career.currentClub.name}
      </strong>
      <small>{career.leagueSeason?.competition.name}</small>
      <span>
        OVR {getPlayerOverall(career.player, career.player.primaryPosition)} · Morale{' '}
        {career.player.morale} · Kondycja {career.player.fitness} · {health}
      </span>
      <label>
        Postęp sezonu{' '}
        <progress value={season.progress} max={1}>
          {Math.round(season.progress * 100)}%
        </progress>{' '}
        {Math.round(season.progress * 100)}%
      </label>
      {season.phase === 'summer_window' ? (
        <span>Letnie okno transferowe</span>
      ) : season.weeksUntilSummerWindow ? (
        <span>Letnie okno za {season.weeksUntilSummerWindow} tyg.</span>
      ) : null}
    </section>
  );
};

const SeasonView = ({ career }: { career: CareerState }) => {
  const table = getLeagueTable(career);
  const controlledClubId = career.leagueSeason?.controlledClubId ?? career.currentClub.id;
  const own = table.find((row) => row.clubId === controlledClubId);
  const season = career.leagueSeason;
  const fixtures =
    season?.rounds
      .flatMap((round) => round.fixtures)
      .filter((fixture) => [fixture.homeClubId, fixture.awayClubId].includes(controlledClubId)) ??
    [];
  const name = (id: string) => season?.clubs.find((club) => club.clubId === id)?.name ?? id;
  const compactFixtures: CompactFixtureItem[] = fixtures.map((fixture) => {
    const opponentStrength = season?.clubs.find(
      (club) =>
        club.clubId ===
        (fixture.homeClubId === controlledClubId ? fixture.awayClubId : fixture.homeClubId),
    )?.strength;
    return {
      fixture,
      opponentName: name(
        fixture.homeClubId === controlledClubId ? fixture.awayClubId : fixture.homeClubId,
      ),
      venue: fixture.homeClubId === controlledClubId ? 'home' : 'away',
      participation: career.seasonParticipation!.find((item) => item.fixtureId === fixture.id)!,
      ...(opponentStrength === undefined ? {} : { opponentStrength }),
    };
  });
  return (
    <section>
      <h2>Sezon {season?.name ?? getSeasonProgress(career).seasonLabel}</h2>
      <strong>{season?.competition.name}</strong>
      <p>
        {season?.currentRound ?? 0}. kolejka z {season?.rounds.length ?? 0} ·{' '}
        {career.currentClub.name} zajmuje {own?.position ?? '—'}. miejsce
      </p>
      <h3>Tabela</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Klub</th>
              <th>M</th>
              <th>W</th>
              <th>R</th>
              <th>P</th>
              <th>BR</th>
              <th>+/-</th>
              <th>PKT</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.clubId} className={row.clubId === controlledClubId ? 'active' : ''}>
                <td>{row.position}</td>
                <td>
                  <ClubStrengthTooltip
                    name={row.clubName}
                    strength={
                      season?.clubs.find((club) => club.clubId === row.clubId)?.strength ?? 50
                    }
                  />
                </td>
                <td>{row.played}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td>
                  {row.goalsFor}:{row.goalsAgainst}
                </td>
                <td>{row.goalDifference}</td>
                <td>
                  <strong>{row.points}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Terminarz</h3>
      <CompactFixtureList items={compactFixtures} />
    </section>
  );
};

const statusLabel: Record<string, string> = {
  senior_starter: 'Pierwszy skład seniorów',
  senior_bench: 'Ławka seniorów',
  senior_out: 'Poza kadrą seniorów',
  academy_starter: 'Pierwszy skład akademii',
  academy_bench: 'Ławka akademii',
  no_match: 'Poza meczem',
};
const numberPl = (value: number, digits = 1) =>
  value.toLocaleString('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const MatchHud = ({ career }: { career: CareerState }) => {
  const match = career.activeMatch!;
  const home = match.venue === 'home' ? career.currentClub.name : match.opponent.name;
  const away = match.venue === 'away' ? career.currentClub.name : match.opponent.name;
  return (
    <div className="match-hud">
      <div className="match-score">
        <span>{home}</span>
        <strong>
          {match.homeGoals} : {match.awayGoals}
        </strong>
        <span>{away}</span>
      </div>
      <div className="match-minute">
        {match.currentMinute}' · {match.teamLevel === 'senior' ? 'Seniorzy' : 'Akademia'}
      </div>
      {match.momentum && (
        <MatchMomentumChart points={match.momentum} currentMinute={match.currentMinute} />
      )}
      <div className="match-kpis">
        {match.liveRating !== undefined && (
          <span>
            Ocena <strong>{numberPl(match.liveRating)}</strong>
          </span>
        )}
        <span>
          Minuty <strong>{match.playerMinutes}</strong>
        </span>
        <span>
          xA{' '}
          <strong>
            {numberPl(
              match.resolvedMoments.reduce((s, r) => s + r.xA, 0),
              2,
            )}
          </strong>
        </span>
      </div>
    </div>
  );
};
const MatchGame = ({
  career,
  onCareer,
}: {
  career: CareerState;
  onCareer: (career: CareerState) => void;
}) => {
  const match = career.activeMatch;
  const transition = (action: string, next: CareerState) => {
    const before = matchStateSummary(career.activeMatch);
    const after = matchStateSummary(next.activeMatch);
    const validTransition = JSON.stringify(before) !== JSON.stringify(after);
    recordMatchTransition({
      action,
      before,
      after,
      validTransition,
      ...(!validTransition ? { warning: 'unchanged actionable match state' } : {}),
    });
    onCareer(next);
  };
  if (!match)
    return (
      <section>
        <p>Trwa przygotowanie spotkania.</p>
      </section>
    );
  const definition =
    match.currentMoment &&
    MATCH_MOMENT_LIBRARY.find((m) => m.id === match.currentMoment!.definitionId);
  if (match.completed) {
    const a = career.matchHistory?.at(-1);
    const forGoals = match.venue === 'home' ? match.homeGoals : match.awayGoals;
    const against = match.venue === 'home' ? match.awayGoals : match.homeGoals;
    const quality = !a?.minutes
      ? 'krótki występ bez większego wpływu'
      : a.personalImpact >= 5
        ? 'bardzo mocny występ'
        : a.personalImpact >= 2
          ? 'solidny występ'
          : a.personalImpact >= -1
            ? 'nierówny mecz'
            : 'trudny wieczór';
    return (
      <section>
        <MatchHud career={career} />
        <h2>Wynik</h2>
        <h3>
          {career.currentClub.name} {forGoals}:{against} {match.opponent.name}
        </h3>
        {match.teamStats && (
          <div className="team-stats">
            <strong>
              {match.venue === 'home' ? career.currentClub.name : match.opponent.name}
            </strong>
            <strong>Statystyka</strong>
            <strong>
              {match.venue === 'away' ? career.currentClub.name : match.opponent.name}
            </strong>
            {(
              [
                ['Posiadanie', 'possession'],
                ['Strzały', 'shots'],
                ['Strzały celne', 'shotsOnTarget'],
                ['xG', 'xG'],
                ['Groźne akcje', 'dangerousActions'],
              ] as const
            ).flatMap(([label, key]) => [
              <span key={`${key}h`}>
                {key === 'xG'
                  ? numberPl(match.teamStats!.home[key], 2)
                  : match.teamStats!.home[key]}
                {key === 'possession' ? '%' : ''}
              </span>,
              <span key={key}>{label}</span>,
              <span key={`${key}a`}>
                {key === 'xG'
                  ? numberPl(match.teamStats!.away[key], 2)
                  : match.teamStats!.away[key]}
                {key === 'possession' ? '%' : ''}
              </span>,
            ])}
          </div>
        )}
        <h3>Twój występ</h3>
        <p>
          {a?.started ? 'Pierwszy skład' : 'Rezerwowy'} · {a?.minutes ?? 0} minut · gole{' '}
          {a?.goals ?? 0} · asysty {a?.assists ?? 0} · xG {numberPl(a?.xG ?? 0, 2)} · xA{' '}
          {numberPl(a?.xA ?? 0, 2)} · kluczowe podania {a?.keyPasses ?? 0} · akcje defensywne{' '}
          {a?.defensiveActions ?? 0}
          {career.player.primaryPosition === 'goalkeeper' ? ` · obrony ${a?.saves ?? 0}` : ''} ·
          ocena {a?.rating === undefined ? '—' : numberPl(a.rating)}
        </p>
        <p>
          {a ? describePerformance(a.rating, a.minutes, forGoals > against) : quality}. Wynik
          drużyny powstał z całego przebiegu spotkania, nie tylko z twoich akcji.
        </p>
        <button onClick={() => onCareer(advanceCareerWeek(career))}>
          Przejdź do kolejnego tygodnia
        </button>
      </section>
    );
  }
  if (!match.currentMoment)
    return (
      <section>
        <MatchHud career={career} />
        <h2>Decyzja sztabu</h2>
        <p>
          {match.date} · {match.venue === 'home' ? 'dom' : 'wyjazd'} · {match.opponent.name}
        </p>
        <h3>{statusLabel[match.squadStatus]}</h3>
        <p>
          {match.squadStatus.includes('bench')
            ? 'Radecki nie rzuca cię jeszcze od pierwszej minuty, ale zostawia szansę na wejście.'
            : match.playerMinutes === 0
              ? 'Ten weekend oglądasz z boku. Potraktuj decyzję jako motywację i zadbaj o gotowość.'
              : 'Dostajesz szansę od początku. Sztab oczekuje realizacji zadań.'}
        </p>
        <button onClick={() => transition('advance', advanceMatch(career))}>
          {match.plannedMinutes ? 'Rozpocznij mecz' : 'Przyjmij decyzję i przejdź dalej'}
        </button>
      </section>
    );
  return (
    <section>
      <MatchHud career={career} />
      <p>{match.currentMoment.minute}. minuta · sytuacja meczowa</p>
      {match.resolvedMoments.at(-1)?.ratingAfter !== undefined && (
        <aside className="rating-change">
          <strong>
            Ocena {numberPl(match.resolvedMoments.at(-1)!.ratingBefore ?? 6)} →{' '}
            {numberPl(match.resolvedMoments.at(-1)!.ratingAfter!)}
          </strong>
          <p>{match.resolvedMoments.at(-1)!.ratingExplanation}</p>
        </aside>
      )}
      <h2>{match.currentMoment.description}</h2>
      <p>
        Masz niewiele czasu. Rywal szybko skraca dystans, ale za jego plecami otwiera się
        przestrzeń.
      </p>
      <div className="choices">
        {definition?.decisions.map((d) => (
          <article className="decision-card" key={d.id}>
            <h3>{d.label}</h3>
            <p>{d.description}</p>
            <section className="possible-benefits">
              <h4>Możesz zyskać</h4>
              <p>{d.visibleGain}</p>
            </section>
            <section className="possible-risks">
              <h4>Ryzykujesz</h4>
              <p>{d.visibleRisk}</p>
            </section>
            <button
              onClick={() => transition(`decision:${d.id}`, resolveMatchDecision(career, d.id))}
            >
              Wybierz
            </button>
          </article>
        ))}
      </div>
    </section>
  );
};

const RetiredCareerSummary = ({
  career,
  onHistory,
  onNewCareer,
}: {
  career: CareerState;
  onHistory: () => void;
  onNewCareer: () => void;
}) => {
  const seasons = career.completedSeasons ?? [];
  const totals = seasons.reduce(
    (sum, season) => ({
      appearances: sum.appearances + season.player.appearances,
      starts: sum.starts + season.player.starts,
      minutes: sum.minutes + season.player.minutes,
      goals: sum.goals + season.player.goals,
      assists: sum.assists + season.player.assists,
    }),
    { appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0 },
  );
  const milestones = getCareerMilestones(career).filter((item) =>
    ['top_tier_champion', 'retired'].includes(item.fact.factType),
  );
  return (
    <section className="panel retirement-summary">
      <p>KARIERA ZAKOŃCZONA</p>
      <h1>Koniec kariery</h1>
      <h2>
        {career.player.firstName} {career.player.lastName}
      </h2>
      <p>Wiek zakończenia kariery: {career.retirementAge ?? career.player.age}</p>
      <p>
        Sezony: {career.careerSeasonNumber} · Pierwszy klub: Vistula Nova · Ostatni klub:{' '}
        {career.currentClub.name}
      </p>
      <h3>Bilans kariery</h3>
      <p>
        Występy: {totals.appearances} · starty: {totals.starts} · minuty: {totals.minutes}
      </p>
      <p>
        Gole: {totals.goals} · asysty: {totals.assists}
      </p>
      <h3>Ścieżka kariery</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sezon</th>
              <th>Wiek</th>
              <th>Klub</th>
              <th>Liga</th>
              <th>Miejsce</th>
              <th>Trofea / wyróżnienia</th>
              <th>Wyst.</th>
              <th>Starty</th>
              <th>Min.</th>
              <th>G/A</th>
              <th>Ocena</th>
              <th>OVR</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((season) => (
              <tr key={season.seasonId}>
                <td>{season.label}</td>
                <td>{season.age}</td>
                <td>{season.clubName}</td>
                <td>
                  {season.leagueName} — poziom {season.leagueTier ?? season.leagueLevel}
                </td>
                <td>
                  {season.clubFinish}.{' '}
                  {season.seasonResult === 'promoted' && (
                    <span title="Awans" aria-label="Awans">
                      ↑
                    </span>
                  )}
                  {season.seasonResult === 'relegated' && (
                    <span title="Spadek" aria-label="Spadek">
                      ↓
                    </span>
                  )}
                </td>
                <td>{getSeasonHonours(career.historyFacts, season).join(', ') || '—'}</td>
                <td>{season.player.appearances}</td>
                <td>{season.player.starts}</td>
                <td>{season.player.minutes}</td>
                <td>
                  {season.player.goals}G {season.player.assists}A
                </td>
                <td>{season.player.averageRating.toFixed(1)}</td>
                <td>
                  {season.development.seasonStartOVR}→{season.development.seasonEndOVR}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Najwyższy OVR:{' '}
        {career.highestOVR ?? getPlayerOverall(career.player, career.player.primaryPosition)}
      </p>
      {milestones.length > 0 && (
        <>
          <h3>Najważniejsze osiągnięcia</h3>
          {milestones.map(({ fact }) => (
            <p key={fact.id}>{getFactPresentation(career, fact)?.title ?? fact.factType}</p>
          ))}
        </>
      )}
      <div className="tabs">
        <button onClick={onHistory}>Historia kariery</button>
        <button onClick={onNewCareer}>Nowa kariera</button>
      </div>
    </section>
  );
};

export const App = () => {
  const devtoolsEnabled = isDevToolsEnabled();
  const tabs = devtoolsEnabled ? [...baseTabs, devtoolsTab] : baseTabs;
  const [view, setView] = useState<'start' | 'creator' | 'career'>(() =>
    hasValidCareer() ? 'start' : 'start',
  );
  const [career, setCareer] = useState<CareerState | null>(() => {
    const loaded = loadCareer();
    return loaded.ok ? advanceCareerFlow(loaded.save.career) : null;
  });
  const [step, setStep] = useState(0);
  const [active, setActive] = useState<TabId>('game');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [identity, setIdentity] = useState<IdentityInput>({
    firstName: '',
    lastName: '',
    nationality: 'PL',
    age: STARTING_AGE,
    dominantFoot: 'right',
    customSeed: '',
  });
  const [profileInput, setProfileInput] = useState<ProfileFormState>({
    position: 'winger',
    heightCm: '174',
    weightKg: '68',
  });
  const [seed, setSeed] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyErrors);
  const [showInfo, setShowInfo] = useState(() => localStorage.getItem(infoKey) !== '1');
  const [variants, setVariants] = useState<StartingPlayerProfile[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const generated = variants[selectedVariant] ?? null;
  const validation = useMemo(() => validateSampleContent(), []);
  const randomPreview = useMemo(() => previewRandomSequence('mfl-sample-career-2026'), []);
  const heightForHint = Number(profileInput.heightCm);
  const weightRange =
    Number.isInteger(heightForHint) && heightForHint >= 155 && heightForHint <= 205
      ? getAllowedWeightRange(heightForHint)
      : getAllowedWeightRange(174);
  const clearVariants = () => {
    setVariants([]);
    setSelectedVariant(0);
  };
  const setProfile = (next: ProfileFormState) => {
    setProfileInput(next);
    clearVariants();
  };
  const updateCareer = (next: CareerState) => {
    const advanced = advanceCareerFlow(next);
    saveCareer(advanced);
    setCareer(advanced);
  };
  const startNew = () => {
    if (career && !confirm(translate('start.confirmOverwrite'))) return;
    setView('creator');
    setStep(0);
    setSeed('');
    clearVariants();
  };
  const resetCareer = () => {
    deleteCareer();
    setCareer(null);
    setView('creator');
    setStep(0);
    setSeed('');
    clearVariants();
  };
  const continueCareer = () => {
    const loaded = loadCareer();
    if (loaded.ok) {
      updateCareer(loaded.save.career);
      setView('career');
    }
  };
  const nextIdentity = () => {
    const result = identityInputSchema.safeParse({ ...identity, age: STARTING_AGE });
    if (!result.success) {
      setFieldErrors(addIssues(result.error.issues));
      return;
    }
    setIdentity(result.data);
    setFieldErrors(emptyErrors());
    setSeed(result.data.customSeed?.trim() || makeReadableSeed());
    clearVariants();
    setStep(1);
  };
  const nextProfile = () => {
    const result = profileInputSchema.safeParse(profileInput);
    if (!result.success) {
      setFieldErrors(addIssues(result.error.issues));
      return;
    }
    const input: CreatorInput = { ...identity, age: STARTING_AGE, ...result.data, seed };
    setFieldErrors(emptyErrors());
    setVariants([generateStartingPlayerProfile(input, seed, 0)]);
    setSelectedVariant(0);
    setStep(2);
  };
  const reroll = () => {
    if (!generated || variants.length >= MAX_PROFILE_VARIANTS || !canReroll(variants.length - 1))
      return;
    const input: CreatorInput = {
      ...identity,
      age: STARTING_AGE,
      position: generated.player.primaryPosition as PositionId,
      heightCm: generated.player.heightCm,
      weightKg: generated.player.weightKg,
      seed,
    };
    const next = generateStartingPlayerProfile(input, seed, variants.length);
    setVariants((current) => [...current, next]);
    setSelectedVariant(variants.length);
  };
  const finish = () => {
    if (!generated) return;
    updateCareer(createCareerState(generated, seed));
    setView('career');
  };

  if (view === 'career' && career && career.careerStatus === 'retired' && active !== 'history')
    return (
      <main className="shell">
        <RetiredCareerSummary
          career={career}
          onHistory={() => setActive('history')}
          onNewCareer={resetCareer}
        />
      </main>
    );

  if (view === 'career' && career)
    return (
      <main className="shell">
        <header className="hero">
          <p>{getCareerHeader(career)}</p>
          <h1>{translate('app.title')}</h1>
          <span>{getCareerSubtitle(career)}</span>
        </header>
        <CareerHud career={career} />
        <nav className="tabs">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={active === id ? 'active' : ''}
            >
              {translate(label)}
            </button>
          ))}
        </nav>
        <section className="panel">
          {active === 'devtools' && devtoolsEnabled ? (
            <div className="devgrid">
              <section>
                <h2>CAREER PROGRESSION</h2>
                <pre>{JSON.stringify(diagnoseCareerProgression(career), null, 2)}</pre>
                <strong>
                  Can advance: {diagnoseCareerProgression(career).canAdvance ? 'YES' : 'NO'}
                </strong>
              </section>
              <section>
                <h2>MATCH STATE</h2>
                <pre>
                  {JSON.stringify(
                    {
                      fixtureId: getCurrentFixture(career)?.id,
                      season: career.currentSeason,
                      careerWeek: getCurrentCareerWeek(career)?.weekIndex,
                      ...matchStateSummary(career.activeMatch),
                      lastSelectedDecision: getMatchTransitionHistory().at(-1)?.action,
                      lastMatchTransition: getMatchTransitionHistory().at(-1),
                      nextExpectedState: career.activeMatch?.completed
                        ? 'career week'
                        : career.activeMatch?.currentMoment
                          ? 'resolved or later moment'
                          : 'next moment or completed',
                      transitionHistory: getMatchTransitionHistory(),
                    },
                    null,
                    2,
                  )}
                </pre>
              </section>
              <code>{career.seed}</code>
              <pre>{JSON.stringify(randomPreview, null, 2)}</pre>
              <p>Brakujące klucze: {Array.from(missingLocalizationKeys).join(', ') || 'brak'}</p>
              <section>
                <h2>Powtarzające się teksty</h2>
                <pre>
                  {JSON.stringify(auditRepeatedPlayerFacingText(matchLocalization), null, 2)}
                </pre>
              </section>
              <p>
                OK: {validation.events.length} wydarzeń, {validation.clubs.length} klub,{' '}
                {validation.people.length} postać.
              </p>
            </div>
          ) : (
            <>
              {active === 'game' && <EventCard career={career} onCareer={updateCareer} />}{' '}
              {active === 'history' && (
                <div>
                  <h2>Oś czasu kariery</h2>
                  <div className="tabs">
                    <button
                      className={!showAllHistory ? 'active' : ''}
                      onClick={() => setShowAllHistory(false)}
                    >
                      Najważniejsze
                    </button>
                    <button
                      className={showAllHistory ? 'active' : ''}
                      onClick={() => setShowAllHistory(true)}
                    >
                      Wszystko
                    </button>
                  </div>
                  {(showAllHistory
                    ? career.historyFacts
                    : getCareerMilestones(career).map((item) => item.fact)
                  ).map((f) => {
                    const fp = getFactPresentation(career, f);
                    return (
                      <article className="mini-card history-item" key={f.id}>
                        <p>
                          {formatDate(f.date)} <span className="tone-badge">{fp.toneLabel}</span>
                        </p>
                        <h3>{fp.title}</h3>
                        <p>{fp.summary}</p>
                        <p>
                          {fp.participantNames.join(', ')}
                          {fp.clubName ? ` · ${fp.clubName}` : ''}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}{' '}
              {active === 'season' && <SeasonView career={career} />}{' '}
              {active === 'club' && <ClubProfile career={career} />}{' '}
              {active !== 'game' &&
                active !== 'history' &&
                active !== 'season' &&
                active !== 'club' && (
                  <div className="career-grid">
                    <PlayerCard
                      profile={{
                        player: career.player,
                        profileDescriptionKey: 'creator.profileDescription',
                        profileDescriptionParams: {
                          strong1: 'attribute.technique',
                          strong2: 'attribute.vision',
                          weak: 'attribute.defending',
                          position: `position.${career.player.primaryPosition}`,
                        },
                        rollIndex: 0,
                      }}
                      seed={career.seed}
                      baseline={career.seasonStartingAttributes}
                    />
                    <aside>
                      <p>
                        <strong>Status:</strong> {playerStatus(career)}
                      </p>
                      <p>
                        <strong>Klub:</strong> {career.currentClub.name}
                      </p>
                      {career.currentContract && (
                        <section className="mini-card">
                          <h3>Kontrakt</h3>
                          <p>
                            <strong>{career.currentClub.name}</strong>
                          </p>
                          <p>
                            {career.currentContract.monthlySalary.toLocaleString('pl-PL')} PLN /
                            miesiąc
                          </p>
                          <p>do {career.currentContract.endDate}</p>
                          <p>Rola: {squadRoleLabel(career.currentContract.squadRole)}</p>
                        </section>
                      )}
                      <section className="mini-card">
                        <h3>Instrukcje dla agenta</h3>
                        <p>
                          Wybierz maksymalnie dwa priorytety. Agent porządkuje tylko oferty klubów,
                          które naprawdę są zainteresowane.
                        </p>
                        {(
                          [
                            ['sporting_level', 'Poziom sportowy'],
                            ['important_role', 'Ważna rola'],
                            ['development', 'Rozwój'],
                            ['salary', 'Wynagrodzenie'],
                            ['infrastructure', 'Zaplecze klubu'],
                          ] as const
                        ).map(([value, label]) => (
                          <label key={value}>
                            <input
                              type="checkbox"
                              checked={(career.agentPreferences ?? []).includes(value)}
                              disabled={
                                !(career.agentPreferences ?? []).includes(value) &&
                                (career.agentPreferences ?? []).length >= 2
                              }
                              onChange={() => {
                                const existing = career.agentPreferences ?? [];
                                updateCareer({
                                  ...career,
                                  agentPreferences: existing.includes(value)
                                    ? existing.filter((item) => item !== value)
                                    : [...existing, value],
                                });
                              }}
                            />{' '}
                            {label}
                          </label>
                        ))}
                      </section>
                      <p>
                        <strong>Pozycja:</strong>{' '}
                        {translate(`position.${career.player.primaryPosition}`)}
                      </p>
                      <p>
                        <strong>Morale:</strong> {career.player.morale}
                      </p>
                      <p>
                        <strong>Kondycja:</strong> {career.player.fitness}
                      </p>
                      {getInjuryDescription(career) && (
                        <p>
                          <strong>Kontuzja:</strong> {getInjuryDescription(career)}
                        </p>
                      )}
                      <p title="Tendencja zmienia się przez doświadczenia i decyzje fabularne.">
                        <strong>Podejście do treningu:</strong>{' '}
                        {TRAINING_EFFORT_LABELS[career.player.trainingEffort ?? 3]}
                      </p>
                      <label title="Steruje tylko sposobem prezentacji meczów, nie poziomem trudności.">
                        Prezentacja meczów{' '}
                        <select
                          value={career.player.matchPresentation}
                          onChange={(event) =>
                            updateCareer({
                              ...career,
                              player: {
                                ...career.player,
                                matchPresentation: event.target.value as
                                  | 'important_matches'
                                  | 'simulate_all',
                              },
                            })
                          }
                        >
                          <option value="important_matches">Ważne mecze</option>
                          <option value="simulate_all">Symuluj wszystkie</option>
                        </select>
                      </label>
                      <p title="To nawyk, a nie ustawienie meczu.">
                        <strong>Podejście do meczu:</strong>{' '}
                        {MATCH_EFFORT_LABELS[career.player.matchEffort]}
                      </p>
                      <h3>Rozwój</h3>
                      {(() => {
                        const summary = getSeasonPlayerSummary(career, career.currentSeason);
                        const goalkeeperSummary =
                          career.player.primaryPosition === 'goalkeeper'
                            ? getSeasonGoalkeeperStats(career.seasonParticipation ?? [])
                            : undefined;
                        return (
                          <>
                            <h3>Bieżący sezon — {getSeasonProgress(career).seasonLabel}</h3>
                            <p>
                              <strong>
                                OVR {getPlayerOverall(career.player, career.player.primaryPosition)}{' '}
                                {formatAttributeDelta(getSeasonOverallDelta(career))}
                              </strong>
                            </p>
                            <div className="season-grid">
                              <div>
                                Mecze
                                <br />
                                <strong>{summary.appearances}</strong>
                              </div>
                              <div>
                                Pierwszy skład
                                <br />
                                <strong>{summary.starts}</strong>
                              </div>
                              <div>
                                Minuty
                                <br />
                                <strong>{summary.minutes}</strong>
                              </div>
                              {goalkeeperSummary ? (
                                <>
                                  <div>
                                    Stracone gole
                                    <br />
                                    <strong>{goalkeeperSummary.goalsConceded}</strong>
                                  </div>
                                  <div>
                                    Czyste konta
                                    <br />
                                    <strong>{goalkeeperSummary.cleanSheets}</strong>
                                  </div>
                                  <div>
                                    Obrony
                                    <br />
                                    <strong>{goalkeeperSummary.saves}</strong>
                                  </div>
                                  <div>
                                    Skuteczność obron
                                    <br />
                                    <strong>{numberPl(goalkeeperSummary.savePercentage)}%</strong>
                                  </div>
                                  <div>
                                    xGA
                                    <br />
                                    <strong>{numberPl(goalkeeperSummary.xGA)}</strong>
                                  </div>
                                  <div>
                                    Gole powstrzymane
                                    <br />
                                    <strong>
                                      {goalkeeperSummary.goalsPrevented > 0 ? '+' : ''}
                                      {numberPl(goalkeeperSummary.goalsPrevented)}
                                    </strong>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    Gole
                                    <br />
                                    <strong>{summary.goals}</strong>
                                  </div>
                                  <div>
                                    Asysty
                                    <br />
                                    <strong>{summary.assists}</strong>
                                  </div>
                                </>
                              )}
                              <div>
                                Średnia ocen
                                <br />
                                <strong>
                                  {summary.averageRating === undefined
                                    ? '—'
                                    : numberPl(summary.averageRating)}
                                </strong>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                      <p>
                        {
                          getMonthlyDevelopmentSummary(
                            career,
                            Number(getSeasonProgress(career).currentDate.slice(0, 4)),
                            Number(getSeasonProgress(career).currentDate.slice(5, 7)),
                          ).narrative
                        }
                      </p>
                      {career.historyFacts
                        .filter((f) => f.factType === 'attribute_changed')
                        .slice(-1)
                        .map((f) => (
                          <article className="mini-card" key={f.id}>
                            <strong>Rozwój zawodnika</strong>
                            <p>
                              {String(f.data.attribute)}: {String(f.data.before)} →{' '}
                              {String(f.data.after)}
                            </p>
                          </article>
                        ))}
                      <p>Ostatnia aktywność: {career.trainingApproach ?? 'balanced'}</p>
                      <h3>Atuty</h3>
                      {getUnlockedPlayStyles(career).length ? (
                        getUnlockedPlayStyles(career).map((id) => (
                          <article className="mini-card" key={id}>
                            <strong>{PLAY_STYLE_PRESENTATION[id].name}</strong>
                            <p>{PLAY_STYLE_PRESENTATION[id].description}</p>
                          </article>
                        ))
                      ) : (
                        <p>
                          Nie wykształciłeś jeszcze wyraźnego stylu, który sztab uznałby za jeden z
                          twoich znaków rozpoznawczych.
                        </p>
                      )}
                      <h3>Finanse</h3>
                      <p>
                        Dostępne środki:{' '}
                        {(career.finances ?? []).reduce((sum, item) => sum + item.amount, 0)} PLN
                      </p>
                      {(career.finances ?? [])
                        .slice(-3)
                        .reverse()
                        .map((item) => (
                          <p key={item.id}>
                            {item.date}: {item.amount > 0 ? '+' : ''}
                            {item.amount} PLN
                          </p>
                        ))}
                    </aside>
                  </div>
                )}
            </>
          )}
        </section>
      </main>
    );
  if (view === 'creator')
    return (
      <main className="shell narrow">
        <header className="hero">
          <p>Nowa kariera</p>
          <h1>Kreator zawodnika</h1>
        </header>
        <ol className="steps">
          {['Tożsamość', 'Profil', 'Atrybuty', 'Podsumowanie'].map((label, i) => (
            <li className={i === step ? 'active' : ''} key={label}>
              {label}
            </li>
          ))}
        </ol>
        <section className="panel">
          {step === 0 && (
            <div className="form">
              <label>
                Imię
                <input
                  value={identity.firstName}
                  onChange={(e) => setIdentity({ ...identity, firstName: e.target.value })}
                />
                <FieldError errors={fieldErrors.firstName} />
              </label>
              <label>
                Nazwisko
                <input
                  value={identity.lastName}
                  onChange={(e) => setIdentity({ ...identity, lastName: e.target.value })}
                />
                <FieldError errors={fieldErrors.lastName} />
              </label>
              <label>
                Narodowość
                <select
                  value={identity.nationality}
                  onChange={(e) =>
                    setIdentity({
                      ...identity,
                      nationality: e.target.value as IdentityInput['nationality'],
                    })
                  }
                >
                  <option value="PL">Polska</option>
                </select>
              </label>
              <p>
                <strong>Wiek startowy:</strong> {STARTING_AGE} lat
              </p>
              <label>
                Dominująca noga
                <select
                  value={identity.dominantFoot}
                  onChange={(e) =>
                    setIdentity({
                      ...identity,
                      dominantFoot: e.target.value as IdentityInput['dominantFoot'],
                    })
                  }
                >
                  <option value="right">Prawa noga</option>
                  <option value="left">Lewa noga</option>
                </select>
              </label>
              <label>
                Seed kariery
                <input
                  value={identity.customSeed}
                  onChange={(e) => setIdentity({ ...identity, customSeed: e.target.value })}
                />
                <small>
                  Pozostaw puste, aby gra utworzyła losowy seed. Ten sam seed pozwala odtworzyć tę
                  samą karierę.
                </small>
                <FieldError errors={fieldErrors.customSeed} />
              </label>
              <button onClick={nextIdentity}>Dalej</button>
            </div>
          )}
          {step === 1 && (
            <div className="form">
              <div className="positions">
                {positionIds.map((id) => (
                  <button
                    className={profileInput.position === id ? 'active' : ''}
                    key={id}
                    onClick={() => {
                      const [heightCm, weightKg] = defaultBodyForPosition(id);
                      setProfile({
                        position: id,
                        heightCm: String(heightCm),
                        weightKg: String(weightKg),
                      });
                    }}
                  >
                    <strong>{translate(`position.${id}`)}</strong>
                    <span>{translate(`position.${id}.description`)}</span>
                  </button>
                ))}
              </div>
              <label>
                Wzrost
                <div className="unit-field">
                  <input
                    inputMode="numeric"
                    value={profileInput.heightCm}
                    onChange={(e) => setProfile({ ...profileInput, heightCm: e.target.value })}
                  />
                  <span>cm</span>
                </div>
                <FieldError errors={fieldErrors.heightCm} />
              </label>
              <label>
                Masa ciała
                <div className="unit-field">
                  <input
                    inputMode="numeric"
                    value={profileInput.weightKg}
                    onChange={(e) => setProfile({ ...profileInput, weightKg: e.target.value })}
                  />
                  <span>kg</span>
                </div>
                <small>
                  Dozwolony zakres dla tego wzrostu: {weightRange.min}–{weightRange.max} kg.
                </small>
                <FieldError errors={fieldErrors.weightKg} />
              </label>
              <button onClick={() => setStep(0)}>Wstecz</button>
              <button onClick={nextProfile}>Dalej</button>
            </div>
          )}
          {step === 2 && generated && (
            <>
              <PlayerCard profile={generated} seed={seed} />
              <div className="variant-picker">
                {variants.map((_, index) => (
                  <button
                    className={selectedVariant === index ? 'active' : ''}
                    key={index}
                    onClick={() => setSelectedVariant(index)}
                  >
                    Wariant {index + 1}
                  </button>
                ))}
              </div>
              <p>Pozostałe ponowne losowania: {MAX_PROFILE_VARIANTS - variants.length}</p>
              <button disabled={variants.length >= MAX_PROFILE_VARIANTS} onClick={reroll}>
                Losuj ponownie
              </button>
              <button onClick={() => setStep(3)}>Akceptuj atrybuty</button>
            </>
          )}
          {step === 3 && generated && (
            <>
              <PlayerCard profile={generated} seed={seed} />
              <p>Wiek startowy: {generated.player.age} lat</p>
              <button onClick={() => setStep(1)}>Wróć i popraw</button>
              <button onClick={finish}>Rozpocznij karierę</button>
            </>
          )}
        </section>
      </main>
    );
  return (
    <main className="shell start">
      <header className="hero">
        <p>{translate('start.subtitle')}</p>
        <h1>{translate('app.title')}</h1>
      </header>
      {showInfo && (
        <aside className="notice">
          <p>{translate('start.localSaveNotice')}</p>
          <button
            onClick={() => {
              localStorage.setItem(infoKey, '1');
              setShowInfo(false);
            }}
          >
            Rozumiem
          </button>
        </aside>
      )}
      <section className="panel menu">
        <button onClick={startNew}>Nowa kariera</button>
        <button disabled={!career} onClick={continueCareer}>
          Kontynuuj
        </button>
        <a href="https://github.com/adamfron/my_football_legend">O projekcie</a>
        {devtoolsEnabled && (
          <button className="subtle" onClick={() => setView('career')}>
            Narzędzia developerskie
          </button>
        )}
      </section>
    </main>
  );
};
