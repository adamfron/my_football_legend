import { PresentationContextHistory } from './tacticalRenderer/contextHistory';
import { PresentationFrameProjector } from './tacticalRenderer/frameProjection';
import { projectSprintEpisode } from '../../core/matchSimulation/locomotion';
import { getPlayerOverall } from '../../core/playerOverall';
import {
  runAttributeMicroLab,
  type AttributeMicroLabResult,
} from '../../core/matchSimulation/attributeMicroLab';
import {
  projectFormationConnectivity,
  PressureSupportTracker,
} from '../../core/matchSimulation/footballIntelligenceDiagnostics';
import {
  isDevObservationMode,
  PerformanceProfiler,
  performanceObserverModeSchema,
  withPerformanceProfiler,
  startPerformanceSpan,
  endPerformanceSpan,
  type PerformanceObserverMode,
} from '../../core/matchSimulation/performanceProfiling';
import {
  BACKGROUND_PUBLICATION_INTERVAL_MS,
  createBackgroundUiPerformance,
  shouldPublishBackgroundState,
  type ObserverCoverageInterval,
} from './backgroundPublication';
import { formatDiagnosticMatchTime, formatMatchTime } from './matchTime';
import { createSessionTelemetryReport } from './matchBenchmarkReport';
import {
  CanonicalParticipationTracker,
  projectCanonicalMatchSanity,
} from '../../core/matchSimulation/canonicalMatchSanity';
import {
  appendReplayFrame,
  sampleReplayFrame,
  replaySnapshotToFrame,
} from './tacticalRenderer/replay';
import { MatchReplayHistory } from '../../core/matchSimulation/matchReplay';
/* eslint-disable react-hooks/refs, react-hooks/immutability -- Match Lab's imperative renderer and
   diagnostic recorders are observer-only refs intentionally kept outside React state. */
import {
  Component,
  forwardRef,
  useCallback,
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
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
  deriveTeamShapeMetrics,
  evaluateMatchSituation,
  projectPlayerAgency,
  PlayerAgencyTracker,
  createContextLeadIn,
  advanceContextLeadIn,
  isDecisionPresentationReady,
  requestedDecisionLeadIn,
  createConsequenceWindow,
  observeConsequenceWindow,
  isDangerousPresentationContext,
  appendMomentCandidate,
  isMomentEpisodeResolved,
  PRESENTATION_WINDOW_RULES,
  type MatchMomentEpisode,
  type PresentationWindowDiagnostic,
  type ConsequenceWindow,
  type ContextLeadIn,
  type MatchPresentationPhase,
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
  MATCH_PRESENTATION_POLICIES,
  projectMatchMoment,
  isInteractiveOutcomeWindowOpen,
  shouldSurfaceMatchMoment,
  createPresentationClock,
  advancePresentationClock,
  createPresentationRuntimeTelemetry,
  type PresentationDecisionDiagnostic,
  type MatchPresentationPolicy,
  BackgroundPerformanceTracker,
  nextAdaptiveBatchSize,
} from '../../core/matchSimulation';
import { loadWorldDatabase } from '../../core/worldDatabase';
import { positionCode } from '../../core/positionPresentation';
import type { WorldDatabase } from '../../types/domain';
import { projectMatchKits } from './tacticalRenderer/kits';
import { TacticalPitchRenderer } from './tacticalRenderer/TacticalPitchRenderer';
import {
  accrueSimulationDebt,
  availableFixedTicks,
  consumeFixedTicks,
  createMatchRuntimeClock,
  pauseSimulationClock,
} from './matchRuntimeClock';
import {
  DEFAULT_MATCH_CAMERA_PREFERENCES,
  matchCameraPreferencesSchema,
  type MatchCameraPreferences,
  type ShotAimIntent,
  shotAimIntentToGoalPoint,
} from './tacticalRenderer/model';
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
import { MatchCentre } from './MatchCentre';
import {
  groupContextualInteractions,
  projectRestartDecisionInteractions,
} from '../../core/matchSimulation/contextualInteractions';
import { distance } from '../../core/matchSimulation/matchSpace';
import { enumerateFreeKickStrikeProfiles } from '../../core/matchSimulation/shootingOptions';
import {
  MatchLabDiagnosticsController,
  runtimeErrorFromEvent,
  runtimeErrorFromRejection,
  findNonFiniteDiagnosticValue,
} from './matchLabDiagnostics';

const freshSeed = () => `lab-${Date.now().toString(36)}`;
const MATCH_LAB_CAMERA_KEY = 'mfl.matchLab.camera.v1';
const loadCameraPreferences = (): MatchCameraPreferences => {
  try {
    return matchCameraPreferencesSchema.parse(
      JSON.parse(localStorage.getItem(MATCH_LAB_CAMERA_KEY) ?? 'null'),
    );
  } catch {
    return DEFAULT_MATCH_CAMERA_PREFERENCES;
  }
};
type RenderFrame = import('./tacticalRenderer/model').TacticalFrame;
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
            <span className="dev-badge">SINGLE MATCH LAB · USTAWIENIA</span>
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
      squadOveralls={
        Object.fromEntries(
          (['home', 'away'] as const).map((side) => {
            const profiles = (session[side].club.squadPlayerIds ?? [])
              .map((id) => world.footballers[id]?.profile)
              .filter((p): p is NonNullable<typeof p> => Boolean(p));
            return [
              side,
              profiles.reduce((sum, p) => sum + getPlayerOverall(p, p.primaryPosition), 0) /
                Math.max(1, profiles.length),
            ];
          }),
        ) as { home: number; away: number }
      }
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
        <p>
          Czas kanoniczny:{' '}
          {import.meta.env.DEV
            ? formatDiagnosticMatchTime(controller.latestState.time)
            : formatMatchTime(controller.latestState.time)}
        </p>
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
  squadOveralls?: { home: number; away: number };
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
    return new MatchLabDiagnosticsController(
      props.session,
      initial,
      createMatchFlowTelemetry(`${initial.seed}:segment:0`),
    );
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

