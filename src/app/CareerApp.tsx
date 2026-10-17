import { buildSeasonNarrative, buildRetirementNarrative } from '../core/narrative/careerStories';
import { limitProfessionalOffers } from '../core/professionalOfferPolicy';
import { resolveClubVisualIdentity } from '../core/clubVisualIdentity';
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { translate } from '../core/narrative/localization';
import { HistoryView } from './career/HistoryView';
import { formatCareerInteger } from '../core/numberPresentation';
import { deriveAppearance } from '../core/visualIdentity';
const RetirementPortrait = lazy(() =>
  import('./appearance/PlayerPreview').then((module) => ({ default: module.PlayerPreview })),
);
import { CompactFixtureList, type CompactFixtureItem } from '../components/CompactFixtureList';
import { aggregateDevelopment } from '../core/seasonDevelopment';
import { createCompletedSeasonSnapshot } from '../core/seasonArchive';
import { buildSeasonSummary } from '../core/matchFeedback';
import {
  createCareerState,
  generateStartingProfileVariants,
  getAllowedWeightRange,
  identityInputSchema,
  makeReadableSeed,
  profileInputSchema,
  STARTING_AGE,
  type CreatorInput,
  type IdentityInput,
  type StartingPlayerProfile,
} from '../core/playerCreator';
import {
  hydrateCareerWithWorld,
  serializeCurrentCareerSave,
  getCareerPersistenceMessage,
} from '../core/persistence';
import { careerStorage } from '../persistence/careerStorage';
import { advanceCareerFlow } from '../core/careerFlow';
import { getEventDefinition } from '../core/events/eventRegistry';
import { resolveEventChoice } from '../core/events/resolveEventChoice';
import { getAvailableDecisions } from '../core/events/decisionAvailability';
import { advanceActiveEvent, applyEventResolution } from '../core/events/applyEventResolution';
import { opportunityDescription } from '../core/matchEngine';
import { getCurrentCareerWeek, getCurrentFixture } from '../core/careerWeeks';
import { getCareerMilestones } from '../core/narrative/careerMilestones';
import { getFactPresentation } from '../core/narrative/factPresentation';
import { getSeasonHonours } from '../core/history/careerHistory';
import { advanceUntilDecision } from '../core/careerSimulation';
import { getLeagueTable, getProfessionalCompetitionName } from '../core/leagueSeason';
import { getClubLeagueTier } from '../core/professionalClubs';
import {
  getCareerClubStrength,
  getClubStrengthPresentation,
  getExpectedSquadRole,
} from '../core/clubStrength';
import { StarRating } from '../components/StarRating';
import { getClubDevelopmentEnvironment, getClubMedicalQuality } from '../core/professionalClubs';
import {} from '../core/clubStrength';
import { availabilityState } from '../core/playerAvailability';
import { deriveSeasonInjurySummary } from '../core/seasonInjuries';
import { presentInjury, presentInjurySource } from '../core/injuryPresentation';
import { getSeasonProgress } from '../core/seasonProgress';
import { completeScheduledEvent } from '../core/careerCalendar';
import {
  acceptProfessionalOffer,
  acceptSeasonEndRenegotiatedContract,
  continueOnExistingContract,
  continueWithProfessionalTrial,
  retireCareer,
  validateProfessionalOfferAcceptance,
} from '../core/careerSeasons';
import { getEffectivePositionOverall, getPlayerOverall } from '../core/playerOverall';
import { requestContractRenegotiation } from '../core/contracts';
import { contractCoversNextSeason } from '../core/contractValidity';
import {
  clubArchetypeLabel,
  getCurrentHeadCoach,
  squadRoleLabel,
} from '../core/careerPresentation';
import {
  getRegularSeasonEvent,
  resolveRegularSeasonEvent,
} from '../core/events/regularSeasonEvents';
import type { CareerState, EventDecision, WorldDatabase } from '../types/domain';
import { loadWorldDatabase } from '../core/worldDatabase';
import { ATTRIBUTE_PRESENTATION_BY_KEY } from '../core/attributePresentation';
import { buildMatchLabUrl, isDevToolsEnabled, navigateApp } from './devTools';
import { CareerView } from './career/CareerView';
import { RadarChart } from './shared/PlayerCard';
import {
  PlayerCreator,
  type CreatorFieldErrors,
  type ProfileFormState,
} from './creator/PlayerCreator';
import { StartScreen } from './StartScreen';
import { positionCode, positionLabel } from '../core/positionPresentation';
import './App.css';
import type { CareerCommit } from './careerCommit';
import { createVisualIdentity, type FootballerVisualIdentity } from '../core/visualIdentity';
const MatchGame = lazy(() =>
  import('./match/MatchGame').then((module) => ({ default: module.MatchGame })),
);

