import { z } from 'zod';
import { physicalPointSchema } from './matchSpace';

const unit = z.number().min(0).max(1);
export const situationalAwarenessSchema = z.literal('bounded-v1');
// The second mode is a development-only intervention, not an integration profile.
export const prospectiveMovementSchema = z.enum(['two-pass-v1', 'two-pass-continuity-dev-v1']);
export const situationSchema = z.object({
  reviewedAt: z.number(),
  ball: z
    .object({
      position: physicalPointSchema,
      evidenceAt: z.number(),
      source: z.enum(['direct', 'remembered']),
      uncertainty: z.number().nonnegative(),
      confidence: unit,
      sector: z.object({
        length: z.number().int().min(0).max(2),
        width: z.number().int().min(0).max(2),
      }),
    })
    .nullable(),
  // Proximity is evidence for a hypothesis, never confirmed control.
  possessor: z
    .object({
      id: z.string(),
      team: z.enum(['home', 'away']),
      evidenceAt: z.number(),
      source: z.enum(['inferred', 'remembered']),
      confidence: unit,
    })
    .nullable(),
  phase: z.enum(['team_possession', 'opponent_possession', 'flight', 'unknown']),
  phaseSource: z.enum(['inferred', 'remembered', 'unknown']),
  changedAt: z.number(),
});
export type Situation = z.infer<typeof situationSchema>;
export const prospectiveSupportSchema = z.object({
  carrierId: z.string(),
  intermediaryId: z.string(),
  createdAt: z.number(),
  recognisedAt: z.number(),
  horizonAt: z.number(),
  confidence: unit,
  status: z.enum(['conditional', 'supported', 'withdrawn']),
  hypotheses: z.array(z.object({ intermediaryId: z.string(), confidence: unit })).max(2),
});
