import { isRestartSetup } from './restartPhase';
import { z } from 'zod';
import { canonicalActionEventSchema } from './actionEvents';
import { onBallPreparationSchema } from './onBallPreparation';
import { teamSideSchema, physicalPointSchema } from './matchSpace';
import type { TacticalMatchState } from './matchState';
import { matchEventSchema } from './matchEventFeed';

export const REPLAY_SAMPLE_SECONDS = 0.2;
export const REPLAY_ROLLING_SECONDS = 12;
export const REPLAY_MAX_ROLLING_SAMPLES = 64;
export const REPLAY_BEFORE_SECONDS = 6;
export const REPLAY_AFTER_SECONDS = 3;
export const REPLAY_MAX_WINDOWS = 8;
export const REPLAY_MAX_WINDOW_SAMPLES = 50;
export const replaySnapshotSchema = z.object({
  timestampMs: z.number().nonnegative(),
  continuity: z.string(),
  players: z
    .array(
      physicalPointSchema.extend({
        id: z.string(),
        team: teamSideSchema,
        facing: z.number(),
        velocity: physicalPointSchema,
        goalkeeper: z.boolean(),
        protagonist: z.boolean(),
        displayNumber: z.number().int(),
        heightCm: z.number(),
        weightKg: z.number(),
        dominantFoot: z.enum(['left', 'right']),
        possessionPreparation: onBallPreparationSchema.optional(),
        carrying: z
          .object({
            mode: z.enum(['burst', 'controlled', 'tight_dribble', 'evade', 'shield']).optional(),
            startedAt: z.number().nonnegative(),
          })
          .optional(),
      }),
    )
    .max(22),
  ball: physicalPointSchema.extend({
    height: z.number().nonnegative(),
    ownerId: z.string().optional(),
  }),
  actionEvents: z.array(canonicalActionEventSchema).max(96),
  dismissals: z.record(z.string(), z.number().nonnegative()),
});
export type ReplaySnapshot = z.infer<typeof replaySnapshotSchema>;
export const matchReplayWindowSchema = z.object({
  event: matchEventSchema,
  frames: z.array(replaySnapshotSchema).max(REPLAY_MAX_WINDOW_SAMPLES),
  complete: z.boolean(),
});
export type MatchReplayWindow = z.infer<typeof matchReplayWindowSchema>;

/** Canonical sampled evidence, independent of React/Three and optional for batch consumers.
 * No live state/profile/ledger references are retained. All windows have an explicit bound. */
