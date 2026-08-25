import { useMemo, useState } from 'react';
import { previewRandomSequence } from '../devtools/randomPreview';
import {
  simulateAcademySelection,
  type AcademySelectionSimulationReport,
} from '../devtools/academySelectionSimulation';
import { validateSampleContent } from '../schemas/validateContent';
import { missingLocalizationKeys, translate } from '../core/narrative/localization';
import { getFactPresentation } from '../core/narrative/factPresentation';
import { buildFirstWeekSummary } from '../core/narrative/weekSummary';
import { PersonAvatar } from '../components/PersonAvatar';
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
import { hasValidCareer, loadCareer, saveCareer } from '../core/persistence';
import { hasCompletedAcademyArc, initializeSecondAcademyWeek } from '../core/events/academyArc';
import { advanceCareerFlow } from '../core/careerFlow';
import { getEventDefinition } from '../core/events/eventRegistry';
import { resolveEventChoice } from '../core/events/resolveEventChoice';
import { getAvailableDecisions } from '../core/events/decisionAvailability';
import {
  advanceAugustWeek,
  augustActivities,
  canChooseAugustActivity,
  canInitializeAugust,
  evaluateWeeklyLoad,
  getAvailableFunds,
  getWeeklyClubLoad,
  initializeAugustPhase,
  resolveAugustActivity,
} from '../core/augustPlanning';
import {
  advanceActiveEvent,
  applyEventResolution,
  completeAcademyWeek,
} from '../core/events/applyEventResolution';
import { assignedRole, roleStatus } from '../core/events/postSelectionPath';
import {
  advanceMatch,
  advanceSeptemberWeek,
  initializeSeptemberPhase,
  MATCH_MOMENT_LIBRARY,
  opportunityDescription,
  resolveMatchDecision,
  startSeptemberMatch,
} from '../core/septemberMatches';
import type {
  CareerState,
  EventDecision,
  Person,
  PlayerAttributes,
  RelationshipScores,
} from '../types/domain';
import { isDevToolsEnabled } from './devTools';
import './App.css';

