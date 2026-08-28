import { useState } from 'react';
import { translate } from '../core/narrative/localization';
import { CompactFixtureList, type CompactFixtureItem } from '../components/CompactFixtureList';
import { aggregateDevelopment } from '../core/seasonDevelopment';
import { createCompletedSeasonSnapshot } from '../core/seasonArchive';
import { buildSeasonSummary } from '../core/matchFeedback';
import {
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
import { opportunityDescription } from '../core/matchEngine';
import { getCurrentCareerWeek, getCurrentFixture } from '../core/careerWeeks';
import { getCareerMilestones } from '../core/narrative/careerMilestones';
import { getFactPresentation } from '../core/narrative/factPresentation';
import { getSeasonHonours } from '../core/history/careerHistory';
import { advanceUntilDecision } from '../core/careerSimulation';
import { getLeagueTable, getProfessionalCompetitionName } from '../core/leagueSeason';
import { getClubLeagueTier } from '../core/professionalClubs';
import { getClubStrength, getExpectedSquadRole } from '../core/clubStrength';
import { StarRating } from '../components/StarRating';
import { getClubDevelopmentEnvironment, getClubMedicalQuality } from '../core/professionalClubs';
import {} from '../core/clubStrength';
import { availabilityState } from '../core/playerAvailability';
import { getSeasonProgress } from '../core/seasonProgress';
import { completeScheduledEvent } from '../core/careerCalendar';
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
  getCurrentHeadCoach,
  squadRoleLabel,
} from '../core/careerPresentation';
import {
  getRegularSeasonEvent,
  resolveRegularSeasonEvent,
} from '../core/events/regularSeasonEvents';
import type { CareerState, EventDecision, PlayerAttributes } from '../types/domain';
import { isDevToolsEnabled } from './devTools';
import { CareerView } from './career/CareerView';
import { PlayerCard, RadarChart } from './shared/PlayerCard';
import { MatchGame } from './match/MatchGame';
import './App.css';

const infoKey = 'mfl.localSaveInfoDismissed';
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

const emptyErrors = () => ({}) as FieldErrors;
const addIssues = (issues: { path: PropertyKey[]; message: string }[]) =>
  issues.reduce<FieldErrors>((acc, issue) => {
    const key = issue.path[0] as keyof FieldErrors;
    acc[key] = [...(acc[key] ?? []), issue.message];
    return acc;
  }, {});

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

export const CareerWeekGame = ({
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
      participation: career.seasonParticipation?.find((record) => record.fixtureId === item.id),
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
                  const resolved = resolveRegularSeasonEvent(
                    career,
                    sourceId,
                    decision.id,
                    week.startDate,
                  );
                  const factId = resolved.historyFacts.find(
                    (fact) => !career.historyFacts.some((old) => old.id === fact.id),
                  )?.id;
                  onCareer(completeScheduledEvent(resolved, sourceId, factId));
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
  const [view, setView] = useState<'start' | 'creator' | 'career'>(() =>
    hasValidCareer() ? 'start' : 'start',
  );
  const [career, setCareer] = useState<CareerState | null>(() => {
    const loaded = loadCareer();
    return loaded.ok ? advanceCareerFlow(loaded.save.career) : null;
  });
  const [step, setStep] = useState(0);
  const [active, setActive] = useState<'game' | 'history'>('game');
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

  if (view === 'career' && career) {
    if (career.activeMatch)
      return (
        <main className="shell match-shell">
          <MatchGame career={career} onCareer={updateCareer} />
        </main>
      );
    const needsDecision = Boolean(
      career.activeEvent ||
        career.decisionPoint?.type === 'off_field_event' ||
        career.leagueSeason?.completed ||
        career.seasonOutcome ||
        career.professionalOffers,
    );
    return (
      <CareerView
        career={career}
        onCareer={updateCareer}
        decisionPanel={needsDecision ? <EventCard career={career} onCareer={updateCareer} /> : undefined}
      />
    );
  }

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
        {isDevToolsEnabled() && (
          <button className="subtle" onClick={() => setView('career')}>
            Narzędzia developerskie
          </button>
        )}
      </section>
    </main>
  );
};
