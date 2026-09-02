import { useEffect, useState } from 'react';
import { translate } from '../core/narrative/localization';
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
  deleteCareer,
  hasValidCareer,
  hydrateCareerWithWorld,
  loadCareer,
  saveCareer,
} from '../core/persistence';
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
} from '../core/careerSeasons';
import { getPlayerOverall } from '../core/playerOverall';
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
import { isDevToolsEnabled } from './devTools';
import { CareerView } from './career/CareerView';
import { RadarChart } from './shared/PlayerCard';
import {
  PlayerCreator,
  type CreatorFieldErrors,
  type ProfileFormState,
} from './creator/PlayerCreator';
import { MatchGame } from './match/MatchGame';
import { StartScreen } from './StartScreen';
import { positionCode, positionLabel } from '../core/positionPresentation';
import './App.css';

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
                    career.decisionPoint!.date,
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

export const SeasonEndSummary = ({
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
  const injuries = deriveSeasonInjurySummary(career, archived.fixtures);
  const development = aggregateDevelopment(
    archived.development.seasonStartAttributes,
    archived.development.seasonEndAttributes,
  );
  const renewalOffer = career.professionalOffers?.find((offer) => offer.offerType === 'renewal');
  const renegotiationProposal = career.renegotiation?.proposedContract;
  const hasContractProposal = Boolean(renewalOffer || renegotiationProposal);
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
        baseline={archived.development.seasonStartAttributes}
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
          {contractCoversNextSeason(career) && !hasContractProposal && (
            <button onClick={() => onCareer(continueOnExistingContract(career))}>
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
              <button onClick={() => onCareer(acceptSeasonEndRenegotiatedContract(career))}>
                Przyjmij
              </button>
            </>
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
              <button onClick={() => onCareer(acceptProfessionalOffer(career, renewalOffer.id))}>
                Przyjmij
              </button>
              {career.renegotiation?.season !== career.currentSeason && (
                <button onClick={() => onCareer(requestContractRenegotiation(career))}>
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
                  <strong>Planowana pozycja:</strong> {positionLabel(offer.plannedPosition)}
                </p>
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
                  Przyjmij
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
      {career.careerSeasonNumber >= 2 &&
        !career.professionalOffers?.length &&
        contractCoversNextSeason(career) && (
          <button onClick={() => onCareer(continueOnExistingContract(career))}>
            Kontynuuj na obecnej umowie
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
  const [career, setCareer] = useState<CareerState | null>(null);
  const [canContinue, setCanContinue] = useState(() => hasValidCareer());
  const [resumeStatus, setResumeStatus] = useState<'idle' | 'loading'>('idle');
  const [careerError, setCareerError] = useState<string>();
  const [step, setStep] = useState(0);
  const [active, setActive] = useState<'game' | 'history'>('game');
  const [identity, setIdentity] = useState<IdentityInput>({
    firstName: '',
    lastName: '',
    nationality: 'PL',
    age: STARTING_AGE,
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
  const [showInfo, setShowInfo] = useState(() => localStorage.getItem(infoKey) !== '1');
  const [variants, setVariants] = useState<StartingPlayerProfile[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [worldDatabase, setWorldDatabase] = useState<WorldDatabase>();
  const [worldError, setWorldError] = useState<string>();
  useEffect(() => {
    if (view !== 'creator' || worldDatabase || worldError) return;
    void loadWorldDatabase()
      .then(setWorldDatabase)
      .catch(() => setWorldError('Nie udało się przygotować świata. Spróbuj ponownie.'));
  }, [view, worldDatabase, worldError]);
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
    try {
      saveCareer(advanced);
      setCareer(advanced);
      setCanContinue(true);
      setCareerError(undefined);
    } catch (error) {
      setCareerError(
        `Nie udało się zapisać kariery.${import.meta.env.DEV && error instanceof Error ? ` ${error.message}` : ''}`,
      );
    }
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
    setCanContinue(false);
    setView('creator');
    setStep(0);
    setSeed('');
    clearVariants();
  };
  const continueCareer = async () => {
    const loaded = loadCareer();
    if (!loaded.ok) {
      setCareerError('Nie udało się odczytać zapisanej kariery. Możesz rozpocząć nową grę.');
      setCanContinue(false);
      return;
    }
    setResumeStatus('loading');
    setCareerError(undefined);
    try {
      const world = await loadWorldDatabase();
      const hydrated = hydrateCareerWithWorld(loaded.save.career, world);
      const advanced = advanceCareerFlow(hydrated);
      saveCareer(advanced);
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
    setVariants(generateStartingProfileVariants(input, seed));
    setSelectedVariant(0);
    setStep(2);
  };
  const finish = () => {
    if (!generated || !worldDatabase) return;
    updateCareer(createCareerState(generated, seed, worldDatabase));
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
          {careerError && (
            <p className="career-error" role="alert">
              {careerError}
            </p>
          )}
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
      <>
        {careerError && (
          <p className="career-error" role="alert">
            {careerError}
          </p>
        )}
        <CareerView
          career={career}
          onCareer={updateCareer}
          decisionPanel={
            needsDecision ? <EventCard career={career} onCareer={updateCareer} /> : undefined
          }
        />
      </>
    );
  }

  if (view === 'creator')
    return (
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
        worldStatus={worldError ? 'error' : worldDatabase ? 'ready' : 'loading'}
        retryWorld={() => setWorldError(undefined)}
      />
    );
  return (
    <StartScreen
      canContinue={canContinue && resumeStatus !== 'loading'}
      status={resumeStatus === 'loading' ? 'Wczytywanie świata kariery…' : careerError}
      notice={showInfo ? translate('start.localSaveNotice') : undefined}
      onDismissNotice={() => {
        localStorage.setItem(infoKey, '1');
        setShowInfo(false);
      }}
      onNewCareer={startNew}
      onContinue={continueCareer}
      developerAction={
        isDevToolsEnabled() ? (
          <button onClick={() => setView('career')}>Narzędzia developerskie</button>
        ) : undefined
      }
    />
  );
};
