import { z } from 'zod';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';

export const pathologicalCaptureSchema = z.object({
  schemaVersion: z.literal(1),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  stepSeconds: z.literal(0.025),
  reason: z.string().min(1),
  state: tacticalMatchStateSchema,
});
export type PathologicalCapture = z.infer<typeof pathologicalCaptureSchema>;

/** Validate the boundary, but retain the entire JSON graph, including unknown legacy
 * fields. Parsing must not apply defaults, migrate preparation or rebuild ownership.
 * The canonical RNG is derived from seed/time/decisionIndex, all inside this graph. */
export const capturePathologicalState = (
  state: TacticalMatchState,
  sourceCommit: string,
  reason: string,
): PathologicalCapture => {
  const capture = JSON.parse(
    JSON.stringify({
      schemaVersion: 1,
      sourceCommit,
      stepSeconds: 0.025,
      reason,
      state,
    }),
  );
  pathologicalCaptureSchema.parse(capture);
  return capture;
};

export const restorePathologicalState = (input: unknown): TacticalMatchState => {
  pathologicalCaptureSchema.parse(input);
  // No references shared with the observer, archive or another continuation.
  return JSON.parse(JSON.stringify((input as PathologicalCapture).state));
};

export const pathologySignalSchema = z.enum([
  'stationary_possession',
  'preparation_without_release',
  'rejected_release',
  'unchanged_containment',
  'readiness_oscillation',
]);
export type PathologySignal = z.infer<typeof pathologySignalSchema>;

/** An external diagnostic, never called by the physical stepping model. Signals
 * can come from causal trace observers; each owner/episode/reason is captured once. */
export const createPathologyDetector = (thresholdSeconds = 20) => {
  let owner: string | undefined;
  let episode: number | undefined;
  let stationary = 0;
  let previousPosition: { x: number; y: number } | undefined;
  const emitted = new Set<PathologySignal>();
  return (state: TacticalMatchState, dt: number, signal?: PathologySignal) => {
    if (owner !== state.ball.ownerId || episode !== state.ballEpisode) {
      owner = state.ball.ownerId;
      episode = state.ballEpisode;
      stationary = 0;
      previousPosition = undefined;
      emitted.clear();
    }
    const actor = state.players.find((p) => p.id === owner);
    const speed =
      actor && previousPosition
        ? Math.hypot(actor.position.x - previousPosition.x, actor.position.y - previousPosition.y) /
          dt
        : actor
          ? Math.hypot(actor.velocity.x, actor.velocity.y)
          : Infinity;
    previousPosition = actor ? { ...actor.position } : undefined;
    stationary =
      actor && !state.restart && state.scenario === 'open_play' && speed < 0.35
        ? stationary + dt
        : 0;
    const reason = signal ?? (stationary >= thresholdSeconds ? 'stationary_possession' : undefined);
    if (!reason || emitted.has(reason)) return undefined;
    emitted.add(reason);
    return reason;
  };
};
