import { z } from 'zod';
import { distance, distanceToSegment, PITCH_LENGTH, PITCH_WIDTH } from './matchSpace';
import { evaluatePressure } from './matchActions';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

export const shootingOpportunitySchema = z.object({
  distance: z.number().nonnegative(),
  angle: z.number().min(0).max(1),
  pressure: z.number().min(0).max(1),
  blockingDefenders: z.number().int().nonnegative(),
  shooterQuality: z.number().min(0).max(1),
  value: z.number().min(0).max(1),
});
export type ShootingOpportunity = z.infer<typeof shootingOpportunitySchema>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Pure canonical shot context shared by observation and autonomous action scoring. */
export const evaluateShootingOpportunity = (
  state: TacticalMatchState,
  shooter: MatchPlayerState,
): ShootingOpportunity => {
  const goal = { x: shooter.team === 'home' ? PITCH_LENGTH : 0, y: PITCH_WIDTH / 2 };
  const metres = distance(shooter.position, goal);
  const lateral = Math.abs(shooter.position.y - PITCH_WIDTH / 2);
  const angle = clamp01(1 - lateral / Math.max(8, metres * 0.72));
  const pressure = evaluatePressure(state, shooter).value;
  const blockingDefenders = state.players.filter(
    (player) =>
      player.team !== shooter.team &&
      player.profile.primaryPosition !== 'goalkeeper' &&
      distance(player.position, shooter.position) < metres &&
      distanceToSegment(player.position, shooter.position, goal) < 2.2,
  ).length;
  const a = shooter.profile.attributes;
  const shooterQuality = (a.finishing * 0.45 + a.technique * 0.25 + a.composure * 0.3) / 100;
  // Range decays progressively: long shots survive as exceptional options but are not routine.
  const rangeValue = clamp01(1 - Math.pow(Math.max(0, metres - 12) / 31, 1.45));
  const value = clamp01(
    rangeValue * 0.62 +
      angle * 0.16 +
      shooterQuality * 0.22 -
      pressure * 0.28 -
      blockingDefenders * 0.1,
  );
  return shootingOpportunitySchema.parse({
    distance: metres,
    angle,
    pressure,
    blockingDefenders,
    shooterQuality,
    value,
  });
};