const infoKey = 'mfl.localSaveInfoDismissed';
type FieldErrors = CreatorFieldErrors;
const emptyErrors = () => ({}) as FieldErrors;
const addIssues = (issues: { path: PropertyKey[]; message: string }[]) =>
  issues.reduce<FieldErrors>((acc, issue) => {
    const key = issue.path[0] as keyof FieldErrors;
    acc[key] = [...(acc[key] ?? []), issue.message];
    return acc;
  }, {});

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

export const EventCard = ({
  career,
  onCareer,
  persistencePending = false,
}: {
  career: CareerState;
  onCareer: CareerCommit;
  persistencePending?: boolean;
}) => {
  const event = career.activeEvent;
  if (!event && career.careerCalendar)
    return (
      <CareerWeekGame career={career} onCareer={onCareer} persistencePending={persistencePending} />
    );
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
          <button
            disabled={persistencePending}
            onClick={() => void onCareer(advanceActiveEvent(career))}
          >
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
                  disabled={persistencePending}
                  onClick={() =>
                    void onCareer(
                      applyEventResolution(career, resolveEventChoice(career, decision)),
                    )
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

export const CareerWeekGame = ({
  career,
  onCareer,
  persistencePending = false,
}: {
  career: CareerState;
  onCareer: CareerCommit;
  persistencePending?: boolean;
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
      participation: career.seasonParticipation?.find((record) => record.fixtureId === item.id),
    }));
  if (!week || career.leagueSeason?.completed)
    return (
      <SeasonEndSummary
        career={career}
        onCareer={onCareer}
        persistencePending={persistencePending}
      />
    );
  if (career.activeMatch)
    return (
      <MatchGame career={career} onCareer={onCareer} persistencePending={persistencePending} />
    );
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
                disabled={persistencePending}
                onClick={() => {
                  const sourceId = career.decisionPoint!.sourceId;
                  const resolved = resolveRegularSeasonEvent(
                    career,
                    sourceId,
                    decision.id,
                    career.decisionPoint!.date,
                  );
                  const factId = resolved.historyFacts.find(
                    (fact) => !career.historyFacts.some((old) => old.id === fact.id),
                  )?.id;
                  void onCareer(completeScheduledEvent(resolved, sourceId, factId));
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
        disabled={persistencePending}
        onClick={() => {
          try {
            setProgressionError(undefined);
            void onCareer(advanceUntilDecision({ ...career, decisionPoint: undefined }));
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

export const SeasonEndSummary = ({
  career,
  onCareer,
  persistencePending = false,
}: {
  career: CareerState;
  onCareer: CareerCommit;
  persistencePending?: boolean;
}) => {
  const [decisionError, setDecisionError] = useState<string>();
  const decisionBusy = useRef(false);
  const commitDecision = async (action: () => CareerState, invalidReason?: string) => {
    if (persistencePending || decisionBusy.current) return;
    decisionBusy.current = true;
    setDecisionError(undefined);
    try {
      if (invalidReason) {
        setDecisionError(invalidReason);
        return;
      }
      const next = action();
      if (next === career) {
        setDecisionError(
          'Ta propozycja nie jest już aktualna. Wybierz dostępną ofertę lub ponów negocjacje.',
        );
        return;
      }
      if (!(await onCareer(next)))
        setDecisionError(
          'Nie udało się zapisać decyzji. Spróbuj ponownie; umowa nie została rozliczona.',
        );
    } catch (e) {
      setDecisionError(e instanceof Error ? e.message : 'Nie udało się przyjąć oferty.');
    } finally {
      decisionBusy.current = false;
    }
  };
  const table = getLeagueTable(career);
  const club = table.find((row) => row.clubId === career.leagueSeason?.controlledClubId);
  const summary = buildSeasonSummary(career, career.currentSeason);
  const availability = availabilityState(career);
  const position = club?.position ?? 12;
  const archived =
    career.completedSeasons?.find((item) => item.seasonId === career.leagueSeason?.id) ??
    createCompletedSeasonSnapshot(career);
  const injuries = deriveSeasonInjurySummary(career, career.seasonParticipation ?? []);
  const development = aggregateDevelopment(
    career.seasonStartingAttributes ?? archived.development.seasonEndAttributes,
    archived.development.seasonEndAttributes,
  );
  const renewalOffer = career.professionalOffers?.find((offer) => offer.offerType === 'renewal');
  const renegotiationProposal = career.renegotiation?.proposedContract;
  const hasContractProposal = Boolean(renewalOffer || renegotiationProposal);
  const reachedRetirementAge = career.player.age >= 40;
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
      participation: (career.seasonParticipation ?? []).find(
        (item) => item.fixtureId === fixture.id,
      )!,
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
      <div className="season-narrative">
        {buildSeasonNarrative(career, archived).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {decisionError && (
        <p role="alert" className="error-message">
          {decisionError}
        </p>
      )}
      <h3>Zawodnik</h3>
      <p>
        Występy: {summary.statistics.appearances} · starty: {summary.statistics.starts} ·{' '}
        {formatCareerInteger(summary.statistics.minutes)} min
      </p>
      <p>
        {summary.statistics.goals} G · {summary.statistics.assists} A · xG{' '}
        {career.seasonParticipation?.some((r) => Boolean(r.metricsSource))
          ? '— (brak pełnych danych)'
          : summary.statistics.xG.toFixed(2).replace('.', ',')}{' '}
        · xA{' '}
        {career.seasonParticipation?.some((r) => Boolean(r.metricsSource))
          ? '— (brak pełnych danych)'
          : summary.statistics.xA.toFixed(2).replace('.', ',')}{' '}
        · średnia {summary.statistics.averageRating?.toFixed(1).replace('.', ',') ?? '—'}
      </p>
      <p>
        Kartki: {summary.statistics.yellowCards} żółtych · {summary.statistics.redCards} czerwonych
        · opuszczone: {availability.matchesMissedThroughSuspension} przez zawieszenie,{' '}
        {availability.matchesMissedThroughInjury} przez uraz
      </p>
      <h3>Urazy</h3>
      {injuries.length ? (
        <ul className="season-injuries">
          {injuries.map(({ injury, missedFixtures }) => (
            <li key={injury.id}>
              {presentInjury(injury, 'ongoing')} ·{' '}
              {injury.startDate.slice(5).split('-').reverse().join('.')} ·{' '}
              {presentInjurySource(injury)} · {missedFixtures}{' '}
              {missedFixtures === 1 ? 'opuszczone spotkanie' : 'opuszczone spotkania'}
            </li>
          ))}
        </ul>
      ) : (
        <p>Urazy: brak</p>
      )}
      <h3>Rozwój</h3>
      <RadarChart
        attributes={archived.development.seasonEndAttributes}
        baseline={career.seasonStartingAttributes ?? archived.development.seasonEndAttributes}
        baselineLabel="początek sezonu"
        currentLabel="koniec sezonu"
        position={career.player.primaryPosition}
        heightCm={career.player.heightCm}
      />
      <p>
        <strong>
          OVR {archived.development.seasonStartOVR} → {archived.development.seasonEndOVR} (
          {archived.development.seasonEndOVR - archived.development.seasonStartOVR >= 0 ? '+' : ''}
          {archived.development.seasonEndOVR - archived.development.seasonStartOVR})
        </strong>
      </p>
      {development.length ? (
        [...development]
          .sort(
            (a, b) =>
              ATTRIBUTE_PRESENTATION_BY_KEY[a.attribute].order -
              ATTRIBUTE_PRESENTATION_BY_KEY[b.attribute].order,
          )
          .map((change) => (
            <p key={change.attribute}>
              {ATTRIBUTE_PRESENTATION_BY_KEY[change.attribute].label} {change.before} →{' '}
              {change.after} ({change.delta > 0 ? '+' : ''}
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
          {contractCoversNextSeason(career) && !hasContractProposal && !reachedRetirementAge && (
            <button
              disabled={persistencePending}
              onClick={() => void commitDecision(() => continueOnExistingContract(career))}
            >
              Kontynuuj na obecnej umowie
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
                <strong>Wynegocjowana propozycja:</strong>{' '}
                {career.renegotiation.proposedContract.monthlySalary.toLocaleString('pl-PL')} PLN /
                mies. · do {career.renegotiation.proposedContract.endDate} · rola:{' '}
                {squadRoleLabel(career.renegotiation.proposedContract.squadRole)}
              </p>
              <button
                disabled={persistencePending}
                onClick={() =>
                  void commitDecision(() => acceptSeasonEndRenegotiatedContract(career))
                }
              >
                Przyjmij
              </button>
            </>
          )}
          {renewalOffer && !validateProfessionalOfferAcceptance(career, renewalOffer.id).valid && (
            <p role="alert" className="error-message">
              {(() => {
                const v = validateProfessionalOfferAcceptance(career, renewalOffer.id);
                return v.valid ? '' : v.reason;
              })()}
            </p>
          )}
          {renewalOffer && !renegotiationProposal && (
            <div className="contract-proposal">
              <p>
                <strong>Propozycja klubu:</strong>{' '}
                {renewalOffer.contract.monthlySalary.toLocaleString('pl-PL')} PLN / mies. · do{' '}
                {renewalOffer.contract.endDate}
                {' · rola: '}
                {squadRoleLabel(renewalOffer.contract.squadRole)}
              </p>
              <button
                disabled={persistencePending || reachedRetirementAge}
                onClick={() => {
                  const validation = validateProfessionalOfferAcceptance(career, renewalOffer.id);
                  void commitDecision(
                    () => acceptProfessionalOffer(career, renewalOffer.id),
                    validation.valid ? undefined : validation.reason,
                  );
                }}
              >
                Przyjmij
              </button>
              {career.renegotiation?.season !== career.currentSeason && (
                <button
                  disabled={persistencePending || reachedRetirementAge}
                  onClick={() => void onCareer(requestContractRenegotiation(career))}
                >
                  Negocjuj
                </button>
              )}
            </div>
          )}
        </article>
      )}
      <h3>Oferty innych klubów</h3>
      {(career.professionalOffers ?? []).length ? (
        <div className="offer-grid">
          {limitProfessionalOffers(career.professionalOffers ?? [], career.currentClub.id)
            .filter((offer) => offer.offerType !== 'renewal')
            .map((offer) => {
              const acceptance = validateProfessionalOfferAcceptance(career, offer);
              const identity = resolveClubVisualIdentity(career.seed, offer.club);
              return (
                <article
                  className="mini-card offer-card"
                  key={offer.id}
                  style={
                    {
                      '--offer-primary': identity.primaryColor,
                      '--offer-secondary': identity.secondaryColor,
                    } as CSSProperties
                  }
                >
                  <h3>{offer.club.name}</h3>
                  {offer.offerType === 'renewal' && (
                    <p>
                      <strong>Obecny klub</strong>
                    </p>
                  )}
                  <p>{getProfessionalCompetitionName(getClubLeagueTier(offer.club))}</p>
                  <p>
                    Poziom {getClubLeagueTier(offer.club)} ·{' '}
                    <StarRating strength={getCareerClubStrength(career, offer.club)} /> · Siła
                    klubu:{' '}
                    {
                      getClubStrengthPresentation(getCareerClubStrength(career, offer.club))
                        .displayedInteger
                    }
                    /100
                  </p>
                  <p>
                    Trening: {qualityLabel(getClubDevelopmentEnvironment(offer.club))} · Medycyna:{' '}
                    {qualityLabel(getClubMedicalQuality(offer.club))}
                  </p>

                  <p>
                    <strong>Rola:</strong> {squadRoleLabel(offer.contract.squadRole)}
                  </p>
                  <p>
                    <strong>Planowana pozycja:</strong> {positionLabel(offer.plannedPosition)}
                  </p>
                  {offer.tacticalPositionWarning && (
                    <p className="position-warning" role="status">
                      {offer.tacticalPositionWarning}
                    </p>
                  )}
                  {!!offer.alternativePositions?.length && (
                    <p>
                      <strong>Alternatywnie:</strong>{' '}
                      {offer.alternativePositions.map(positionCode).join(', ')}
                    </p>
                  )}
                  <p>
                    <strong>Pensja:</strong> {offer.contract.monthlySalary.toLocaleString('pl-PL')}{' '}
                    PLN / mies.
                  </p>
                  <p>
                    <strong>Kontrakt:</strong> do {offer.contract.endDate}
                  </p>
                  <p>
                    Ty: {getEffectivePositionOverall(career.player, offer.plannedPosition)} OVR ·
                    Prognoza:{' '}
                    {offer.projectedStanding === 'starting_xi'
                      ? 'walka o pierwszy skład'
                      : offer.projectedStanding === 'bench'
                        ? 'ławka'
                        : 'rezerwy'}
                  </p>
                  <details className="offer-secondary">
                    <summary>Ocena skautów i konkurencja</summary>
                    <p>
                      <strong>Transfer:</strong>{' '}
                      {offer.transferKind === 'free'
                        ? 'Wolny transfer'
                        : `Szacowane odstępne: ${(offer.estimatedTransferFee ?? 0).toLocaleString('pl-PL')} PLN`}
                    </p>
                    {offer.interestReasons.map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                    <p>
                      <strong>Konkurencja na {positionCode(offer.plannedPosition)}:</strong>
                    </p>
                    {!!offer.destinationCompetition?.length && (
                      <ul className="offer-competition">
                        {offer.destinationCompetition.map((competitor) => (
                          <li key={competitor.competitorId}>
                            {competitor.competitorName} — {competitor.effectiveOverall} OVR —{' '}
                            {competitor.expectedStatus === 'starting_xi'
                              ? 'podstawowy skład'
                              : competitor.expectedStatus === 'bench'
                                ? 'ławka'
                                : 'rezerwy'}
                          </li>
                        ))}
                      </ul>
                    )}

                    <p>
                      <strong>Filozofia:</strong> {clubArchetypeLabel(offer.club.archetype)}
                    </p>
                  </details>
                  <p>
                    <strong>Szansa:</strong> {offer.opportunity}
                  </p>
                  <p>
                    <strong>Ryzyko:</strong> {offer.risk}
                  </p>
                  {!acceptance.valid && <p className="error-message">{acceptance.reason}</p>}
                  <button
                    disabled={persistencePending || reachedRetirementAge || !acceptance.valid}
                    title={acceptance.valid ? undefined : acceptance.reason}
                    onClick={() =>
                      void commitDecision(
                        () => acceptProfessionalOffer(career, offer.id),
                        acceptance.valid ? undefined : acceptance.reason,
                      )
                    }
                  >
                    Przyjmij
                  </button>
                </article>
              );
            })}
        </div>
      ) : career.careerSeasonNumber === 1 ? (
        <article className="mini-card">
          <h4>Ścieżka próbna</h4>
          <p>Vistula Nova zapewni ci testy w małym klubie zawodowym. Kariera trwa dalej.</p>
          <button
            disabled={persistencePending || reachedRetirementAge}
            onClick={() => void onCareer(continueWithProfessionalTrial(career))}
          >
            Przejdź testy
          </button>
        </article>
      ) : (
        <p>
          {career.player.age >= 40
            ? 'Osiągnąłeś limit wieku gry, dlatego nie pojawią się już nowe oferty. Pozostaje dokończyć obecną umowę lub zakończyć karierę.'
            : 'Brak nowych ofert. Możesz kontynuować w obecnym klubie lub szukać klubu jako wolny zawodnik.'}
        </p>
      )}
      {career.careerSeasonNumber >= 2 &&
        !career.professionalOffers?.length &&
        contractCoversNextSeason(career) &&
        !reachedRetirementAge && (
          <button
            disabled={persistencePending}
            onClick={() => void commitDecision(() => continueOnExistingContract(career))}
          >
            Kontynuuj na obecnej umowie
          </button>
        )}
      {reachedRetirementAge && (
        <p>
          Osiągnąłeś limit wieku rozgrywania kolejnego sezonu. Ten sezon jest ostatnim w karierze
          zawodniczej.
        </p>
      )}
      {career.player.age >= 33 && (
        <button disabled={persistencePending} onClick={() => void onCareer(retireCareer(career))}>
          Zakończ karierę
        </button>
      )}
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
  const completed = career.completedSeasons ?? [];
  const current =
    career.leagueSeason && !completed.some((season) => season.seasonId === career.leagueSeason!.id)
      ? createCompletedSeasonSnapshot(career)
      : undefined;
  const seasons = current && current.player.appearances > 0 ? [...completed, current] : completed;
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
  const orderedSeasons = [...seasons].sort((a, b) => a.seasonNumber - b.seasonNumber);
  const startFact = [...career.historyFacts]
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((fact) => fact.factType === 'career_started');
  const firstClubId = startFact?.clubs[0];
  const firstClub =
    (typeof startFact?.data.club === 'string' ? startFact.data.club : undefined) ??
    career.clubWorld?.find((club) => club.id === firstClubId)?.name ??
    orderedSeasons[0]?.clubName ??
    (firstClubId === career.currentClub.id ? career.currentClub.name : 'Brak danych');
  const firstDate = [...career.historyFacts].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
  return (
    <section className="career-view retirement-summary">
      <header className="retirement-identity">
        <Suspense fallback={<span role="status">Wczytywanie portretu…</span>}>
          <RetirementPortrait
            appearance={deriveAppearance(
              career.player,
              career.currentDate ?? `${career.currentSeason}-06-30`,
            )}
            label={`Portret: ${career.player.firstName} ${career.player.lastName}`}
          />
        </Suspense>
        <div>
          <p>KARIERA ZAKOŃCZONA</p>
          <h1>Koniec kariery</h1>
          <h2>
            {career.player.firstName} {career.player.lastName}
          </h2>
          <p>Wiek zakończenia kariery: {career.retirementAge ?? career.player.age}</p>
          <p>
            Sezony: {seasons.length} · Pierwszy klub: {firstClub} · Ostatni klub:{' '}
            {career.currentClub.name}
          </p>
          <p>
            {firstDate ?? '—'} — {career.retirementDate ?? career.currentDate ?? '—'}
          </p>
        </div>
      </header>
      <p className="retirement-story">{buildRetirementNarrative(career)}</p>
      <h3>Bilans kariery</h3>
      <p>
        Występy: {formatCareerInteger(totals.appearances)} · starty:{' '}
        {formatCareerInteger(totals.starts)} · minuty: {formatCareerInteger(totals.minutes)}
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
            {orderedSeasons.map((season) => (
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
                <td>{formatCareerInteger(season.player.minutes)}</td>
                <td>
                  {season.player.goals}G {season.player.assists}A
                </td>
                <td>
                  {season.player.ratedAppearances === 0
                    ? '—'
                    : season.player.averageRating.toFixed(1)}
                </td>
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

interface CareerErrorBoundaryProps {
  career: CareerState;
  backend: string;
  children: ReactNode;
}

class CareerErrorBoundary extends Component<CareerErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('career render failed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { career, backend } = this.props;
    return (
      <main className="shell">
        <section className="panel" role="alert">
          <h1>Nie udało się wyświetlić bieżącego stanu kariery.</h1>
          {import.meta.env.DEV && (
            <pre className="career-diagnostics">
              {JSON.stringify(
                {
                  currentSeason: career.currentSeason,
                  careerSeasonNumber: career.careerSeasonNumber,
                  currentDate: career.currentDate,
                  leagueCompleted: career.leagueSeason?.completed ?? false,
                  decisionPoint: career.decisionPoint
                    ? `${career.decisionPoint.type}:${career.decisionPoint.sourceId}`
                    : null,
                  activeEvent: career.activeEvent?.definitionId ?? null,
                  activeMatch: career.activeMatch?.id ?? null,
                  seasonOutcome: Boolean(career.seasonOutcome),
                  professionalOffers: career.professionalOffers?.length ?? 0,
                  persistenceBackend: backend,
                },
                null,
                2,
              )}
            </pre>
          )}
        </section>
      </main>
    );
  }
}

export const CareerApp = ({ initialAction = 'new' }: { initialAction?: 'new' | 'resume' }) => {
  const [view, setView] = useState<'start' | 'creator' | 'career'>(
    initialAction === 'new' ? 'creator' : 'start',
  );
  const [career, setCareer] = useState<CareerState | null>(null);
  const [canContinue, setCanContinue] = useState(false);
  const [resumeStatus, setResumeStatus] = useState<'startup' | 'idle' | 'loading'>('startup');
  const [careerError, setCareerError] = useState<string>();
  const [step, setStep] = useState(0);
  const [active, setActive] = useState<'game' | 'history'>('game');
  const [identity, setIdentity] = useState<IdentityInput>({
    firstName: '',
    lastName: '',
    nationality: 'PL',
    age: STARTING_AGE,
    birthMonth: 7,
    birthDay: 1,
    dominantFoot: 'right',
    difficulty: 'normal',
    customSeed: '',
  });
  const [profileInput, setProfileInput] = useState<ProfileFormState>({
    position: 'left_winger',
    heightCm: '174',
    weightKg: '68',
  });
  const [seed, setSeed] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyErrors);
  const [showInfo, setShowInfo] = useState(() => {
    try {
      return localStorage.getItem(infoKey) !== '1';
    } catch {
      return true;
    }
  });
  const [variants, setVariants] = useState<StartingPlayerProfile[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [appearance, setAppearance] = useState<FootballerVisualIdentity>();
  const [worldDatabase, setWorldDatabase] = useState<WorldDatabase>();
  const [worldError, setWorldError] = useState<string>();
  const persistenceInProgress = useRef(false);
  const [persistencePending, setPersistencePending] = useState(false);
  useEffect(() => {
    let active = true;
    void careerStorage.load().then((result) => {
      if (!active) return;
      setCanContinue(result.ok);
      if (!result.ok && !['missing', 'indexeddb_unavailable'].includes(result.reason))
        setCareerError('Zapis kariery jest uszkodzony lub nie można go odczytać.');
      setResumeStatus('idle');
      if (initialAction === 'resume' && result.ok) {
        setResumeStatus('loading');
        void loadWorldDatabase()
          .then(async (world) => {
            const advanced = advanceCareerFlow(hydrateCareerWithWorld(result.save.career, world));
            await careerStorage.save(serializeCurrentCareerSave(advanced));
            if (active) {
              setCareer(advanced);
              setView('career');
              setResumeStatus('idle');
            }
          })
          .catch(() => {
            if (active) {
              setCareerError('Nie udało się wczytać kariery. Spróbuj ponownie.');
              setResumeStatus('idle');
            }
          });
      }
    });
    return () => {
      active = false;
    };
  }, [initialAction]);
  useEffect(() => {
    if (view !== 'creator' || worldDatabase || worldError) return;
    void loadWorldDatabase()
      .then(setWorldDatabase)
      .catch(() => setWorldError('Nie udało się przygotować świata. Spróbuj ponownie.'));
  }, [view, worldDatabase, worldError]);
  const selectedProfile = variants[selectedVariant] ?? null;
  const generated =
    selectedProfile && appearance
      ? { ...selectedProfile, player: { ...selectedProfile.player, visualIdentity: appearance } }
      : selectedProfile;
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
  const updateCareer: CareerCommit = useCallback(async (next: CareerState) => {
    if (persistenceInProgress.current) return false;
    persistenceInProgress.current = true;
    setPersistencePending(true);
    try {
      const advanced = advanceCareerFlow(next);
      await careerStorage.save(serializeCurrentCareerSave(advanced));
      setCareer(advanced);
      setCanContinue(true);
      setCareerError(undefined);
      return true;
    } catch (error) {
      setCareerError(
        `${getCareerPersistenceMessage(error)}${import.meta.env.DEV && error instanceof Error ? ` ${error.message}` : ''}`,
      );
      return false;
    } finally {
      persistenceInProgress.current = false;
      setPersistencePending(false);
    }
  }, []);
  const startNew = () => {
    if (career && !confirm(translate('start.confirmOverwrite'))) return;
    setView('creator');
    setStep(0);
    setSeed('');
    setAppearance(undefined);
    clearVariants();
  };
  const resetCareer = async () => {
    try {
      await careerStorage.delete();
    } catch (error) {
      setCareerError(getCareerPersistenceMessage(error));
      return;
    }
    setCareer(null);
    setCanContinue(false);
    setView('creator');
    setStep(0);
    setSeed('');
    setAppearance(undefined);
    clearVariants();
  };
  const continueCareer = async () => {
    if (resumeStatus !== 'idle') return;
    setResumeStatus('loading');
    const loaded = await careerStorage.load();
    if (!loaded.ok) {
      setCareerError('Nie udało się odczytać zapisanej kariery. Możesz rozpocząć nową grę.');
      setCanContinue(false);
      setResumeStatus('idle');
      return;
    }
    setCareerError(undefined);
    try {
      const world = await loadWorldDatabase();
      const hydrated = hydrateCareerWithWorld(loaded.save.career, world);
      const advanced = advanceCareerFlow(hydrated);
      await careerStorage.save(serializeCurrentCareerSave(advanced));
      setCareer(advanced);
      setView('career');
    } catch (error) {
      setCareerError(
        `Nie udało się wczytać świata kariery. Spróbuj ponownie.${import.meta.env.DEV && error instanceof Error ? ` ${error.message}` : ''}`,
      );
    } finally {
      setResumeStatus('idle');
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
    setSeed(result.data.customSeed?.trim() || seed || makeReadableSeed());
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
    const nextVariants = generateStartingProfileVariants(input, seed);
    setVariants(nextVariants);
    const initial = createVisualIdentity(nextVariants[0]!.player.id);
    setAppearance((previous) => (previous?.faceSeed === initial.faceSeed ? previous : initial));
    setSelectedVariant(0);
    setStep(2);
  };
  const finish = async () => {
    if (!generated || !worldDatabase) return;
    if (await updateCareer(createCareerState(generated, seed, worldDatabase))) setView('career');
  };

  if (view === 'career' && career && career.careerStatus === 'retired')
    return (
      <main className="retirement-shell">
        {active === 'history' ? (
          <section className="career-view retirement-summary retirement-history">
            <button onClick={() => setActive('game')}>Wróć do podsumowania</button>
            <HistoryView career={career} />
          </section>
        ) : (
          <RetiredCareerSummary
            career={career}
            onHistory={() => setActive('history')}
            onNewCareer={resetCareer}
          />
        )}
      </main>
    );

  if (view === 'career' && career) {
    if (career.activeMatch)
      return (
        <CareerErrorBoundary career={career} backend={careerStorage.mode ?? 'uninitialized'}>
          <div className="career-match-host">
            {careerError && (
              <p className="career-error" role="alert">
                {careerError}
              </p>
            )}
            <MatchGame
              career={career}
              onCareer={updateCareer}
              persistencePending={persistencePending}
            />
          </div>
        </CareerErrorBoundary>
      );
    const needsDecision = Boolean(
      career.activeEvent ||
        career.decisionPoint?.type === 'off_field_event' ||
        career.leagueSeason?.completed ||
        career.seasonOutcome ||
        career.professionalOffers,
    );
    return (
      <CareerErrorBoundary career={career} backend={careerStorage.mode ?? 'uninitialized'}>
        {careerError && (
          <p className="career-error" role="alert">
            {careerError}
          </p>
        )}
        <CareerView
          career={career}
          onCareer={updateCareer}
          persistencePending={persistencePending}
          decisionPanel={
            needsDecision ? (
              <EventCard
                career={career}
                onCareer={updateCareer}
                persistencePending={persistencePending}
              />
            ) : undefined
          }
        />
      </CareerErrorBoundary>
    );
  }

  if (view === 'creator')
    return (
      <>
        {careerError && (
          <p className="career-error" role="alert">
            {careerError}
          </p>
        )}
        <PlayerCreator
          step={step}
          identity={identity}
          profile={profileInput}
          errors={fieldErrors}
          generated={generated}
          variants={variants}
          selectedVariant={selectedVariant}
          seed={seed}
          weightRange={weightRange}
          setStep={setStep}
          setIdentity={setIdentity}
          setProfile={setProfile}
          selectVariant={setSelectedVariant}
          nextIdentity={nextIdentity}
          nextProfile={nextProfile}
          finish={finish}
          appearance={appearance}
          setAppearance={setAppearance}
          resetAppearance={() =>
            generated && setAppearance(createVisualIdentity(generated.player.id))
          }
          worldStatus={worldError ? 'error' : worldDatabase ? 'ready' : 'loading'}
          retryWorld={() => setWorldError(undefined)}
        />
      </>
    );
  return (
    <StartScreen
      canContinue={canContinue && resumeStatus === 'idle'}
      status={
        resumeStatus === 'startup'
          ? 'Sprawdzanie zapisu kariery…'
          : resumeStatus === 'loading'
            ? 'Wczytywanie świata kariery…'
            : careerError
      }
      notice={showInfo ? translate('start.localSaveNotice') : undefined}
      onDismissNotice={() => {
        try {
          localStorage.setItem(infoKey, '1');
        } catch {
          /* CareerStorage reports actual persistence failures. This notice is optional. */
        }
        setShowInfo(false);
      }}
      onNewCareer={startNew}
      onContinue={continueCareer}
      onOpenMatchLab={() => {
        navigateApp(buildMatchLabUrl(globalThis.location.href));
      }}
      developerAction={
        isDevToolsEnabled() ? (
          <button onClick={() => setView('career')}>Narzędzia developerskie</button>
        ) : undefined
      }
    />
  );
};

export const CareerScreen = (props: { initialAction?: 'new' | 'resume' }) => (
  <Suspense fallback={<p role="status">Wczytywanie kariery…</p>}>
    <CareerApp {...props} />
  </Suspense>
);