const infoKey = 'mfl.localSaveInfoDismissed';
const baseTabs = [
  ['game', 'nav.game'],
  ['player', 'nav.player'],
  ['club', 'nav.club'],
  ['relationships', 'nav.relationships'],
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

const RadarChart = ({ attributes }: { attributes: PlayerAttributes }) => {
  const points = attributeKeys
    .map((key, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / attributeKeys.length;
      const radius = (attributes[key] / 100) * RADAR_RADIUS;
      return `${RADAR_CENTER + Math.cos(angle) * radius},${RADAR_CENTER + Math.sin(angle) * radius}`;
    })
    .join(' ');
  return (
    <figure className="radar">
      <svg
        viewBox={`0 0 ${RADAR_VIEWBOX_SIZE} ${RADAR_VIEWBOX_SIZE}`}
        role="img"
        aria-labelledby="radar-title"
      >
        <title id="radar-title">Wykres radarowy atrybutów</title>
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
        {attributeKeys.map((key, index) => {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / attributeKeys.length;
          const x = RADAR_CENTER + Math.cos(angle) * RADAR_LABEL_RADIUS;
          const y = RADAR_CENTER + Math.sin(angle) * RADAR_LABEL_RADIUS;
          return (
            <g key={key}>
              <line
                x1={RADAR_CENTER}
                y1={RADAR_CENTER}
                x2={RADAR_CENTER + Math.cos(angle) * RADAR_RADIUS}
                y2={RADAR_CENTER + Math.sin(angle) * RADAR_RADIUS}
                stroke="rgba(255,255,255,.12)"
              />
              <text x={x} y={y} textAnchor="middle">
                {translate(`attribute.${key}`)}
              </text>
            </g>
          );
        })}
        <polygon points={points} fill="rgba(68, 209, 157, .35)" stroke="#44d19d" strokeWidth="3" />
      </svg>
      <figcaption>
        {attributeKeys
          .map((key) => `${translate(`attribute.${key}`)} ${attributes[key]}`)
          .join(', ')}
      </figcaption>
    </figure>
  );
};

const PlayerCard = ({ profile, seed }: { profile: StartingPlayerProfile; seed: string }) => (
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
    <RadarChart attributes={profile.player.attributes} />
    <ul className="attrs">
      {attributeKeys.map((key) => (
        <li key={key}>
          <span>{translate(`attribute.${key}`)}</span>
          <strong>{profile.player.attributes[key]}</strong>
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
const relationshipLabel = (scores: RelationshipScores) =>
  scores.resentment > 55
    ? translate('relationships.tense_resentment')
    : scores.rivalry > 55
      ? translate('relationships.rising_rivalry')
      : scores.gratitude > 55
        ? translate('relationships.gratitude')
        : scores.respect > 60
          ? translate('relationships.strong_respect')
          : scores.trust > 55
            ? translate('relationships.cautious_trust')
            : translate('relationships.neutral');
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
  const role = assignedRole(career);
  if (role) return roleStatus(role);
  const outcome = career.historyFacts.find((f) => f.factType === 'academy_selection_result')?.data
    .selectionOutcome;
  if (outcome === 'player_invited') return 'Zaproszony na trening seniorów';
  if (outcome === 'both_invited') return 'Zaproszony razem z konkurentem';
  if (outcome === 'rival_invited_player_plan') return 'Realizuje indywidualny plan rozwoju';
  if (outcome === 'extended_assessment') return 'Czeka na dodatkowy sprawdzian';
  return hasCompletedAcademyArc(career) ? 'Kandydat do treningów z seniorami' : 'Zawodnik akademii';
};
const careerHeader = (career: CareerState) => {
  const key = String(
    career.activeEvent?.context.stageKey ??
      (career.historyFacts.some((f) => f.factType === 'academy_selection_result')
        ? 'events.academy.stage.selection_decision'
        : hasCompletedAcademyArc(career)
          ? 'events.academy.stage.deciding_week'
          : 'events.academy.stage.first_week'),
  );
  return `Lipiec 2026 — ${translate(key).toLowerCase()}`;
};
const eventParams = (career: CareerState) => {
  const rival = career.significantPeople.find((p) => p.role === 'academy_rival');
  const coach = career.significantPeople.find((p) => p.role === 'coach');
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
const relationshipDynamic = (person: Person, scores: RelationshipScores) =>
  person.role === 'coach'
    ? 'Trener przygląda ci się z ostrożnym zainteresowaniem.'
    : scores.resentment > 50
      ? 'Rozmowa po treningu pozostawiła między wami chłód.'
      : scores.gratitude > 55
        ? `${person.firstName} pamięta, że podzieliłeś się z nim uznaniem.`
        : scores.rivalry > 50
          ? 'Rywalizacja nabiera wyraźnego charakteru.'
          : scores.trust > 55
            ? 'Między wami pojawia się pierwsze wzajemne zaufanie.'
            : 'Relacja dopiero nabiera kształtu.';
const RelationshipCard = ({ career, person }: { career: CareerState; person: Person }) => {
  const scores = career.relationships[person.id] ?? person.relationshipParameters;
  const lastFact = [...career.historyFacts]
    .reverse()
    .find((f) => f.actors.includes(person.id) || f.targets.includes(person.id));
  const presentation = lastFact ? getFactPresentation(career, lastFact) : undefined;
  return (
    <article className="mini-card relation-card">
      <PersonAvatar
        seed={person.faceSeed}
        firstName={person.firstName}
        lastName={person.lastName}
        age={person.age}
      />
      <h3>
        {person.firstName} {person.lastName}
      </h3>
      <p>{translate(`relationships.role.${person.role}`)}</p>
      <strong>{relationshipLabel(scores)}</strong>
      <p>{relationshipDynamic(person, scores)}</p>
      <p>
        {presentation
          ? `Ostatnio: ${presentation.summary}`
          : 'Ostatnie istotne wydarzenie dopiero się pojawi.'}
      </p>
    </article>
  );
};

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
      VN
    </text>
  </svg>
);
const ClubProfile = ({ career }: { career: CareerState }) => {
  const club = career.currentClub;
  const coach = career.significantPeople.find((p) => p.role === 'coach');
  const role = assignedRole(career);
  const importantPeople = career.significantPeople.filter((person) =>
    ['coach', 'academy_rival', 'senior_head_coach', 'senior_captain'].includes(person.role),
  );
  return (
    <div className="club-profile">
      <header className="club-header">
        <ClubCrest name={club.name} />
        <div>
          <h2>{club.name}</h2>
          <p>
            {club.region}, {club.country}
          </p>
          <strong>{prestigeLabel(club.prestige)}</strong>
        </div>
      </header>
      {role && (
        <section>
          <h3>Twoja obecna rola</h3>
          <p>{roleStatus(role)}</p>
        </section>
      )}
      <section>
        <h3>Tożsamość klubu</h3>
        <p>
          {club.name} buduje reputację przez cierpliwe rozwijanie zawodników i spokojną pracę
          akademii.
        </p>
        <p>
          <strong>DNA:</strong> cierpliwość w rozwoju, techniczne szkolenie i wiara w akademię.
        </p>
        <p>
          <strong>Styl gry:</strong> {club.playStyle}.
        </p>
        <p>
          <strong>Młodzież:</strong> {club.youthApproach}.
        </p>
        <p>
          <strong>Sytuacja:</strong> {club.currentSituation}
        </p>
      </section>
      <section>
        <h3>Ostatni sezon</h3>
        {club.seasonHistory.map((s) => (
          <p key={s.season}>
            {s.season}: {s.placement ? `${s.placement}. miejsce. ` : ''}
            {s.summary}
          </p>
        ))}
      </section>
      <section>
        <h3>Co to oznacza dla ciebie</h3>
        <p>
          {club.name} rzeczywiście daje szanse wychowankom, ale oczekuje cierpliwości i gry zgodnej
          z zespołową filozofią. {coach ? `${coach.firstName} ${coach.lastName}` : 'Trener'}{' '}
          obserwuje, czy potrafisz połączyć rozwój indywidualny z potrzebami drużyny.
        </p>
      </section>
      {importantPeople.length > 0 && (
        <section>
          <h3>Ważne osoby</h3>
          {importantPeople.map((person) => (
            <article className="mini-card coach-card" key={person.id}>
              <PersonAvatar
                seed={person.faceSeed}
                firstName={person.firstName}
                lastName={person.lastName}
                age={person.age}
              />
              <div>
                <h4>
                  {person.firstName} {person.lastName}
                </h4>
                <p>{translate(`relationships.role.${person.role}`)}</p>
              </div>
            </article>
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
  if (!event && (career.september || career.activeMatch))
    return <SeptemberGame career={career} onCareer={onCareer} />;
  if (!event && career.augustPlanning) return <AugustPlanner career={career} onCareer={onCareer} />;
  if (!event) {
    const firstWeekCompleted = hasCompletedAcademyArc(career);
    const selectionCompleted = career.historyFacts.some(
      (fact) => fact.factType === 'academy_selection_result',
    );
    const postSelectionCompleted = career.historyFacts.some(
      (fact) => fact.factType === 'post_selection_path_completed',
    );
    return (
      <section>
        {postSelectionCompleted ? (
          <>
            <h2>Podsumowanie nowej roli</h2>
            <p>{playerStatus(career)}</p>
          </>
        ) : firstWeekCompleted && !selectionCompleted ? (
          <>
            <h2>{translate('events.academy.summary.title')}</h2>
            {buildFirstWeekSummary(career).map((p) => (
              <p key={p}>{p}</p>
            ))}
            <button onClick={() => onCareer(initializeSecondAcademyWeek(career))}>
              {translate('events.ui.startSecondWeek')}
            </button>
          </>
        ) : (
          <p>Trwa przygotowanie kolejnego etapu kariery.</p>
        )}
        {postSelectionCompleted && canInitializeAugust(career) && (
          <button onClick={() => onCareer(initializeAugustPhase(career))}>
            Przejdź do sierpnia
          </button>
        )}
      </section>
    );
  }
  const definition = getEventDefinition(event.definitionId);
  const people = Object.values(event.cast)
    .map((id) => personName(career, id))
    .filter(Boolean);
  const params = eventParams(career);
  if (event.definitionId === 'academy_first_week_summary')
    return (
      <section>
        <h2>{translate(definition.localizationKeys.title)}</h2>
        {buildFirstWeekSummary(career).map((p) => (
          <p key={p}>{p}</p>
        ))}
        <button onClick={() => onCareer(completeAcademyWeek(career))}>
          {translate('events.ui.next')}
        </button>
      </section>
    );
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

const AugustPlanner = ({
  career,
  onCareer,
}: {
  career: CareerState;
  onCareer: (career: CareerState) => void;
}) => {
  const plan = career.augustPlanning!;
  if (plan.completed) {
    const summary = [...career.historyFacts]
      .reverse()
      .find((f) => f.factType === 'august_2026_completed');
    return (
      <section>
        <h2>Sierpień 2026 zakończony</h2>
        <p>
          <strong>Rola:</strong> {playerStatus(career)}
        </p>
        <p>
          Kondycja: {Number(summary?.data.fitnessChange) >= 0 ? '+' : ''}
          {String(summary?.data.fitnessChange)} · morale:{' '}
          {Number(summary?.data.moraleChange) >= 0 ? '+' : ''}
          {String(summary?.data.moraleChange)}
        </p>
        <p>Dostępne środki: {getAvailableFunds(career)} PLN</p>
        <p>
          Rozwój: {String(summary?.data.development)} punktów postępu. Najważniejszy moment:{' '}
          {String(summary?.data.highlight)}
        </p>
        <p>Sierpień za tobą. Rozpoczyna się właściwa walka o miejsce na boisku.</p>
        <button onClick={() => onCareer(initializeSeptemberPhase(career))}>
          Rozpocznij wrzesień
        </button>
      </section>
    );
  }
  const latest = plan.results.find((r) => r.week === plan.currentWeek);
  const load = getWeeklyClubLoad(career);
  if (latest)
    return (
      <section>
        <p>
          Tydzień {plan.currentWeek} · {latest.date}
        </p>
        <h2>Zamknięcie tygodnia</h2>
        <p>{latest.narrative}</p>
        {latest.interlude && <p>{latest.interlude}</p>}
        <button onClick={() => onCareer(advanceAugustWeek(career))}>
          {plan.currentWeek === 4 ? 'Podsumuj sierpień' : 'Przejdź do kolejnego tygodnia'}
        </button>
      </section>
    );
  return (
    <section>
      <p>Tydzień {plan.currentWeek} · August 2026 — walka o swoją rolę</p>
      <h2>Plan tygodnia</h2>
      <div className="career-grid">
        <article className="mini-card">
          <h3>Status</h3>
          <p>
            <strong>Rola:</strong> {playerStatus(career)}
          </p>
          <p>
            <strong>Obciążenie:</strong>{' '}
            {load >= 70 ? 'Duże' : load <= 45 ? 'Stosunkowo lekkie' : 'Średnie'}
          </p>
          <p>{evaluateWeeklyLoad(career, 'prioritize_recovery').description}</p>
          <p>
            <strong>Kondycja:</strong> {career.player.fitness}
          </p>
          <p>
            <strong>Morale:</strong> {career.player.morale}
          </p>
          <p>
            <strong>Środki:</strong> {getAvailableFunds(career)} PLN
          </p>
        </article>
      </div>
      <h3>Co robisz poza obowiązkami klubowymi?</h3>
      <div className="choices">
        {augustActivities.map((activity) => (
          <article className="decision-card" key={activity.id}>
            <h3>{activity.name}</h3>
            <p>{activity.descriptions[plan.currentWeek % 2]}</p>
            <p>{activity.cost ? `Koszt: ${activity.cost} PLN` : 'Bez kosztu'}</p>
            <button
              disabled={!canChooseAugustActivity(career, activity.id)}
              onClick={() => onCareer(resolveAugustActivity(career, activity.id))}
            >
              {canChooseAugustActivity(career, activity.id) ? 'Wybierz' : 'Brak środków'}
            </button>
          </article>
        ))}
      </div>
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
const SeptemberGame = ({
  career,
  onCareer,
}: {
  career: CareerState;
  onCareer: (career: CareerState) => void;
}) => {
  const match = career.activeMatch;
  if (career.september?.completed)
    return (
      <section>
        <h2>Wrzesień 2026 zakończony</h2>
        <p>Cztery pierwsze kolejki są za tobą. Dalsza część sezonu nie jest jeszcze dostępna.</p>
      </section>
    );
  if (!match) {
    const i = career.september?.fixtureIndex ?? 0;
    const opponent = career.september?.opponents[i];
    return (
      <section>
        <p>
          Kolejka {i + 1} · {['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26'][i]}
        </p>
        <h2>Nadchodzi kolejny mecz</h2>
        <p>
          {opponent?.name} · {i % 2 === 0 ? 'dom' : 'wyjazd'} ·{' '}
          {opponent &&
            (opponent.strength > 59
              ? 'nieco mocniejszy rywal'
              : opponent.strength < 52
                ? 'słabszy rywal'
                : 'rywal o podobnym poziomie')}
        </p>
        <p>{opportunityDescription(career)}</p>
        <button onClick={() => onCareer(startSeptemberMatch(career))}>Poznaj decyzję sztabu</button>
      </section>
    );
  }
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
        <h2>Wynik</h2>
        <h3>
          Vistula Nova {forGoals}:{against} {match.opponent.name}
        </h3>
        <p>
          {a?.minutes ?? 0} minut · gole {a?.goals ?? 0} · asysty {a?.assists ?? 0} · xG{' '}
          {(a?.xG ?? 0).toFixed(2)} · xA {(a?.xA ?? 0).toFixed(2)}
        </p>
        <p>
          {quality}. Wynik drużyny powstał z całego przebiegu spotkania, nie tylko z twoich akcji.
        </p>
        <button onClick={() => onCareer(advanceSeptemberWeek(career))}>
          Przejdź do kolejnego tygodnia
        </button>
      </section>
    );
  }
  if (!match.currentMoment)
    return (
      <section>
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
        <button onClick={() => onCareer(advanceMatch(career))}>
          {match.plannedMinutes ? 'Rozpocznij mecz' : 'Przyjmij decyzję i przejdź dalej'}
        </button>
      </section>
    );
  return (
    <section>
      <p>{match.currentMoment.minute}. minuta · sytuacja meczowa</p>
      <h2>{match.currentMoment.description}</h2>
      <p>Widzisz ustawienie rywali i wynik, ale nie znasz ukrytej trudności rozstrzygnięcia.</p>
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
            <button onClick={() => onCareer(resolveMatchDecision(career, d.id))}>Wybierz</button>
          </article>
        ))}
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
  const [simulation, setSimulation] = useState<AcademySelectionSimulationReport | null>(null);
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

  if (view === 'career' && career)
    return (
      <main className="shell">
        <header className="hero">
          <p>{careerHeader(career)}</p>
          <h1>{translate('app.title')}</h1>
          <span>
            Rozpoczynasz przygotowania z zespołem młodzieżowym Vistula Nova. Trener zapowiedział, że
            podczas najbliższych tygodni zdecyduje, kto otrzyma szansę trenowania z seniorami.
          </span>
        </header>
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
              <code>{career.seed}</code>
              <pre>{JSON.stringify(randomPreview, null, 2)}</pre>
              <p>Brakujące klucze: {Array.from(missingLocalizationKeys).join(', ') || 'brak'}</p>
              <p>
                OK: {validation.events.length} wydarzeń, {validation.clubs.length} klub,{' '}
                {validation.people.length} postać.
              </p>
              <section>
                <h2>Symulacja naboru do seniorów</h2>
                <button onClick={() => setSimulation(simulateAcademySelection({ samples: 500 }))}>
                  Uruchom symulację
                </button>
                {simulation && <pre>{JSON.stringify(simulation, null, 2)}</pre>}
              </section>
            </div>
          ) : (
            <>
              {active === 'game' && <EventCard career={career} onCareer={updateCareer} />}{' '}
              {active === 'relationships' && (
                <div className="career-grid">
                  {career.significantPeople
                    .filter((p) => ['coach', 'academy_rival'].includes(p.role))
                    .map((p) => (
                      <RelationshipCard key={p.id} career={career} person={p} />
                    ))}
                </div>
              )}{' '}
              {active === 'history' && (
                <div>
                  <h2>Oś czasu kariery</h2>
                  {career.historyFacts
                    .filter((f) => f.narrativeImportance >= 30)
                    .map((f) => {
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
              {active === 'club' && <ClubProfile career={career} />}{' '}
              {active !== 'game' &&
                active !== 'relationships' &&
                active !== 'history' &&
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
                    />
                    <aside>
                      <p>
                        <strong>Status:</strong> {playerStatus(career)}
                      </p>
                      <p>
                        <strong>Klub:</strong> {career.currentClub.name}
                      </p>
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
                      <h3>Rozwój</h3>
                      <p>
                        Kierunek:{' '}
                        {career.developmentProgress?.[0]?.attribute ?? 'jeszcze nieustalony'}
                      </p>
                      <p>
                        Postęp:{' '}
                        {(career.developmentProgress?.[0]?.progress ?? 0) < 20
                          ? 'pierwsze oznaki poprawy'
                          : (career.developmentProgress?.[0]?.progress ?? 0) < 45
                            ? 'widoczny postęp'
                            : 'blisko przełomu'}
                      </p>
                      <p>
                        Ostatnia aktywność:{' '}
                        {career.augustPlanning?.results.at(-1)?.activityId ?? 'brak'}
                      </p>
                      <h3>Finanse</h3>
                      <p>Dostępne środki: {getAvailableFunds(career)} PLN</p>
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
