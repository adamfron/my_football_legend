import {
  Component,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
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
  projectPlayerDecisionOpportunity,
  letAiDecide,
  projectContextualInteractions,
  applyContextualInteraction,
  type PlayerInteractionTarget,
  type ContextualInteraction,
  type PlayerDecisionOpportunity,
  type TacticalMatchState,
  type RestartScenario,
  createMatchFlowTelemetry,
  observeMatchFlow,
  recordDecisionOpportunity,
  recordDecisionSelection,
  sampleCanonicalPositioning,
  type PositioningSample,
  projectPlayerMatchSummary,
  startSecondHalf,
} from '../../core/matchSimulation';
import { loadWorldDatabase } from '../../core/worldDatabase';
import { positionCode } from '../../core/positionPresentation';
import type { WorldDatabase } from '../../types/domain';
import { TacticalPitchRenderer } from './tacticalRenderer/TacticalPitchRenderer';
import { buildStartMenuUrl } from '../devTools';
import {
  debugBasename,
  downloadBlob,
  describeDebugCapture,
  isCaptureTriggerDisabled,
  saveDebugPackage,
  ViewportVideoRecorder,
  type DebugCaptureStatus,
  type MatchDebugExport,
} from './matchDebugCapture';
import './TacticalMatchSandbox.css';
import {
  MatchLabDiagnosticsController,
  runtimeErrorFromEvent,
  runtimeErrorFromRejection,
  findNonFiniteDiagnosticValue,
} from './matchLabDiagnostics';

const freshSeed = () => `lab-${Date.now().toString(36)}`;
const formatMatchTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
};
type RenderFrame = ReturnType<typeof matchStateToFrame>;
export const PitchCanvasHost = forwardRef<HTMLDivElement>(function PitchCanvasHost(_, ref) {
  return <div className="pitch-canvas-host" ref={ref} aria-hidden="true" />;
});
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
    <RunningLabGuard
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

const crashBasename = (controller: MatchLabDiagnosticsController) =>
  `mfl-crash_${controller.session.setup.seed}_t${controller.latestState.time.toFixed(3)}`;

export class MatchLabErrorBoundary extends Component<
  {
    controller: MatchLabDiagnosticsController;
    onSetup(): void;
    children: ReactNode;
  },
  { error?: Error }
> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.controller.freezeFatal('react_error', error, {
      componentStack: info.componentStack ?? undefined,
    });
    this.forceUpdate();
  }
  render() {
    if (!this.state.error) return this.props.children;
    const { controller } = this.props;
    const crash = controller.crashPackage;
    return (
      <main className="tactical-sandbox crash-fallback" role="alert">
        <h1>Single Match Lab uległ awarii</h1>
        <strong>{crash?.error.message ?? this.state.error.message}</strong>
        <p>
          Seed: <code>{controller.session.setup.seed}</code>
        </p>
        <p>Czas kanoniczny: {formatMatchTime(controller.latestState.time)}</p>
        <p>Sterowany piłkarz: {controller.latestState.controlledFootballerId ?? '—'}</p>
        {import.meta.env.DEV && <pre>{crash?.error.stack ?? this.state.error.stack}</pre>}
        <button onClick={this.props.onSetup}>Wróć do ustawień</button>{' '}
        <button
          disabled={!crash}
          onClick={() =>
            crash &&
            downloadBlob(
              new Blob([JSON.stringify(crash, null, 2)], { type: 'application/json' }),
              `${crashBasename(controller)}.json`,
            )
          }
        >
          Pobierz diagnostykę awarii
        </button>
      </main>
    );
  }
}