export const RunningLab = ({
  session,
  onSetup,
  onRestart,
  onRandomize,
  diagnostics,
  squadOveralls,
}: {
  session: SingleMatchSession;
  onSetup(): void;
  onRestart(): void;
  onRandomize(): void;
  diagnostics: MatchLabDiagnosticsController;
  squadOveralls?: { home: number; away: number };
}) => {
  const kits = useMemo(() => projectMatchKits(session.home.club, session.away.club), [session]);
  const [attributeLab, setAttributeLab] = useState<AttributeMicroLabResult>();
  const [state, setState] = useState<TacticalMatchState>(() => diagnostics.latestState),
    [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(1),
    [presentationPolicyId, setPresentationPolicyId] =
      useState<MatchPresentationPolicy['id']>('full_match'),
    [presentationPhase, setPresentationPhase] = useState<MatchPresentationPhase>('full_match'),
    [displayTime, setDisplayTime] = useState(() => diagnostics.latestState.time),
    [debug, setDebug] = useState(false),
    [observerMode, setObserverMode] = useState<PerformanceObserverMode>('normal'),
    [videoEnabled, setVideoEnabled] = useState(false),
    [profilingEnabled, setProfilingEnabled] = useState(false),
    [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false),
    [performanceExpanded, setPerformanceExpanded] = useState(false),
    [geometryExpanded, setGeometryExpanded] = useState(false),
    [goalReplay, setGoalReplay] = useState<RenderFrame[]>([]),
    [captureStatus, setCaptureStatus] = useState<DebugCaptureStatus>('idle'),
    [saveMessage, setSaveMessage] = useState<string>(),
    [captureError, setCaptureError] = useState<string>(),
    [rendererError, setRendererError] = useState<string>(),
    [decisionBoundary, setDecisionBoundary] = useState<PlayerDecisionOpportunity>(),
    [selectedTarget, setSelectedTarget] = useState<PlayerInteractionTarget>(),
    [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>(),
    [shotAim, setShotAim] = useState<ShotAimIntent>(),
    [cameraPreferences, setCameraPreferences] = useState(loadCameraPreferences),
    [debugExport, setDebugExport] = useState<{
      trace: MatchDebugExport;
      video: Blob | undefined;
      basename: string;
    }>();
  const hostRef = useRef<HTMLDivElement>(null),
    rendererRef = useRef<TacticalPitchRenderer | undefined>(undefined),
    runtimeClockRef = useRef(createMatchRuntimeClock(0)),
    replayBufferRef = useRef<RenderFrame[]>([]),
    matchReplayRef = useRef(new MatchReplayHistory()),
    replayEpochRef = useRef(0),
    scoreRef = useRef(0),
    stateRef = useRef(state),
    rendererFaultRef = useRef(false),
    debugRecorderRef = useRef(diagnostics.recorder),
    videoRecorderRef = useRef(new ViewportVideoRecorder()),
    finishingRef = useRef(false);
  const replaying = presentationPhase === 'replay';
  const opportunity =
    presentationPhase === 'awaiting_player_decision' ? decisionBoundary : undefined;
  const contextHistoryRef = useRef(new PresentationContextHistory());
  const agencyTrackerRef = useRef(new PlayerAgencyTracker());
  const leadInRef = useRef<ContextLeadIn | undefined>(undefined);
  const leadInFramesRef = useRef<RenderFrame[]>([]);
  const consequenceRef = useRef<ConsequenceWindow | undefined>(undefined);
  const phaseBeforeReplayRef = useRef<MatchPresentationPhase>('full_match');
  const windowDiagnosticsRef = useRef<PresentationWindowDiagnostic[]>([]);
  const windowEvent = useCallback(
    (event: PresentationWindowDiagnostic) => {
      if (!isDevObservationMode(observerMode)) return;
      windowDiagnosticsRef.current = [...windowDiagnosticsRef.current, event].slice(-64);
    },
    [observerMode],
  );
  const finishReplay = () => setPresentationPhase(phaseBeforeReplayRef.current);
  const animationProjectorRef = useRef(new PresentationFrameProjector());
  // React may evaluate an updater twice. Only consume samples belonging to its committed result.
  const presentationSamplesRef = useRef(new WeakMap<TacticalMatchState, TacticalMatchState[]>());
  const presentationClockRef = useRef(createPresentationClock(state.time));
  const presentationTelemetryRef = useRef(createPresentationRuntimeTelemetry());
  const canonicalParticipationRef = useRef(new CanonicalParticipationTracker());
  const backgroundPerformanceRef = useRef(new BackgroundPerformanceTracker());
  const profilerRef = useRef(new PerformanceProfiler());
  const profiledTicksRef = useRef(0);
  const publishedStateRef = useRef(state);
  const lastPublicationAtRef = useRef(0);
  const decisionDetectedAtRef = useRef<number | undefined>(undefined);
  const uiPerformanceRef = useRef(createBackgroundUiPerformance());
  const backgroundBatchTicksRef = useRef(80);
  const presentationDecisionsRef = useRef<PresentationDecisionDiagnostic[]>([]);
  const visibleEpisodeRef = useRef<MatchMomentEpisode | undefined>(undefined);
  const presentationPolicy = MATCH_PRESENTATION_POLICIES[presentationPolicyId];
  const presentationPolicyRef = useRef(presentationPolicy);
  presentationPolicyRef.current = presentationPolicy;
  const backgroundPerformance =
    diagnosticsExpanded && performanceExpanded
      ? backgroundPerformanceRef.current.snapshot(
          presentationTelemetryRef.current.rendererCallsBackground,
        )
      : undefined;
  const performanceProfile =
    diagnosticsExpanded && performanceExpanded ? profilerRef.current.snapshot() : undefined;
  const telemetryRef = useRef(diagnostics.telemetry);
  const pressureSupportRef = useRef(new PressureSupportTracker());
  const positioningSamplesRef = useRef<PositioningSample[]>(diagnostics.positioningSamples);
  const observerModeRef = useRef(observerMode);
  const observerCoverageRef = useRef<ObserverCoverageInterval[]>([]);
  const presentationPhaseRef = useRef(presentationPhase);
  observerModeRef.current = observerMode;
  presentationPhaseRef.current = presentationPhase;
  const devObservation = isDevObservationMode(observerMode);
  const measuredPosition = [...session.home.players, ...session.away.players].find(
    (player) => player.footballerId === state.controlledFootballerId,
  )?.profile.primaryPosition;
  const participationDiagnostic = geometryExpanded
    ? projectCanonicalMatchSanity(
        state,
        presentationTelemetryRef.current,
        canonicalParticipationRef.current.snapshot(),
        undefined,
        measuredPosition,
      )
    : null;
  const agencyDiagnostic = geometryExpanded
    ? agencyTrackerRef.current.snapshot(state.time, state)
    : null;
  const resetPresentation = useCallback((next: TacticalMatchState) => {
    replayEpochRef.current++;
    const phase = presentationPolicyRef.current.fullMatch ? 'full_match' : 'background_simulation';
    if (phase === 'background_simulation') canonicalParticipationRef.current.beginHiddenSequence();
    setPresentationPhase(phase);
    presentationPhaseRef.current = phase;
    phaseBeforeReplayRef.current = phase;
    setDecisionBoundary(undefined);
    decisionDetectedAtRef.current = undefined;
    setShotAim(undefined);
    setSelectedTarget(undefined);
    setMenuPosition(undefined);
    setGoalReplay([]);
    matchReplayRef.current = new MatchReplayHistory();
    replayBufferRef.current = [];
    scoreRef.current = next.score.home + next.score.away;
    leadInRef.current = undefined;
    leadInFramesRef.current = [];
    consequenceRef.current = undefined;
    visibleEpisodeRef.current = undefined;
    presentationSamplesRef.current = new WeakMap();
    presentationClockRef.current = createPresentationClock(next.time);
    setDisplayTime(next.time);
    animationProjectorRef.current.reset();
    contextHistoryRef.current = new PresentationContextHistory();
    contextHistoryRef.current.observe(next, true);
    agencyTrackerRef.current = new PlayerAgencyTracker();
  }, []);
  const publishState = useCallback(
    (next: TacticalMatchState) => {
      try {
        matchReplayRef.current.observe(next);
      } catch (error) {
        diagnostics.report('observer_error', error, { module: 'MatchReplayHistory.observe' });
      }
      stateRef.current = next;
      diagnostics.latestState = next;
      publishedStateRef.current = next;
      lastPublicationAtRef.current = performance.now();
      setState(next);
    },
    [diagnostics],
  );
  useEffect(() => {
    if (!hostRef.current) return;
    const initial = createTacticalMatch(session);
    resetPresentation(initial);
    backgroundPerformanceRef.current = new BackgroundPerformanceTracker();
    presentationTelemetryRef.current = createPresentationRuntimeTelemetry();
    canonicalParticipationRef.current = new CanonicalParticipationTracker();
    publishState(initial);
    profilerRef.current = new PerformanceProfiler();
    profiledTicksRef.current = 0;
    uiPerformanceRef.current = createBackgroundUiPerformance();
    observerCoverageRef.current = [{ mode: observerModeRef.current, startedAt: initial.time }];
    windowDiagnosticsRef.current = [];
    replayBufferRef.current = [animationProjectorRef.current.frame(initial)];
    debugRecorderRef.current.clear();
    try {
      if (observerModeRef.current === 'capture') debugRecorderRef.current.record(initial);
    } catch (error) {
      diagnostics.report('observer_error', error, { module: 'MatchDebugRecorder.record' });
    }
    telemetryRef.current = createMatchFlowTelemetry(`${initial.seed}:segment:0`);
    pressureSupportRef.current = new PressureSupportTracker();
    diagnostics.telemetry = telemetryRef.current;
    try {
      positioningSamplesRef.current = isDevObservationMode(observerModeRef.current)
        ? [sampleCanonicalPositioning(initial)]
        : [];
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
    setDecisionBoundary(undefined);
    setSelectedTarget(undefined);
    setShotAim(undefined);
    runtimeClockRef.current = createMatchRuntimeClock(performance.now());
    presentationClockRef.current = createPresentationClock(initial.time);
    setDisplayTime(initial.time);
    const renderer = new TacticalPitchRenderer(
      hostRef.current,
      animationProjectorRef.current.frame(initial),
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
      kits,
      setCameraPreferences,
    );
    const videoRecorder = videoRecorderRef.current;
    rendererRef.current = renderer;
    diagnostics.setRendererLifecycle(renderer.lifecycle);
    return () => {
      renderer.dispose();
      videoRecorder.dispose();
    };
  }, [session, diagnostics, kits, publishState, resetPresentation]);
  useEffect(() => {
    const last = observerCoverageRef.current.at(-1);
    if (!last || last.mode !== observerMode) {
      if (last) last.endedAt = stateRef.current.time;
      observerCoverageRef.current.push({ mode: observerMode, startedAt: stateRef.current.time });
    }
    if (observerMode === 'capture') debugRecorderRef.current.record(stateRef.current);
    else debugRecorderRef.current.clear();
  }, [observerMode, session]);
  useEffect(() => {
    profilerRef.current = new PerformanceProfiler({ enabled: profilingEnabled });
    profiledTicksRef.current = 0;
  }, [profilingEnabled, session]);
  useEffect(() => {
    const recorder = videoRecorderRef.current;
    const renderer = rendererRef.current;
    if (videoEnabled && observerMode === 'capture' && renderer)
      recorder.start(
        renderer.getCanvas(),
        () => stateRef.current.time,
        () => presentationPhaseRef.current !== 'background_simulation',
      );
    else recorder.dispose();
    return () => recorder.dispose();
  }, [session, videoEnabled, observerMode]);
  useEffect(() => {
    if (decisionBoundary && decisionDetectedAtRef.current !== undefined) {
      const elapsedMs = performance.now() - decisionDetectedAtRef.current;
      uiPerformanceRef.current.decisionCommitSamples++;
      uiPerformanceRef.current.maximumDecisionCommitMs = Math.max(
        uiPerformanceRef.current.maximumDecisionCommitMs,
        elapsedMs,
      );
      decisionDetectedAtRef.current = undefined;
    }
  }, [decisionBoundary]);
  useEffect(() => {
    let timer = 0;
    runtimeClockRef.current = decisionBoundary
      ? pauseSimulationClock(runtimeClockRef.current, performance.now())
      : createMatchRuntimeClock(performance.now());
    if (playing && !replaying && !decisionBoundary && presentationPhase !== 'lead_in') {
      let scheduledAt = performance.now();
      const advance = () => {
        const background =
          !presentationPolicy.fullMatch && presentationPhase === 'background_simulation';
        if (background)
          uiPerformanceRef.current.backgroundSchedulingWaitMs += performance.now() - scheduledAt;
        runtimeClockRef.current = accrueSimulationDebt(
          runtimeClockRef.current,
          performance.now(),
          speed,
        );
        // Bound each task so a background catch-up yields to input and rendering. Debt is retained.
        const ticks = background
          ? backgroundBatchTicksRef.current
          : Math.min(160, availableFixedTicks(runtimeClockRef.current));
        if (ticks > 0) {
          if (!background)
            runtimeClockRef.current = consumeFixedTicks(runtimeClockRef.current, ticks);
          {
            const value = stateRef.current;
            const batchStartedAt = background ? performance.now() : 0;
            let executedTicks = 0;
            let next = value;
            let boundaryDetected = false;
            const presentationSamples: TacticalMatchState[] = [];
            withPerformanceProfiler(profilerRef.current, () => {
              for (let tick = 0; tick < ticks; tick += 1) {
                if (
                  next.status === 'half_time' ||
                  next.status === 'full_time' ||
                  next.status === 'abandoned'
                )
                  break;
                diagnostics.latestState = next;
                profilerRef.current.beginTick(profiledTicksRef.current++);
                const agencyStarted = startPerformanceSpan('agency_projection');
                const agency = projectPlayerAgency(next);
                endPerformanceSpan('agency_projection', agencyStarted);
                const agencyEntry = devObservation
                  ? agencyTrackerRef.current.observe(next, agency)
                  : undefined;
                if (agencyEntry)
                  windowEvent({
                    ...agencyEntry,
                    type: 'agency_evaluated',
                    policyId: presentationPolicy.id,
                    footageHidden: background,
                    hiddenReason: background ? 'presentation_policy' : undefined,
                  });
                const projected = agency.opportunity;
                if (projected) {
                  boundaryDetected = true;
                  decisionDetectedAtRef.current = performance.now();
                  const candidate = projectMatchMoment(next, projected);
                  setDecisionBoundary(projected);
                  presentationTelemetryRef.current.humanDecisionPromptsShown += 1;
                  canonicalParticipationRef.current.markVisiblePlayerInvolvement();
                  if (devObservation) {
                    const diagnostic: PresentationDecisionDiagnostic = {
                      at: next.time,
                      opportunityKind: projected.kind,
                      controlledPlayerId: projected.actorId,
                      situation: projected.situation.kind,
                      importance: candidate.importance,
                      semanticChoiceCount: agency.probe.semanticChoiceCount ?? 0,
                      policyId: presentationPolicy.id,
                      threshold: presentationPolicy.minimumPlayerDecisionImportance,
                      result: 'surfaced',
                      reason: 'human_decision:canonical_meaningful_alternatives',
                    };
                    presentationDecisionsRef.current = [
                      ...presentationDecisionsRef.current,
                      diagnostic,
                    ].slice(-64);
                  }
                  if (consequenceRef.current) {
                    windowEvent({
                      at: next.time,
                      type: 'consequence_ended',
                      reason: 'new_meaningful_decision',
                      merged: isDangerousPresentationContext(next),
                    });
                    consequenceRef.current = undefined;
                  }
                  contextHistoryRef.current.observe(next, true);
                  if (background) {
                    // Count the sequence on its hidden-to-visible entry. Later choices in the
                    // same live sequence increase prompts, never presentation density.
                    presentationTelemetryRef.current.episodesStarted += 1;
                    presentationTelemetryRef.current.episodesPresented += 1;
                    const requested = requestedDecisionLeadIn(next, projected);
                    const frames = contextHistoryRef.current.leadIn(next.time, requested);
                    leadInFramesRef.current = frames;
                    const lead = createContextLeadIn(
                      next.time,
                      requested,
                      (frames[0]?.timestampMs ?? next.time * 1000) / 1000,
                    );
                    leadInRef.current = lead;
                    presentationClockRef.current = createPresentationClock(lead.displayTime);
                    setDisplayTime(lead.displayTime);
                    presentationTelemetryRef.current.episodeLeadIns += 1;
                    windowEvent({
                      at: next.time,
                      type: 'decision_lead_in',
                      policyId: presentationPolicy.id,
                      requestedSeconds: lead.requestedSeconds,
                      availableSeconds: lead.availableSeconds,
                    });
                    setPresentationPhase(
                      isDecisionPresentationReady(lead) ? 'awaiting_player_decision' : 'lead_in',
                    );
                  } else {
                    presentationClockRef.current = createPresentationClock(next.time);
                    setDisplayTime(next.time);
                    setPresentationPhase('awaiting_player_decision');
                  }
                  if (devObservation)
                    recordDecisionOpportunity(
                      telemetryRef.current,
                      projected.kind,
                      projected.triggerReason.includes('autopilot_escalation'),
                    );
                  if (observerMode === 'capture')
                    debugRecorderRef.current.ui(next.time, 'player_decision_opened', projected);
                  break;
                }
                if (consequenceRef.current) {
                  const result = observeConsequenceWindow(consequenceRef.current, next);
                  if (result.merged && !consequenceRef.current.outcomeAt)
                    windowEvent({
                      at: next.time,
                      type: 'episode_merged',
                      reason: 'connected_danger_after_outcome',
                    });
                  consequenceRef.current = result.window;
                  if (result.endReason) {
                    if (!presentationPolicy.fullMatch)
                      canonicalParticipationRef.current.beginHiddenSequence();
                    boundaryDetected = true;
                    windowEvent({
                      at: next.time,
                      type: 'consequence_ended',
                      reason: result.endReason,
                    });
                    consequenceRef.current = undefined;
                    setPresentationPhase(
                      presentationPolicy.fullMatch ? 'full_match' : 'background_simulation',
                    );
                    break;
                  }
                }
                if (background) {
                  const momentStarted = startPerformanceSpan('match_moment');
                  const candidate = projectMatchMoment(next, agency.opportunity ?? null);
                  endPerformanceSpan('match_moment', momentStarted);
                  presentationTelemetryRef.current.projectedCandidates += 1;
                  if (
                    candidate.kind !== 'routine' &&
                    shouldSurfaceMatchMoment(candidate, presentationPolicy)
                  ) {
                    presentationTelemetryRef.current.qualifyingCandidates += 1;
                    presentationTelemetryRef.current.episodesStarted += 1;
                    presentationTelemetryRef.current.episodesPresented += 1;
                    visibleEpisodeRef.current = appendMomentCandidate(undefined, candidate);
                    if (candidate.controlledPlayerInvolved)
                      canonicalParticipationRef.current.markVisiblePlayerInvolvement();
                    boundaryDetected = true;
                    windowEvent({
                      at: next.time,
                      type: 'non_interactive_episode_started',
                      reason: candidate.kind,
                    });
                    setPresentationPhase('presenting_live_moment');
                    if (observerMode === 'capture')
                      debugRecorderRef.current.ui(next.time, 'match_moment_surfaced', candidate);
                    break;
                  }
                } else if (
                  !presentationPolicy.fullMatch &&
                  presentationPhase === 'presenting_live_moment' &&
                  visibleEpisodeRef.current
                ) {
                  const momentStarted = startPerformanceSpan('match_moment');
                  const candidate = projectMatchMoment(next, agency.opportunity ?? null);
                  endPerformanceSpan('match_moment', momentStarted);
                  const episode = visibleEpisodeRef.current;
                  if (candidate.controlledPlayerInvolved)
                    canonicalParticipationRef.current.markVisiblePlayerInvolvement();
                  const bounded =
                    next.time - episode.startedAt >=
                    PRESENTATION_WINDOW_RULES.maximumEpisodeSeconds;
                  if (
                    !isInteractiveOutcomeWindowOpen(next) &&
                    (bounded || isMomentEpisodeResolved(episode, candidate, next.time))
                  ) {
                    boundaryDetected = true;
                    windowEvent({
                      at: next.time,
                      type: 'non_interactive_episode_ended',
                      reason: bounded ? 'episode_safety_bound' : 'quiet_context',
                    });
                    visibleEpisodeRef.current = undefined;
                    canonicalParticipationRef.current.beginHiddenSequence();
                    setPresentationPhase('background_simulation');
                    break;
                  }
                  if (
                    candidate.kind !== 'routine' &&
                    candidate.kind !== episode.candidates.at(-1)?.kind
                  ) {
                    visibleEpisodeRef.current = appendMomentCandidate(episode, candidate);
                    windowEvent({ at: next.time, type: 'episode_merged', reason: candidate.kind });
                  } else if (candidate.kind !== 'routine') {
                    visibleEpisodeRef.current = { ...episode, lastMeaningfulAt: next.time };
                  }
                }
                const previousState = next;
                try {
                  const canonicalStarted = startPerformanceSpan('canonical_step');
                  next = background
                    ? stepTacticalMatchAfterDecisionProbe(next, FIXED_MATCH_DT)
                    : stepTacticalMatch(next, FIXED_MATCH_DT);
                  endPerformanceSpan('canonical_step', canonicalStarted);
                  diagnostics.latestState = next;
                  canonicalParticipationRef.current.observe(previousState, next, background);
                  executedTicks += 1;
                  if (background)
                    presentationTelemetryRef.current.hiddenCanonicalSeconds += FIXED_MATCH_DT;
                  else presentationTelemetryRef.current.visibleCanonicalSeconds += FIXED_MATCH_DT;
                } catch (error) {
                  boundaryDetected = true;
                  stateRef.current = next;
                  diagnostics.latestState = next;
                  diagnostics.freezeFatal('canonical_error', error, {
                    module: 'stepTacticalMatch',
                  });
                  break;
                }
                try {
                  matchReplayRef.current.observe(next);
                } catch (error) {
                  diagnostics.report('observer_error', error, {
                    module: 'MatchReplayHistory.observe',
                  });
                }
                try {
                  const contextStarted = startPerformanceSpan('context_history');
                  contextHistoryRef.current.observe(next);
                  endPerformanceSpan('context_history', contextStarted);
                  if (!background) presentationSamples.push(next);
                  if (devObservation) {
                    const flowStarted = startPerformanceSpan('match_flow');
                    telemetryRef.current = observeMatchFlow(
                      telemetryRef.current,
                      previousState,
                      next,
                    );
                    pressureSupportRef.current.observe(previousState, next);
                    endPerformanceSpan('match_flow', flowStarted);
                    diagnostics.telemetry = telemetryRef.current;
                  }
                } catch (error) {
                  diagnostics.report('observer_error', error, { module: 'observeMatchFlow' });
                }
                if (
                  devObservation &&
                  next.latestAction &&
                  next.latestAction.actorId === next.controlledFootballerId &&
                  (next.latestAction !== previousState.latestAction ||
                    next.decisionIndex !== previousState.decisionIndex)
                )
                  recordDecisionSelection(telemetryRef.current, 'autonomous');
                const lastPositioning = positioningSamplesRef.current.at(-1);
                if (
                  devObservation &&
                  (!lastPositioning || next.time - lastPositioning.time >= 1 - FIXED_MATCH_DT / 2)
                ) {
                  try {
                    const sample = sampleCanonicalPositioning(next);
                    const invalid = findNonFiniteDiagnosticValue(sample);
                    if (invalid)
                      throw new Error(
                        `Próbka zawiera wartość niefinitywną: ${invalid.path}=${invalid.value}.`,
                      );
                    positioningSamplesRef.current.push(sample);
                    if (positioningSamplesRef.current.length > 6000)
                      positioningSamplesRef.current.shift();
                  } catch (error) {
                    diagnostics.report('observer_error', error, {
                      module: 'sampleCanonicalPositioning',
                      values: { time: next.time },
                    });
                  }
                }
                let complete = false;
                try {
                  const captureStarted = startPerformanceSpan('debug_capture');
                  if (observerMode === 'capture') complete = debugRecorderRef.current.record(next);
                  endPerformanceSpan('debug_capture', captureStarted);
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
                        setCaptureStatus(video || !videoEnabled ? 'ready' : 'error');
                        if (!video && videoEnabled) setCaptureError('enkoder nie zwrócił pliku');
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
            });
            if (background) {
              presentationTelemetryRef.current.backgroundBatches += 1;
              presentationTelemetryRef.current.backgroundTicks += executedTicks;
              const elapsedMs = performance.now() - batchStartedAt;
              backgroundPerformanceRef.current.record(
                elapsedMs,
                executedTicks * FIXED_MATCH_DT,
                executedTicks,
              );
              backgroundBatchTicksRef.current = nextAdaptiveBatchSize(ticks, elapsedMs);
            }
            if (presentationSamples.length)
              presentationSamplesRef.current.set(next, presentationSamples);
            stateRef.current = next;
            diagnostics.latestState = next;
            if (
              !background ||
              shouldPublishBackgroundState(
                publishedStateRef.current,
                next,
                performance.now() - lastPublicationAtRef.current,
                boundaryDetected || Boolean(diagnostics.crashPackage),
              )
            ) {
              if (background) uiPerformanceRef.current.backgroundPublications++;
              publishState(next);
            }
          }
        }
        if (
          stateRef.current.status === 'half_time' ||
          stateRef.current.status === 'full_time' ||
          stateRef.current.status === 'abandoned' ||
          diagnostics.crashPackage
        )
          return;
        scheduledAt = performance.now();
        timer = window.setTimeout(
          advance,
          background || availableFixedTicks(runtimeClockRef.current) ? 0 : 16,
        );
      };
      timer = window.setTimeout(advance, 0);
    }
    return () => window.clearTimeout(timer);
  }, [
    playing,
    replaying,
    session,
    speed,
    state.seed,
    state.status,
    decisionBoundary,
    diagnostics,
    presentationPolicy,
    presentationPhase,
    observerMode,
    devObservation,
    videoEnabled,
    publishState,
    windowEvent,
  ]);
  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let lastHiddenDisplayAt = previous;
    const animate = (now: number) => {
      const elapsed = Math.max(0, (now - previous) / 1000);
      previous = now;
      if (presentationPhase === 'lead_in' && leadInRef.current) {
        const lead = advanceContextLeadIn(leadInRef.current, playing ? elapsed : 0);
        leadInRef.current = lead;
        const historical = sampleReplayFrame(leadInFramesRef.current, lead.displayTime * 1000);
        if (historical) {
          rendererRef.current?.render(historical, debug);
          presentationTelemetryRef.current.rendererCallsVisible += 1;
        }
        setDisplayTime(lead.displayTime);
        if (isDecisionPresentationReady(lead)) {
          presentationClockRef.current = createPresentationClock(lead.boundaryTime);
          setPresentationPhase('awaiting_player_decision');
        }
      } else if (!replaying) {
        presentationClockRef.current = advancePresentationClock(
          presentationClockRef.current,
          stateRef.current.time,
          elapsed,
          !playing || presentationPhase === 'awaiting_player_decision',
        );
        const hidden =
          !presentationPolicy.fullMatch && presentationPhase === 'background_simulation';
        if (!hidden || now - lastHiddenDisplayAt >= BACKGROUND_PUBLICATION_INTERVAL_MS) {
          setDisplayTime(presentationClockRef.current.displayTime);
          if (hidden) lastHiddenDisplayAt = now;
        }
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [playing, presentationPhase, replaying, debug, presentationPolicy.fullMatch]);
  useEffect(() => {
    const hidden = !presentationPolicy.fullMatch && presentationPhase === 'background_simulation';
    if (replaying || hidden || presentationPhase === 'lead_in') return;
    const samples = presentationSamplesRef.current.get(state);
    if (samples) {
      for (const sample of samples)
        appendReplayFrame(replayBufferRef.current, animationProjectorRef.current.frame(sample));
      presentationSamplesRef.current.delete(state);
    }
    const baseFrame = animationProjectorRef.current.frame(state, { includeAiCarryTarget: debug });
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
      showMotionVectors: Boolean(opportunity),
      ...(opportunity?.kind === 'defensive_response'
        ? {
            interceptionTarget:
              interceptionOption?.kind === 'movement'
                ? interceptionOption.intent.target
                : undefined,
          }
        : {}),
      ...(selectedTarget?.kind === 'player' ? { selectedTarget: selectedTarget.playerId } : {}),
      ...(selectedTarget?.kind === 'space' || selectedTarget?.kind === 'ball'
        ? { selectedPoint: selectedTarget.point }
        : {}),
      ...(state.ballCarrierIntent?.humanSelected &&
      state.ballCarrierIntent.actorId === state.controlledFootballerId
        ? { carryTarget: state.ballCarrierIntent.target }
        : {}),
    };
    rendererRef.current?.render(frame, debug);
    presentationTelemetryRef.current.rendererCallsVisible += 1;
    const frames = replayBufferRef.current;
    appendReplayFrame(frames, frame);
    const score = state.score.home + state.score.away;
    if (score > scoreRef.current) setGoalReplay([...frames]);
    scoreRef.current = score;
  }, [state, debug, replaying, opportunity, selectedTarget, presentationPhase, presentationPolicy]);
  const shotAimActive = Boolean(shotAim);
  const shotAimTeam = state.players.find((player) => player.id === opportunity?.actorId)?.team;
  useEffect(() => {
    rendererRef.current?.setCameraMode(
      replaying ? 'goal_replay' : shotAimActive ? 'shot_aim' : 'tactical',
      shotAimActive ? opportunity?.actorId : state.controlledFootballerId,
      shotAimTeam,
    );
  }, [replaying, shotAimActive, opportunity?.actorId, shotAimTeam, state.controlledFootballerId]);
  useEffect(() => {
    if (shotAim) rendererRef.current?.setGoalAimMarker(shotAim);
  }, [shotAim]);
  useEffect(() => {
    localStorage.setItem(MATCH_LAB_CAMERA_KEY, JSON.stringify(cameraPreferences));
    rendererRef.current?.setCameraPreferences(cameraPreferences, state.controlledFootballerId);
  }, [cameraPreferences, state.controlledFootballerId]);
  useEffect(() => {
    if (!replaying || goalReplay.length === 0) return;
    const started = performance.now(),
      firstTimestamp = goalReplay[0]!.timestampMs;
    let animation = 0;
    let active = true;
    const replayEpoch = replayEpochRef.current;
    const play = (now: number) => {
      // A reset invalidates callbacks immediately, before React cleans up the old RAF effect.
      if (!active || replayEpoch !== replayEpochRef.current) return;
      const replayTimestamp = firstTimestamp + (now - started) * 0.5;
      const frame = sampleReplayFrame(goalReplay, replayTimestamp);
      if (frame) {
        rendererRef.current?.render(frame, debug);
        setDisplayTime(frame.timestampMs / 1000);
      }
      if (replayTimestamp < goalReplay.at(-1)!.timestampMs) animation = requestAnimationFrame(play);
      else finishReplay();
    };
    animation = requestAnimationFrame(play);
    return () => {
      active = false;
      cancelAnimationFrame(animation);
    };
  }, [replaying, goalReplay, debug]);
  const owner = state.players.find((p) => p.id === state.ball.ownerId),
    actor = state.players.find((p) => p.id === state.currentActorId),
    controlledActor = state.players.find((p) => p.id === state.controlledFootballerId),
    situation = geometryExpanded
      ? evaluateMatchSituation(state, owner?.id ?? state.controlledFootballerId)
      : undefined,
    shapeMetrics = geometryExpanded
      ? (['home', 'away'] as const).map(
          (side) => [side, deriveTeamShapeMetrics(state, side)] as const,
        )
      : [];
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
      lead_pass: 'Podaj na dobieg',
      lofted_pass: 'Zagraj górą',
      progressive_pass: 'Podanie progresywne',
      pass_into_space: 'Zagraj przed niego',
      cross: 'Dośrodkuj',
      floated_cross: 'Dośrodkuj górą',
      driven_cross: 'Dośrodkuj mocno',
      cutback_cross: 'Wycofaj przed pole karne',
      free_kick_power_bend: 'Mocny strzał z rotacją',
      free_kick_controlled_curl: 'Podkręcony strzał techniczny',
      free_kick_dipping: 'Strzał opadający',
      free_kick_under_wall: 'Nisko pod murem',
      free_kick_wall_gap: 'Przez lukę w murze',
      hold_ball: 'Osłoń / utrzymaj piłkę',
      carry_here: 'Prowadź tutaj',
      sprint_here: 'Sprintem tutaj',
      dribble_here: 'Drybluj w tym kierunku',
      retain_here: 'Utrzymaj piłkę',
      play_here: 'Zagraj tutaj',
      first_time_pass: 'Podaj z pierwszej piłki',
      placed_shot: 'Strzał techniczny',
      driven_shot: 'Strzał mocny',
      chip_shot: 'Lob',
      first_time_driven: 'Z pierwszej · mocno',
      first_time_placed: 'Z pierwszej · technicznie',
      half_volley_driven: 'Półwolej · mocno',
      half_volley_placed: 'Półwolej · technicznie',
      volley_driven: 'Wolej · mocno',
      volley_placed: 'Wolej · technicznie',
      header_shot: 'Strzał głową',
      contain: 'Pilnuj / opóźniaj',
      close_down: 'Doskok',
      normal_challenge: 'Odbiór',
      standing_challenge: 'Odbiór',
      committed_challenge: 'Zdecydowany odbiór',
      slide_tackle: 'Wślizg',
      tactical_foul: 'Zatrzymaj atak',
      aggressive_challenge: 'Ostry odbiór',
      press: 'Pressuj',
      challenge: 'Odbierz',
      hold_line: 'Trzymaj linię',
      intercept: 'Wyjdź do przechwytu',
      control_ball: 'Przyjmij i osłoń',
      first_touch_into_space: 'Pierwszy kontakt w przestrzeń',
      attack_ball: 'Walcz o piłkę',
      move_here: 'Pokaż się tutaj',
      run_in_behind: 'Rusz za linię',
      keeper_stay: 'Zostań',
      keeper_stay_line: 'Zostań na linii',
      keeper_sweep: 'Wyjdź do piłki',
      keeper_claim_cross: 'Wyjdź do dośrodkowania',
      keeper_hold_position: 'Trzymaj pozycję',
      keeper_close_angle: 'Skróć kąt',
    })[interaction.labelKey] ?? interaction.labelKey;
  const interactionFamilyLabels = {
    shoot: 'Strzał',
    cross: 'Dośrodkowanie',
    pass: 'Podanie',
    short_routine: 'Krótkie rozegranie',
    movement: 'Ruch',
    defending: 'Obrona',
  };
  const restartGroups =
    opportunity?.kind === 'restart'
      ? groupContextualInteractions(projectRestartDecisionInteractions(state, opportunity), true)
      : [];
  const restartTargetLabel = (interaction: ContextualInteraction) => {
    const resolution = interaction.resolution;
    if (resolution.kind !== 'action') return '';
    const action = resolution.action;
    const receiverId =
      action.type === 'pass'
        ? action.receiverId
        : action.type === 'cross'
          ? action.intendedTargetId
          : undefined;
    const receiver = state.players.find((p) => p.id === receiverId);
    const role = receiverId ? state.restart?.roles[receiverId] : undefined;
    const developing =
      receiver && role && distance(receiver.position, role.zone.centre) > role.zone.radius;
    if (receiver && action.type === 'pass')
      return `${receiver.profile.lastName}${developing ? ' · ustawia się' : ''}`;
    if (action.type === 'space_pass') return 'W wolną przestrzeń';
    if (action.type !== 'cross') return '';
    const ballNearTop = (state.restart?.spot?.y ?? state.ball.y) <= 34;
    const near = ballNearTop ? action.target.y < 31 : action.target.y > 37;
    const far = ballNearTop ? action.target.y > 37 : action.target.y < 31;
    const target =
      action.intent === 'cutback'
        ? 'Przed pole karne'
        : near
          ? 'Bliższy słupek'
          : far
            ? 'Dalszy słupek'
            : 'Środek';
    return `${target}${receiver ? ` · ${receiver.profile.lastName}${developing ? ' ustawia się' : ''}` : ''}`;
  };
  const uiEvent = (type: string, data?: Record<string, unknown>) =>
    observerMode === 'capture' && debugRecorderRef.current.ui(stateRef.current.time, type, data);
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
    if (devObservation)
      recordDecisionSelection(telemetryRef.current, source === 'ai' ? 'dev_ai' : 'human');
    consequenceRef.current = createConsequenceWindow(state, opportunity.actorId);
    windowEvent({ at: state.time, type: 'consequence_started', actorId: opportunity.actorId });
    setPresentationPhase('post_moment');
    canonicalParticipationRef.current.observe(state, next, false);
    publishState(next);
    setDecisionBoundary(undefined);
    setSelectedTarget(undefined);
    setShotAim(undefined);
  };
  const triggerCapture = () => {
    const current = stateRef.current;
    if (!debugRecorderRef.current.trigger(current.time)) return;
    videoRecorderRef.current.trigger(current.time);
    setSaveMessage(undefined);
    setCaptureError(undefined);
    setCaptureStatus('capturing');
  };
  const savePastOnly = () => {
    const current = stateRef.current;
    const recorder = debugRecorderRef.current;
    if (!recorder.freezePast(current.time) && recorder.triggerTime === undefined) return;
    videoRecorderRef.current.trigger(current.time);
    const basename = debugBasename(current.seed, current.time);
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
          <span className="dev-badge">SINGLE MATCH LAB · MECZ</span>
          <h1>
            <i className="team-swatch" style={{ background: kits.home.primary }} />
            {session.home.club.name}{' '}
            <b>
              {state.score.home}–{state.score.away}
            </b>{' '}
            {session.away.club.name}
            <i className="team-swatch" style={{ background: kits.away.primary }} />
          </h1>
        </div>
        <p>
          {formatMatchTime(displayTime)} ·{' '}
          {state.status === 'abandoned'
            ? 'Mecz przerwany'
            : replaying
              ? 'Powtórka'
              : opportunity
                ? 'Twój wybór'
                : playing
                  ? 'Mecz trwa'
                  : 'Pauza'}
        </p>
      </header>
      <nav>
        <label>
          Czułość momentów{' '}
          <select
            disabled={replaying}
            value={presentationPolicyId}
            onChange={(event) => {
              publishState(stateRef.current);
              const id = event.target.value as MatchPresentationPolicy['id'];
              setPresentationPolicyId(id);
              if (
                ['background_simulation', 'full_match', 'presenting_live_moment'].includes(
                  presentationPhase,
                )
              ) {
                if (id !== 'full_match') canonicalParticipationRef.current.beginHiddenSequence();
                setPresentationPhase(id === 'full_match' ? 'full_match' : 'background_simulation');
              }
            }}
          >
            <option value="key_player">Najważniejsze moje akcje</option>
            <option value="player_extended">Rozszerzone moje akcje</option>
            <option value="key_match">Moje akcje + ważne momenty</option>
            <option value="extended_match">Rozszerzone wydarzenia</option>
            <option value="full_match">Oglądaj cały mecz</option>
          </select>
        </label>
        <button
          disabled={state.status === 'abandoned' || state.status === 'full_time'}
          onClick={() => {
            publishState(stateRef.current);
            uiEvent(playing ? 'paused' : 'playing');
            setPlaying(!playing);
          }}
        >
          {playing ? 'Pauza' : 'Odtwórz'}
        </button>
        {[1, 2, 4, 8, 16].map((v) => (
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
          disabled={!goalReplay.length || replaying || presentationPhase === 'lead_in'}
          onClick={() => {
            uiEvent('replay_started');
            phaseBeforeReplayRef.current = presentationPhase;
            setPresentationPhase('replay');
          }}
        >
          Powtórka 0.5×
        </button>
        {replaying && <button onClick={finishReplay}>Zakończ powtórkę</button>}
        {state.status === 'half_time' && (
          <button onClick={() => publishState(startSecondHalf(stateRef.current))}>
            Rozpocznij drugą połowę
          </button>
        )}
        {state.status === 'abandoned' && (
          <p role="status">
            Mecz przerwany: {state.termination?.team === 'home' ? 'gospodarze' : 'goście'} mają
            mniej niż siedmiu zawodników. Zachowano wynik i czas przerwania.
          </p>
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
      <nav
        className="camera-controls"
        aria-label="Ustawienia kamery"
        aria-disabled={shotAimActive || replaying}
      >
        <span>Kamera:</span>
        {(
          [
            ['overview', 'Przegląd'],
            ['action', 'Akcja'],
            ['player_focus', 'Zawodnik'],
          ] as const
        ).map(([preset, label]) => (
          <button
            disabled={shotAimActive || replaying}
            className={cameraPreferences.preset === preset ? 'active' : ''}
            key={preset}
            onClick={() => setCameraPreferences((current) => ({ ...current, preset }))}
          >
            {label}
          </button>
        ))}
        <label>
          Zoom{' '}
          <input
            disabled={shotAimActive || replaying}
            aria-label="Zoom kamery"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={cameraPreferences.zoom}
            onChange={(event) =>
              setCameraPreferences((current) => ({ ...current, zoom: Number(event.target.value) }))
            }
          />
        </label>
        <button
          disabled={shotAimActive || replaying}
          onClick={() => rendererRef.current?.resetView()}
        >
          Resetuj widok
        </button>
        <small>
          {shotAimActive
            ? 'Celowanie: lewy przycisk wskazuje punkt w bramce'
            : replaying
              ? 'Kamera powtórki'
              : 'Kółko: zoom · Środkowy: obrót · Shift + środkowy: przesunięcie'}
        </small>
      </nav>
      <details
        className="lab-diagnostics"
        onToggle={(event) => {
          if (event.target === event.currentTarget)
            setDiagnosticsExpanded(event.currentTarget.open);
        }}
      >
        <summary>DEV · Diagnostyka, scenariusze i zapis meczu</summary>
        {diagnosticsExpanded && (
          <>
            <p>
              OVR XI: {session.home.club.name} {session.home.strength.toFixed(1)} ·{' '}
              {session.away.club.name} {session.away.strength.toFixed(1)}
              {squadOveralls && (
                <>
                  {' '}
                  · OVR kadr: {squadOveralls.home.toFixed(1)} / {squadOveralls.away.toFixed(1)}
                </>
              )}
            </p>
            <details>
              <summary>DEV · Attribute Micro Lab</summary>
              <p>
                Identyczna geometria i seedy; zmieniamy jeden atrybut w pasmach 20 / 40 / 60 / 80 /
                100. Wyniki opisują rozkłady wykonania i ETA.
              </p>
              <button onClick={() => setAttributeLab(runAttributeMicroLab(state))}>
                Uruchom macierz atrybutów
              </button>
              {attributeLab && (
                <>
                  <button
                    onClick={() =>
                      downloadBlob(
                        new Blob([JSON.stringify(attributeLab, null, 2)], {
                          type: 'application/json',
                        }),
                        'mfl-attribute-micro-lab.json',
                      )
                    }
                  >
                    Eksportuj macierz JSON
                  </button>
                  <p>
                    {attributeLab.rows.length} wariantów · {attributeLab.config.repetitions}{' '}
                    powtórzeń każdego wariantu
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Pomiar / atrybut / kontekst</th>
                        <th>Pasmo</th>
                        <th>Średnia</th>
                        <th>P05 / P50 / P95</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attributeLab.rows.map((row) => (
                        <tr key={`${row.metric}:${row.attribute}:${row.context}:${row.band}`}>
                          <td>
                            {row.metric} / {row.attribute} / {row.context}
                          </td>
                          <td>{row.band}</td>
                          <td>{row.distribution.mean.toFixed(3)}</td>
                          <td>
                            {row.distribution.p05.toFixed(3)} / {row.distribution.median.toFixed(3)}{' '}
                            / {row.distribution.p95.toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </details>
            <details>
              <summary>DEV · Reakcja wsparcia na presję</summary>
              <p>
                Ostatnie epizody: ruch partnerów, czas reakcji, odległości i dostępne opcje. Pomiar
                zbierany w DEV/capture.
              </p>
              <button
                onClick={() =>
                  downloadBlob(
                    new Blob([JSON.stringify(pressureSupportRef.current.snapshot(), null, 2)], {
                      type: 'application/json',
                    }),
                    'mfl-pressure-support.json',
                  )
                }
              >
                Eksportuj epizody JSON
              </button>
              <pre>{JSON.stringify(pressureSupportRef.current.snapshot().slice(-8), null, 2)}</pre>
            </details>
            <nav className="debug-capture" aria-label="Eksport diagnostyczny">
              <label>
                Tryb obserwacji{' '}
                <select
                  aria-label="Tryb obserwacji"
                  value={observerMode}
                  disabled={isCaptureTriggerDisabled(captureStatus)}
                  onChange={(event) =>
                    setObserverMode(performanceObserverModeSchema.parse(event.target.value))
                  }
                >
                  <option value="release_minimal">release_minimal</option>
                  <option value="normal">normal</option>
                  <option value="dev">dev</option>
                  <option value="capture">capture</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={videoEnabled}
                  disabled={observerMode !== 'capture' || isCaptureTriggerDisabled(captureStatus)}
                  onChange={(event) => setVideoEnabled(event.target.checked)}
                />{' '}
                Nagrywaj WebM (DEV)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={profilingEnabled}
                  onChange={(event) => setProfilingEnabled(event.target.checked)}
                />{' '}
                Profiluj podsystemy (DEV)
              </label>
              <button
                onClick={() => {
                  const current = stateRef.current;
                  const report = createSessionTelemetryReport({
                    canonicalSeconds: current.time,
                    coverage: observerCoverageRef.current,
                    flow: telemetryRef.current,
                    agency: agencyTrackerRef.current.snapshot(current.time, current),
                    positioning: positioningSamplesRef.current,
                    presentation: presentationTelemetryRef.current,
                    state: current,
                    participation: canonicalParticipationRef.current.snapshot(),
                    measuredPosition,
                  });
                  const summary = {
                    metadata: {
                      schema: 'mfl-session-benchmark-v5',
                      seed: current.seed,
                      observerMode,
                      observationScope:
                        report.collectionScope.detailedObservers !== 'unavailable'
                          ? 'dev_since_mode_enabled'
                          : 'canonical_statistics_only',
                      collectionScope: report.collectionScope,
                      positioningSampleCapacity: 6000,
                      observerCoverage: observerCoverageRef.current.map((interval) => ({
                        ...interval,
                        endedAt: interval.endedAt ?? current.time,
                      })),
                    },
                    duration: current.time,
                    segments: diagnostics
                      .exportSegments(current, telemetryRef.current, positioningSamplesRef.current)
                      .map((segment) => ({
                        ...segment,
                        observationScope: report.collectionScope.detailedObservers,
                        matchFlowTelemetry:
                          report.collectionScope.detailedObservers === 'unavailable'
                            ? null
                            : segment.matchFlowTelemetry,
                        sampledPositioning:
                          report.collectionScope.detailedObservers === 'unavailable'
                            ? null
                            : segment.sampledPositioning,
                      })),
                    controlledPlayer: current.controlledFootballerId,
                    canonicalStatistics: current.statistics,
                    defensiveTelemetry: current.defensiveTelemetry,
                    discipline: current.discipline,
                    recentCanonicalActionEvents: current.actionEvents ?? [],
                    ...report,
                    passingNetwork: current.statistics?.passingNetwork ?? [],
                    runtimeDiagnostics: diagnostics.runtimeDiagnostics,
                    omittedRuntimeDiagnostics: diagnostics.omittedRuntimeDiagnostics,
                    rendererLifecycle: diagnostics.rendererLifecycle,
                    contextBuffer: contextHistoryRef.current.snapshot(),
                    presentationWindows: windowDiagnosticsRef.current,
                    backgroundPerformance: backgroundPerformanceRef.current.snapshot(
                      presentationTelemetryRef.current.rendererCallsBackground,
                    ),
                    presentationDecisions: presentationDecisionsRef.current,
                    subsystemProfile: profilerRef.current.snapshot(),
                    uiPerformance: uiPerformanceRef.current,
                  };
                  downloadBlob(
                    new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' }),
                    `${current.seed}-benchmark-sesji.json`,
                  );
                }}
              >
                Eksportuj benchmark sesji
              </button>
              <button
                disabled={observerMode !== 'capture' || isCaptureTriggerDisabled(captureStatus)}
                onClick={triggerCapture}
              >
                Przechwyć debug ±10 s
              </button>
              <button
                disabled={observerMode !== 'capture' || isCaptureTriggerDisabled(captureStatus)}
                onClick={savePastOnly}
              >
                Zapisz ostatnie 10 s
              </button>
              <button onClick={clearDebugBuffer}>Wyczyść bufor debug</button>
              {captureStatus === 'idle' && (
                <span>
                  {observerMode !== 'capture'
                    ? 'Włącz tryb capture, aby buforować debug ±10 s'
                    : videoRecorderRef.current.active
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
                    {
                      const next = applyRestartScenario(
                        createTacticalMatch(session),
                        scenario,
                        scenario === 'throw_in'
                          ? { restartTeam: 'home', restartPoint: { x: 72, y: 0 } }
                          : undefined,
                      );
                      presentationTelemetryRef.current = createPresentationRuntimeTelemetry();
                      canonicalParticipationRef.current = new CanonicalParticipationTracker();
                      resetPresentation(next);
                      const segmentId = diagnostics.beginSegment(
                        next,
                        telemetryRef.current,
                        positioningSamplesRef.current,
                      );
                      telemetryRef.current = createMatchFlowTelemetry(segmentId);
                      positioningSamplesRef.current = devObservation
                        ? [sampleCanonicalPositioning(next)]
                        : [];
                      diagnostics.telemetry = telemetryRef.current;
                      diagnostics.positioningSamples = positioningSamplesRef.current;
                      if (observerMode === 'capture') {
                        debugRecorderRef.current.record(next);
                        debugRecorderRef.current.ui(next.time, 'scenario_button_clicked', {
                          scenario,
                        });
                      }
                      publishState(next);
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            <p className="runtime-status">
              Prezentacja: <strong>{presentationPhase}</strong> · Polityka:{' '}
              <strong>{presentationPolicyId}</strong> · Renderer:{' '}
              <strong>
                {!presentationPolicy.fullMatch && presentationPhase === 'background_simulation'
                  ? 'suppressed'
                  : diagnostics.rendererLifecycle}
              </strong>{' '}
              · Kanoniczny: <strong>{formatDiagnosticMatchTime(state.time)}</strong> · Wyświetlany:{' '}
              <strong>{formatDiagnosticMatchTime(displayTime)}</strong> · Runtime:{' '}
              <strong>{diagnostics.runtimeDiagnostics.length ? 'error captured' : 'OK'}</strong>
            </p>
            <details
              className="presentation-diagnostics"
              onToggle={(event) => {
                if (event.target === event.currentTarget)
                  setPerformanceExpanded(event.currentTarget.open);
              }}
            >
              <summary>DEV · Wydajność symulacji w tle</summary>
              {backgroundPerformance && (
                <p>
                  Tryb: {observerMode} · Przedział: {Math.floor(state.time / 300) * 5}–
                  {Math.floor(state.time / 300) * 5 + 5} min · Kanoniczny:{' '}
                  {formatDiagnosticMatchTime(backgroundPerformance.canonicalSecondsAdvanced)} ·
                  Realnie: {(backgroundPerformance.realElapsedMs / 1000).toFixed(1)} s ·
                  Przepustowość: {backgroundPerformance.canonicalSecondsPerRealSecond.toFixed(1)}× ·
                  Rolling: {backgroundPerformance.rollingCanonicalSpeed.toFixed(1)}× · Batch
                  p50/p95/p99: {backgroundPerformance.p50BatchMs.toFixed(1)}/
                  {backgroundPerformance.p95BatchMs.toFixed(1)}/
                  {backgroundPerformance.p99BatchMs.toFixed(1)} ms · Ticki/s:{' '}
                  {backgroundPerformance.ticksPerRealSecond.toFixed(0)} · Renderer tła:{' '}
                  {backgroundPerformance.rendererCallsBackground} · Publikacje UI:{' '}
                  {uiPerformanceRef.current.backgroundPublications} · Oczekiwanie scheduler:{' '}
                  {(uiPerformanceRef.current.backgroundSchedulingWaitMs / 1000).toFixed(2)} s ·
                  Maks. decyzja → commit:{' '}
                  {uiPerformanceRef.current.maximumDecisionCommitMs.toFixed(1)} ms
                </p>
              )}
              {performanceProfile?.enabled && (
                <p>
                  Profil próbkowany 1/{performanceProfile.sampleEveryTicks} ticków (czasy zawierają
                  wywołania zagnieżdżone):{' '}
                  {performanceProfile.categories
                    .map(
                      (category) =>
                        `${category.category}: ${(category.estimatedMs / 1000).toFixed(2)} s`,
                    )
                    .join(' · ')}
                </p>
              )}
            </details>
            <details className="presentation-diagnostics">
              <summary>DEV · Dlaczego pokazano lub ukryto decyzję?</summary>
              {presentationDecisionsRef.current.length ? (
                presentationDecisionsRef.current
                  .slice(-8)
                  .reverse()
                  .map((item, index) => (
                    <p key={`${item.at}:${item.opportunityKind}:${index}`}>
                      {formatDiagnosticMatchTime(item.at)} · {item.opportunityKind} · ważność{' '}
                      {item.importance.toFixed(2)} · {item.policyId} / próg{' '}
                      {item.threshold.toFixed(2)} → <strong>{item.result}</strong> ({item.reason})
                    </p>
                  ))
              ) : (
                <p>Brak decyzji prezentacyjnych w tej sesji.</p>
              )}
            </details>
          </>
        )}
      </details>
      <section className="sandbox-grid">
        <div
          className={`pitch-stage ${opportunity ? 'pitch-stage--interactive' : ''}`}
          onClick={(event) => {
            if (!presentationPolicy.fullMatch && presentationPhase === 'background_simulation')
              return;
            if (event.button !== 0 || rendererRef.current?.consumeCameraClick()) return;
            if (!opportunity || shotAim || replaying) return;
            const opportunityActor = state.players.find(
              (player) => player.id === opportunity.actorId,
            );
            const hasShot = opportunity.options.some(
              (option) =>
                option.kind === 'action' &&
                (option.action.type === 'shot' ||
                  (option.action.type === 'header' && option.action.intent === 'header_shot')),
            );
            const opponentGoal = opportunityActor
              ? opportunityActor.team === 'home'
                ? 'away'
                : 'home'
              : undefined;
            const picked = rendererRef.current?.pick(
              event.clientX,
              event.clientY,
              hasShot ? opponentGoal : undefined,
              state.players
                .filter(
                  (player) =>
                    projectContextualInteractions(state, opportunity, {
                      kind: 'player',
                      playerId: player.id,
                    }).length > 0,
                )
                .map((player) => player.id),
            );
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
            if (
              target.kind === 'goal' &&
              projected.some((item) => item.resolution.kind === 'action')
            ) {
              setSelectedTarget(target);
              setShotAim({ horizontal: 0, vertical: 0.45 });
              setMenuPosition(undefined);
              uiEvent('shot_aim_opened', { target });
              return;
            }
            setSelectedTarget(target);
            setMenuPosition({
              x: Math.max(
                0,
                Math.min(
                  event.currentTarget.clientWidth - 220,
                  event.clientX - event.currentTarget.getBoundingClientRect().left,
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  event.currentTarget.clientHeight - 260,
                  event.clientY - event.currentTarget.getBoundingClientRect().top,
                ),
              ),
            });
            uiEvent('interaction_target_selected', { target });
            if (projected.length)
              uiEvent('context_menu_opened', {
                target,
                interactionIds: projected.map((item) => item.id),
              });
          }}
        >
          <div
            hidden={!presentationPolicy.fullMatch && presentationPhase === 'background_simulation'}
          >
            <PitchCanvasHost ref={hostRef} />
          </div>
          {!presentationPolicy.fullMatch && presentationPhase === 'background_simulation' && (
            <section className="background-presentation" aria-live="polite">
              <small>{presentationPolicyId}</small>
              <h2>Symulacja meczu…</h2>
              <strong>{formatMatchTime(displayTime)}</strong>
              <p>
                {session.home.club.name} {state.score.home}–{state.score.away}{' '}
                {session.away.club.name}
              </p>
              {!playing && <p>Wstrzymano</p>}
            </section>
          )}
          {shotAim && opportunity && !replaying && selectedTarget?.kind === 'goal' && (
            <section
              className="shot-aim"
              aria-label="Celowanie strzału"
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className="shot-aim__surface"
                aria-label="Kliknij podświetloną bramkę, aby wskazać intencję strzału"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const intent = rendererRef.current?.pickGoalAim(event.clientX, event.clientY);
                  if (intent) setShotAim(intent);
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  const intent = rendererRef.current?.pickGoalAim(event.clientX, event.clientY);
                  if (intent) setShotAim(intent);
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
              />
              <div className="shot-aim__actions">
                {projectContextualInteractions(state, opportunity, selectedTarget)
                  .filter(
                    (item) =>
                      item.resolution.kind === 'action' &&
                      (item.resolution.action.type === 'shot' ||
                        (item.resolution.action.type === 'header' &&
                          item.resolution.action.intent === 'header_shot')),
                  )
                  .map((item) => {
                    if (
                      item.resolution.kind !== 'action' ||
                      (item.resolution.action.type !== 'shot' &&
                        (item.resolution.action.type !== 'header' ||
                          item.resolution.action.intent !== 'header_shot'))
                    )
                      return null;
                    if (!shotAimTeam) return null;
                    const point = shotAimIntentToGoalPoint(shotAimTeam, shotAim);
                    const action = {
                      ...item.resolution.action,
                      target: { x: point.x, y: point.y },
                      goalTarget: shotAim,
                    };
                    const profileAvailable =
                      action.type !== 'shot' ||
                      !action.freeKickProfile ||
                      enumerateFreeKickStrikeProfiles(state, action.actorId, shotAim).includes(
                        action.freeKickProfile,
                      );
                    return (
                      <button
                        key={item.id}
                        disabled={!profileAvailable}
                        title={
                          profileAvailable
                            ? undefined
                            : 'Ustaw niski cel lub wolną drogę przez mur, aby wykonać ten strzał.'
                        }
                        onClick={() =>
                          closeOpportunity(
                            applyContextualInteraction(state, opportunity, {
                              ...item,
                              resolution: { kind: 'action', action },
                            }),
                            'player',
                            action,
                          )
                        }
                      >
                        {interactionLabel(item)}
                      </button>
                    );
                  })}
                <button
                  onClick={() => {
                    setShotAim(undefined);
                    setSelectedTarget(undefined);
                    uiEvent('shot_aim_cancelled');
                  }}
                >
                  Anuluj
                </button>
              </div>
            </section>
          )}
          {opportunity && !replaying && (
            <div className="interaction-hint">
              {controlledActor &&
                (() => {
                  const speed = Math.hypot(controlledActor.velocity.x, controlledActor.velocity.y);
                  const sprinting = projectSprintEpisode(
                    controlledActor,
                    speed / (6.2 + controlledActor.profile.attributes.pace * 0.033),
                    state.time,
                    0,
                  ).actualSprinting;
                  return `${speed < 0.35 ? 'Stoisz' : speed < 2.2 ? 'Idziesz' : sprinting ? 'Sprintujesz' : 'Biegniesz'} (${speed.toFixed(1)} m/s) · `;
                })()}
              Wybierz piłkę, piłkarza, przestrzeń lub bramkę
            </div>
          )}
          {opportunity && !replaying && menuPosition && interactions.length > 0 && (
            <section
              className="context-menu"
              style={{ left: menuPosition.x, top: menuPosition.y }}
              aria-label="Dostępne zagrania"
              onClick={(event) => event.stopPropagation()}
            >
              {groupContextualInteractions(interactions, opportunity.kind === 'restart').map(
                (group) => (
                  <div className="context-menu__group" key={group.family}>
                    <strong>{interactionFamilyLabels[group.family]}</strong>
                    {group.interactions.map((interaction) => (
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
                        {opportunity.kind === 'restart' && (
                          <small>{restartTargetLabel(interaction)}</small>
                        )}
                      </button>
                    ))}
                  </div>
                ),
              )}
            </section>
          )}
        </div>
        <aside className="decision-board">
          <MatchCentre
            state={state}
            session={session}
            kits={kits}
            canReplay={(replayKey) =>
              !replaying &&
              presentationPhase !== 'lead_in' &&
              matchReplayRef.current.hasWindow(replayKey)
            }
            onReplay={(replayKey) => {
              const recorded = matchReplayRef.current.getWindow(replayKey);
              if (!recorded || recorded.frames.length < 2) return;
              setGoalReplay(recorded.frames.map(replaySnapshotToFrame));
              phaseBeforeReplayRef.current = presentationPhase;
              setPresentationPhase('replay');
              uiEvent('match_event_replay_started', { replayKey });
            }}
          />
          <div className="match-status-title">
            {state.status === 'abandoned'
              ? 'MECZ PRZERWANY'
              : replaying
                ? 'POWTÓRKA'
                : presentationPhase === 'lead_in'
                  ? 'KONTEKST DECYZJI'
                  : opportunity
                    ? 'TWOJA DECYZJA'
                    : 'GRA AUTONOMICZNA'}
          </div>
          <p
            className={opportunity ? 'decision-status decision-status--active' : 'decision-status'}
          >
            {state.status === 'abandoned'
              ? 'Spotkanie zakończyło się z powodu zbyt małej liczby zawodników.'
              : replaying
                ? 'Oglądasz zapisany fragment meczu.'
                : presentationPhase === 'lead_in'
                  ? 'Zobacz, jak rozwinęła się sytuacja. Wybór będzie dostępny po dojściu do piłki.'
                  : session.setup.control.mode === 'spectator'
                    ? 'Obserwujesz mecz. Wszystkie decyzje wykonuje symulacja.'
                    : opportunity
                      ? 'Mecz czeka na Twój wybór. Wskaż cel na boisku, następnie wybierz dostępne zagranie.'
                      : 'Piłkarze wykonują decyzje symulacji. Kolejny wybór pojawi się w odpowiednim kontekście.'}
          </p>
          {state.restart && state.restart.phase !== 'release' && (
            <section
              className="restart-readiness"
              aria-label="Przygotowanie wznowienia"
              aria-live="polite"
            >
              <strong>Przygotowanie wznowienia</strong>
              <span>
                Wykonawca:{' '}
                {state.players.find((p) => p.id === state.restart?.takerId)?.profile.lastName ??
                  'wybór zawodnika'}
              </span>
              {state.restart.readiness && (
                <span>
                  {state.restart.readiness.ballReady ? 'Piłka na miejscu' : 'Piłka w drodze'} ·{' '}
                  {state.restart.readiness.legalReady
                    ? 'Pozycje zgodne z przepisami'
                    : 'Ustawianie zawodników'}
                </span>
              )}
              <span>
                {state.restart.phase === 'awaiting_decision' || opportunity?.kind === 'restart'
                  ? 'Czeka na Twój wybór'
                  : state.restart.phase === 'kick_preparation'
                    ? 'Przygotowanie wybranego zagrania'
                    : 'Zawodnicy przygotowują wznowienie'}
              </span>
            </section>
          )}
          {opportunity?.kind === 'restart' && !replaying && restartGroups.length > 0 && (
            <section className="restart-choices" aria-label="Wybór wznowienia">
              {restartGroups.map((group) => (
                <fieldset key={group.family}>
                  <legend>{interactionFamilyLabels[group.family]}</legend>
                  {group.family === 'shoot' ? (
                    <button
                      onClick={() => {
                        const target = group.interactions[0]!.target;
                        setSelectedTarget(target);
                        setShotAim({ horizontal: 0, vertical: 0.45 });
                        setMenuPosition(undefined);
                        uiEvent('shot_aim_opened', { target });
                      }}
                    >
                      Wskaż miejsce i wysokość strzału
                    </button>
                  ) : (
                    group.interactions.map((interaction) => (
                      <button
                        key={interaction.id}
                        onClick={() =>
                          closeOpportunity(
                            applyContextualInteraction(state, opportunity, interaction),
                            'player',
                            interaction,
                          )
                        }
                      >
                        {interactionLabel(interaction)}
                        <small>{restartTargetLabel(interaction)}</small>
                      </button>
                    ))
                  )}
                </fieldset>
              ))}
            </section>
          )}
          <p>
            <strong>
              {owner?.profile.firstName} {owner?.profile.lastName}
            </strong>
            <br />
            Presja: {Math.round(state.currentPressure * 100)}% ·{' '}
            {state.restart ? 'Wznowienie gry' : 'Gra otwarta'}
          </p>
          {controlledSummary && (
            <p>
              <strong>
                Twój występ ·{' '}
                {
                  state.players.find((player) => player.id === state.controlledFootballerId)
                    ?.profile.lastName
                }
              </strong>
              <br />
              Żółty: Twój piłkarz · turkusowy: posiadacz · jasny: dostępny cel
              <br />
              Minuty {controlledSummary.minutesPlayed.toFixed(0)} · Kontakty{' '}
              {controlledSummary.touches}
              <br />
              Podania {controlledSummary.passesCompleted}/{controlledSummary.passesAttempted} ·
              Strzały {controlledSummary.shots} · Gole {controlledSummary.goals}
              <br />
              Otrzymane podania {controlledSummary.passesReceived}
              <br />
              Odbiory {controlledSummary.tacklesWon}/{controlledSummary.tacklesAttempted} ·
              Przechwyty {controlledSummary.interceptions}
              <br />
              Dystans {(controlledSummary.distanceCovered / 1000).toFixed(1)} km · Sprinty{' '}
              {controlledSummary.sprintBursts}
            </p>
          )}
          {rendererError &&
            !(
              !presentationPolicy.fullMatch &&
              presentationPhase === 'background_simulation' &&
              rendererError.includes('waiting_for_layout')
            ) && (
              <strong>
                {rendererError}{' '}
                <button onClick={() => rendererRef.current?.recover()}>Odtwórz renderer</button>
              </strong>
            )}
          <h2>
            {state.possessionTeam === 'home' ? session.home.club.name : session.away.club.name} przy
            piłce
          </h2>
          <details
            className="player-diagnostics"
            onToggle={(event) => {
              if (event.target === event.currentTarget)
                setGeometryExpanded(event.currentTarget.open);
            }}
          >
            <summary>DEV · Stan i geometria</summary>
            {geometryExpanded && situation && (
              <>
                {(() => {
                  const selected = state.players.find(
                    (p) =>
                      p.id ===
                      (selectedTarget?.kind === 'player'
                        ? selectedTarget.playerId
                        : (state.controlledFootballerId ?? state.ball.ownerId)),
                  );
                  return (
                    selected && (
                      <p>
                        Wybrany piłkarz: {selected.profile.firstName} {selected.profile.lastName} ·
                        OVR {getPlayerOverall(selected.profile, selected.profile.primaryPosition)}
                        <br />
                        {Object.entries(selected.profile.attributes)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(' · ')}
                      </p>
                    )
                  );
                })()}
                {projectFormationConnectivity(state).map((team) => (
                  <p key={team.side}>
                    Łączność {team.formation}: obrona{' '}
                    {(team.lineInvolvement.defence! * 100).toFixed(1)}% · środek{' '}
                    {(team.lineInvolvement.midfield! * 100).toFixed(1)}% · największa relacja{' '}
                    {(team.topEdgeShare * 100).toFixed(1)}%<br />
                    {team.warnings.join(' · ') || 'Brak ostrzeżeń udziału'}
                  </p>
                ))}
                <p>
                  Sprawczość: {agencyDiagnostic?.meaningfulHumanDecisions} obserwowanych kandydatów
                  decyzji · rutyna: {agencyDiagnostic?.routineDelegated} · jedna opcja:{' '}
                  {agencyDiagnostic?.singleOptionDelegated} · bufor kontekstu:{' '}
                  {contextHistoryRef.current.snapshot().samplesRetained}/62 próbek (10 Hz)
                </p>
                {participationDiagnostic?.controlled && (
                  <p>
                    Kanoniczne epizody posiadania:{' '}
                    {participationDiagnostic.controlled.possessionEpisodes} · ukryte:{' '}
                    {participationDiagnostic.controlled.presentationCoverage?.hidden
                      .possessionEpisodes ?? '—'}{' '}
                    · widoczne epizody posiadania:{' '}
                    {participationDiagnostic.controlled.presentationCoverage
                      ?.visiblePossessionEpisodes ?? '—'}
                    <br />
                    Widoczne sekwencje z udziałem piłkarza:{' '}
                    {participationDiagnostic.controlled.presentationCoverage
                      ?.visiblePlayerInvolvingSequences ?? '—'}{' '}
                    · pytania do człowieka:{' '}
                    {participationDiagnostic.controlled.humanDecisionPrompts ?? '—'}
                    <br />
                    Aktywne minuty: {participationDiagnostic.controlled.minutes.toFixed(2)} ·
                    pytania / aktywne 45:{' '}
                    {participationDiagnostic.ratios.humanPromptsPerActive45?.toFixed(2) ?? '—'} · /
                    aktywne 90:{' '}
                    {participationDiagnostic.ratios.humanPromptsPerActive90?.toFixed(2) ?? '—'}
                    <br />
                    Zdarzenia obronne ukryte / widoczne:{' '}
                    {participationDiagnostic.controlled.presentationCoverage?.hidden
                      .defensiveInvolvements ?? '—'}
                    {' / '}
                    {participationDiagnostic.controlled.presentationCoverage
                      ?.visibleDefensiveInvolvements ?? '—'}{' '}
                    · udział w epizodach zespołu:{' '}
                    {participationDiagnostic.ratios.controlledPlayerTouchShare === null
                      ? '—'
                      : `${(participationDiagnostic.ratios.controlledPlayerTouchShare * 100).toFixed(1)}%`}
                    <br />
                    Epizod posiadania obejmuje przyjęcie, prowadzenie i oddanie/utratę piłki.
                    Widoczność epizodu liczymy w chwili jego rozpoczęcia. Widoczna sekwencja może
                    obejmować kilka takich epizodów.
                    <br />
                    Udział w celnych podaniach zespołu od / do piłkarza:{' '}
                    {participationDiagnostic.ratios.controlledPlayerCompletedPassesFromShare ===
                    null
                      ? '—'
                      : `${(participationDiagnostic.ratios.controlledPlayerCompletedPassesFromShare * 100).toFixed(1)}%`}
                    {' / '}
                    {participationDiagnostic.ratios.controlledPlayerCompletedPassesToShare === null
                      ? '—'
                      : `${(participationDiagnostic.ratios.controlledPlayerCompletedPassesToShare * 100).toFixed(1)}%`}{' '}
                    · inni zawodnicy zespołu w tej samej roli:{' '}
                    {participationDiagnostic.controlled.comparableRolePlayers.length}
                  </p>
                )}
                {opportunity && opportunity.kind === 'on_ball' && (
                  <button
                    className="dev-ai-choice"
                    onClick={() =>
                      closeOpportunity(letAiDecide(state, opportunity), 'ai', 'npc_choice')
                    }
                  >
                    DEV: wykonaj wybór AI
                  </button>
                )}
                <p>
                  Czas kanoniczny: {formatDiagnosticMatchTime(state.time)}
                  <br />
                  Stały tick: {FIXED_MATCH_DT.toFixed(3)} s · tempo: {speed}×
                  <br />
                  Prędkość piłki:{' '}
                  {Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0).toFixed(
                    1,
                  )}{' '}
                  m/s · wysokość {(state.ball.height ?? 0).toFixed(1)} m
                  <br />
                  Bufor powtórki: {replayBufferRef.current.length} kl. /{' '}
                  {(
                    ((replayBufferRef.current.at(-1)?.timestampMs ?? 0) -
                      (replayBufferRef.current[0]?.timestampMs ?? 0)) /
                    1000
                  ).toFixed(1)}{' '}
                  s
                  <br />
                  Prędkość aktora:{' '}
                  {Math.hypot(actor?.velocity.x ?? 0, actor?.velocity.y ?? 0).toFixed(1)} m/s Fazy:{' '}
                  {state.teams.home.phase} / {state.teams.away.phase}
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
                    : state.ball.travelKind
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
                      {state.lastShot.reboundSource
                        ? ` · odbicie: ${state.lastShot.reboundSource}`
                        : ''}
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
                      {metric.length.toFixed(1)} m · szerokość {metric.width.toFixed(1)} m ·
                      rozciągnięcie {metric.stretchIndex.toFixed(1)} m · pole{' '}
                      {metric.convexHullArea.toFixed(0)} m² · przed/za piłką{' '}
                      {metric.playersAheadOfBall}/{metric.playersBehindBall} · linie DEF–MID{' '}
                      {metric.lines.defenceToMidfield.toFixed(1)} m, MID–ATT{' '}
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
                      {p.profile.lastName}: {p.meanPosition.x.toFixed(1)},{' '}
                      {p.meanPosition.y.toFixed(1)}
                    </div>
                  ))}
                </details>
              </>
            )}
          </details>
        </aside>
      </section>
    </main>
  );
};
