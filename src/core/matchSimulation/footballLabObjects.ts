import { z } from 'zod';
import { BALL_RADIUS, findFirstBallContact, resolveBallRebound } from './ballFlight';
import { integrateBallFlight, ballSpinSchema, type PhysicalBall } from './ballPhysics';

export const labVectorSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
const normal = labVectorSchema.refine(
  (v) => Math.hypot(v.x, v.y, v.z) > 1e-8,
  'Nonzero normal required',
);
const base = { id: z.string().min(1), position: labVectorSchema };
const plane = { ...base, normal, up: normal.default({ x: 0, y: 0, z: 1 }) };
const dimensions = { width: z.number().positive(), height: z.number().positive() };
const zone = z.object({
  id: z.string(),
  u: z.number(),
  v: z.number(),
  radius: z.number().positive(),
});
export const labObstacleSchema = z.object({
  ...base,
  kind: z.enum(['cone', 'pole']),
  radius: z.number().positive(),
  height: z.number().positive(),
  orientation: z.number().default(0),
  collision: z.boolean(),
  checkpoint: z.string().optional(),
  restitution: z.number().min(0).max(1).default(0.38),
});
export const labGateSchema = z.object({
  ...plane,
  ...dimensions,
  kind: z.literal('gate'),
  subject: z.enum(['player', 'ball']),
  direction: z.enum(['positive', 'negative', 'both']).default('positive'),
});
export const labTargetSchema = z.object({
  ...plane,
  ...dimensions,
  kind: z.literal('target'),
  shape: z.enum(['rectangle', 'ellipse']).default('rectangle'),
  zones: z.array(zone).default([]),
});
export const labWallSchema = z.object({
  ...plane,
  ...dimensions,
  kind: z.literal('wall'),
  restitution: z.number().min(0).max(1),
  tangentRetention: z.number().min(0).max(1),
  markings: z.array(zone).default([]),
});
export const labHoopSchema = z.object({
  ...plane,
  kind: z.literal('hoop'),
  innerDiameter: z.number().positive(),
  rimRadius: z.number().positive(),
  direction: z.enum(['positive', 'negative', 'both']),
});
export const labGoalSchema = z.object({
  ...plane,
  ...dimensions,
  kind: z.literal('goal'),
  postRadius: z.number().positive().default(0.06),
  sectors: z.array(zone).default([]),
});
export const labLauncherSchema = z.object({
  ...base,
  kind: z.literal('launcher'),
  velocity: labVectorSchema,
  spin: ballSpinSchema,
  releaseAt: z.number().nonnegative(),
  dispersion: z.number().nonnegative().default(0),
});
export const trainingObjectSchema = z.discriminatedUnion('kind', [
  labObstacleSchema,
  labGateSchema,
  labTargetSchema,
  labWallSchema,
  labHoopSchema,
  labGoalSchema,
  labLauncherSchema,
]);
export type TrainingObject = z.infer<typeof trainingObjectSchema>;
export type LabVector = z.infer<typeof labVectorSchema>;
export const planeCrossingSchema = z.object({
  fraction: z.number().min(0).max(1),
  point: labVectorSchema,
  u: z.number(),
  v: z.number(),
  direction: z.enum(['positive', 'negative']),
});
export type PlaneCrossing = z.infer<typeof planeCrossingSchema>;
const dot = (a: LabVector, b: LabVector) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: LabVector, b: LabVector) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (v: LabVector) => {
  const d = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / d, y: v.y / d, z: v.z / d };
};
export const planeBasis = (object: { normal: LabVector; up: LabVector }) => {
  const n = unit(object.normal);
  let right = cross(object.up, n);
  if (Math.hypot(right.x, right.y, right.z) < 1e-8)
    right = cross(Math.abs(n.z) > 0.9 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 }, n);
  const u = unit(right),
    v = cross(n, u);
  return { n, u, v };
};
/** Half-open swept segments count a shared endpoint once. Timing comes from real positions. */
export const intersectLabPlane = (
  previous: LabVector,
  next: LabVector,
  object: { position: LabVector; normal: LabVector; up: LabVector },
): PlaneCrossing | undefined => {
  const { n, u, v } = planeBasis(object);
  const relative = (p: LabVector) => ({
    x: p.x - object.position.x,
    y: p.y - object.position.y,
    z: p.z - object.position.z,
  });
  const a = dot(relative(previous), n),
    b = dot(relative(next), n);
  if (!((a < 0 && b >= 0) || (a > 0 && b <= 0))) return;
  const fraction = a / (a - b);
  const point = {
    x: previous.x + (next.x - previous.x) * fraction,
    y: previous.y + (next.y - previous.y) * fraction,
    z: previous.z + (next.z - previous.z) * fraction,
  };
  return {
    fraction,
    point,
    u: dot(relative(point), u),
    v: dot(relative(point), v),
    direction: b > a ? 'positive' : 'negative',
  };
};
export const measureLabOpening = (
  object: Extract<TrainingObject, { kind: 'target' | 'hoop' | 'goal' | 'gate' }>,
  crossing: PlaneCrossing,
) => {
  const radius = object.kind === 'gate' && object.subject === 'player' ? 0 : BALL_RADIUS;
  const direction =
    !('direction' in object) ||
    object.direction === 'both' ||
    object.direction === crossing.direction;
  const error = Math.hypot(crossing.u, crossing.v);
  const inside =
    object.kind === 'hoop'
      ? error + radius < object.innerDiameter / 2
      : object.kind === 'target' && object.shape === 'ellipse'
        ? (crossing.u / (object.width / 2 - radius)) ** 2 +
            (crossing.v / (object.height / 2 - radius)) ** 2 <
            1 &&
          object.width > radius * 2 &&
          object.height > radius * 2
        : object.kind === 'goal'
          ? Math.abs(crossing.u) + radius < object.width / 2 &&
            crossing.v + object.height / 2 >= BALL_RADIUS &&
            crossing.v + object.height / 2 < object.height - BALL_RADIUS
          : Math.abs(crossing.u) + radius <= object.width / 2 &&
            Math.abs(crossing.v) + radius <= object.height / 2;
  const markings =
    object.kind === 'target' ? object.zones : object.kind === 'goal' ? object.sectors : [];
  const zoneIds = markings
    .filter((zone) => Math.hypot(crossing.u - zone.u, crossing.v - zone.v) + radius <= zone.radius)
    .map((zone) => zone.id);
  return { hit: direction && inside, errorMetres: error, ...(markings.length ? { zoneIds } : {}) };
};
export const labContactSchema = z.object({
  objectId: z.string(),
  kind: z.string(),
  at: z.number(),
  point: labVectorSchema,
  incoming: labVectorSchema,
  outgoing: labVectorSchema,
});
export type LabContact = z.infer<typeof labContactSchema>;

