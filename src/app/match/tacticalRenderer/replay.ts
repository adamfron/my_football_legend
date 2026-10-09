import { tacticalToWorld, type TacticalFrame } from './model';
import type { AnimationCue } from './model';
import type { ReplaySnapshot } from '../../../core/matchSimulation/matchReplay';
import { CUE_DURATION_MS } from './animation';
import { frameActionEvents } from './actionFeedback';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const interpolateFacing = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Interpolate only recorded adjacent samples; no extrapolation or replay simulation. */
export const interpolatePresentationFrames = (
  previous: TacticalFrame,
  next: TacticalFrame,
  atMs: number,
): TacticalFrame => {
  if (atMs >= next.timestampMs) return next;
  if (atMs <= previous.timestampMs) return previous;
  const events = frameActionEvents(
    [
      ...new Map(
        [...(previous.actionEvents ?? []), ...(next.actionEvents ?? [])].map((event) => [
          event.id,
          event,
        ]),
      ).values(),
    ],
    atMs,
  );
  const dismissals = { ...previous.dismissals, ...next.dismissals };
  const dismissedIds = new Set([
    ...Object.entries(dismissals)
      .filter(([, at]) => at <= atMs)
      .map(([id]) => id),
    ...events
      .filter(
        (event) =>
          event.kind === 'card' &&
          (event.outcome === 'red' || event.outcome === 'second_yellow_red'),
      )
      .map((event) => event.actorId),
  ]);
  const players = previous.players.filter((player) => !dismissedIds.has(player.id));
  const gap = next.timestampMs - previous.timestampMs;
  // Skipped/background football and restart teleports must never become invented paths.
  if (gap > 250 || next.continuity !== previous.continuity)
    return previous.actionEvents?.length ||
      next.actionEvents?.length ||
      Object.keys(dismissals).length
      ? { ...previous, timestampMs: atMs, players, actionEvents: events, dismissals }
      : previous;
  const t = (atMs - previous.timestampMs) / gap;
  return {
    ...previous,
    timestampMs: atMs,
    // Adjacent samples contain actual contacts, not future animation guesses. Reveal at T.
    actionEvents: events,
    dismissals,
    players: players.map((player) => {
      const target = next.players.find((p) => p.id === player.id);
      if (!target || Math.hypot(target.x - player.x, target.y - player.y) > 2) return player;
      return {
        ...player,
        x: lerp(player.x, target.x, t),
        y: lerp(player.y, target.y, t),
        facing: interpolateFacing(player.facing ?? 0, target.facing ?? player.facing ?? 0, t),
        gaitPhase: lerp(player.gaitPhase ?? 0, target.gaitPhase ?? player.gaitPhase ?? 0, t),
        gaitSpeed: lerp(player.gaitSpeed ?? 0, target.gaitSpeed ?? player.gaitSpeed ?? 0, t),
        // Never reveal a future contact/action before its canonical time.
        cue: target.cue && target.cue.atMs <= atMs ? target.cue : player.cue,
        ...(target.preparationSinceMs !== undefined && target.preparationSinceMs <= atMs
          ? {
              preparation: target.preparation,
              preparationSinceMs: target.preparationSinceMs,
              canonicalBallPlacement: Boolean(target.canonicalBallPlacement),
            }
          : {}),
      };
    }),
    ball:
      previous.ball.ownerId !== next.ball.ownerId ||
      next.players.some(
        (p) => p.cue && p.cue.atMs > previous.timestampMs && p.cue.atMs <= next.timestampMs,
      )
        ? previous.ball
        : {
            ...previous.ball,
            x: lerp(previous.ball.x, next.ball.x, t),
            y: lerp(previous.ball.y, next.ball.y, t),
            height: lerp(previous.ball.height ?? 0, next.ball.height ?? 0, t),
          },
  };
};

/** Converts the renderer-free event recording without rerunning football or mutating history. */
export const replaySnapshotToFrame = (snapshot: ReplaySnapshot): TacticalFrame => {
  const carryMode = snapshot.players.find((player) => player.id === snapshot.ball.ownerId)?.carrying
    ?.mode;
  return {
    timestampMs: snapshot.timestampMs,
    continuity: snapshot.continuity,
    ball: { ...snapshot.ball },
    actionEvents: snapshot.actionEvents,
    dismissals: snapshot.dismissals,
    ...(carryMode ? { carryMode } : {}),
    players: snapshot.players.map(({ possessionPreparation, carrying, ...player }) => {
      const event = [...snapshot.actionEvents]
        .reverse()
        .find(
          (candidate) =>
            candidate.actorId === player.id &&
            snapshot.timestampMs - candidate.at * 1000 >= 0 &&
            snapshot.timestampMs - candidate.at * 1000 < CUE_DURATION_MS &&
            [
              'pass',
              'through_pass',
              'cross',
              'shot',
              'reception',
              'heavy_touch',
              'tackle',
              'slide_tackle',
            ].includes(candidate.kind),
        );
      const kind: AnimationCue['kind'] | undefined = event
        ? event.kind === 'shot'
          ? 'shot'
          : event.kind === 'cross'
            ? 'cross'
            : event.kind === 'slide_tackle'
              ? 'slide'
              : event.kind === 'tackle'
                ? 'tackle'
                : ['reception', 'heavy_touch'].includes(event.kind)
                  ? 'receive'
                  : 'pass'
        : undefined;
      const micro = possessionPreparation?.micro;
      const preparation =
        carrying && snapshot.ball.ownerId === player.id
          ? {
              preparation:
                carrying.mode === 'shield' ? ('shielding' as const) : ('carrying' as const),
              preparationSinceMs: carrying.startedAt * 1000,
              canonicalBallPlacement: true,
            }
          : micro &&
              (snapshot.ball.ownerId === player.id ||
                (micro.phase === 'recovering' &&
                  snapshot.timestampMs < possessionPreparation.readyAt * 1000))
            ? {
                preparation: micro.phase,
                preparationSinceMs: micro.startedAt * 1000,
                canonicalBallPlacement: true,
              }
            : {};
      return {
        ...player,
        ...(kind && event ? { cue: { kind, atMs: event.at * 1000 } } : {}),
        ...preparation,
      };
    }),
  };
};

export const sampleReplayFrame = (frames: readonly TacticalFrame[], atMs: number) => {
  if (!frames.length) return undefined;
  if (atMs <= frames[0]!.timestampMs) return frames[0];
  let low = 0,
    high = frames.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle]!.timestampMs < atMs) low = middle + 1;
    else high = middle;
  }
  return interpolatePresentationFrames(frames[Math.max(0, low - 1)]!, frames[low]!, atMs);
};

export const appendReplayFrame = (frames: TacticalFrame[], frame: TacticalFrame) => {
  const last = frames.at(-1);
  if (last && frame.timestampMs < last.timestampMs) frames.length = 0;
  if (frames.at(-1)?.timestampMs === frame.timestampMs) frames[frames.length - 1] = frame;
  else frames.push(frame);
  while (frames.length > 1 && frame.timestampMs - frames[0]!.timestampMs > 10_000) frames.shift();
};

/** Stable oblique framing follows the actual ball, independent of the controlled footballer. */
export const deriveReplayCameraPose = (frame: TacticalFrame) => {
  const ball = tacticalToWorld(frame.ball);
  return {
    position: { x: ball.x - 24, y: 23, z: ball.z + 26 },
    lookAt: { x: ball.x, y: Math.min(3, frame.ball.height ?? 0) * 0.35, z: ball.z },
  };
};
