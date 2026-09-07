import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createSingleMatchSession,
  getSingleMatchPlayerOverall,
  type SingleMatchSession,
} from '../../core/singleMatch';
import {
  createTacticalMatch,
  applyRestartScenario,
  matchStateToFrame,
  stepTacticalMatch,
  type TacticalMatchState,
  type RestartScenario,
} from '../../core/matchSimulation';
import { loadWorldDatabase } from '../../core/worldDatabase';
import { positionCode } from '../../core/positionPresentation';
import type { WorldDatabase } from '../../types/domain';
import { TacticalPitchRenderer } from './tacticalRenderer/TacticalPitchRenderer';
import { buildStartMenuUrl } from '../devTools';
import './TacticalMatchSandbox.css';

const freshSeed = () => `lab-${Date.now().toString(36)}`;
export const TacticalMatchSandbox = () => {
  const [world, setWorld] = useState<WorldDatabase>(),
    [homeId, setHomeId] = useState(''),
    [awayId, setAwayId] = useState('');
  const [mode, setMode] = useState<'spectator' | 'player'>('spectator'),
    [control, setControl] = useState<'home' | 'away'>('home'),
    [playerId, setPlayerId] = useState(''),
    [seed, setSeed] = useState(freshSeed),
    [force, setForce] = useState(true),
    [session, setSession] = useState<SingleMatchSession>();
  useEffect(() => {
    void loadWorldDatabase().then((value) => {
      setWorld(value);
      setHomeId(value.clubs[0]!.id);
      setAwayId(value.clubs[1]!.id);
    });
  }, []);
  const controlledClubId = control === 'home' ? homeId : awayId;
  const players = useMemo(
    () =>
      world
        ? (world.clubs.find((c) => c.id === controlledClubId)?.squadPlayerIds ?? [])
            .map((id) => world.footballers[id]?.profile)
            .filter(Boolean)
        : [],
    [world, controlledClubId],
  );
  const effectivePlayerId = players.some((p) => p?.id === playerId)
    ? playerId
    : (players[0]?.id ?? '');
  if (!world)
    return (
      <main className="tactical-sandbox">
        <p>Ładowanie świata Single Match Lab…</p>
      </main>
    );
  if (!session)
    return (
      <main className="tactical-sandbox">
        <header>
          <div>
            <span className="dev-badge">DEV · PR89</span>
            <h1>Single Match Lab</h1>
          </div>
        </header>
        <section className="lab-launcher">
          <label>
            GOSPODARZE
            <select value={homeId} onChange={(e) => setHomeId(e.target.value)}>
              {world.clubs
                .filter((c) => c.id !== awayId)
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            GOŚCIE
            <select value={awayId} onChange={(e) => setAwayId(e.target.value)}>
              {world.clubs
                .filter((c) => c.id !== homeId)
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <fieldset>
            <legend>TRYB</legend>
            <label>
              <input
                type="radio"
                checked={mode === 'spectator'}
                onChange={() => setMode('spectator')}
              />{' '}
              Obserwuj mecz
            </label>
            <label>
              <input type="radio" checked={mode === 'player'} onChange={() => setMode('player')} />{' '}
              Steruj piłkarzem
            </label>
          </fieldset>
          {mode === 'player' && (
            <>
              <fieldset>
                <legend>DRUŻYNA</legend>
                <label>
                  <input
                    type="radio"
                    checked={control === 'home'}
                    onChange={() => setControl('home')}
                  />{' '}
                  Gospodarze
                </label>
                <label>
                  <input
                    type="radio"
                    checked={control === 'away'}
                    onChange={() => setControl('away')}
                  />{' '}
                  Goście
                </label>
              </fieldset>
              <label>
                PIŁKARZ
                <select value={effectivePlayerId} onChange={(e) => setPlayerId(e.target.value)}>
                  {players.map((p) => (
                    <option key={p!.id} value={p!.id}>
                      {p!.firstName} {p!.lastName} — {positionCode(p!.primaryPosition)} —{' '}
                      {getSingleMatchPlayerOverall(p!)} OVR
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                />{' '}
                Wymuś w XI
              </label>
            </>
          )}
          <label>
            SEED
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>
          <button onClick={() => setSeed(freshSeed())}>Losuj seed</button>
          <button
            className="primary-choice"
            disabled={homeId === awayId || (mode === 'player' && !effectivePlayerId)}
            onClick={() =>
              setSession(
                createSingleMatchSession(world, {
                  homeClubId: homeId,
                  awayClubId: awayId,
                  seed,
                  control:
                    mode === 'spectator'
                      ? { mode: 'spectator' }
                      : {
                          mode: 'player',
                          clubId: controlledClubId,
                          footballerId: effectivePlayerId,
                          forceIntoXI: force,
                        },
                }),
              )
            }
          >
            Rozpocznij mecz
          </button>
        </section>
      </main>
    );
  return (
    <RunningLab
      session={session}
      onSetup={() => setSession(undefined)}
      onRestart={() => setSession(createSingleMatchSession(world, session.setup))}
      onRandomize={() => {
        const next = freshSeed();
        setSeed(next);
        setSession(createSingleMatchSession(world, { ...session.setup, seed: next }));
      }}
    />
  );
};

const RunningLab = ({
  session,
  onSetup,
  onRestart,
  onRandomize,
}: {
  session: SingleMatchSession;
  onSetup(): void;
  onRestart(): void;
  onRandomize(): void;
}) => {
  const [state, setState] = useState<TacticalMatchState>(() => createTacticalMatch(session)),
    [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(1),
    [debug, setDebug] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null),
    rendererRef = useRef<TacticalPitchRenderer | undefined>(undefined);
  useEffect(() => {
    if (!hostRef.current) return;
    const initial = createTacticalMatch(session);
    setState(initial);
    const renderer = new TacticalPitchRenderer(hostRef.current, matchStateToFrame(initial));
    rendererRef.current = renderer;
    return () => renderer.dispose();
  }, [session]);
  useEffect(() => {
    let frame = 0,
      previous: number | undefined;
    if (playing)
      frame = requestAnimationFrame(function animate(now) {
        const delta = previous === undefined ? 0 : Math.min(100, now - previous);
        previous = now;
        setState((value) => stepTacticalMatch(value, (delta / 1000) * speed));
        frame = requestAnimationFrame(animate);
      });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);
  useEffect(() => rendererRef.current?.render(matchStateToFrame(state), debug), [state, debug]);
  const owner = state.players.find((p) => p.id === state.ball.ownerId),
    actor = state.players.find((p) => p.id === state.currentActorId);
  const scenarios: [RestartScenario, string][] = [
    ['open_play', 'Gra otwarta'],
    ['kick_off', 'Środek'],
    ['goal_kick', 'Wykop'],
    ['gk_short', 'Krótkie od BR'],
    ['corner', 'Rożny'],
    ['free_kick_far', 'Wolny · daleki środek'],
    ['free_kick_close', 'Wolny · bliski środek'],
    ['free_kick_wide', 'Wolny · skrzydło'],
    ['penalty', 'Karny'],
  ];
  return (
    <main className="tactical-sandbox">
      <header>
        <div>
          <span className="dev-badge">DEV · AUTONOMICZNA SYMULACJA</span>
          <h1>
            {session.home.club.name} <b>–</b> {session.away.club.name}
          </h1>
        </div>
        <p>
          {state.time.toFixed(1)} s · seed: <code>{state.seed}</code>
        </p>
      </header>
      <nav>
        <button onClick={() => setPlaying((v) => !v)}>{playing ? 'Pauza' : 'Odtwórz'}</button>
        {[1, 2, 4].map((v) => (
          <button className={speed === v ? 'active' : ''} key={v} onClick={() => setSpeed(v)}>
            {v}×
          </button>
        ))}
        <button onClick={onRestart}>Restart — ten sam seed</button>
        <button onClick={onRandomize}>Losuj seed</button>
        <button onClick={onSetup}>Zmień ustawienia</button>
        <button
          onClick={() => globalThis.location.assign(buildStartMenuUrl(globalThis.location.href))}
        >
          Powrót do menu
        </button>
      </nav>
      <nav className="scenario-picker" aria-label="Scenariusz developerski">
        <strong>Sytuacja:</strong>
        {scenarios.map(([scenario, label]) => (
          <button
            key={scenario}
            className={state.scenario === scenario ? 'active' : ''}
            onClick={() => {
              setPlaying(false);
              setState(applyRestartScenario(createTacticalMatch(session), scenario));
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="sandbox-grid">
        <div className="pitch-stage" ref={hostRef} />
        <aside className="decision-board">
          <small>STAN KANONICZNY</small>
          <h2>
            {state.possessionTeam === 'home' ? session.home.club.name : session.away.club.name} przy
            piłce
          </h2>
          <p>
            Czas: {state.time.toFixed(1)} s<br />
            Fazy: {state.teams.home.phase} / {state.teams.away.phase}
            <br />
            Formacje: {state.teams.home.formation} / {state.teams.away.formation}
            <br />
            Style: {state.teams.home.style} / {state.teams.away.style}
            <br />
            Wznowienie: {state.restart?.phase ?? 'gra otwarta'}
            <br />
            Właściciel: {owner?.profile.firstName} {owner?.profile.lastName}
            <br />
            Aktor: {actor?.profile.firstName} {actor?.profile.lastName}
            <br />
            Akcja: {state.latestAction?.type ?? '—'}
            <br />
            Seed: <code>{state.seed}</code>
          </p>
          <label>
            <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />{' '}
            Kotwice i cele
          </label>
          <details>
            <summary>Średnie pozycje (DEV)</summary>
            {state.players.map((p) => (
              <div key={p.id}>
                {p.profile.lastName}: {p.meanPosition.x.toFixed(1)}, {p.meanPosition.y.toFixed(1)}
              </div>
            ))}
          </details>
        </aside>
      </section>
    </main>
  );
};
