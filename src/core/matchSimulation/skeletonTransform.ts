import { z } from 'zod';
import { bodyPointSchema, type BodyPoint } from './articulatedBodyState';

export const skeletonQuaternionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
    w: z.number().finite(),
  })
  .refine((q) => Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-9, 'Non-unit rotation');
export const skeletonTransformSchema = z.object({
  position: bodyPointSchema,
  rotation: skeletonQuaternionSchema,
});
export type SkeletonQuaternion = z.infer<typeof skeletonQuaternionSchema>;
export type SkeletonTransform = z.infer<typeof skeletonTransformSchema>;
export const addPoint = (a: BodyPoint, b: BodyPoint): BodyPoint => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
export const subtractPoint = (a: BodyPoint, b: BodyPoint): BodyPoint => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
export const scalePoint = (a: BodyPoint, k: number): BodyPoint => ({
  x: a.x * k,
  y: a.y * k,
  z: a.z * k,
});
export const pointLength = (a: BodyPoint) => Math.hypot(a.x, a.y, a.z);
export const identityRotation = (): SkeletonQuaternion => ({ x: 0, y: 0, z: 0, w: 1 });
export const inverseRotation = (q: SkeletonQuaternion): SkeletonQuaternion => ({
  x: -q.x,
  y: -q.y,
  z: -q.z,
  w: q.w,
});
export const multiplyRotation = (
  a: SkeletonQuaternion,
  b: SkeletonQuaternion,
): SkeletonQuaternion => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
export const rotatePoint = (q: SkeletonQuaternion, p: BodyPoint): BodyPoint => {
  const t = {
    x: 2 * (q.y * p.z - q.z * p.y),
    y: 2 * (q.z * p.x - q.x * p.z),
    z: 2 * (q.x * p.y - q.y * p.x),
  };
  return {
    x: p.x + q.w * t.x + q.y * t.z - q.z * t.y,
    y: p.y + q.w * t.y + q.z * t.x - q.x * t.z,
    z: p.z + q.w * t.z + q.x * t.y - q.y * t.x,
  };
};
export const axisRotation = (axis: 'x' | 'y' | 'z', radians: number): SkeletonQuaternion => ({
  ...identityRotation(),
  [axis]: Math.sin(radians / 2),
  w: Math.cos(radians / 2),
});
export const composeTransform = (
  a: SkeletonTransform,
  b: SkeletonTransform,
): SkeletonTransform => ({
  position: addPoint(a.position, rotatePoint(a.rotation, b.position)),
  rotation: multiplyRotation(a.rotation, b.rotation),
});
export const relativeTransform = (
  a: SkeletonTransform,
  world: SkeletonTransform,
): SkeletonTransform => {
  const inverse = inverseRotation(a.rotation);
  return {
    position: rotatePoint(inverse, subtractPoint(world.position, a.position)),
    rotation: multiplyRotation(inverse, world.rotation),
  };
};
/** Local +Z is a segment's proximal-to-distal axis. Antiparallel case is explicit. */
export const segmentRotation = (from: BodyPoint, to: BodyPoint): SkeletonQuaternion => {
  const d = subtractPoint(to, from),
    length = pointLength(d);
  if (length < 1e-10) throw Error('Degenerate skeletal segment');
  const z = d.z / length;
  if (z < -1 + 1e-12) return { x: 1, y: 0, z: 0, w: 0 };
  const q = { x: -d.y / length, y: d.x / length, z: 0, w: 1 + z },
    n = Math.hypot(q.x, q.y, q.w);
  return { x: q.x / n, y: q.y / n, z: 0, w: q.w / n };
};

/** A hinge chain shares its normal as local +X on both adjoining segments. */
export const segmentFrameRotation = (
  from: BodyPoint,
  to: BodyPoint,
  normal: BodyPoint,
): SkeletonQuaternion => {
  const d = subtractPoint(to, from),
    z = scalePoint(d, 1 / pointLength(d));
  const dot = normal.x * z.x + normal.y * z.y + normal.z * z.z;
  const projected = subtractPoint(normal, scalePoint(z, dot)),
    x = scalePoint(projected, 1 / pointLength(projected));
  const y = { x: z.y * x.z - z.z * x.y, y: z.z * x.x - z.x * x.z, z: z.x * x.y - z.y * x.x };
  const trace = x.x + y.y + z.z;
  let q: SkeletonQuaternion;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    q = { w: s / 4, x: (y.z - z.y) / s, y: (z.x - x.z) / s, z: (x.y - y.x) / s };
  } else if (x.x > y.y && x.x > z.z) {
    const s = 2 * Math.sqrt(1 + x.x - y.y - z.z);
    q = { w: (y.z - z.y) / s, x: s / 4, y: (y.x + x.y) / s, z: (z.x + x.z) / s };
  } else if (y.y > z.z) {
    const s = 2 * Math.sqrt(1 + y.y - x.x - z.z);
    q = { w: (z.x - x.z) / s, x: (y.x + x.y) / s, y: s / 4, z: (z.y + y.z) / s };
  } else {
    const s = 2 * Math.sqrt(1 + z.z - x.x - y.y);
    q = { w: (x.y - y.x) / s, x: (z.x + x.z) / s, y: (z.y + y.z) / s, z: s / 4 };
  }
  return q;
};

export const rotationCoordinates = (q: SkeletonQuaternion) => {
  const yy = q.y * q.y,
    xx = q.x * q.x,
    zz = q.z * q.z;
  const r13 = 2 * (q.x * q.z + q.y * q.w),
    abduction = Math.asin(Math.max(-1, Math.min(1, r13)));
  return Math.abs(r13) < 0.9999999
    ? {
        flexion: Math.atan2(-2 * (q.y * q.z - q.x * q.w), 1 - 2 * (xx + yy)),
        abduction,
        twist: Math.atan2(-2 * (q.x * q.y - q.z * q.w), 1 - 2 * (yy + zz)),
      }
    : { flexion: Math.atan2(2 * (q.y * q.z + q.x * q.w), 1 - 2 * (xx + zz)), abduction, twist: 0 };
};
