import { z } from 'zod';
// This geometry module must remain independent of contact execution/schema imports.
const vector = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
type V = z.infer<typeof vector>;
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (v: V, k: number): V => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const zero = (): V => ({ x: 0, y: 0, z: 0 });
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
/** Engineering assumptions, not articulated biomechanics or calibrated human timing. */
export const TEMPORAL_STRIKE = Object.freeze({
  version: 'temporal-contact-dev-v1' as const,
  footRadius: 0.035,
  nominalOnset: 0.025,
  swingSeconds: 0.05,
  followThroughSeconds: 0.02,
  windowSeconds: 0.12,
  maximumTimingError: 0.02,
  distanceTolerance: 1e-7,
  maximumEvaluationsPerStep: 160,
});
export const temporalFootPathSchema = z.object({
  origin: vector,
  bodyVelocity: vector,
  onset: z.number().nonnegative(),
  duration: z.number().positive(),
  controls: z.tuple([vector, vector, vector, vector]),
  finalVelocity: vector,
  speedBound: z.number().nonnegative(),
  reachBound: z.number().nonnegative(),
  capabilityScale: z.number().min(0).max(1),
});
export type TemporalFootPath = z.infer<typeof temporalFootPathSchema>;
export const temporalFootAt = (path: TemporalFootPath, at: number) => {
  const t = clamp((at - path.onset) / path.duration),
    u = 1 - t;
  const [, , c, d] = path.controls;
  const relative = add(scale(c, 3 * u * t * t), scale(d, t * t * t));
  const follow = clamp(at - path.onset - path.duration, 0, TEMPORAL_STRIKE.followThroughSeconds);
  const followDistance = follow - (follow * follow) / (2 * TEMPORAL_STRIKE.followThroughSeconds);
  return {
    position: add(
      add(path.origin, scale(path.bodyVelocity, at)),
      add(relative, scale(path.finalVelocity, followDistance)),
    ),
    velocity: add(
      path.bodyVelocity,
      at < path.onset
        ? zero()
        : follow > 0
          ? scale(path.finalVelocity, 1 - follow / TEMPORAL_STRIKE.followThroughSeconds)
          : scale(add(scale(c, 6 * t - 9 * t * t), scale(d, 3 * t * t)), 1 / path.duration),
    ),
  };
};

/** The existing stroke displacement in its original body-relative coordinates. */
export const relativeTemporalFootAt = (path: TemporalFootPath, elapsed: number) => {
  const value = temporalFootAt(path, elapsed);
  return {
    relative: {
      x: value.position.x - path.origin.x - path.bodyVelocity.x * elapsed,
      y: value.position.y - path.origin.y - path.bodyVelocity.y * elapsed,
      z: value.position.z - path.origin.z - path.bodyVelocity.z * elapsed,
    },
    relativeVelocity: {
      x: value.velocity.x - path.bodyVelocity.x,
      y: value.velocity.y - path.bodyVelocity.y,
      z: value.velocity.z - path.bodyVelocity.z,
    },
  };
};