export class MatchReplayHistory {
  private rolling: ReplaySnapshot[] = [];
  private windows = new Map<string, MatchReplayWindow>();
  private seed?: string;
  private lastTime = -Infinity;
  private lastRestart: number | undefined;
  private continuity = 0;
  private eventCount = 0;
  observe(state: TacticalMatchState) {
    if (state.seed !== this.seed || state.time < this.lastTime) this.reset(state.seed);
    this.lastTime = state.time;
    const events = state.matchEvents ?? [];
    const fresh = events.slice(this.eventCount);
    this.eventCount = events.length;
    if (isRestartSetup(state) && state.restart.startedAt !== this.lastRestart) this.continuity++;
    this.lastRestart = state.restart?.startedAt;
    const last = this.rolling.at(-1);
    const terminal = ['half_time', 'full_time', 'abandoned'].includes(state.status ?? '');
    if (
      !fresh.length &&
      !terminal &&
      last &&
      state.time * 1000 - last.timestampMs < REPLAY_SAMPLE_SECONDS * 1000 - 0.01
    )
      return;
    // Missing observations must never become an invented interpolation across hidden seconds.
    if (last && state.time * 1000 - last.timestampMs > REPLAY_SAMPLE_SECONDS * 2000 + 0.01)
      this.continuity++;
    const frame: ReplaySnapshot = {
      timestampMs: state.time * 1000,
      continuity: `replay:${state.seed}:${this.continuity}`,
      players: state.players.map((p) => ({
        id: p.id,
        team: p.team,
        x: p.position.x,
        y: p.position.y,
        facing: p.facingAngle,
        velocity: { ...p.velocity },
        goalkeeper: p.profile.primaryPosition === 'goalkeeper',
        protagonist: p.id === state.controlledFootballerId,
        displayNumber: p.slotIndex + 1,
        heightCm: p.profile.heightCm,
        weightKg: p.profile.weightKg,
        dominantFoot: p.profile.dominantFoot,
        ...(state.ball.ownerId === p.id && state.ballCarrierIntent?.actorId === p.id
          ? {
              carrying: {
                mode: state.ballCarrierIntent.executionMode,
                startedAt: state.ballCarrierIntent.startedAt,
              },
            }
          : {}),
        ...(state.onBallPreparation?.actorId === p.id
          ? { possessionPreparation: structuredClone(state.onBallPreparation) }
          : {}),
      })),
      ball: {
        x: state.ball.x,
        y: state.ball.y,
        height: state.ball.height ?? 0,
        ownerId: state.ball.ownerId,
      },
      actionEvents: structuredClone(
        (state.actionEvents ?? []).filter((e) => state.time - e.at < 1.8),
      ),
      dismissals: Object.fromEntries(
        Object.entries(state.discipline ?? {}).flatMap(([id, d]) =>
          d.sentOffAt !== undefined ? [[id, d.sentOffAt * 1000]] : [],
        ),
      ),
    };
    if (last?.timestampMs === frame.timestampMs) this.rolling[this.rolling.length - 1] = frame;
    else this.rolling.push(frame);
    while (
      this.rolling.length > REPLAY_MAX_ROLLING_SAMPLES ||
      (this.rolling.length > 1 &&
        frame.timestampMs - this.rolling[0]!.timestampMs > REPLAY_ROLLING_SECONDS * 1000)
    )
      this.rolling.shift();
    for (const [id, window] of this.windows) {
      if (window.complete) continue;
      const frames =
        state.time > window.event.at + REPLAY_AFTER_SECONDS + REPLAY_SAMPLE_SECONDS
          ? window.frames
          : window.frames.at(-1)?.timestampMs === frame.timestampMs
            ? [...window.frames.slice(0, -1), frame]
            : [...window.frames, frame].slice(-REPLAY_MAX_WINDOW_SAMPLES);
      this.windows.set(id, {
        ...window,
        frames,
        complete: terminal || state.time >= window.event.at + REPLAY_AFTER_SECONDS,
      });
    }
    for (const event of fresh) {
      if (['foul', 'kick_off'].includes(event.kind)) continue;
      const frames = this.rolling
        .filter(
          (f) =>
            f.timestampMs >= (event.at - REPLAY_BEFORE_SECONDS) * 1000 &&
            f.timestampMs <= (event.at + REPLAY_AFTER_SECONDS) * 1000,
        )
        .slice(-REPLAY_MAX_WINDOW_SAMPLES);
      // Loading a feed or observing a sparse fast-forward can introduce old permanent events.
      // Keep the event visible, but offer replay only when the incident itself was recorded.
      if (
        !frames.some(
          (f) => Math.abs(f.timestampMs - event.at * 1000) <= REPLAY_SAMPLE_SECONDS * 1000 + 0.01,
        )
      )
        continue;
      this.windows.set(event.replayKey, {
        event: structuredClone(event),
        frames,
        complete: terminal || state.time >= event.at + REPLAY_AFTER_SECONDS,
      });
      while (this.windows.size > REPLAY_MAX_WINDOWS)
        this.windows.delete(this.windows.keys().next().value!);
    }
  }
  getWindow(eventId: string): MatchReplayWindow | undefined {
    const window = this.windows.get(eventId);
    return window ? structuredClone(window) : undefined;
  }
  hasWindow(eventId: string): boolean {
    const window = this.windows.get(eventId);
    return Boolean(
      window?.complete &&
        window.frames.length >= 2 &&
        window.frames[0]!.timestampMs <= window.event.at * 1000 &&
        window.frames.at(-1)!.timestampMs >= window.event.at * 1000,
    );
  }
  snapshot() {
    const retained = [...this.rolling, ...[...this.windows.values()].flatMap((w) => w.frames)];
    const unique = new Set(retained);
    return {
      rollingSamples: this.rolling.length,
      windows: this.windows.size,
      retainedSamples: unique.size,
      estimatedBytes: JSON.stringify([...unique]).length * 2,
      sampleHz: 1 / REPLAY_SAMPLE_SECONDS,
      maxWindows: REPLAY_MAX_WINDOWS,
    };
  }
  private reset(seed: string) {
    this.seed = seed;
    this.rolling = [];
    this.windows.clear();
    this.eventCount = 0;
    this.lastTime = -Infinity;
    this.lastRestart = undefined;
    this.continuity = 0;
  }
}
