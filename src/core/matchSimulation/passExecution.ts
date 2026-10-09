import { isRestartSetup } from './restartPhase';
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

export const passDifficultyProfileSchema = z.object({
  ability: z.number().min(0).max(1),
  difficulty: z.number().nonnegative(),
  uncertaintyMetres: z.number().positive(),
  facingError: z.number().min(0).max(Math.PI),
  pressure: z.number().min(0).max(1),
});
export type PassDifficultyProfile = z.infer<typeof passDifficultyProfileSchema>;

/** Shared distribution, before sampling. No distance gate or identity/role utility bonus.
 * Metres/18 scales continuous range demands; the low end represents poor football competence.
 * Geometric skill aggregation prevents other good attributes from erasing a missing pass skill. */
export const derivePassDifficulty = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  target: PitchPoint,
  intent: PassLaunchIntent,
  delivery: PassDelivery,
  options: { firstTime?: boolean; receiverSpeed?: number } = {},
): PassDifficultyProfile => {
  const a = passer.profile.attributes;
  const distribution =
    passer.profile.primaryPosition === 'goalkeeper' &&
    isRestartSetup(state) &&
    state.scenario === 'goal_kick';
  const primary = (distribution ? a.goalkeeperKicking : a.passing) / 100;
  const ability =
    Math.pow(primary, 0.65) *
    Math.pow(a.technique / 100, 0.25) *
    Math.pow((a.gameReading + a.composure) / 200, 0.1);
  const dx = target.x - passer.position.x,
    dy = target.y - passer.position.y;
  const metres = Math.hypot(dx, dy);
  const facingError = Math.abs(
    normalizeAngle(angleForVector({ x: dx, y: dy }) - passer.facingAngle),
  );
  const nearest = Math.min(
    14,
    ...state.players
      .filter((p) => p.team !== passer.team)
      .map((p) => distance(p.position, passer.position)),
  );
  const pressure = Math.max(0, 1 - nearest / 14);
  const lateral = dx * Math.cos(passer.facingAngle) - dy * Math.sin(passer.facingAngle);
  const weaker = passer.profile.dominantFoot === 'right' ? lateral < -1 : lateral > 1;
  const incoming = options.firstTime
    ? 0.3 +
      Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0) / 55 +
      (state.ball.height ?? 0) * 0.4
    : 0;
  const difficulty =
    1 +
    Math.abs(dy) / 50 +
    (delivery === 'lofted' ? 0.25 : 0) +
    (intent === 'lead' || intent === 'through' ? 0.2 + (options.receiverSpeed ?? 0) / 24 : 0) +
    Math.pow(facingError / Math.PI, 2) * 0.75 +
    pressure * 0.7 +
    (weaker ? (1 - passer.profile.weakFootProficiency / 100) * 0.2 : 0) +
    incoming;
  const rangeDemand = 0.18 + metres * 0.03 + Math.pow(metres / 18, 2) * 0.55;
  const uncertaintyMetres =
    0.12 + rangeDemand * (0.09 + Math.pow(1 - ability, 2) / (0.08 + ability)) * difficulty;
  return passDifficultyProfileSchema.parse({
    ability,
    difficulty,
    uncertaintyMetres,
    facingError,
    pressure,
  });
};

/** Interprets football intent using the current body and ability; the human never selects a trick.
 * The seed describes this release alone. Neither UI observation nor future receiver motion is RNG. */
export const interpretPassExecution = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  target: PitchPoint,
  intent: PassLaunchIntent,
  delivery: PassDelivery,
  options: { firstTime?: boolean; spatial?: boolean; receiverSpeed?: number } = {},
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
  const incomingSpeed = Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0);
  const incomingHeight = state.ball.height ?? 0;
  const profile = derivePassDifficulty(state, passer, target, intent, delivery, options);
  const quality = profile.ability / (1 + (profile.difficulty - 1) * 0.25 + metres / 400);
  const rng = RandomGenerator.fromSeed(
    `${state.seed}:pass-execution:${state.decisionIndex}:${passer.id}`,
  );
  // Unbounded Gaussian tails permit occasional perfect connections and occasional elite errors.
  const radius = Math.sqrt(-2 * Math.log(Math.max(1e-12, rng.float())));
  const angle = rng.float() * Math.PI * 2;
  const lateralError = radius * Math.cos(angle) * profile.uncertaintyMetres;
  const depthError = radius * Math.sin(angle) * profile.uncertaintyMetres * 0.65;
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
