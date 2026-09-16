import { z } from 'zod';
import { clampPitchPoint, distance, distanceToSegment, pitchPointSchema } from './matchSpace';
import type { BallCarrierIntent, MatchPlayerState, TacticalMatchState } from './matchState';

export const carryExecutionModeSchema = z.enum([
  'burst',
  'controlled',
  'tight_dribble',
  'evade',
  'shield',
]);
export type CarryExecutionMode = z.infer<typeof carryExecutionModeSchema>;
export const carryExecutionSchema = z.object({
  mode: carryExecutionModeSchema,
  localTarget: pitchPointSchema,
  speedFactor: z.number().positive(),
  touchDistance: z.number().positive(),
  closestDefenderDistance: z.number().nonnegative(),
  blockerId: z.string().optional(),
  projectedControl: z.number().min(0).max(1),
});
export type CarryExecution = z.infer<typeof carryExecutionSchema>;

const opponents = (state: TacticalMatchState, actor: MatchPlayerState) =>
  state.players.filter(
    (player) => player.team !== actor.team && player.profile.primaryPosition !== 'goalkeeper',
  );

/** Contextual micro-execution of an authoritative carry destination; never selects another action. */
export const deriveCarryExecution = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  intent: BallCarrierIntent,
): CarryExecution => {
  const defenders = opponents(state, actor)
    .map((player) => ({ player, metres: distance(player.position, actor.position) }))
    .sort((a, b) => a.metres - b.metres || a.player.id.localeCompare(b.player.id));
  const closest = defenders[0];
  const targetDistance = distance(actor.position, intent.target);
  const blocker = defenders.find(
    ({ player, metres }) =>
      metres < 7 && distanceToSegment(player.position, actor.position, intent.target) < 1.65,
  );
  let mode: CarryExecutionMode =
    !closest || closest.metres > 7
      ? targetDistance > 9 && Math.hypot(actor.velocity.x, actor.velocity.y) > 2
        ? 'burst'
        : 'controlled'
      : closest.metres < 2.2
        ? blocker
          ? 'shield'
          : 'tight_dribble'
        : blocker
          ? 'evade'
          : 'controlled';
  // Semantic hysteresis: retain a recent mode unless pressure crosses a meaningful boundary.
  if (intent.executionMode && state.time - (intent.modeSince ?? intent.startedAt) < 0.65)
    mode = intent.executionMode;
  let localTarget = intent.target;
  if (mode === 'evade' && blocker) {
    const dx = intent.target.x - actor.position.x;
    const dy = intent.target.y - actor.position.y;
    const length = Math.max(0.1, Math.hypot(dx, dy));
    const candidates = [-1, 1].map((side) =>
      clampPitchPoint({
        x: blocker.player.position.x + (-dy / length) * 3.2 * side,
        y: blocker.player.position.y + (dx / length) * 3.2 * side,
      }),
    );
    localTarget = candidates.sort((a, b) => {
      const clearance = (point: typeof a) =>
        Math.min(...defenders.map(({ player }) => distance(point, player.position)));
      const score = (point: typeof a) =>
        distance(point, intent.target) -
        clearance(point) * 0.7 +
        (point.y < 2 || point.y > 66 ? 5 : 0);
      return score(a) - score(b) || a.y - b.y;
    })[0]!;
  } else if (mode === 'shield' && closest) {
    const awayX = actor.position.x - closest.player.position.x;
    const awayY = actor.position.y - closest.player.position.y;
    const length = Math.max(0.1, Math.hypot(awayX, awayY));
    localTarget = clampPitchPoint({
      x: actor.position.x + awayX / length,
      y: actor.position.y + awayY / length,
    });
  }
  const a = actor.profile.attributes;
  const projectedControl = Math.max(
    0,
    Math.min(
      1,
      (a.dribbling + a.technique + a.agility + a.composure + a.gameReading) / 500 -
        Math.max(0, 3.5 - (closest?.metres ?? 10)) * 0.06,
    ),
  );
  return carryExecutionSchema.parse({
    mode,
    localTarget,
    speedFactor:
      mode === 'burst'
        ? 1.25
        : mode === 'controlled'
          ? 0.85
          : mode === 'evade'
            ? 0.72
            : mode === 'tight_dribble'
              ? 0.58
              : 0.42,
    touchDistance:
      mode === 'burst'
        ? 1.35
        : mode === 'controlled'
          ? 0.72
          : mode === 'tight_dribble'
            ? 0.38
            : mode === 'shield'
              ? 0.32
              : 0.5,
    closestDefenderDistance: closest?.metres ?? 105,
    ...(blocker ? { blockerId: blocker.player.id } : {}),
    projectedControl,
  });
};
