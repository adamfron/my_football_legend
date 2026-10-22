import { z } from 'zod';

export const decisionPolicyIdSchema = z.enum([
  'legacy-pr176',
  'risk-ablation-v1',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
]);
export type DecisionPolicyId = z.infer<typeof decisionPolicyIdSchema>;
export const decisionAblationSchema = z.enum([
  'none',
  'direct-risk',
  'adaptive-risk',
  'runs',
  'delivery',
  'readiness',
  'movement',
  'continuation',
  'transitions',
]);
export type DecisionAblation = z.infer<typeof decisionAblationSchema>;
export const decisionPolicyConfigSchema = z.object({
  valueHorizonSeconds: z.number().positive(),
  discountSeconds: z.number().positive(),
  turnoverWeight: z.number().positive(),
  maxCandidates: z.number().int().positive().max(48),
  maxRunners: z.number().int().positive().max(3),
  maxDeliveries: z.number().int().positive().max(3),
  minPerceptionSeconds: z.number().positive(),
  maxPerceptionSeconds: z.number().positive(),
  fullRankingInterval: z.number().min(0.1),
  transitionSeconds: z.number().positive(),
  transitionValue: z.number().nonnegative(),
  effortWeight: z.number().nonnegative(),
  continuationWeight: z.number().nonnegative(),
  competenceNoise: z.number().nonnegative(),
});
export const STATE_VALUE_CONFIG = Object.freeze(
  decisionPolicyConfigSchema.parse({
    valueHorizonSeconds: 2.5,
    discountSeconds: 12,
    turnoverWeight: 1,
    maxCandidates: 48,
    maxRunners: 3,
    maxDeliveries: 3,
    minPerceptionSeconds: 0.12,
    maxPerceptionSeconds: 0.3,
    fullRankingInterval: 0.1,
    transitionSeconds: 8,
    transitionValue: 0.055,
    effortWeight: 0.00005,
    continuationWeight: 0.25,
    competenceNoise: 0.008,
  }),
);
// Promotion is a separate, evidence-based decision. This is the one new-match rollback switch.
export const DEFAULT_DECISION_POLICY: DecisionPolicyId = 'state-value-v1';
export const usesStateValue = (state: { decisionPolicy?: DecisionPolicyId }) =>
  state.decisionPolicy === 'state-value-v1' || usesTacticalRoles(state);
export const usesTacticalRoles = (state: { decisionPolicy?: DecisionPolicyId }) =>
  ['role-value-v1', 'role-intent-v1', 'phase-role-hybrid-v1'].includes(state.decisionPolicy ?? '');
export const usesRoleIntentions = (state: { decisionPolicy?: DecisionPolicyId }) =>
  state.decisionPolicy === 'role-intent-v1' || state.decisionPolicy === 'phase-role-hybrid-v1';
export const PRIMARY_DECISION_POLICIES = decisionPolicyIdSchema.options.filter(
  (id) => id !== 'risk-ablation-v1',
);