type RunningLabProps = {
  session: SingleMatchSession;
  onSetup(): void;
  onRestart(): void;
  onRandomize(): void;
};
const FatalCrash = ({ message }: { message: string }) => {
  throw new Error(message);
};
const RunningLabGuard = (props: RunningLabProps) => {
  const [controller] = useState(() => {
    const initial = createTacticalMatch(props.session);
    return new MatchLabDiagnosticsController(props.session, initial, createMatchFlowTelemetry());
  });
  const [, refresh] = useState(0);
  useEffect(() => controller.subscribe(() => refresh((value) => value + 1)), [controller]);
  useEffect(() => {
    const onError = (event: ErrorEvent) =>
      controller.freezeFatal('window_error', runtimeErrorFromEvent(event));
    const onRejection = (event: PromiseRejectionEvent) =>
      controller.freezeFatal('unhandled_rejection', runtimeErrorFromRejection(event));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [controller]);
  return (
    <MatchLabErrorBoundary controller={controller} onSetup={props.onSetup}>
      {controller.crashPackage ? (
        <FatalCrash message={controller.crashPackage.error.message} />
      ) : (
        <RunningLab {...props} diagnostics={controller} />
      )}
    </MatchLabErrorBoundary>
  );
};

const RunningLab = ({
  session,
  onSetup,
  onRestart,
  onRandomize,
  diagnostics,
}: {
  session: SingleMatchSession;
  onSetup(): void;
  onRestart(): void;
  onRandomize(): void;
  diagnostics: MatchLabDiagnosticsController;
}) => {
  const [state, setState] = useState<TacticalMatchState>(() => diagnostics.latestState),
    [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(1),
    [debug, setDebug] = useState(false),
    [goalReplay, setGoalReplay] = useState<RenderFrame[]>([]),
    [replaying, setReplaying] = useState(false),
    [captureStatus, setCaptureStatus] = useState<DebugCaptureStatus>('idle'),
    [saveMessage, setSaveMessage] = useState<string>(),
    [captureError, setCaptureError] = useState<string>(),
    [rendererError, setRendererError] = useState<string>(),
    [opportunity, setOpportunity] = useState<PlayerDecisionOpportunity>(),
    [selectedTarget, setSelectedTarget] = useState<PlayerInteractionTarget>(),
    [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>(),
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
    rendererFaultRef = useRef(false),
    debugRecorderRef = useRef(diagnostics.recorder),
    videoRecorderRef = useRef(new ViewportVideoRecorder()),
    finishingRef = useRef(false);
  const telemetryRef = useRef(diagnostics.telemetry);
  const positioningSamplesRef = useRef<PositioningSample[]>(diagnostics.positioningSamples);
  stateRef.current = state;
  diagnostics.latestState = state;
  diagnostics.telemetry = telemetryRef.current;
  diagnostics.positioningSamples = positioningSamplesRef.current;
  useEffect(() => {
    if (!hostRef.current) return;
    const initial = createTacticalMatch(session);
    setState(initial);
    replayBufferRef.current = [matchStateToFrame(initial)];
    debugRecorderRef.current.clear();
    try {
      debugRecorderRef.current.record(initial);
    } catch (error) {
      diagnostics.report('observer_error', error, { module: 'MatchDebugRecorder.record' });
    }
    telemetryRef.current = createMatchFlowTelemetry();
    diagnostics.telemetry = telemetryRef.current;
    try {
      positioningSamplesRef.current = [sampleCanonicalPositioning(initial)];
    } catch (error) {
      positioningSamplesRef.current = [];
      diagnostics.report('observer_error', error, { module: 'sampleCanonicalPositioning' });
    }
    diagnostics.positioningSamples = positioningSamplesRef.current;
    scoreRef.current = 0;
    setDebugExport(undefined);
    setCaptureStatus('idle');
    setCaptureError(undefined);
    setSaveMessage(undefined);
    setOpportunity(undefined);
    setSelectedTarget(undefined);
    accumulatorRef.current = 0;
    const renderer = new TacticalPitchRenderer(
      hostRef.current,
      matchStateToFrame(initial),
      (error) => {
        setRendererError(error);
        const lifecycle =
          rendererRef.current?.lifecycle ??
          (error?.includes('waiting_for_layout')
            ? 'waiting_for_layout'
            : error
              ? 'failed'
              : 'ready');
        diagnostics.setRendererLifecycle(lifecycle);
        const wasFaulted = rendererFaultRef.current;
        rendererFaultRef.current = Boolean(error && !error.includes('waiting_for_layout'));
        const type = error?.includes('context lost')
          ? 'renderer_context_lost'
          : error?.includes('recovery failed')
            ? 'renderer_recovery_failed'
            : !error && wasFaulted
              ? 'renderer_context_restored'
              : undefined;
        if (type) debugRecorderRef.current.ui(stateRef.current.time, type, { message: error });
        if (error && !wasFaulted && !error.includes('waiting_for_layout')) {
          diagnostics.report('renderer_error', error);
          debugRecorderRef.current.freezePast(stateRef.current.time);
          videoRecorderRef.current.trigger(stateRef.current.time);
        }
      },
    );
    const videoRecorder = videoRecorderRef.current;
    rendererRef.current = renderer;
    diagnostics.setRendererLifecycle(renderer.lifecycle);
    videoRecorder.start(renderer.getCanvas(), () => stateRef.current.time);
    return () => {
      renderer.dispose();
      videoRecorder.dispose();
    };
  }, [session, diagnostics]);
  useEffect(() => {
    let frame = 0,
      previous: number | undefined;
    if (playing && !replaying && !opportunity)
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
              const projected = projectPlayerDecisionOpportunity(next);
              if (projected) {
                setOpportunity(projected);
                recordDecisionOpportunity(
                  telemetryRef.current,
                  projected.kind,
                  projected.triggerReason.includes('autopilot_escalation'),
                );
                debugRecorderRef.current.ui(next.time, 'player_decision_opened', projected);
                break;
              }
              const previousState = next;
              try {
                next = stepTacticalMatch(next, FIXED_MATCH_DT);
              } catch (error) {
                diagnostics.freezeFatal('canonical_error', error, { module: 'stepTacticalMatch' });
                break;
              }
              try {
                telemetryRef.current = observeMatchFlow(telemetryRef.current, previousState, next);
                diagnostics.telemetry = telemetryRef.current;
              } catch (error) {
                diagnostics.report('observer_error', error, { module: 'observeMatchFlow' });
              }
              if (
                next.latestAction &&
                next.latestAction.actorId === next.controlledFootballerId &&
                (next.latestAction !== previousState.latestAction ||
                  next.decisionIndex !== previousState.decisionIndex)
              )
                recordDecisionSelection(telemetryRef.current, 'autonomous');
              const lastPositioning = positioningSamplesRef.current.at(-1);
              if (!lastPositioning || next.time - lastPositioning.time >= 1 - FIXED_MATCH_DT / 2) {
                try {
                  const sample = sampleCanonicalPositioning(next);
                  const invalid = findNonFiniteDiagnosticValue(sample);
                  if (invalid)
                    throw new Error(
                      `Próbka zawiera wartość niefinitywną: ${invalid.path}=${invalid.value}.`,
                    );
                  positioningSamplesRef.current.push(sample);
                } catch (error) {
                  diagnostics.report('observer_error', error, {
                    module: 'sampleCanonicalPositioning',
                    values: { time: next.time },
                  });
                }
              }
              let complete = false;
              try {
                complete = debugRecorderRef.current.record(next);
              } catch (error) {
                diagnostics.report('observer_error', error, {
                  module: 'MatchDebugRecorder.record',
                });
              }
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
  }, [playing, replaying, session, speed, state.seed, opportunity, diagnostics]);
  useEffect(() => {
    if (replaying) return;
    const baseFrame = matchStateToFrame(state);
    // Interaction legality remains a pure canonical projection; presentation only observes it.
    const actionableTargets = opportunity
      ? state.players
          .filter(
            (player) =>
              projectContextualInteractions(state, opportunity, {
                kind: 'player',
                playerId: player.id,
              }).length > 0,
          )
          .map((player) => player.id)
      : [];
    const interceptionOption = opportunity?.options.find(
      (option) => option.kind === 'movement' && option.id === 'intercept',
    );
    const frame = {
      ...baseFrame,
      actionableTargets,
      ...(opportunity?.kind === 'defensive_response'
        ? {
            interceptionTarget:
              interceptionOption?.kind === 'movement'
                ? interceptionOption.intent.target
                : undefined,
          }
        : {}),
      ...(selectedTarget?.kind === 'player' ? { selectedTarget: selectedTarget.playerId } : {}),
    };
    rendererRef.current?.render(frame, debug);
    const frames = replayBufferRef.current;
    frames.push(frame);
    while (frames.length > 1 && frame.timestampMs - frames[0]!.timestampMs > 10_000) frames.shift();
    const score = state.score.home + state.score.away;
    if (score > scoreRef.current) setGoalReplay([...frames]);
    scoreRef.current = score;
  }, [state, debug, replaying, opportunity, selectedTarget]);
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
  const controlledSummary =
    state.controlledFootballerId && state.statistics
      ? projectPlayerMatchSummary(state.statistics, state.controlledFootballerId)
      : undefined;
  const interactions =
    opportunity && selectedTarget
      ? projectContextualInteractions(state, opportunity, selectedTarget)
      : [];
  const interactionLabel = (interaction: ContextualInteraction) =>
    ({
      pass_to_feet: 'Podaj do nogi',
      progressive_pass: 'Podanie progresywne',
      pass_into_space: 'Zagraj przed niego',
      cross: 'Dośrodkuj',
      hold_ball: 'Osłoń / utrzymaj piłkę',
      carry_here: 'Prowadź tutaj',
      placed_shot: 'Strzał techniczny',
      driven_shot: 'Strzał mocny',
      chip_shot: 'Lob',
      contain: 'Pilnuj / opóźniaj',
      press: 'Pressuj',
      challenge: 'Odbierz',
      hold_line: 'Trzymaj linię',
      intercept: 'Wyjdź do przechwytu',
      control_ball: 'Przyjmij i osłoń',
      first_touch_into_space: 'Pierwszy kontakt w przestrzeń',
      attack_ball: 'Walcz o piłkę',
      move_here: 'Pokaż się tutaj',
      run_in_behind: 'Rusz za linię',
    })[interaction.labelKey] ?? interaction.labelKey;
  const uiEvent = (type: string, data?: Record<string, unknown>) =>
    debugRecorderRef.current.ui(stateRef.current.time, type, data);
  const closeOpportunity = (
    next: TacticalMatchState,
    source: 'player' | 'ai',
    selected: unknown,
  ) => {
    if (!opportunity) return;
    uiEvent(source === 'ai' ? 'player_decision_skipped_to_ai' : 'player_decision_selected', {
      opportunityId: opportunity.id,
      actorId: opportunity.actorId,
      selected,
      source,
    });
    recordDecisionSelection(telemetryRef.current, source === 'ai' ? 'dev_ai' : 'human');
    setState(next);
    setOpportunity(undefined);
    setSelectedTarget(undefined);
  };
  const triggerCapture = () => {
    if (!debugRecorderRef.current.trigger(state.time)) return;
    videoRecorderRef.current.trigger(state.time);
    setSaveMessage(undefined);
    setCaptureError(undefined);
    setCaptureStatus('capturing');
  };
  const savePastOnly = () => {
    const recorder = debugRecorderRef.current;
    if (!recorder.freezePast(state.time) && recorder.triggerTime === undefined) return;
    videoRecorderRef.current.trigger(state.time);
    const basename = debugBasename(state.seed, state.time);
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
      void videoRecorderRef.current.finish().then((video) => {
        setDebugExport((current) => (current ? { ...current, video } : current));
        setCaptureStatus('ready');
        recorder.resetCapture();
      });
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
      setCaptureStatus('error');
      recorder.resetCapture();
    }
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
        {state.status === 'half_time' && (
          <button onClick={() => setState((current) => startSecondHalf(current))}>
            Rozpocznij drugą połowę
          </button>
        )}
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
        <button
          onClick={() => {
            const summary = {
              metadata: { schema: 'mfl-session-benchmark-v1', seed: state.seed },
              duration: state.time,
              controlledPlayer: state.controlledFootballerId,
              matchFlowTelemetry: telemetryRef.current,
              decisionTelemetry: telemetryRef.current.controlled,
              passingNetwork: telemetryRef.current.passingNetwork,
              sampledPositioning: positioningSamplesRef.current,
              runtimeDiagnostics: diagnostics.runtimeDiagnostics,
              rendererLifecycle: diagnostics.rendererLifecycle,
            };
            downloadBlob(
              new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' }),
              `${state.seed}-benchmark-sesji.json`,
            );
          }}
        >
          Eksportuj benchmark sesji
        </button>
        <button disabled={isCaptureTriggerDisabled(captureStatus)} onClick={triggerCapture}>
          Przechwyć debug ±10 s
        </button>
        <button disabled={isCaptureTriggerDisabled(captureStatus)} onClick={savePastOnly}>
          Zapisz ostatnie 10 s
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
      <p className="runtime-status">
        Renderer: <strong>{diagnostics.rendererLifecycle}</strong> · Runtime:{' '}
        <strong>{diagnostics.runtimeDiagnostics.length ? 'error captured' : 'OK'}</strong>
      </p>
      <section className="sandbox-grid">
        <div
          className={`pitch-stage ${opportunity ? 'pitch-stage--interactive' : ''}`}
          onClick={(event) => {
            if (!opportunity) return;
            const picked = rendererRef.current?.pick(event.clientX, event.clientY);
            if (!picked) return;
            const target: PlayerInteractionTarget =
              picked.kind === 'player'
                ? picked
                : picked.kind === 'goal'
                  ? picked
                  : picked.kind === 'ball'
                    ? picked
                    : { kind: 'space', point: picked.point };
            const projected = projectContextualInteractions(state, opportunity, target);
            setSelectedTarget(target);
            setMenuPosition({
              x: event.clientX - event.currentTarget.getBoundingClientRect().left,
              y: event.clientY - event.currentTarget.getBoundingClientRect().top,
            });
            uiEvent('interaction_target_selected', { target });
            if (projected.length)
              uiEvent('context_menu_opened', {
                target,
                interactionIds: projected.map((item) => item.id),
              });
          }}
        >
          <PitchCanvasHost ref={hostRef} />
          {opportunity && (
            <div className="interaction-hint">Wybierz piłkę, piłkarza, przestrzeń lub bramkę</div>
          )}
          {opportunity && menuPosition && interactions.length > 0 && (
            <section
              className="context-menu"
              style={{ left: menuPosition.x, top: menuPosition.y }}
              aria-label="Dostępne zagrania"
              onClick={(event) => event.stopPropagation()}
            >
              {interactions.slice(0, 5).map((interaction) => (
                <button
                  key={interaction.id}
                  onClick={() => {
                    uiEvent('player_interaction_selected', {
                      target: selectedTarget,
                      interactionId: interaction.id,
                    });
                    closeOpportunity(
                      applyContextualInteraction(state, opportunity, interaction),
                      'player',
                      interaction,
                    );
                  }}
                >
                  {interactionLabel(interaction)}
                </button>
              ))}
            </section>
          )}
        </div>
        <aside className="decision-board">
          <small>STAN KANONICZNY</small>
          {controlledSummary && (
            <p>
              <strong>Twój występ</strong>
              <br />
              Minuty {controlledSummary.minutesPlayed.toFixed(0)} · Kontakty{' '}
              {controlledSummary.touches}
              <br />
              Podania {controlledSummary.passesCompleted}/{controlledSummary.passesAttempted} ·
              Strzały {controlledSummary.shots} · Gole {controlledSummary.goals}
              <br />
              Odbiory {controlledSummary.tacklesWon}/{controlledSummary.tacklesAttempted} ·
              Przechwyty {controlledSummary.interceptions}
              <br />
              Dystans {(controlledSummary.distanceCovered / 1000).toFixed(1)} km · Sprinty{' '}
              {controlledSummary.sprintBursts}
            </p>
          )}
          {rendererError && (
            <strong>
              {rendererError}{' '}
              <button onClick={() => rendererRef.current?.recover()}>Odtwórz renderer</button>
            </strong>
          )}
          {opportunity && opportunity.kind === 'on_ball' && (
            <button
              className="dev-ai-choice"
              onClick={() => closeOpportunity(letAiDecide(state, opportunity), 'ai', 'npc_choice')}
            >
              DEV: wykonaj wybór AI
            </button>
          )}
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
            Ostatnia decyzja:{' '}
            {state.lastPlayerDecisionOutcome?.selectedIntent ??
              state.pendingPlayerDecision?.selectedIntent ??
              '—'}
            {' · '}
            {state.lastPlayerDecisionOutcome?.result?.kind ??
              (state.pendingPlayerDecision ? 'w toku' : '—')}
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
            <summary>Benchmark pozycyjny (DEV)</summary>
            {shapeMetrics.map(([side, metric]) => (
              <div key={side}>
                <strong>{side === 'home' ? 'Gospodarze' : 'Goście'}</strong>: środek{' '}
                {metric.centroid.x.toFixed(1)}, {metric.centroid.y.toFixed(1)} · długość{' '}
                {metric.length.toFixed(1)} m · szerokość {metric.width.toFixed(1)} m · rozciągnięcie{' '}
                {metric.stretchIndex.toFixed(1)} m · pole {metric.convexHullArea.toFixed(0)} m² ·
                przed/za piłką {metric.playersAheadOfBall}/{metric.playersBehindBall} · linie
                DEF–MID {metric.lines.defenceToMidfield.toFixed(1)} m, MID–ATT{' '}
                {metric.lines.midfieldToAttack.toFixed(1)} m · zabezpieczenie{' '}
                {metric.restDefenceCount} · pasy{' '}
                {Object.values(metric.lanes)
                  .slice(0, 5)
                  .map((value) => (value ? '✓' : '—'))
                  .join(' ')}
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
