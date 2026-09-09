import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createSingleMatchSession,
  getSingleMatchPlayerOverall,
  type SingleMatchSession,
} from '../../core/singleMatch';
import {
  createTacticalMatch,
  applyRestartScenario,
  FIXED_MATCH_DT,
  matchStateToFrame,
  stepTacticalMatch,
  deriveTeamShapeMetrics,
  evaluateMatchSituation,
  type TacticalMatchState,
  type RestartScenario,
} from '../../core/matchSimulation';
import { loadWorldDatabase } from '../../core/worldDatabase';
import { positionCode } from '../../core/positionPresentation';
import type { WorldDatabase } from '../../types/domain';
import { TacticalPitchRenderer } from './tacticalRenderer/TacticalPitchRenderer';
import { buildStartMenuUrl } from '../devTools';
import {
  debugBasename,
  describeDebugCapture,
  isCaptureTriggerDisabled,
  MatchDebugRecorder,
  saveDebugPackage,
  ViewportVideoRecorder,
  type DebugCaptureStatus,
  type MatchDebugExport,
} from './matchDebugCapture';
import './TacticalMatchSandbox.css';

const freshSeed = () => `lab-${Date.now().toString(36)}`;
const formatMatchTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
};
type RenderFrame = ReturnType<typeof matchStateToFrame>;
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
    [debug, setDebug] = useState(false),
    [goalReplay, setGoalReplay] = useState<RenderFrame[]>([]),
    [replaying, setReplaying] = useState(false),
    [captureStatus, setCaptureStatus] = useState<DebugCaptureStatus>('idle'),
    [saveMessage, setSaveMessage] = useState<string>(),
    [captureError, setCaptureError] = useState<string>(),
    [debugExport, setDebugExport] = useState<{
      trace: MatchDebugExport;
      video: Blob | undefined;
      basename: string;
    }>();
  const hostRef = useRef<HTMLDivElement>(null),
    rendererRef = useRef<TacticalPitchRenderer | undefined>(undefined),
    accumulatorRef = useRef(0),
    replayBufferRef = useRef<RenderFrame[]>([]),
    scoreRef = useRef(0),
    stateRef = useRef(state),
    debugRecorderRef = useRef(new MatchDebugRecorder()),
    videoRecorderRef = useRef(new ViewportVideoRecorder()),
    finishingRef = useRef(false);
  stateRef.current = state;
  useEffect(() => {
    if (!hostRef.current) return;
    const initial = createTacticalMatch(session);
    setState(initial);
    replayBufferRef.current = [matchStateToFrame(initial)];
    debugRecorderRef.current = new MatchDebugRecorder();
    debugRecorderRef.current.record(initial);
    scoreRef.current = 0;
    setDebugExport(undefined);
    setCaptureStatus('idle');
    setCaptureError(undefined);
    setSaveMessage(undefined);
    accumulatorRef.current = 0;
    const renderer = new TacticalPitchRenderer(hostRef.current, matchStateToFrame(initial));
    const videoRecorder = videoRecorderRef.current;
    rendererRef.current = renderer;
    videoRecorder.start(renderer.getCanvas(), () => stateRef.current.time);
    return () => {
      renderer.dispose();
      videoRecorder.dispose();
    };
  }, [session]);
  useEffect(() => {
    let frame = 0,
      previous: number | undefined;
    if (playing && !replaying)
      frame = requestAnimationFrame(function animate(now) {
        const delta = previous === undefined ? 0 : Math.min(100, now - previous);
        previous = now;
        accumulatorRef.current += (delta / 1000) * speed;
        const ticks = Math.floor((accumulatorRef.current + 1e-9) / FIXED_MATCH_DT);
        if (ticks > 0) {
          accumulatorRef.current -= ticks * FIXED_MATCH_DT;
          setState((value) => {
            let next = value;
            for (let tick = 0; tick < ticks; tick += 1) {
              next = stepTacticalMatch(next, FIXED_MATCH_DT);
              const complete = debugRecorderRef.current.record(next);
              if (complete && !finishingRef.current) {
                finishingRef.current = true;
                const recorder = debugRecorderRef.current;
                const basename = debugBasename(state.seed, recorder.triggerTime!);
                try {
                  const trace = recorder.export(
                    session,
                    FIXED_MATCH_DT,
                    { width: window.innerWidth, height: window.innerHeight },
                    videoRecorderRef.current.active,
                    videoRecorderRef.current.captureFps,
                  );
                  setDebugExport({ trace, video: undefined, basename });
                  setCaptureStatus('processing');
                  void videoRecorderRef.current
                    .finish()
                    .then((video) => {
                      setDebugExport((current) => (current ? { ...current, video } : current));
                      setCaptureStatus(video ? 'ready' : 'error');
                      if (!video) setCaptureError('enkoder nie zwrócił pliku');
                    })
                    .catch((error: unknown) => {
                      const message = error instanceof Error ? error.message : String(error);
                      console.error('Nie udało się zakodować WebM debug.', error);
                      setCaptureError(message);
                      setCaptureStatus('error');
                    })
                    .finally(() => {
                      recorder.resetCapture();
                      finishingRef.current = false;
                    });
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  console.error('Nie udało się utworzyć śladu JSON debug.', error);
                  setCaptureError(message);
                  setCaptureStatus('error');
                  recorder.resetCapture();
                  finishingRef.current = false;
                }
              }
            }
            return next;
          });
        }
        frame = requestAnimationFrame(animate);
      });
    return () => cancelAnimationFrame(frame);
  }, [playing, replaying, session, speed, state.seed]);
  useEffect(() => {
    if (replaying) return;
    const frame = matchStateToFrame(state);
    rendererRef.current?.render(frame, debug);
    const frames = replayBufferRef.current;
    frames.push(frame);
    while (frames.length > 1 && frame.timestampMs - frames[0]!.timestampMs > 10_000) frames.shift();
    const score = state.score.home + state.score.away;
    if (score > scoreRef.current) setGoalReplay([...frames]);
    scoreRef.current = score;
  }, [state, debug, replaying]);
  useEffect(() => {
    if (!replaying || goalReplay.length === 0) return;
    const started = performance.now(),
      firstTimestamp = goalReplay[0]!.timestampMs;
    let animation = 0;
    const play = (now: number) => {
      const replayTimestamp = firstTimestamp + (now - started) * 0.5;
      let frame: RenderFrame | undefined;
      for (let index = goalReplay.length - 1; index >= 0; index -= 1)
        if (goalReplay[index]!.timestampMs <= replayTimestamp) {
          frame = goalReplay[index];
          break;
        }
      if (frame) rendererRef.current?.render(frame, debug);
      if (replayTimestamp < goalReplay.at(-1)!.timestampMs) animation = requestAnimationFrame(play);
      else setReplaying(false);
    };
    animation = requestAnimationFrame(play);
    return () => cancelAnimationFrame(animation);
  }, [replaying, goalReplay, debug]);
  const owner = state.players.find((p) => p.id === state.ball.ownerId),
    actor = state.players.find((p) => p.id === state.currentActorId),
    situation = evaluateMatchSituation(state, owner?.id ?? state.controlledFootballerId),
    shapeMetrics = (['home', 'away'] as const).map(
      (side) => [side, deriveTeamShapeMetrics(state, side)] as const,
    );
  const uiEvent = (type: string, data?: Record<string, unknown>) =>
    debugRecorderRef.current.ui(stateRef.current.time, type, data);
  const triggerCapture = () => {
    if (!debugRecorderRef.current.trigger(state.time)) return;
    videoRecorderRef.current.trigger(state.time);
    setSaveMessage(undefined);
    setCaptureError(undefined);
    setCaptureStatus('capturing');
  };
  const clearDebugBuffer = () => {
    debugRecorderRef.current.clear();
    videoRecorderRef.current.clear();
    setDebugExport(undefined);
    setCaptureStatus('idle');
    setCaptureError(undefined);
    setSaveMessage(undefined);
    finishingRef.current = false;
  };
  const savePackage = async () => {
    if (!debugExport) return;
    setSaveMessage(undefined);
    try {
      const result = await saveDebugPackage({
        basename: debugExport.basename,
        json: new Blob([JSON.stringify(debugExport.trace, null, 2)], {
          type: 'application/json',
        }),
        ...(debugExport.video ? { video: debugExport.video } : {}),
      });
      if (result.status !== 'cancelled') {
        setSaveMessage(result.message);
        setCaptureStatus('saved');
      }
    } catch {
      setSaveMessage('Nie udało się zapisać plików. Spróbuj ponownie.');
      setCaptureStatus('error');
    }
  };
  const remaining =
    debugRecorderRef.current.triggerTime === undefined
      ? 0
      : Math.max(0, debugRecorderRef.current.triggerTime + 10 - state.time);
  const scenarios: [RestartScenario, string][] = [
    ['open_play', 'Gra otwarta'],
    ['kick_off', 'Środek'],
    ['goal_kick', 'Wykop'],
    ['gk_short', 'Krótkie od BR'],
    ['corner', 'Rożny'],
    ['throw_in', 'Aut'],
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
            {session.home.club.name}{' '}
            <b>
              {state.score.home}–{state.score.away}
            </b>{' '}
            {session.away.club.name}
          </h1>
        </div>
        <p>
          {formatMatchTime(state.time)} · seed: <code>{state.seed}</code>
        </p>
      </header>
      <nav>
        <button
          onClick={() =>
            setPlaying((v) => {
              uiEvent(v ? 'paused' : 'playing');
              return !v;
            })
          }
        >
          {playing ? 'Pauza' : 'Odtwórz'}
        </button>
        {[1, 2, 4].map((v) => (
          <button
            className={speed === v ? 'active' : ''}
            key={v}
            onClick={() => {
              uiEvent('playback_speed_changed', { speed: v });
              setSpeed(v);
            }}
          >
            {v}×
          </button>
        ))}
        <button
          disabled={!goalReplay.length || replaying}
          onClick={() => {
            uiEvent('replay_started');
            setReplaying(true);
          }}
        >
          Powtórka 0.5×
        </button>
        {replaying && <button onClick={() => setReplaying(false)}>Zakończ powtórkę</button>}
        <button onClick={onRestart}>Restart — ten sam seed</button>
        <button onClick={onRandomize}>Losuj seed</button>
        <button onClick={onSetup}>Zmień ustawienia</button>
        <button
          onClick={() => globalThis.location.assign(buildStartMenuUrl(globalThis.location.href))}
        >
          Powrót do menu
        </button>
      </nav>
      <nav className="debug-capture" aria-label="Eksport diagnostyczny">
        <button disabled={isCaptureTriggerDisabled(captureStatus)} onClick={triggerCapture}>
          Przechwyć debug ±10 s
        </button>
        <button onClick={clearDebugBuffer}>Wyczyść bufor debug</button>
        {captureStatus === 'idle' && (
          <span>
            {videoRecorderRef.current.active
              ? `Gotowy — bufor: ${videoRecorderRef.current.bufferedSeconds.toFixed(1)} s`
              : 'Wideo niedostępne — zapis będzie zawierał JSON'}
          </span>
        )}
        {captureStatus === 'capturing' && (
          <strong>Debug: zapisano historię · +{remaining.toFixed(1)} s</strong>
        )}
        {(captureStatus === 'processing' ||
          captureStatus === 'ready' ||
          captureStatus === 'saved' ||
          captureStatus === 'error') && (
          <>
            <strong>
              {describeDebugCapture(
                captureStatus,
                Boolean(debugExport),
                Boolean(debugExport?.video),
                captureError,
              )}
            </strong>
            {debugExport && captureStatus !== 'processing' && (
              <button onClick={() => void savePackage()}>Zapisz pakiet…</button>
            )}
            {saveMessage && <span>{saveMessage}</span>}
          </>
        )}
      </nav>
      <nav className="scenario-picker" aria-label="Scenariusz developerski">
        <strong>Sytuacja:</strong>
        {scenarios.map(([scenario, label]) => (
          <button
            key={scenario}
            className={state.scenario === scenario ? 'active' : ''}
            onClick={() => {
              setPlaying(false);
              clearDebugBuffer();
              setState(() => {
                const next = applyRestartScenario(
                  createTacticalMatch(session),
                  scenario,
                  scenario === 'throw_in'
                    ? { restartTeam: 'home', restartPoint: { x: 72, y: 0 } }
                    : undefined,
                );
                debugRecorderRef.current.record(next);
                debugRecorderRef.current.ui(next.time, 'scenario_button_clicked', { scenario });
                return next;
              });
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
            Czas kanoniczny: {formatMatchTime(state.time)}
            <br />
            Stały tick: {FIXED_MATCH_DT.toFixed(3)} s · tempo: {speed}×
            <br />
            Prędkość piłki:{' '}
            {Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0).toFixed(1)} m/s ·
            wysokość {(state.ball.height ?? 0).toFixed(1)} m
            <br />
            Bufor powtórki: {replayBufferRef.current.length} kl. /{' '}
            {(
              ((replayBufferRef.current.at(-1)?.timestampMs ?? 0) -
                (replayBufferRef.current[0]?.timestampMs ?? 0)) /
              1000
            ).toFixed(1)}{' '}
            s
            <br />
            Prędkość aktora: {Math.hypot(actor?.velocity.x ?? 0, actor?.velocity.y ?? 0).toFixed(
              1,
            )}{' '}
            m/s Fazy: {state.teams.home.phase} / {state.teams.away.phase}
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
            Piłka:{' '}
            {state.ball.ownerId
              ? 'w posiadaniu'
              : state.ball.travelDuration
                ? 'w ruchu'
                : 'bezpańska'}
            <br />
            Presja: {Math.round(state.currentPressure * 100)}%
            <br />
            Sytuacja: {situation.kind} · ważność {situation.importance.toFixed(2)} · decyzja{' '}
            {situation.decisionWorthiness.toFixed(2)}
            <br />
            Powody: {situation.reasons.join(', ')} · aktor: {situation.actorId ?? '—'}
            <br />
            Kontekst: bramka {situation.context.goalDistance?.toFixed(1) ?? '—'} m · presja{' '}
            {situation.context.pressure !== undefined
              ? `${Math.round(situation.context.pressure * 100)}%`
              : '—'}
            <br />
            Ostatni strzał: {state.lastShotResult ?? '—'}
            <br />
            Ostatni kontakt: {state.lastBallContact?.kind ?? '—'}
            {state.lastBallContact &&
              ` · (${state.lastBallContact.point.x.toFixed(2)}, ${state.lastBallContact.point.y.toFixed(2)}, ${state.lastBallContact.point.z.toFixed(2)}) · ${state.lastBallContact.preContactSpeed.toFixed(1)}→${state.lastBallContact.postContactSpeed.toFixed(1)} m/s`}
            <br />
            {state.lastShot && (
              <>
                Strzał DEV: cel {state.lastShot.intendedTarget.horizontal.toFixed(2)}/
                {state.lastShot.intendedTarget.vertical.toFixed(2)} →{' '}
                {state.lastShot.actualTarget.horizontal.toFixed(2)}/
                {state.lastShot.actualTarget.vertical.toFixed(2)} ·{' '}
                {state.lastShot.speed.toFixed(1)} m/s · {state.lastShot.classification} ·{' '}
                {state.lastShot.goalkeeperAction ?? 'bez interwencji'}
                {state.lastShot.reboundSource ? ` · odbicie: ${state.lastShot.reboundSource}` : ''}
                <br />
              </>
            )}
            Seed: <code>{state.seed}</code>
          </p>
          <label>
            <input
              type="checkbox"
              checked={debug}
              onChange={(e) => {
                uiEvent('debug_markers_changed', { enabled: e.target.checked });
                setDebug(e.target.checked);
              }}
            />{' '}
            Kotwice i cele
          </label>
          <details>
            <summary>Metryki kształtu drużyn (DEV)</summary>
            {shapeMetrics.map(([side, metric]) => (
              <div key={side}>
                <strong>{side === 'home' ? 'Gospodarze' : 'Goście'}</strong>: środek{' '}
                {metric.centroid.x.toFixed(1)}, {metric.centroid.y.toFixed(1)} · długość{' '}
                {metric.length.toFixed(1)} m · szerokość {metric.width.toFixed(1)} m · rozciągnięcie{' '}
                {metric.stretchIndex.toFixed(1)} m · pole {metric.area.toFixed(0)} m² · przed piłką{' '}
                {metric.playersAheadOfBall} · zabezpieczenie {metric.restDefenceCount}
              </div>
            ))}
          </details>
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
