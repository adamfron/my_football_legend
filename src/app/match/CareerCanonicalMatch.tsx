import { useEffect, useRef, useState } from 'react';
import type { CareerState } from '../../types/domain';
import type { CareerCommit } from '../careerCommit';
import { loadWorldDatabase } from '../../core/worldDatabase';
import {
  applyCareerMatchResult,
  CareerMatchEvidence,
  createCareerMatchInput,
  finishCareerMatch,
  startCareerMatch,
  type CareerMatchInput,
  type CareerMatchResult,
} from '../../core/careerMatchContract';
import type { TacticalMatchState } from '../../core/matchSimulation/matchState';
import type { SingleMatchSession } from '../../core/singleMatch';
import { continueCareerMatch } from '../../core/careerMatchContinuation';
import { RunningLabGuard } from './TacticalMatchSandbox';

/** The Lab and career share one runtime; React owns only the save/return transaction. */
export const CareerCanonicalMatch = ({
  career,
  onCareer,
  persistencePending = false,
}: {
  career: CareerState;
  onCareer: CareerCommit;
  persistencePending?: boolean;
}) => {
  const [prepared, setPrepared] = useState<{
    input: CareerMatchInput;
    initial: TacticalMatchState;
    session: SingleMatchSession;
    epoch: number;
  }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const committing = useRef(false);
  const persisted = useRef(false);
  const [saved, setSaved] = useState(false);
  const pendingResult = useRef<CareerMatchResult | undefined>(undefined);
  const [continuation, setContinuation] = useState<CareerMatchResult>();
  const evidence = useRef(new CareerMatchEvidence());
  const generation = useRef(0);
  useEffect(() => {
    if (career.activeMatch?.completed) return;
    const epochRef = generation;
    const epoch = ++epochRef.current;
    void loadWorldDatabase()
      .then((world) => {
        const input = createCareerMatchInput(career, world);
        const initial = startCareerMatch(input);
        const session = {
          ...input.session,
          ...(input.presentation.visualContext
            ? { presentation: input.presentation.visualContext }
            : {}),
        };
        if (generation.current === epoch) setPrepared({ input, initial, session, epoch });
      })
      .catch((reason: unknown) => {
        if (generation.current === epoch)
          setError(reason instanceof Error ? reason.message : 'Nie udało się przygotować meczu.');
      });
    return () => {
      epochRef.current++;
    };
  }, [career]);
  const leave = () => {
    if (committing.current || pendingResult.current) return;
    void onCareer({ ...career, activeMatch: undefined, decisionPoint: undefined });
  };
  const saveResult = async (result: CareerMatchResult) => {
    if (
      !prepared ||
      prepared.epoch !== generation.current ||
      committing.current ||
      persisted.current ||
      persistencePending
    )
      return;
    committing.current = true;
    setBusy(true);
    const epoch = prepared.epoch;
    try {
      const world = await loadWorldDatabase();
      if (generation.current !== epoch) return;
      const next = applyCareerMatchResult(career, world, prepared.input, result);
      // onCareer exposes the next state only after the queued storage transaction succeeds.
      if (!(await onCareer(next)))
        setError('Wynik nie został zapisany. Pozostał tu do ponowienia zapisu.');
      else {
        persisted.current = true;
        setSaved(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać wyniku.');
    } finally {
      committing.current = false;
      if (generation.current === epoch) setBusy(false);
    }
  };
  const complete = (state: TacticalMatchState) => {
    if (
      !prepared ||
      prepared.epoch !== generation.current ||
      committing.current ||
      persisted.current ||
      persistencePending
    )
      return;
    try {
      pendingResult.current ??= finishCareerMatch(prepared.input, state, evidence.current);
      void saveResult(pendingResult.current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zakończyć meczu.');
    }
  };
  const simulateRemainder = (state: TacticalMatchState, unselectedDecision: boolean) => {
    if (
      !prepared ||
      prepared.epoch !== generation.current ||
      committing.current ||
      persisted.current ||
      persistencePending ||
      pendingResult.current
    )
      return false;
    try {
      const result = continueCareerMatch(
        prepared.input,
        state,
        evidence.current,
        unselectedDecision,
      );
      pendingResult.current = result;
      setContinuation(result);
      void saveResult(result);
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Nie udało się przekazać meczu do symulacji.',
      );
      return false;
    }
  };
  if (continuation)
    return (
      <section>
        <h2>
          Mecz zakończony · {continuation.score.home}:{continuation.score.away}
        </h2>
        <p>
          Dotychczasowe zdarzenia zachowane. Pozostała część została zasymulowana. Indywidualne
          statystyki akcji obejmują rozegrany fragment.
        </p>
        {error && <p role="alert">{error}</p>}
        <button
          disabled={busy || persistencePending || saved}
          onClick={() => void saveResult(continuation)}
        >
          {busy ? 'Zapisywanie wyniku…' : 'Ponów zapis wyniku'}
        </button>
      </section>
    );
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
  if (!prepared)
    return (
      <section>
        <h2>Przygotowanie meczu</h2>
        <p role={error ? 'alert' : 'status'}>
          {error ?? 'Trener wybiera kadrę na rzeczywisty mecz ligowy…'}
        </p>
        {error && <button onClick={leave}>Wróć do kariery</button>}
      </section>
    );
  const { input, initial, session } = prepared;
  return (
    <section className="career-canonical-match">
      {error && <p role="alert">{error}</p>}
      <RunningLabGuard
        key={input.footballFingerprint}
        session={session}
        initialState={initial}
        careerMode
        onObserve={(state) => evidence.current.observe(state)}
        onComplete={complete}
        onSimulateRemainder={simulateRemainder}
        completionPending={busy || persistencePending}
        onSetup={leave}
        onRestart={() => undefined}
        onRandomize={() => undefined}
      />
    </section>
  );
};
