import { z } from 'zod';
import { distance, distanceToSegment, PITCH_LENGTH, PITCH_WIDTH } from './matchSpace';
import { evaluatePressure } from './matchActions';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

export const shotRelevanceSchema = z.enum(['non_viable', 'speculative', 'credible', 'high_value']);

export const shootingOpportunitySchema = z.object({
  distance: z.number().nonnegative(),
  angle: z.number().min(0).max(1),
  pressure: z.number().min(0).max(1),
  blockingDefenders: z.number().int().nonnegative(),
  baseXg: z.number().min(0).max(1),
  shooterExecutionQuality: z.number().min(0).max(1),
  effectiveScoringExpectation: z.number().min(0).max(1),
  category: shotRelevanceSchema,
  /** @deprecated Compatibility projection; use effectiveScoringExpectation. */
  value: z.number().min(0).max(1),
});
export type ShootingOpportunity = z.infer<typeof shootingOpportunitySchema>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Chance quality is geometry-first. Player ability is applied only to the execution projection. */
export const evaluateShootingOpportunity = (
  state: TacticalMatchState,
  shooter: MatchPlayerState,
): ShootingOpportunity => {
  const goal = { x: shooter.team === 'home' ? PITCH_LENGTH : 0, y: PITCH_WIDTH / 2 };
  const metres = distance(shooter.position, goal);
  const lateral = Math.abs(shooter.position.y - PITCH_WIDTH / 2);
  const angle = clamp01(1 - lateral / Math.max(7, metres * 0.62));
  const pressure = evaluatePressure(state, shooter).value;
  const blockingDefenders = state.players.filter(
    (player) =>
      player.team !== shooter.team &&
      player.profile.primaryPosition !== 'goalkeeper' &&
      distance(player.position, shooter.position) < metres &&
      distanceToSegment(player.position, shooter.position, goal) < 1.65,
  ).length;

  // A smooth distance decay keeps 10–16 m chances useful while making 30 m attempts exceptional.
  const distanceQuality = 0.62 / (1 + Math.exp((metres - 15.5) / 4.5));
  const baseXg = clamp01(
    distanceQuality *
      (0.46 + angle * 0.7) *
      (1 - pressure * 0.5) *
      Math.pow(0.72, blockingDefenders),
  );
  const a = shooter.profile.attributes;
  const shooterExecutionQuality =
    (a.finishing * 0.45 + a.technique * 0.28 + a.composure * 0.27) / 100;
  const executionMultiplier = 0.62 + shooterExecutionQuality * 0.76;
  const effectiveScoringExpectation = clamp01(baseXg * executionMultiplier);
  const category =
    effectiveScoringExpectation < 0.018
      ? 'non_viable'
      : effectiveScoringExpectation < 0.075
        ? 'speculative'
        : effectiveScoringExpectation < 0.24
          ? 'credible'
          : 'high_value';

  return shootingOpportunitySchema.parse({
    distance: metres,
    angle,
    pressure,
    blockingDefenders,
    baseXg,
    shooterExecutionQuality,
    effectiveScoringExpectation,
    category,
    value: effectiveScoringExpectation,
  });
};
