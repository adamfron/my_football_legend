import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createSingleMatchSession,
  getSingleMatchPlayerOverall,
  type SingleMatchSession,
} from '../../core/singleMatch';
import { loadWorldDatabase } from '../../core/worldDatabase';
import { positionCode } from '../../core/positionPresentation';
import type { WorldDatabase } from '../../types/domain';
import { createTacticalScenarios } from './tacticalRenderer/scenarios';
import { interpolateFrame, type TacticalPlayer } from './tacticalRenderer/model';
import { TacticalPitchRenderer } from './tacticalRenderer/TacticalPitchRenderer';
import './TacticalMatchSandbox.css';

const freshSeed = () => `lab-${Date.now().toString(36)}`;
const toTacticalPlayers = (session: SingleMatchSession): TacticalPlayer[] => [
  ...session.home.players.map((player) => ({
    id: player.footballerId,
    team: 'home' as const,
    x: player.x,
    y: player.y,
    goalkeeper: player.profile.primaryPosition === 'goalkeeper',
    protagonist: player.footballerId === session.setup.controlledFootballerId,
  })),
  ...session.away.players.map((player) => ({
    id: player.footballerId,
    team: 'away' as const,
    x: 105 - player.x,
    y: 68 - player.y,
    goalkeeper: player.profile.primaryPosition === 'goalkeeper',
    protagonist: player.footballerId === session.setup.controlledFootballerId,
  })),
];

