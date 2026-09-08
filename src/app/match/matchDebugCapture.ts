import { z } from 'zod';
import type { SingleMatchSession } from '../../core/singleMatch';
import type { TacticalMatchState } from '../../core/matchSimulation';

export const MATCH_DEBUG_SCHEMA = 'mfl-match-debug-v1' as const;
export const DEBUG_WINDOW_SECONDS = 10;

const pointSchema = z.object({ x: z.number(), y: z.number() });
export const debugFrameSchema = z.object({
  time: z.number(),
  decisionIndex: z.number().int(),
  score: z.object({ home: z.number().int(), away: z.number().int() }),
  scenario: z.string(),
  restart: z.unknown().optional(),
  possessionTeam: z.enum(['home', 'away']),
  teams: z.record(
    z.enum(['home', 'away']),
    z.object({
      phase: z.string(),
      phaseElapsed: z.number(),
      formation: z.string(),
      style: z.string(),
    }),
  ),
  currentActorId: z.string().optional(),
  currentAction: z.unknown().optional(),
  latestAction: z.unknown().optional(),
  pressure: z.number(),
  nearestChallengerId: z.string().optional(),
  ball: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    vx: z.number(),
    vy: z.number(),
    ownerId: z.string().optional(),
    travelKind: z.string().optional(),
    flightProgress: z.number().optional(),
    airborne: z.boolean().optional(),
  }),
  lastShot: z.unknown().optional(),
  lastShotResult: z.string().optional(),
  lastBallContact: z.unknown().optional(),
  lastPossessionChange: z.unknown().optional(),
  lastAerialResult: z.string().optional(),
  lastBoundaryRestart: z.string().optional(),
  players: z.array(
    z.object({
      id: z.string(),
      x: z.number(),
      y: z.number(),
      vx: z.number(),
      vy: z.number(),
      target: pointSchema,
      idealTarget: pointSchema,
    }),
  ),
});
export type DebugFrame = z.infer<typeof debugFrameSchema>;

