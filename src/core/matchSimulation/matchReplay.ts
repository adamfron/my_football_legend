import { isMatchGoalkeeper } from './matchGoalkeeper';
import {
  canonicalPlayerPresentationShape,
  canonicalBallPresentation,
  projectPresentationPlayers,
  projectCanonicalPlayerPresentation,
  presentationDiscontinuity,
  ballPresentationDiscontinuity,
  importantPresentationChange,
  releasePresentationSchema,
  projectCanonicalReleasePresentation,
  observeCanonicalReleasePresentations,
  RELEASE_PRESENTATION_DURATION_MS,
  type ReleasePresentation,
} from './canonicalPresentation';
import { isRestartSetup } from './restartPhase';
import { z } from 'zod';
import { canonicalActionEventSchema } from './actionEvents';
import { onBallPreparationSchema } from './onBallPreparation';
import { teamSideSchema, physicalPointSchema } from './matchSpace';
import type { TacticalMatchState } from './matchState';
import { matchEventSchema, matchEventKindSchema } from './matchEventFeed';

export const REPLAY_SAMPLE_SECONDS = 0.2;
export const REPLAY_ROLLING_SECONDS = 12;
export const REPLAY_MAX_ROLLING_SAMPLES = 192;
export const REPLAY_BEFORE_SECONDS = 6;
export const REPLAY_AFTER_SECONDS = 3;
export const REPLAY_MAX_WINDOWS = 8;
export const REPLAY_MAX_WINDOW_SAMPLES = 144;
export const replaySnapshotSchema = z.object({
  timestampMs: z.number().nonnegative(),
  continuity: z.string(),
  ballContinuity: z.string().optional(),
  keyframe: z.boolean().optional(),
  players: z
    .array(
      physicalPointSchema.extend({
        ...canonicalPlayerPresentationShape,
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
        target: physicalPointSchema.optional(),
        anchor: physicalPointSchema.optional(),
        idealTarget: physicalPointSchema.optional(),
        releaseCue: releasePresentationSchema.optional(),
        possessionPreparation: onBallPreparationSchema.optional(),
        carrying: z
          .object({
            mode: z.enum(['burst', 'controlled', 'tight_dribble', 'evade', 'shield']).optional(),
            startedAt: z.number().nonnegative(),
          })
          .optional(),
      }),
    )
    .max(52),
  ball: physicalPointSchema.extend({
    height: z.number().nonnegative(),
    ownerId: z.string().optional(),
    radius: z.number().positive().optional(),
    velocity: physicalPointSchema.extend({ z: z.number().finite().optional() }).optional(),
  }),
  restart: z
    .object({
      spot: physicalPointSchema,
      phase: z.enum(['setup', 'preparing', 'awaiting_decision', 'kick_preparation', 'release']),
      takerId: z.string(),
      wallIds: z.array(z.string()).max(22),
      deliveryTarget: physicalPointSchema.optional(),
      ready: z.boolean(),
      scenario: z.string().optional(),
      blockers: z.array(z.string()).max(48).optional(),
      retrievalStage: z.enum(['approach', 'transport', 'placed']).optional(),
    })
    .optional(),
  actionEvents: z.array(canonicalActionEventSchema).max(96),
  dismissals: z.record(z.string(), z.number().nonnegative()),
});
export type ReplaySnapshot = z.infer<typeof replaySnapshotSchema>;
export const replayEventSchema = matchEventSchema.extend({
  kind: z.enum([
    ...matchEventKindSchema.options,
    'dangerous_shot',
    'save',
    'near_miss',
    'decisive_challenge',
  ]),
});
export type ReplayEvent = z.infer<typeof replayEventSchema>;
export const matchReplayWindowSchema = z.object({
  event: replayEventSchema,
  frames: z.array(replaySnapshotSchema).max(REPLAY_MAX_WINDOW_SAMPLES),
  complete: z.boolean(),
});
export type MatchReplayWindow = z.infer<typeof matchReplayWindowSchema>;