/** Apparatus geometry only. Integration and dissipative contact response are canonical.
 * Split the tick at the first collision; integrate its finite remainder after reflection. */
export const advanceLabBall = (
  input: PhysicalBall,
  dt: number,
  objects: TrainingObject[],
  at: number,
): {
  ball: PhysicalBall;
  contacts: LabContact[];
  segments: { from: LabVector; to: LabVector; at: number; dt: number; initial: PhysicalBall }[];
} => {
  let ball = input,
    remaining = dt,
    elapsed = 0;
  const contacts: LabContact[] = [],
    segments: { from: LabVector; to: LabVector; at: number; dt: number; initial: PhysicalBall }[] =
      [];
  for (let iteration = 0; remaining > 1e-9 && iteration < 8; iteration++) {
    const integrated = integrateBallFlight(ball, remaining);
    let first:
      | {
          fraction: number;
          point: LabVector;
          normal: LabVector;
          object: TrainingObject;
          kind?: 'left_post' | 'right_post' | 'crossbar';
        }
      | undefined;
    const consider = (
      fraction: number,
      point: LabVector,
      normal: LabVector,
      object: TrainingObject,
      kind?: 'left_post' | 'right_post' | 'crossbar',
    ) => {
      if (fraction > 1e-8 && fraction <= 1 && (!first || fraction < first.fraction))
        first = { fraction, point, normal, object, ...(kind ? { kind } : {}) };
    };
    for (const object of objects) {
      if (object.kind === 'wall') {
        const basis = planeBasis(object),
          n = basis.n;
        const side = dot(
          {
            x: ball.position.x - object.position.x,
            y: ball.position.y - object.position.y,
            z: ball.position.z - object.position.z,
          },
          n,
        );
        const sign = side >= 0 ? 1 : -1;
        const shifted = {
          ...object,
          position: {
            x: object.position.x + n.x * BALL_RADIUS * sign,
            y: object.position.y + n.y * BALL_RADIUS * sign,
            z: object.position.z + n.z * BALL_RADIUS * sign,
          },
        };
        const hit = intersectLabPlane(ball.position, integrated.position, shifted);
        if (
          hit &&
          Math.abs(hit.u) <= object.width / 2 + BALL_RADIUS &&
          Math.abs(hit.v) <= object.height / 2 + BALL_RADIUS
        )
          consider(
            hit.fraction,
            hit.point,
            { x: n.x * sign, y: n.y * sign, z: n.z * sign },
            object,
          );
      } else if ((object.kind === 'cone' || object.kind === 'pole') && object.collision) {
        const h = Math.max(object.radius * 2, object.height);
        const hit = findFirstBallContact({
          previous: ball.position,
          next: integrated.position,
          attackingTeam: 'home',
          candidates: [
            {
              kind: 'defender',
              playerId: object.id,
              centre: { ...object.position, z: object.position.z + h / 2 },
              radius: object.radius,
              halfHeight: h / 2 - object.radius,
            },
          ],
        });
        if (hit?.playerId === object.id && hit.surfaceNormal)
          consider(hit.segmentFraction, hit.point, hit.surfaceNormal, object);
      } else if (object.kind === 'hoop') {
        const { n, u, v } = planeBasis(object),
          major = object.innerDiameter / 2 + object.rimRadius;
        const radius = object.rimRadius + BALL_RADIUS;
        const from = ball.position,
          delta = {
            x: integrated.position.x - from.x,
            y: integrated.position.y - from.y,
            z: integrated.position.z - from.z,
          };
        const length = Math.hypot(delta.x, delta.y, delta.z);
        // Conservative advancement against the torus signed-distance field avoids tunnelling.
        for (let f = 0, j = 0; f <= 1 && j < 100 && length > 1e-9; j++) {
          const p = { x: from.x + delta.x * f, y: from.y + delta.y * f, z: from.z + delta.z * f };
          const r = {
            x: p.x - object.position.x,
            y: p.y - object.position.y,
            z: p.z - object.position.z,
          };
          const a = dot(r, u),
            b = dot(r, v),
            depth = dot(r, n),
            radial = Math.hypot(a, b);
          const separation = Math.hypot(radial - major, depth) - radius;
          if (separation < 1e-7) {
            const scale = major / Math.max(1e-9, radial);
            const ring = {
              x: object.position.x + (u.x * a + v.x * b) * scale,
              y: object.position.y + (u.y * a + v.y * b) * scale,
              z: object.position.z + (u.z * a + v.z * b) * scale,
            };
            const normal = unit({ x: p.x - ring.x, y: p.y - ring.y, z: p.z - ring.z });
            if (dot(ball.velocity, normal) < 0) consider(Math.max(f, 1e-7), p, normal, object);
            break;
          }
          f += Math.max(1e-7, (separation / length) * 0.95);
        }
      } else if (object.kind === 'goal') {
        // Map the arbitrary local plane into canonical goal coordinates; dimensions are configurable.
        const { n, u, v } = planeBasis(object);
        const transform = (p: LabVector) => {
          const r = {
            x: p.x - object.position.x,
            y: p.y - object.position.y,
            z: p.z - object.position.z,
          };
          return { x: 105 + dot(r, n), y: 34 + dot(r, u), z: object.height / 2 + dot(r, v) };
        };
        const hit = findFirstBallContact({
          previous: transform(ball.position),
          next: transform(integrated.position),
          attackingTeam: 'home',
          goal: { width: object.width, height: object.height, postRadius: object.postRadius },
        });
        if (hit && ['left_post', 'right_post', 'crossbar'].includes(hit.kind)) {
          const f = hit.segmentFraction,
            p = {
              x: ball.position.x + (integrated.position.x - ball.position.x) * f,
              y: ball.position.y + (integrated.position.y - ball.position.y) * f,
              z: ball.position.z + (integrated.position.z - ball.position.z) * f,
            };
          consider(
            f,
            p,
            { x: -n.x, y: -n.y, z: -n.z },
            object,
            hit.kind as 'left_post' | 'right_post' | 'crossbar',
          );
        }
      }
    }
    if (!first) {
      segments.push({
        initial: ball,
        from: ball.position,
        to: integrated.position,
        at: at + elapsed,
        dt: remaining,
      });
      ball = integrated;
      remaining = 0;
      break;
    }
    const hit = first as {
      fraction: number;
      point: LabVector;
      normal: LabVector;
      object: TrainingObject;
      kind?: 'left_post' | 'right_post' | 'crossbar';
    };
    const duration = remaining * hit.fraction;
    const contactBall = integrateBallFlight(ball, duration);
    const surface = hit.object;
    let response = resolveBallRebound('defender', contactBall.velocity, 'home', contactBall.spin, {
      surfaceNormal: hit.normal,
      ...(surface.kind === 'wall'
        ? { restitution: surface.restitution, tangentRetention: surface.tangentRetention }
        : surface.kind === 'cone' || surface.kind === 'pole'
          ? { restitution: surface.restitution }
          : {}),
    });
    if (surface.kind === 'goal' && hit.kind) {
      const { n, u, v } = planeBasis(surface);
      const local = (p: LabVector) => ({ x: dot(p, n), y: dot(p, u), z: dot(p, v) });
      const world = (p: LabVector) => ({
        x: p.x * n.x + p.y * u.x + p.z * v.x,
        y: p.x * n.y + p.y * u.y + p.z * v.y,
        z: p.x * n.z + p.y * u.z + p.z * v.z,
      });
      const rebound = resolveBallRebound(
        hit.kind,
        local(contactBall.velocity),
        'home',
        contactBall.spin ? local(contactBall.spin) : undefined,
      );
      response = {
        ...rebound,
        velocity: world(rebound.velocity),
        ...(rebound.spin ? { spin: world(rebound.spin) } : {}),
      };
    }
    segments.push({
      initial: ball,
      from: ball.position,
      to: hit.point,
      at: at + elapsed,
      dt: duration,
    });
    contacts.push({
      objectId: surface.id,
      kind: hit.kind ?? surface.kind,
      at: at + elapsed + duration,
      point: hit.point,
      incoming: contactBall.velocity,
      outgoing: response.velocity,
    });
    ball = {
      ...contactBall,
      ...response,
      position: {
        x: hit.point.x + hit.normal.x * 1e-7,
        y: hit.point.y + hit.normal.y * 1e-7,
        z: Math.max(BALL_RADIUS, hit.point.z + hit.normal.z * 1e-7),
      },
    };
    elapsed += duration;
    remaining -= duration;
  }
  if (remaining > 1e-9) throw new Error('Apparatus collision budget exceeded');
  return { ball, contacts, segments };
};
