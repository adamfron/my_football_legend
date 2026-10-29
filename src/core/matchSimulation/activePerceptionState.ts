import { z } from 'zod';
import { physicalPointSchema } from './matchSpace';
import { situationSchema, prospectiveSupportSchema } from './situationalAwarenessState';

const unit = z.number().min(0).max(1);
export const activePerceptionConfigSchema = z.object({
  scanning: z.boolean(),
  memory: z.boolean(),
  preparation: z.boolean(),
});
export const spatialSightingSchema = z.object({
  id: z.string(),
  team: z.enum(['home', 'away']),
  position: physicalPointSchema,
  velocity: physicalPointSchema,
  keeper: z.boolean(),
  role: z.string().nullable(),
  preparing: z.boolean(),
  facing: z.number().optional(),
  observedAt: z.number(),
  confidence: unit,
});
export const perceivedBallSchema = z.object({
  position: physicalPointSchema,
  height: z.number(),
  velocity: physicalPointSchema.extend({ z: z.number() }),
  ownerId: z.string().nullable(),
});
export const spatialMemorySchema = z.object({
  situation: situationSchema.optional(),
  gaze: z.number(),
  targetOffset: z.number(),
  scanningUntil: z.number(),
  nextScanAt: z.number(),
  nextObservationAt: z.number(),
  observedAt: z.number(),
  scans: z.number().int().nonnegative(),
  scanSide: z.union([z.literal(-1), z.literal(1)]),
  directIds: z.string().array().max(12),
  entities: spatialSightingSchema.array().max(12),
  ball: perceivedBallSchema.nullable(),
  ballSeenAt: z.number(),
});
export const preparedOptionSchema = z.object({
  id: z.string(),
  kind: z.enum(['hold', 'carry', 'pass', 'shot']),
  target: physicalPointSchema.nullable(),
  receiverId: z.string().nullable(),
  requiredFacing: z.number(),
  preparationSeconds: z.number().nonnegative(),
  evidence: z
    .array(
      z.object({ id: z.string(), observedAt: z.number(), uncertainty: z.number().nonnegative() }),
    )
    .max(22),
  confidence: unit,
  expiresAt: z.number(),
  difficulty: unit,
  benefit: z.number(),
  goal: z.enum(['retain', 'progress', 'finish', 'escape']),
});
export const preReceptionPlanSchema = z.object({
  actorId: z.string(),
  createdAt: z.number(),
  reviewedAt: z.number(),
  expectedContactAt: z.number(),
  expectedPoint: physicalPointSchema,
  incomingVelocity: physicalPointSchema.extend({ z: z.number() }),
  expiresAt: z.number(),
  options: preparedOptionSchema.array().max(3),
  invalidated: z.array(z.object({ id: z.string(), reason: z.string() })).max(3),
  status: z.enum(['preparing', 'revalidated', 'revised']),
  receptionAt: z.number().nullable(),
  usedId: z.string().nullable(),
});
export const receivingPositionSchema = z.object({
  prospective: prospectiveSupportSchema.optional(),
  target: physicalPointSchema,
  origin: physicalPointSchema,
  observedAt: z.number(),
  expiresAt: z.number(),
  personalValue: z.number(),
  teamValue: z.number(),
  baselineValue: z.number(),
  reason: z.string(),
});
export const tempoIntentionSchema = z.object({
  at: z.number(),
  expiresAt: z.number(),
  mode: z.enum(['patient', 'balanced', 'accelerate', 'recover', 'urgent']),
  urgency: unit,
  opportunity: unit,
  capacity: unit,
  reason: z.string(),
});
export const activePerceptionRuntimeSchema = z
  .object({
    lastUpdateAt: z.number(),
    memory: z.record(z.string(), spatialMemorySchema),
    plans: z.record(z.string(), preReceptionPlanSchema),
    positions: z.record(z.string(), receivingPositionSchema),
    tempo: z.record(z.string(), tempoIntentionSchema),
  })
  .refine((s) =>
    [s.memory, s.plans, s.positions, s.tempo].every((r) => Object.keys(r).length <= 22),
  );
export type SpatialMemory = z.infer<typeof spatialMemorySchema>;
export type PreReceptionPlan = z.infer<typeof preReceptionPlanSchema>;
export type TempoIntention = z.infer<typeof tempoIntentionSchema>;
export type ActivePerceptionRuntime = z.infer<typeof activePerceptionRuntimeSchema>;

/** Uncertainty grows even after the short velocity extrapolation has stopped. */
export const rememberedGeometry = (
  memory: SpatialMemory | undefined,
  at: number,
  concentration: number,
  gameReading: number,
) => {
  const maxAge = 0.65 + concentration * 0.012;
  return (memory?.entities ?? [])
    .filter((p) => at - p.observedAt <= maxAge)
    .map((p) => {
      const age = Math.max(0, at - p.observedAt);
      const current = memory!.directIds.includes(p.id) && age < 0.31;
      const prediction = current ? 0 : Math.min(age, 0.25 + gameReading * 0.004);
      return {
        ...p,
        age,
        source: current
          ? ('current' as const)
          : age <= prediction
            ? ('predicted' as const)
            : ('remembered' as const),
        uncertainty: 0.15 + age * (1.2 + Math.hypot(p.velocity.x, p.velocity.y) * 0.15),
        confidence: Math.max(0, p.confidence * (1 - age / (maxAge + 0.1))),
        position: {
          x: Math.max(0, Math.min(105, p.position.x + p.velocity.x * prediction)),
          y: Math.max(0, Math.min(68, p.position.y + p.velocity.y * prediction)),
        },
      };
    });
};