export const captureReplaySnapshot = (
  state: TacticalMatchState,
  continuity: number,
  previous?: TacticalMatchState,
  keyframe = false,
  releaseCues?: ReadonlyMap<string, ReleasePresentation>,
): ReplaySnapshot => ({
  timestampMs: state.time * 1000,
  continuity: `replay:${state.seed}:${continuity}:${presentationDiscontinuity(state)}`,
  ballContinuity: ballPresentationDiscontinuity(state),
  keyframe,
  players: projectPresentationPlayers(state).map((p) => {
    const observed = releaseCues?.get(p.id);
    const current = projectCanonicalReleasePresentation(state, p.id);
    const releaseCue =
      observed &&
      observed.atMs <= state.time * 1000 &&
      state.time * 1000 - observed.atMs < RELEASE_PRESENTATION_DURATION_MS &&
      (!current || observed.atMs > current.atMs)
        ? observed
        : current;
    return {
      id: p.id,
      team: p.team,
      x: p.position.x,
      y: p.position.y,
      facing: p.facingAngle,
      velocity: { ...p.velocity },
      goalkeeper: isMatchGoalkeeper(p),
      protagonist: p.id === state.controlledFootballerId,
      displayNumber: p.slotIndex + 1,
      heightCm: p.profile.heightCm,
      weightKg: p.profile.weightKg,
      dominantFoot: p.profile.dominantFoot,
      target: { ...p.target },
      anchor: { ...p.neutralAnchor },
      idealTarget: { ...p.idealTarget },
      ...projectCanonicalPlayerPresentation(state, p, previous),
      ...(releaseCue ? { releaseCue: { ...releaseCue } } : {}),
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
    };
  }),
  ball: canonicalBallPresentation(state),
  ...(state.restart && state.restart.phase !== 'release'
    ? {
        restart: {
          spot: { ...(state.restart.spot ?? { x: state.ball.x, y: state.ball.y }) },
          phase: state.restart.phase,
          takerId: state.restart.takerId,
          wallIds: Object.entries(state.restart.roles)
            .filter(([, role]) => role.key === 'wall')
            .map(([id]) => id),
          ...(state.restart.selectedAction && 'target' in state.restart.selectedAction
            ? { deliveryTarget: { ...state.restart.selectedAction.target } }
            : {}),
          ready: Boolean(
            state.restart.readiness?.ballReady &&
              state.restart.readiness.takerReady &&
              state.restart.readiness.legalReady,
          ),
          scenario: state.scenario,
          blockers: [...(state.restart.readiness?.blockers ?? [])],
          retrievalStage: state.restart.retrieval?.stage,
        },
      }
    : {}),
  actionEvents: structuredClone((state.actionEvents ?? []).filter((e) => state.time - e.at < 1.8)),
  dismissals: Object.fromEntries(
    Object.entries(state.discipline ?? {}).flatMap(([id, d]) =>
      d.sentOffAt !== undefined ? [[id, d.sentOffAt * 1000]] : [],
    ),
  ),
});

