import { z } from 'zod';
import { pitchPointSchema } from './matchSpace';

const unit = z.number().min(0).max(1);
export const boundedPolicySchema = z.enum([
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
]);
export const BOUNDED_RESEARCH_POLICY_IDS = {
  'opportunity-driven-v1': 'opportunity_driven',
  'hierarchical-intent-v1': 'hierarchical_intent',
  'contextual-judgment-v1': 'contextual_judgment',
} as const;
export const boundedKnowledgeSchema = z.object({ system: unit, role: unit, partner: unit });
export const boundedCoachSchema = z.object({
  complexity: unit.default(0.5),
  discipline: unit.default(0.5),
  creativeFreedom: unit.default(0.5),
  changeFrequency: unit.default(0),
  rehearsal: unit.default(0),
});
/** Explicit match apparatus. No synthetic years of history or permanent card attributes. */
export const boundedExperimentSchema = z.object({
  knowledge: boundedKnowledgeSchema.default({ system: 0, role: 0, partner: 0 }),
  players: z.record(z.string(), boundedKnowledgeSchema).default({}),
  coach: boundedCoachSchema.default({
    complexity: 0.5,
    discipline: 0.5,
    creativeFreedom: 0.5,
    changeFrequency: 0,
    rehearsal: 0,
  }),
  personalIncentive: unit.default(0),
  patterns: z.boolean().default(true),
  planning: z.boolean().default(true),
  individuality: z.boolean().default(true),
});
export const boundedPatternSchema = z.object({
  actorId: z.string(),
  sourceId: z.string(),
  pattern: z.enum(['counter_support', 'playmaker_run', 'press_triangle']),
  observedAt: z.number(),
  recognisedAt: z.number(),
  expiresAt: z.number(),
  target: pitchPointSchema,
  origin: pitchPointSchema,
  arrivedAt: z.number().nullable(),
  cancelled: z.string().nullable(),
  signature: z.string(),
});
export const boundedIntentSchema = z.object({
  actorId: z.string(),
  candidateKey: z.string(),
  goal: z.enum(['retain', 'progress', 'finish', 'escape']),
  startedAt: z.number(),
  expiresAt: z.number(),
  dependencies: z.string().array().max(3),
  signature: z.string(),
});
export const boundedRuntimeSchema = z.object({
  patterns: z.record(z.string(), boundedPatternSchema).default({}),
  lastPatternScanAt: z.number().default(-1),
  lastActorId: z.string().default(''),
  lastDecisionAt: z.number().default(-1),
  decisionSignature: z.string().default(''),
  lastAction: z.enum(['hold', 'carry', 'pass', 'shot', 'none']).default('none'),
  sightings: z
    .record(
      z.string(),
      z.object({
        ownerId: z.string().nullable(),
        team: z.enum(['home', 'away']).nullable(),
        regainedAt: z.number().nullable(),
      }),
    )
    .default({}),
  intent: boundedIntentSchema.nullable().default(null),
});
export type BoundedExperiment = z.infer<typeof boundedExperimentSchema>;
export type BoundedRuntime = z.infer<typeof boundedRuntimeSchema>;
export type BoundedIntent = z.infer<typeof boundedIntentSchema>;
export type BoundedPattern = z.infer<typeof boundedPatternSchema>;
export const usesBoundedIntelligence = (s: { decisionPolicy?: string }) =>
  boundedPolicySchema.options.some((p) => p === s.decisionPolicy);
