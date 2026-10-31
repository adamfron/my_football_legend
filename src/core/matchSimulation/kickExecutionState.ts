import { z } from 'zod';
import { footContactExecutionSchema } from './footContact';

export const kickVectorSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export const kickExecutionSelectionSchema = z.literal('contact-v1');
export const kickPerturbationSchema = z.object({
  lateralPatchMetres: z.number().finite(),
  verticalPatchMetres: z.number().finite(),
  timingSeconds: z.number().finite(),
  effortError: z.number().finite(),
});
export const kickExecutionReceiptSchema = z.object({
  version: kickExecutionSelectionSchema,
  episode: z.string(),
  actorId: z.string(),
  at: z.number().nonnegative(),
  family: z.enum(['pass', 'shot']),
  intendedTarget: z.object({ x: z.number().finite(), y: z.number().finite() }),
  nominalVelocity: kickVectorSchema,
  nominalSpin: kickVectorSchema,
  nominalFootVelocity: kickVectorSchema,
  realisedFootVelocity: kickVectorSchema,
  nominalNormal: kickVectorSchema,
  effectiveNormal: kickVectorSchema,
  angularImpulse: kickVectorSchema,
  capability: z.object({
    effectiveMass: z.number().positive(),
    restitution: z.number().nonnegative(),
    maximumFootSpeed: z.number().positive(),
  }),
  perturbation: kickPerturbationSchema,
  body: z.object({
    position: z.object({ x: z.number().finite(), y: z.number().finite() }),
    velocity: z.object({ x: z.number().finite(), y: z.number().finite() }),
    facingAngle: z.number().finite(),
  }),
  context: z.object({
    skill: z.number().min(0).max(1),
    pressure: z.number().min(0).max(1),
    preparationSeconds: z.number().nonnegative(),
    obstructionTime: z.number().nonnegative().nullable(),
    balance: z.number().min(0).max(1),
    alignmentError: z.number().nonnegative(),
    weakFootDeficit: z.number().min(0).max(1),
  }),
  contact: footContactExecutionSchema,
});
export type KickExecutionReceipt = z.infer<typeof kickExecutionReceiptSchema>;
