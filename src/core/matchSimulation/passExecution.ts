import { z } from 'zod';
import { RandomGenerator } from '../random/RandomGenerator';
import { distance, physicalPointSchema, pitchPointSchema, type PitchPoint } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import type { PassDelivery, PassLaunchIntent } from './passLaunchPlan';

export const passExecutionTypeSchema = z.enum([
  'normal',
  'weighted_ground',
  'ground_through',
  'lofted_through',
  'chipped',
  'driven',
  'cross_field',
  'backheel',
  'outside_foot',
  'weak_foot',
  'first_time',
  'turning_pass',
]);
export type PassExecutionType = z.infer<typeof passExecutionTypeSchema>;
export const passExecutionSchema = z.object({
  type: passExecutionTypeSchema,
  quality: z.number().min(0).max(1),
  facingError: z.number().min(0).max(Math.PI),
  pressure: z.number().min(0).max(1),
  incomingSpeed: z.number().nonnegative().optional(),
  incomingHeight: z.number().nonnegative().optional(),
  intendedTarget: pitchPointSchema,
  physicalTarget: physicalPointSchema,
});
export type PassExecution = z.infer<typeof passExecutionSchema>;

/** Interprets football intent using the current body and ability; the human never selects a trick.
 * The seed describes this release alone. Neither UI observation nor future receiver motion is RNG. */
export const interpretPassExecution = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  target: PitchPoint,
  intent: PassLaunchIntent,
  delivery: PassDelivery,
  options: { firstTime?: boolean; spatial?: boolean } = {},
): PassExecution => {
  const a = passer.profile.attributes;
  const metres = distance(passer.position, target);
  const direction = { x: target.x - passer.position.x, y: target.y - passer.position.y };
  const facingError = Math.abs(normalizeAngle(angleForVector(direction) - passer.facingAngle));
  const nearestOpponent = Math.min(
    14,
    ...state.players
      .filter((player) => player.team !== passer.team)
      .map((player) => distance(player.position, passer.position)),
  );
  const pressure = Math.max(0, 1 - nearestOpponent / 14);
  const lateral =
    direction.x * Math.cos(passer.facingAngle) - direction.y * Math.sin(passer.facingAngle);
  const weakerSide = passer.profile.dominantFoot === 'right' ? lateral < -1 : lateral > 1;
  let type: PassExecutionType =
    delivery === 'lofted'
      ? intent === 'through' || intent === 'lead'
        ? 'lofted_through'
        : metres < 22
          ? 'chipped'
          : Math.abs(direction.y) > 24
            ? 'cross_field'
            : 'driven'
      : intent === 'through'
        ? 'ground_through'
        : intent === 'lead' || options.spatial
          ? 'weighted_ground'
          : intent === 'direct'
            ? 'driven'
            : 'normal';
  if (options.firstTime) type = 'first_time';
  else if (delivery === 'ground' && facingError > 2.2 && metres < 12)
    type = a.technique >= 70 && a.passing >= 55 && pressure > 0.25 ? 'backheel' : 'turning_pass';
  else if (delivery === 'ground' && weakerSide && facingError > 0.65)
    type =
      a.technique >= 78 && passer.profile.weakFootProficiency < 65 ? 'outside_foot' : 'weak_foot';
  const awkwardTurn = type === 'turning_pass' ? (facingError / Math.PI) * 0.22 : 0;
  const weakPenalty =
    type === 'weak_foot' ? (1 - passer.profile.weakFootProficiency / 100) * 0.12 : 0;
  const distribution =
    passer.profile.primaryPosition === 'goalkeeper' &&
    state.restart?.phase === 'setup' &&
    state.scenario === 'goal_kick';
  const incomingSpeed = Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0);
  const incomingHeight = state.ball.height ?? 0;
  const firstTimeDifficulty = options.firstTime
    ? 0.03 +
      incomingSpeed / 160 +
      incomingHeight * 0.12 +
      (facingError / Math.PI) * 0.14 +
      Math.max(0, metres - 18) / 240
    : 0;
  const quality = Math.max(
    0.08,
    Math.min(
      1,
      ((distribution ? a.goalkeeperKicking : a.passing) * 2 +
        a.technique +
        a.gameReading +
        a.composure) /
        500 -
        pressure * 0.2 -
        awkwardTurn -
        weakPenalty -
        firstTimeDifficulty,
    ),
  );
  // Ordinary feet passing keeps its existing calibration. Spatial/difficult releases reveal
  // their real accuracy envelope, including touchline exits rather than clipping errors in-bounds.
  const spread =
    options.spatial || options.firstTime || intent === 'lead' || distribution
      ? (0.18 + metres * 0.045) * (1 - quality) +
        (type === 'turning_pass' || type === 'first_time' ? (1 - quality) * 0.65 : 0)
      : (0.1 + metres * 0.015) * (1 - quality);
  const rng = RandomGenerator.fromSeed(
    `${state.seed}:pass-execution:${state.decisionIndex}:${passer.id}`,
  );
  const lateralError = (rng.float() - 0.5) * 2 * spread;
  const depthError = (rng.float() - 0.5) * spread;
  const length = Math.max(0.001, metres);
  return passExecutionSchema.parse({
    type,
    quality,
    facingError,
    pressure,
    ...(options.firstTime ? { incomingSpeed, incomingHeight } : {}),
    intendedTarget: { ...target },
    physicalTarget: {
      x: target.x + (direction.x / length) * depthError - (direction.y / length) * lateralError,
      y: target.y + (direction.y / length) * depthError + (direction.x / length) * lateralError,
    },
  });
};
