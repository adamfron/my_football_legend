import { lazy, Suspense, useRef, useState } from 'react';
import type { CareerState } from '../../types/domain';
import type { CareerCommit } from '../careerCommit';
import { getCurrentFixture } from '../../core/careerWeeks';
import { projectFixtureParticipation } from '../../core/matchEngine';
import { simulateSelectedCareerFixture } from '../../core/careerSimulation';

const CareerCanonicalMatch = lazy(() =>
  import('./CareerCanonicalMatch').then((module) => ({ default: module.CareerCanonicalMatch })),
);

/** No physical state or Three/runtime import exists until the explicit per-fixture choice. */
export const MatchGame = ({
  career,
  onCareer,
  persistencePending = false,
}: {
  career: CareerState;
  onCareer: CareerCommit;
  persistencePending?: boolean;
}) => {
  const [play, setPlay] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const committing = useRef(false);
  const pending = useRef<CareerState | undefined>(undefined);
  const [hasPending, setHasPending] = useState(false);
  const persisted = useRef(false);
  const [saved, setSaved] = useState(false);
  if (play)
    return (
      <Suspense fallback={<p role="status">Przygotowanie meczu 3D…</p>}>
        <CareerCanonicalMatch
          career={career}
          onCareer={onCareer}
          persistencePending={persistencePending}
        />
      </Suspense>
    );
  const fixture = getCurrentFixture(career);
  const leave = () => {
    if (!committing.current && !pending.current)
      void onCareer({ ...career, activeMatch: undefined, decisionPoint: undefined });
  };
  if (career.activeMatch?.completed)
    return (
      <section>
        <h2>Zapisany wynik wcześniejszego meczu</h2>
        <p>
          {career.activeMatch.homeGoals}:{career.activeMatch.awayGoals} ·{' '}
          {career.activeMatch.opponent.name}
        </p>
        <button disabled={persistencePending} onClick={leave}>
          Wróć do kariery
        </button>
      </section>
    );
  if (!fixture)
    return (
      <section>
        <p role="alert">Brak aktualnego meczu.</p>
        <button onClick={leave}>Wróć do kariery</button>
      </section>
    );
  const home = fixture.venue === 'home' ? career.currentClub.name : fixture.opponent.name;
  const away = fixture.venue === 'away' ? career.currentClub.name : fixture.opponent.name;
  const projection = projectFixtureParticipation(career, fixture);
  const simulate = async () => {
    if (committing.current || persisted.current || persistencePending) return;
    committing.current = true;
    setBusy(true);
    setError(undefined);
    try {
      pending.current ??= simulateSelectedCareerFixture(career);
      setHasPending(true);
      if (!(await onCareer(pending.current)))
        setError('Wynik nie został zapisany. Ponów zapis tego samego wyniku.');
      else {
        persisted.current = true;
        setSaved(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zasymulować meczu.');
    } finally {
      committing.current = false;
      setBusy(false);
    }
  };
  const disabled = busy || persistencePending || saved;
  return (
    <section className="career-prematch">
      <p>
        {career.leagueSeason?.competition.name} · {fixture.date}
      </p>
      <h2>
        {home} — {away}
      </h2>
      <p>
        Przewidywany udział:{' '}
        {projection.started
          ? 'pierwszy skład'
          : projection.plannedMinutes > 0
            ? 'rezerwa · możliwe wejście'
            : 'ławka lub poza kadrą'}
        . Ostateczny udział określi wybrany tryb meczu.
      </p>
      {error && <p role="alert">{error}</p>}
      <button disabled={disabled || hasPending} onClick={() => setPlay(true)}>
        Rozegraj mecz 3D
      </button>
      <button disabled={disabled} onClick={() => void simulate()}>
        {busy ? 'Zapisywanie wyniku…' : hasPending ? 'Ponów zapis wyniku' : 'Symuluj mecz'}
      </button>
      <button disabled={disabled || hasPending} onClick={leave}>
        Wróć do kariery
      </button>
    </section>
  );
};
