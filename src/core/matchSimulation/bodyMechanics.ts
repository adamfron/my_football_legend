import { z } from 'zod';
import type { MatchPlayerState } from './matchState';
import { deriveFitnessPhysicalModifiers } from './matchFitness';

export const plantBalanceSchema = z.object({
  balance: z.number().min(0).max(1),
  load: z.number().nonnegative(),
  support: z.enum(['left', 'right', 'both']),
});
export type PlantBalance = z.infer<typeof plantBalanceSchema>;
export const verticalJumpSchema = z.object({
  phase: z.enum(['preparing', 'airborne', 'recovering', 'ready']),
  elapsed: z.number().nonnegative(),
  height: z.number().nonnegative(),
  velocity: z.number().finite(),
  takeoffVelocity: z.number().positive(),
  preparationSeconds: z.number().positive(),
  recoverySeconds: z.number().positive(),
  takeoffAt: z.number().nonnegative().nullable(),
  landingAt: z.number().nonnegative().nullable(),
  impulseNewtonSeconds: z.number().positive(),
  maximumHeight: z.number().nonnegative(),
});
export type VerticalJump = z.infer<typeof verticalJumpSchema>;
export const jumpRequestSchema = z.object({
  armAssistance: z.boolean().default(false),
  approach: z.boolean().default(false),
});

/** Bounded specific force over a finite extension, independent of standing body height.
 * Strength raises force; mass loads it. Ratings never directly assign a jump height.
 * The integration is shared but automatic match takeoff scheduling remains staged.
 */
export const beginVerticalJump = (
  player: MatchPlayerState,
  request: z.infer<typeof jumpRequestSchema>,
): VerticalJump | undefined => {
  if (player.verticalJump && player.verticalJump.phase !== 'ready') return undefined;
  const a = player.profile.attributes,
    fitness = deriveFitnessPhysicalModifiers(player);
  const mass = player.profile.weightKg,
    balance = player.plantBalance?.balance ?? 1;
  const approach = request.approach
    ? Math.min(1, Math.hypot(player.velocity.x, player.velocity.y) / 5)
    : 0;
  const extension = 0.17 + (a.jumping / 100) * 0.07;
  const force =
    (1050 + a.strength * 7.5) *
    (0.6 + a.jumping / 250) *
    fitness.acceleration *
    (0.7 + balance * 0.3) *
    (1 + (request.armAssistance ? 0.09 : 0) + approach * 0.06);
  const impulse = Math.max(mass * 1.2, Math.min(mass * 4.5, (force - mass * 9.81) * extension));
  return {
    phase: 'preparing',
    elapsed: 0,
    height: 0,
    velocity: 0,
    takeoffVelocity: impulse / mass,
    preparationSeconds: 0.17 + (1 - a.agility / 100) * 0.14,
    recoverySeconds: 0.22 + (1 - a.agility / 100) * 0.3,
    takeoffAt: null,
    landingAt: null,
    impulseNewtonSeconds: impulse,
    maximumHeight: 0,
  };
};
/** Exact constant-gravity substep after takeoff; finite landing and another-jump recovery. */
export const advanceVerticalJump = (jump: VerticalJump, dt: number): VerticalJump => {
  let j = { ...jump },
    remaining = dt;
  if (j.phase === 'preparing') {
    const wait = Math.min(remaining, Math.max(0, j.preparationSeconds - j.elapsed));
    j.elapsed += wait;
    remaining -= wait;
    if (j.elapsed + 1e-9 >= j.preparationSeconds)
      j = { ...j, phase: 'airborne', velocity: j.takeoffVelocity, takeoffAt: j.elapsed };
  }
  if (j.phase === 'airborne' && remaining > 0) {
    const landing = (j.velocity + Math.sqrt(j.velocity * j.velocity + 2 * 9.81 * j.height)) / 9.81;
    const step = Math.min(remaining, landing),
      apex = Math.max(0, Math.min(step, j.velocity / 9.81));
    const maximumHeight = Math.max(
      j.maximumHeight,
      j.height + j.velocity * apex - 0.5 * 9.81 * apex * apex,
    );
    j = {
      ...j,
      height: Math.max(0, j.height + j.velocity * step - 0.5 * 9.81 * step * step),
      velocity: j.velocity - 9.81 * step,
      elapsed: j.elapsed + step,
      maximumHeight,
    };
    remaining -= step;
    if (step >= landing - 1e-9)
      j = { ...j, phase: 'recovering', height: 0, velocity: 0, landingAt: j.elapsed };
  }
  if (j.phase === 'recovering') {
    j.elapsed += remaining;
    if (j.elapsed - (j.landingAt ?? j.elapsed) >= j.recoverySeconds) j.phase = 'ready';
  } else if (j.phase === 'ready') j.elapsed += remaining;
  return j;
};

/** Support loading follows requested change of momentum; recovery follows actual elapsed time. */
export const derivePlantBalance = (
  player: MatchPlayerState,
  targetVelocity: { x: number; y: number },
  dt: number,
): PlantBalance => {
  const speed = Math.hypot(player.velocity.x, player.velocity.y),
    a = player.profile.attributes;
  const cross = player.velocity.x * targetVelocity.y - player.velocity.y * targetVelocity.x;
  const lateral = speed > 0.2 ? Math.abs(cross) / speed : 0;
  const reverse =
    speed > 0.2
      ? Math.max(
          0,
          -(player.velocity.x * targetVelocity.x + player.velocity.y * targetVelocity.y) / speed,
        )
      : 0;
  const load = Math.min(1, (lateral + reverse) / (5 + a.agility * 0.04));
  const recovery = (0.9 + a.agility / 100) * deriveFitnessPhysicalModifiers(player).balanceRecovery;
  const balance = Math.max(
    0.35,
    Math.min(
      1,
      (player.plantBalance?.balance ?? 1) + dt * recovery - dt * load * (1.8 - a.agility / 100),
    ),
  );
  return { balance, load, support: Math.abs(cross) < 0.01 ? 'both' : cross > 0 ? 'right' : 'left' };
};
