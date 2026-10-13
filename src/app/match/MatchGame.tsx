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
} from '../../core/careerMatchContract';
import type { TacticalMatchState } from '../../core/matchSimulation/matchState';
import type { SingleMatchSession } from '../../core/singleMatch';
import { RunningLabGuard } from './TacticalMatchSandbox';
import { getUnlockedPlayStyles, PLAY_STYLE_PRESENTATION } from '../../core/playStyles';

/** The Lab and career share one runtime; React owns only the save/return transaction. */
export const MatchGame = ({
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
  const [intro, setIntro] = useState(true);
  const committing = useRef(false);
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
    if (committing.current) return;
    void onCareer({ ...career, activeMatch: undefined, decisionPoint: undefined });
  };
  const complete = async (state: TacticalMatchState) => {
    if (
      !prepared ||
      prepared.epoch !== generation.current ||
      committing.current ||
      persistencePending
    )
      return;
    committing.current = true;
    setBusy(true);
    const epoch = prepared.epoch;
    try {
      const result = finishCareerMatch(prepared.input, state, evidence.current);
      const world = await loadWorldDatabase();
      if (generation.current !== epoch) return;
      const next = applyCareerMatchResult(career, world, prepared.input, result);
      // onCareer exposes the next state only after the queued storage transaction succeeds.
      if (!(await onCareer(next)))
        setError('Wynik nie został zapisany. Pozostał tu do ponowienia zapisu.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać wyniku.');
    } finally {
      committing.current = false;
      if (generation.current === epoch) setBusy(false);
    }
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
  const body = initial.players.find((p) => p.id === career.player.id);
  const bench = input.session.home.bench
    .concat(input.session.away.bench)
    .some((p) => p.footballerId === career.player.id);
  const participation = body
    ? 'Pierwszy skład'
    : bench
      ? 'Ławka · o wejściu decyduje trener'
      : 'Poza kadrą';
  return (
    <section className="career-canonical-match">
      {error && <p role="alert">{error}</p>}
      <p>
        {input.fixture.date} · {career.leagueSeason?.competition.name}
        {intro ? ` · ${career.player.firstName} ${career.player.lastName} · ${participation}` : ''}
      </p>
      {intro ? (
        <>
          <h2>
            {input.session.home.club.name} — {input.session.away.club.name}
          </h2>
          <p>
            Kontrolujesz swoje decyzje podczas udziału w meczu. Zwykła gra przebiega samodzielnie.
          </p>
          <p>
            Przerwanie lub odświeżenie rozpocznie niezapisany mecz od początku, z tym samym składem
            i warunkami początkowymi.
          </p>
          {(['home', 'away'] as const).map((side) => (
            <details key={side}>
              <summary>{input.session[side].club.name} · skład trenera</summary>
              <p>{input.session[side].players.map((p) => p.profile.lastName).join(', ')}</p>
              <p>Rezerwa: {input.session[side].bench.map((p) => p.profile.lastName).join(', ')}</p>
            </details>
          ))}
          {getUnlockedPlayStyles(career).map((id) => (
            <p key={id}>
              {PLAY_STYLE_PRESENTATION[id].name} · {PLAY_STYLE_PRESENTATION[id].effect}
            </p>
          ))}
          <button disabled={persistencePending} onClick={() => setIntro(false)}>
            Rozpocznij mecz 3D
          </button>
          <button disabled={persistencePending} onClick={leave}>
            Wróć do kariery
          </button>
        </>
      ) : (
        <RunningLabGuard
          key={input.footballFingerprint}
          session={session}
          initialState={initial}
          careerMode
          onObserve={(state) => evidence.current.observe(state)}
          onComplete={(state) => void complete(state)}
          completionPending={busy || persistencePending}
          onSetup={leave}
          onRestart={() => undefined}
          onRandomize={() => undefined}
        />
      )}
    </section>
  );
};
