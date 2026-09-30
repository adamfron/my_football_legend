import { z } from 'zod';
import type { AnimationCue, TacticalPlayer } from './model';

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const locomotionStateSchema = z.enum(['idle', 'walk', 'run', 'sprint']);
export const deriveLocomotion = (speed: number): z.infer<typeof locomotionStateSchema> =>
  speed < 0.15 ? 'idle' : speed < 2.4 ? 'walk' : speed < 5.6 ? 'run' : 'sprint';

export const bodyDimensionsSchema = z.object({ height: z.number(), width: z.number() });
export const projectBodyDimensions = (player: TacticalPlayer) => ({
  height: clamp((player.heightCm ?? 180) / 100, 1.45, 2.15),
  width: clamp(Math.sqrt((player.weightKg ?? 75) / 75), 0.85, 1.2),
});

export const playerPoseSchema = z.object({
  hipLeft: z.number(),
  hipRight: z.number(),
  kneeLeft: z.number(),
  kneeRight: z.number(),
  armLeft: z.number(),
  armRight: z.number(),
  elbowLeft: z.number(),
  elbowRight: z.number(),
  armSpread: z.number(),
  lean: z.number(),
  roll: z.number(),
  crouch: z.number(),
  lift: z.number(),
  head: z.number(),
});
export type PlayerPose = z.infer<typeof playerPoseSchema>;
export const createPlayerPose = (): PlayerPose => ({
  hipLeft: 0,
  hipRight: 0,
  kneeLeft: 0,
  kneeRight: 0,
  armLeft: 0,
  armRight: 0,
  elbowLeft: 0,
  elbowRight: 0,
  armSpread: 0.08,
  lean: 0,
  roll: 0,
  crouch: 0,
  lift: 0,
  head: 0,
});

export const CUE_DURATION_MS = 620;
/** Contact is already resolved. This envelope only decays the visible follow-through. */
export const cueWeight = (cue: AnimationCue | undefined, atMs: number) => {
  if (!cue || atMs < cue.atMs) return 0;
  const t = clamp((atMs - cue.atMs) / CUE_DURATION_MS, 0, 1);
  return 1 - t * t * (3 - 2 * t);
};

/** Pure, seekable pose. Optional output is renderer-owned scratch, never canonical state. */
export const derivePlayerPose = (
  player: TacticalPlayer,
  atMs: number,
  out = createPlayerPose(),
): PlayerPose => {
  const speed = player.gaitSpeed ?? Math.hypot(player.velocity?.x ?? 0, player.velocity?.y ?? 0);
  const amplitude = clamp(speed / 7, 0, 1) * 0.85;
  // Compact context samples carry velocity, not a hidden animation accumulator. Reconstruct
  // cosmetic stride only when this historical frame is actually rendered.
  const phase =
    player.gaitPhase ??
    (((atMs / 1000) * speed) / (1.25 + Math.min(speed, 8) * 0.18)) * Math.PI * 2;
  const stride = Math.sin(phase) * amplitude;
  // Facing remains canonical even while shuffling/backpedalling.
  const facing = player.facing ?? 0;
  const forward =
    (player.velocity?.x ?? 0) * Math.sin(facing) + (player.velocity?.y ?? 0) * Math.cos(facing);
  const sign = forward < -0.1 ? -1 : 1;
  out.hipLeft = stride * sign;
  out.hipRight = -stride * sign;
  out.kneeLeft = Math.max(0, -Math.sin(phase)) * amplitude * 1.35;
  out.kneeRight = Math.max(0, Math.sin(phase)) * amplitude * 1.35;
  out.armLeft = -stride * 0.75;
  out.armRight = stride * 0.75;
  out.elbowLeft = out.elbowRight = -0.15 - amplitude * 0.75;
  out.armSpread = player.goalkeeper ? 0.3 : 0.08;
  out.lean = amplitude * 0.12;
  out.roll = 0;
  out.crouch = player.goalkeeper && speed < 0.4 ? 0.08 : 0;
  out.lift = 0;
  out.head = 0;
  if (player.preparation === 'receive' || player.preparation === 'claim') {
    out.lean += 0.1;
    out.armSpread = 0.35;
    if (player.preparation === 'claim') out.armLeft = out.armRight = -1.2;
  }
  if (player.preparation === 'throw') {
    // Two planted feet; both hands move together from in front to behind/above the head.
    const t = clamp((atMs - (player.preparationSinceMs ?? atMs)) / 650, 0, 1);
    out.hipLeft = out.hipRight = out.kneeLeft = out.kneeRight = 0;
    out.armLeft = out.armRight = -1.1 - 1.9 * t;
    out.elbowLeft = out.elbowRight = -1.05;
    out.armSpread = -0.42;
    out.lean = -0.08 * t;
  }
  if (player.preparation === 'save_low' || player.preparation === 'save_high') {
    const low = player.preparation === 'save_low';
    out.armLeft = out.armRight = low ? -0.7 : -2.1;
    out.roll = (player.preparationSide ?? 0) * Math.min(0.55, speed * 0.09);
    out.crouch = low ? 0.16 : 0;
    if (low) {
      out.hipLeft = out.hipRight = -0.7;
      out.kneeLeft = out.kneeRight = 1.4;
    }
  }
  const weight = cueWeight(player.cue, atMs);
  if (!weight || !player.cue) return out;
  const blend = (base: number, target: number) => base + (target - base) * weight;
  const kind = player.cue.kind;
  if (['pass', 'shot', 'cross', 'distribution', 'receive'].includes(kind)) {
    const kick = kind === 'receive' ? -0.3 : kind === 'shot' ? -1.15 : -0.8;
    if (player.dominantFoot === 'left') {
      out.hipLeft = blend(out.hipLeft, kick);
      out.kneeLeft = blend(out.kneeLeft, 0.2);
    } else {
      out.hipRight = blend(out.hipRight, kick);
      out.kneeRight = blend(out.kneeRight, 0.2);
    }
    out.lean = blend(out.lean, kind === 'receive' ? 0.16 : -0.13);
    out.armSpread = blend(out.armSpread, kind === 'cross' ? 0.8 : 0.45);
  } else if (kind === 'throw') {
    out.armLeft = out.armRight = blend(out.armLeft, -1.65);
    out.elbowLeft = out.elbowRight = blend(out.elbowLeft, -0.15);
    out.armSpread = -0.42;
    out.lean = blend(out.lean, 0.18);
  } else if (kind === 'header' || kind === 'contest') {
    out.head = weight * 0.32;
    out.lean = blend(out.lean, 0.22);
    out.armSpread = blend(out.armSpread, 0.8);
    // Bounded body articulation, never move the root or pull the ball toward the head.
    out.lift =
      clamp(
        (player.cue.contactHeight ?? 1.7) - projectBodyDimensions(player).height + 0.12,
        0,
        0.45,
      ) * weight;
  } else {
    const low = kind === 'low_save';
    out.crouch = blend(out.crouch, low ? 0.16 : 0.05);
    if (low) {
      out.hipLeft = out.hipRight = blend(out.hipLeft, -0.7);
      out.kneeLeft = out.kneeRight = blend(out.kneeLeft, 1.4);
    }
    out.armLeft = out.armRight = blend(out.armLeft, low ? -0.65 : kind === 'catch' ? -1.3 : -2.4);
    out.elbowLeft = out.elbowRight = blend(out.elbowLeft, -0.25);
    out.roll = (player.cue.side ?? 0) * weight * (kind === 'high_save' ? 0.95 : low ? 0.4 : 0.1);
    out.armSpread = blend(out.armSpread, 0.25);
  }
  return out;
};