const replayTitles: Record<ReplayEvent['kind'], string> = {
  goal: 'Gol',
  yellow_card: 'Żółta kartka',
  second_yellow_red: 'Druga żółta kartka',
  red_card: 'Czerwona kartka',
  penalty: 'Rzut karny',
  foul: 'Faul',
  offside: 'Spalony',
  kick_off: 'Wznowienie',
  substitution: 'Zmiana',
  injury: 'Uraz',
  dangerous_shot: 'Groźny strzał',
  save: 'Interwencja bramkarza',
  near_miss: 'Bliski strzał',
  decisive_challenge: 'Decydujący odbiór',
};
export const replayWindowMetadataSchema = z.object({
  replayKey: z.string(),
  title: z.string(),
  eventAt: z.number().nonnegative(),
  actorId: z.string().optional(),
  kind: replayEventSchema.shape.kind,
  complete: z.boolean(),
});
export type ReplayWindowMetadata = z.infer<typeof replayWindowMetadataSchema>;

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
  private previous: TacticalMatchState | undefined;
  private actionSequence = -1;
  private releaseCues = new Map<string, ReleasePresentation>();
  observe(state: TacticalMatchState) {
    if (state.seed !== this.seed || state.time < this.lastTime) this.reset(state.seed);
    const previous = this.previous;
    this.lastTime = state.time;
    const events = state.matchEvents ?? [];
    const fresh: ReplayEvent[] = events.slice(this.eventCount);
    this.eventCount = events.length;
    for (const event of state.actionEvents ?? []) {
      if (event.sequence <= this.actionSequence) continue;
      const shot = state.ball.shot ?? state.lastShot;
      const kind =
        event.kind === 'save'
          ? 'save'
          : event.kind === 'shot' &&
              shot?.shooterId === event.actorId &&
              shot.effectiveScoringExpectation >= 0.1
            ? 'dangerous_shot'
            : ['tackle', 'slide_tackle'].includes(event.kind) &&
                event.outcome === 'won' &&
                (event.team === 'home' ? event.position.x < 35 : event.position.x > 70)
              ? 'decisive_challenge'
              : undefined;
      if (kind)
        fresh.push({
          id: event.id,
          replayKey: event.id,
          at: event.at,
          kind,
          actorId: event.actorId,
          team: event.team,
          relatedPlayerId: event.targetId,
          actionEventId: event.id,
        });
      this.actionSequence = Math.max(this.actionSequence, event.sequence);
    }
    const shot = state.lastShot;
    if (
      shot &&
      (shot.shotId !== previous?.lastShot?.shotId ||
        shot.outcome !== previous?.lastShot?.outcome) &&
      ['miss', 'post', 'crossbar'].includes(shot.outcome ?? '') &&
      (shot.outcome !== 'miss' ||
        (Math.abs(shot.actualTarget.horizontal) <= 1.35 &&
          shot.actualTarget.vertical <= 1.25 &&
          shot.effectiveScoringExpectation >= 0.08))
    ) {
      const actor = [...state.players, ...(state.departedPlayers ?? [])].find(
        (p) => p.id === shot.shooterId,
      );
      const at =
        state.lastBallContact && state.lastBallContact.at >= (shot.releasedAt ?? state.time)
          ? state.lastBallContact.at
          : state.time;
      if (actor)
        fresh.push({
          id: `${shot.shotId}:near-miss`,
          replayKey: `${shot.shotId}:near-miss`,
          at,
          kind: 'near_miss',
          team: actor.team,
          actorId: actor.id,
          contactId: shot.shotId,
        });
    }
    if (isRestartSetup(state) && state.restart.startedAt !== this.lastRestart) this.continuity++;
    this.lastRestart = state.restart?.startedAt;
    const last = this.rolling.at(-1);
    const keyframe = importantPresentationChange(previous, state) || fresh.length > 0;
    const terminal = ['half_time', 'full_time', 'abandoned'].includes(state.status ?? '');
    if (
      !fresh.length &&
      !keyframe &&
      !terminal &&
      last &&
      state.time * 1000 - last.timestampMs < REPLAY_SAMPLE_SECONDS * 1000 - 0.01
    ) {
      observeCanonicalReleasePresentations(state, this.releaseCues);
      this.previous = state;
      return;
    }
    // Missing observations must never become an invented interpolation across hidden seconds.
    if (last && state.time * 1000 - last.timestampMs > REPLAY_SAMPLE_SECONDS * 2000 + 0.01)
      this.continuity++;
    // Retain both real sides of an observed transition; interpolation cannot fabricate a touch.
    if (
      keyframe &&
      previous &&
      previous.time < state.time &&
      last?.timestampMs !== previous.time * 1000
    ) {
      const before = captureReplaySnapshot(
        previous,
        this.continuity,
        undefined,
        true,
        this.releaseCues,
      );
      this.rolling.push(before);
      for (const window of this.windows.values())
        if (!window.complete && previous.time <= window.event.at + REPLAY_AFTER_SECONDS)
          window.frames = [...window.frames, before].slice(-REPLAY_MAX_WINDOW_SAMPLES);
    }
    observeCanonicalReleasePresentations(state, this.releaseCues);
    const frame = captureReplaySnapshot(
      state,
      this.continuity,
      previous,
      keyframe,
      this.releaseCues,
    );
    this.previous = state;
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
  listWindows(): ReplayWindowMetadata[] {
    return [...this.windows.values()]
      .sort((a, b) => a.event.at - b.event.at || a.event.replayKey.localeCompare(b.event.replayKey))
      .map((window) => ({
        replayKey: window.event.replayKey,
        title: replayTitles[window.event.kind],
        eventAt: window.event.at,
        actorId: window.event.actorId,
        kind: window.event.kind,
        complete: this.hasWindow(window.event.replayKey),
      }));
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
      keyframes: [...unique].filter((frame) => frame.keyframe).length,
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
    this.previous = undefined;
    this.actionSequence = -1;
    this.releaseCues.clear();
  }
}
