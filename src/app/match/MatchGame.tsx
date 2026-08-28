import { MatchMomentumChart } from '../../components/MatchMomentumChart';
import { advanceCareerWeek } from '../../core/careerWeeks';
import { describePerformance } from '../../core/matchFeedback';
import { advanceMatch, MATCH_MOMENT_LIBRARY, resolveMatchDecision } from '../../core/matchEngine';
import { matchStateSummary } from '../../core/progressionDiagnostics';
import type { CareerState } from '../../types/domain';
import { recordMatchTransition } from '../devTools';

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
export const MatchHud = ({ career }: { career: CareerState }) => {
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
export const MatchGame = ({
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