export const TacticalMatchSandbox = () => {
  const [world, setWorld] = useState<WorldDatabase>();
  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const [control, setControl] = useState<'home' | 'away'>('home');
  const [playerId, setPlayerId] = useState('');
  const [seed, setSeed] = useState(freshSeed);
  const [force, setForce] = useState(true);
  const [session, setSession] = useState<SingleMatchSession>();
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
  const effectivePlayerId = players.some((player) => player?.id === playerId)
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
            <span className="dev-badge">DEV · PR87</span>
            <h1>Single Match Lab</h1>
          </div>
        </header>
        <section className="lab-launcher">
          <label>
            GOSPODARZE
            <select value={homeId} onChange={(e) => setHomeId(e.target.value)}>
              {[1, 2, 3, 4].map((tier) => (
                <optgroup label={`${tier}. liga`} key={tier}>
                  {world.clubs
                    .filter((c) => c.leagueTier === tier && c.id !== awayId)
                    .map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            GOŚCIE
            <select value={awayId} onChange={(e) => setAwayId(e.target.value)}>
              {[1, 2, 3, 4].map((tier) => (
                <optgroup label={`${tier}. liga`} key={tier}>
                  {world.clubs
                    .filter((c) => c.leagueTier === tier && c.id !== homeId)
                    .map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>KONTROLA</legend>
            <label>
              <input
                type="radio"
                checked={control === 'home'}
                onChange={() => {
                  setControl('home');
                  setPlayerId('');
                }}
              />{' '}
              Gospodarze
            </label>
            <label>
              <input
                type="radio"
                checked={control === 'away'}
                onChange={() => {
                  setControl('away');
                  setPlayerId('');
                }}
              />{' '}
              Goście
            </label>
          </fieldset>
          <label>
            KONTROLOWANY PIŁKARZ
            <select value={effectivePlayerId} onChange={(e) => setPlayerId(e.target.value)}>
              {players.map((p) => (
                <option key={p!.id} value={p!.id}>
                  {p!.firstName} {p!.lastName} — {positionCode(p!.primaryPosition)} —{' '}
                  {getSingleMatchPlayerOverall(p!)} OVR
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>SELEKCJA</legend>
            <label>
              <input type="radio" checked={!force} onChange={() => setForce(false)} /> Szanuj wybór
              trenera
            </label>
            <label>
              <input type="radio" checked={force} onChange={() => setForce(true)} /> Wymuś gracza w
              XI
            </label>
          </fieldset>
          <label>
            SEED
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>
          <button onClick={() => setSeed(freshSeed())}>Losuj seed</button>
          <button
            className="primary-choice"
            disabled={!effectivePlayerId || homeId === awayId}
            onClick={() =>
              setSession(
                createSingleMatchSession(world, {
                  homeClubId: homeId,
                  awayClubId: awayId,
                  controlledClubId,
                  controlledFootballerId: effectivePlayerId,
                  seed,
                  forceControlledIntoXI: force,
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
  const tacticalPlayers = useMemo(() => toTacticalPlayers(session), [session]);
  const controlledTeam =
    session.setup.controlledClubId === session.home.club.id ? session.home : session.away;
  const actor = controlledTeam.players.find(
    (p) => p.footballerId === session.setup.controlledFootballerId,
  );
  const scenarios = useMemo(() => {
    const homeIds = session.home.players.map((p) => p.footballerId),
      awayIds = session.away.players.map((p) => p.footballerId);
    const aliases = {
      'home-0': homeIds[0]!,
      'home-6': session.setup.controlledFootballerId,
      'home-8': homeIds[8]!,
      'home-9': homeIds[9]!,
      'away-0': awayIds[0]!,
      'away-6': awayIds[6]!,
      'away-9': awayIds[9]!,
    };
    return createTacticalScenarios({ players: tacticalPlayers, aliases });
  }, [session, tacticalPlayers]);
  const [scenarioIndex, setScenarioIndex] = useState(0),
    scenario = scenarios[scenarioIndex]!;
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TacticalPitchRenderer>();
  useEffect(() => {
    if (!hostRef.current) return;
    const renderer = new TacticalPitchRenderer(hostRef.current, scenarios[0]!.sequence.frames[0]!);
    rendererRef.current = renderer;
    return () => renderer.dispose();
  }, [scenarios]);
  useEffect(() => {
    let frame = 0,
      previous: number | undefined;
    if (playing)
      frame = requestAnimationFrame(function animate(now) {
        const delta = previous === undefined ? 0 : now - previous;
        previous = now;
        setElapsedMs((value) => {
          const next = Math.min(value + delta, scenario.sequence.durationMs);
          if (next === scenario.sequence.durationMs) setPlaying(false);
          return next;
        });
        frame = requestAnimationFrame(animate);
      });
    return () => cancelAnimationFrame(frame);
  }, [playing, scenario]);
  useEffect(() => {
    rendererRef.current?.render(interpolateFrame(scenario.sequence, elapsedMs));
  }, [scenario, elapsedMs]);
  return (
    <main className="tactical-sandbox">
      <header>
        <div>
          <span className="dev-badge">DEV · SINGLE MATCH LAB</span>
          <h1>
            {session.home.club.name} <b>0–0</b> {session.away.club.name}
          </h1>
        </div>
        <p>
          00:00 · seed: <code>{session.setup.seed}</code>
        </p>
      </header>
      <nav>
        {scenarios.map((s, i) => (
          <button
            className={i === scenarioIndex ? 'active' : ''}
            key={s.id}
            onClick={() => {
              setScenarioIndex(i);
              setElapsedMs(0);
              setPlaying(false);
            }}
          >
            {s.title}
          </button>
        ))}
        <button onClick={onRestart}>Restart — ten sam seed</button>
        <button onClick={onRandomize}>Losuj seed</button>
        <button onClick={onSetup}>Zmień ustawienia</button>
      </nav>
      <section className="sandbox-grid">
        <div className="pitch-stage" ref={hostRef} />
        <aside className="decision-board">
          <small>SEKWENCJA TESTOWA</small>
          <h2>{scenario.title}</h2>
          <p>{scenario.situation}</p>
          <button className="primary-choice" onClick={() => setPlaying(true)}>
            {scenario.choice}
          </button>
          <div className="playback-controls">
            <button onClick={() => setPlaying((v) => !v)}>{playing ? 'Pauza' : 'Odtwórz'}</button>
            <button onClick={() => setElapsedMs(0)}>Od początku</button>
          </div>
          <p>{scenario.sequence.result}</p>
          <hr />
          <h3>Debug</h3>
          <p>
            Home: {session.home.club.name} / {session.home.strength} / {session.home.formation}
            <br />
            Away: {session.away.club.name} / {session.away.strength} / {session.away.formation}
          </p>
          <p>
            Gracz: {actor?.profile.firstName} {actor?.profile.lastName} /{' '}
            {actor && positionCode(actor.profile.primaryPosition)} /{' '}
            {actor && getSingleMatchPlayerOverall(actor.profile)} OVR
          </p>
          <p>
            Seed: <code>{session.setup.seed}</code>
          </p>
          <details>
            <summary>22 wybranych piłkarzy</summary>
            {[...session.home.players, ...session.away.players].map((p) => (
              <div key={p.footballerId}>
                {p.profile.firstName} {p.profile.lastName}
              </div>
            ))}
          </details>
        </aside>
      </section>
    </main>
  );
};