export const debugEventSchema = z.object({
  time: z.number(),
  type: z.string(),
  actorId: z.string().optional(),
  team: z.enum(['home', 'away']).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export const debugUiEventSchema = z.object({
  time: z.number(),
  type: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export const matchDebugExportSchema = z.object({
  schema: z.literal(MATCH_DEBUG_SCHEMA),
  metadata: z.object({
    createdAt: z.string(),
    seed: z.string(),
    fixedDt: z.number(),
    window: z.object({
      requestedPreSeconds: z.number(),
      requestedPostSeconds: z.number(),
      actualStart: z.number(),
      trigger: z.number(),
      actualEnd: z.number(),
    }),
    home: z.object({
      clubId: z.string(),
      name: z.string(),
      formation: z.string(),
      style: z.string(),
    }),
    away: z.object({
      clubId: z.string(),
      name: z.string(),
      formation: z.string(),
      style: z.string(),
    }),
    control: z.unknown(),
    viewport: z.object({ width: z.number(), height: z.number() }),
    video: z.object({
      available: z.boolean(),
      captureFps: z.number(),
      source: z.literal('tactical_pitch_canvas').optional(),
    }),
  }),
  entities: z.object({
    players: z.array(
      z.object({
        id: z.string(),
        team: z.enum(['home', 'away']),
        name: z.string(),
        primaryPosition: z.string(),
        slot: z.string(),
        duty: z.string(),
        heightCm: z.number().optional(),
        attributes: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
  frames: z.array(debugFrameSchema),
  events: z.array(debugEventSchema),
  uiEvents: z.array(debugUiEventSchema),
});
export type MatchDebugExport = z.infer<typeof matchDebugExportSchema>;

const compact = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const snapshotMatchState = (state: TacticalMatchState): DebugFrame =>
  compact({
    time: state.time,
    decisionIndex: state.decisionIndex,
    score: state.score,
    scenario: state.scenario,
    restart: state.restart,
    possessionTeam: state.possessionTeam,
    teams: {
      home: {
        phase: state.teams.home.phase,
        phaseElapsed: state.teams.home.phaseElapsed,
        formation: state.teams.home.formation,
        style: state.teams.home.style,
      },
      away: {
        phase: state.teams.away.phase,
        phaseElapsed: state.teams.away.phaseElapsed,
        formation: state.teams.away.formation,
        style: state.teams.away.style,
      },
    },
    currentActorId: state.currentActorId,
    currentAction: state.currentAction,
    latestAction: state.latestAction,
    pressure: state.currentPressure,
    nearestChallengerId: state.nearestChallengerId,
    ball: {
      x: state.ball.x,
      y: state.ball.y,
      z: state.ball.height ?? 0,
      vx: state.ball.velocity?.x ?? 0,
      vy: state.ball.velocity?.y ?? 0,
      ownerId: state.ball.ownerId,
      travelKind: state.ball.travelKind,
      flightProgress: state.ball.flightProgress,
      airborne: state.ball.airborne,
    },
    lastShot: state.lastShot,
    lastShotResult: state.lastShotResult,
    lastBallContact: state.lastBallContact,
    lastPossessionChange: state.lastPossessionChange,
    lastAerialResult: state.lastAerialResult,
    lastBoundaryRestart: state.lastBoundaryRestart,
    players: state.players.map((p) => ({
      id: p.id,
      x: p.position.x,
      y: p.position.y,
      vx: p.velocity.x,
      vy: p.velocity.y,
      target: p.target,
      idealTarget: p.idealTarget,
    })),
  });

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const projectDebugEvents = (previous: DebugFrame | undefined, frame: DebugFrame) => {
  const events: z.infer<typeof debugEventSchema>[] = [];
  const add = (
    type: string,
    actorId?: string,
    team?: 'home' | 'away',
    data?: Record<string, unknown>,
  ) => events.push({ time: frame.time, type, actorId, team, data });
  if (!previous || previous.scenario !== frame.scenario)
    add('scenario_changed', undefined, undefined, { scenario: frame.scenario });
  if (
    frame.restart &&
    (!previous?.restart ||
      (previous.restart as { phase?: string }).phase !==
        (frame.restart as { phase?: string }).phase)
  )
    add(
      (frame.restart as { phase?: string }).phase === 'release'
        ? 'restart_release'
        : 'restart_setup',
      (frame.restart as { takerId?: string }).takerId,
      (frame.restart as { restartTeam?: 'home' | 'away' }).restartTeam,
    );
  if (previous && !same(previous.currentAction, frame.currentAction) && frame.currentAction)
    add(
      frame.currentAction && (frame.currentAction as { type?: string }).type === 'shot'
        ? 'shot_started'
        : 'action_started',
      (frame.currentAction as { actorId?: string }).actorId,
    );
  if (previous && previous.possessionTeam !== frame.possessionTeam)
    add('possession_changed', undefined, frame.possessionTeam, { from: previous.possessionTeam });
  const change = frame.lastPossessionChange as
    | { at?: number; cause?: string; to?: 'home' | 'away' }
    | undefined;
  const oldChange = previous?.lastPossessionChange as { at?: number } | undefined;
  if (change?.at !== undefined && change.at !== oldChange?.at)
    add(change.cause ?? 'possession_changed', undefined, change.to);
  if (frame.lastBallContact && !same(previous?.lastBallContact, frame.lastBallContact))
    add('ball_contact', undefined, undefined, frame.lastBallContact as Record<string, unknown>);
  if (frame.lastShotResult && frame.lastShotResult !== previous?.lastShotResult)
    add(frame.lastShotResult, (frame.lastShot as { shooterId?: string } | undefined)?.shooterId);
  if (frame.lastAerialResult && frame.lastAerialResult !== previous?.lastAerialResult)
    add('aerial_duel', undefined, undefined, { result: frame.lastAerialResult });
  if (frame.lastBoundaryRestart && frame.lastBoundaryRestart !== previous?.lastBoundaryRestart)
    add(frame.lastBoundaryRestart);
  if (
    previous &&
    (frame.score.home !== previous.score.home || frame.score.away !== previous.score.away)
  )
    add('goal');
  return events;
};

export class MatchDebugRecorder {
  private history: DebugFrame[] = [];
  private captured: DebugFrame[] | undefined;
  private events: z.infer<typeof debugEventSchema>[] = [];
  private capturedEvents: z.infer<typeof debugEventSchema>[] = [];
  private uiHistory: z.infer<typeof debugUiEventSchema>[] = [];
  private capturedUi: z.infer<typeof debugUiEventSchema>[] = [];
  triggerTime: number | undefined;
  constructor(private readonly seconds = DEBUG_WINDOW_SECONDS) {}
  record(state: TacticalMatchState) {
    const frame = snapshotMatchState(state),
      previous = this.history.at(-1);
    if (previous && frame.time < previous.time) {
      this.history = [];
      this.events = [];
      this.uiHistory = [];
    }
    const nextEvents = projectDebugEvents(previous, frame);
    this.history.push(frame);
    this.events.push(...nextEvents);
    while (this.history.length > 1 && frame.time - this.history[0]!.time > this.seconds)
      this.history.shift();
    const earliest = this.history[0]!.time;
    this.events = this.events.filter((event) => event.time >= earliest);
    if (
      this.captured &&
      this.triggerTime !== undefined &&
      frame.time <= this.triggerTime + this.seconds + 1e-9
    ) {
      this.captured.push(frame);
      this.capturedEvents.push(...nextEvents);
    }
    return this.isComplete(frame.time);
  }
  ui(time: number, type: string, data?: Record<string, unknown>) {
    const event = { time, type, data };
    this.uiHistory.push(event);
    this.uiHistory = this.uiHistory.filter((item) => time - item.time <= this.seconds);
    if (
      this.captured &&
      this.triggerTime !== undefined &&
      time <= this.triggerTime + this.seconds + 1e-9
    )
      this.capturedUi.push(event);
  }
  trigger(time: number) {
    if (this.captured) return false;
    this.triggerTime = time;
    this.captured = [...this.history];
    this.capturedEvents = [...this.events];
    this.capturedUi = [...this.uiHistory];
    this.ui(time, 'debug_trigger');
    return true;
  }
  isComplete(time: number) {
    return this.triggerTime !== undefined && time + 1e-9 >= this.triggerTime + this.seconds;
  }
  resetCapture() {
    this.captured = undefined;
    this.triggerTime = undefined;
    this.capturedEvents = [];
    this.capturedUi = [];
  }
  export(
    session: SingleMatchSession,
    fixedDt: number,
    viewport: { width: number; height: number },
    videoAvailable: boolean,
    captureFps: number,
  ): MatchDebugExport {
    if (!this.captured?.length || this.triggerTime === undefined)
      throw new Error('Debug capture is not ready.');
    const frames = this.captured.filter(
      (f) => f.time <= this.triggerTime! + this.seconds + fixedDt / 2,
    );
    const team = (side: 'home' | 'away') => ({
      clubId: session[side].club.id,
      name: session[side].club.name,
      formation: session[side].formation,
      style: frames.at(-1)!.teams[side].style,
    });
    const players = [
      ...session.home.players.map((p) => [p, 'home'] as const),
      ...session.away.players.map((p) => [p, 'away'] as const),
    ].map(([p, side]) => ({
      id: p.footballerId,
      team: side,
      name: `${p.profile.firstName} ${p.profile.lastName}`,
      primaryPosition: p.profile.primaryPosition,
      slot: p.slot.position,
      duty: p.slot.duty,
      heightCm: p.profile.heightCm,
      attributes: compact(p.profile.attributes),
    }));
    return matchDebugExportSchema.parse({
      schema: MATCH_DEBUG_SCHEMA,
      metadata: {
        createdAt: new Date().toISOString(),
        seed: session.setup.seed,
        fixedDt,
        window: {
          requestedPreSeconds: this.seconds,
          requestedPostSeconds: this.seconds,
          actualStart: frames[0]!.time,
          trigger: this.triggerTime,
          actualEnd: frames.at(-1)!.time,
        },
        home: team('home'),
        away: team('away'),
        control: session.setup.control,
        viewport,
        video: { available: videoAvailable, captureFps, source: 'tactical_pitch_canvas' },
      },
      entities: { players },
      frames,
      events: this.capturedEvents.filter(
        (e) => e.time >= frames[0]!.time && e.time <= frames.at(-1)!.time,
      ),
      uiEvents: this.capturedUi.filter(
        (e) => e.time >= frames[0]!.time && e.time <= frames.at(-1)!.time,
      ),
    });
  }
  get historyFrames() {
    return this.history;
  }
}

type VisualFrame = { wallTimestamp: number; canonicalTime: number; blob: Blob };
export class ViewportVideoRecorder {
  readonly captureFps = 15;
  private source: HTMLCanvasElement | undefined;
  private canvas: HTMLCanvasElement | undefined;
  private timer: number | undefined;
  private frames: VisualFrame[] = [];
  private triggerTime: number | undefined;
  get active() {
    return this.timer !== undefined;
  }
  start(source: HTMLCanvasElement, canonicalTime: () => number) {
    if (typeof source.toBlob !== 'function' || typeof document === 'undefined') return false;
    this.source = source;
    this.canvas = document.createElement('canvas');
    this.timer = window.setInterval(
      () => void this.sample(canonicalTime()),
      1000 / this.captureFps,
    );
    return true;
  }
  private async sample(canonicalTime: number) {
    if (!this.source || !this.canvas || !this.active || !this.source.width) return;
    const scale = Math.min(1, 1600 / this.source.width);
    this.canvas.width = Math.round(this.source.width * scale);
    this.canvas.height = Math.round(this.source.height * scale);
    this.canvas
      .getContext('2d')
      ?.drawImage(this.source, 0, 0, this.canvas.width, this.canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      this.canvas!.toBlob(resolve, 'image/webp', 0.72),
    );
    if (!blob) return;
    this.frames.push({ wallTimestamp: performance.now(), canonicalTime, blob });
    if (this.triggerTime === undefined)
      while (this.frames.length && performance.now() - this.frames[0]!.wallTimestamp > 10_000)
        this.frames.shift();
  }
  trigger(time: number) {
    this.triggerTime = time;
  }
  get bufferedSeconds() {
    if (this.frames.length < 2) return 0;
    return Math.min(
      DEBUG_WINDOW_SECONDS,
      (this.frames.at(-1)!.wallTimestamp - this.frames[0]!.wallTimestamp) / 1000,
    );
  }
  get bufferedFrameCount() {
    return this.frames.length;
  }
  private stopSampling() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }
  async finish(): Promise<Blob | undefined> {
    const frames = [...this.frames];
    this.triggerTime = undefined;
    const end = frames.at(-1)?.wallTimestamp;
    this.frames =
      end === undefined
        ? []
        : frames.filter((frame) => end - frame.wallTimestamp <= DEBUG_WINDOW_SECONDS * 1000);
    if (!frames.length || typeof MediaRecorder === 'undefined') return;
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType) return;
    const output = document.createElement('canvas');
    output.width = this.canvas?.width ?? 1;
    output.height = this.canvas?.height ?? 1;
    const stream = output.captureStream(this.captureFps),
      chunks: Blob[] = [],
      recorder = new MediaRecorder(stream, { mimeType });
    const done = new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });
    recorder.start();
    const origin = frames[0]!.wallTimestamp;
    const playbackStarted = performance.now();
    for (const frame of frames) {
      const wait = Math.max(
        0,
        frame.wallTimestamp - origin - (performance.now() - playbackStarted),
      );
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      const bitmap = await createImageBitmap(frame.blob);
      output.getContext('2d')?.drawImage(bitmap, 0, 0, output.width, output.height);
      bitmap.close();
    }
    recorder.stop();
    const blob = await done;
    stream.getTracks().forEach((track) => track.stop());
    return blob;
  }
  dispose() {
    this.stopSampling();
    this.source = undefined;
    this.frames = [];
  }
}

export const debugBasename = (seed: string, time: number, createdAt = new Date()) =>
  `mfl-debug_${seed}_t${time.toFixed(3)}_${createdAt
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '_')}`;
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export type DebugPackage = { basename: string; json: Blob; video?: Blob };
export type DebugSaveResult =
  | { status: 'saved'; message: string }
  | { status: 'downloaded'; message: string }
  | { status: 'cancelled' };

type DirectoryHandle = {
  name: string;
  getFileHandle(
    name: string,
    options: { create: true },
  ): Promise<{
    createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
};

export const saveDebugPackage = async (
  pkg: DebugPackage,
  picker = (window as Window & { showDirectoryPicker?: () => Promise<DirectoryHandle> })
    .showDirectoryPicker,
): Promise<DebugSaveResult> => {
  if (!picker) {
    downloadBlob(pkg.json, `${pkg.basename}.json`);
    if (pkg.video) downloadBlob(pkg.video, `${pkg.basename}.webm`);
    return {
      status: 'downloaded',
      message: 'Rozpoczęto pobieranie — sprawdź folder Pobrane przeglądarki.',
    };
  }
  try {
    const directory = await picker();
    const write = async (name: string, blob: Blob) => {
      const file = await directory.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
    };
    await write(`${pkg.basename}.json`, pkg.json);
    if (pkg.video) await write(`${pkg.basename}.webm`, pkg.video);
    return {
      status: 'saved',
      message: `Zapisano ${pkg.video ? 'JSON + WebM' : 'JSON'} w: ${directory.name}`,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      return { status: 'cancelled' };
    throw error;
  }
};

export type DebugCaptureStatus = 'idle' | 'capturing' | 'processing' | 'ready' | 'saved' | 'error';
export const isCaptureTriggerDisabled = (status: DebugCaptureStatus) =>
  status === 'capturing' || status === 'processing';
