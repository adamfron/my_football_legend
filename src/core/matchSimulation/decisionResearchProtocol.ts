import { z } from 'zod';
import { tacticalObservationSchema, cognitionTraceSchema } from './tacticalCognition';
import { matchActionSchema } from './matchState';

/** PR187 interface specification, not registered production policy identifiers. */
export const researchPolicyIdSchema = z.enum([
  'opportunity_driven',
  'hierarchical_intent',
  'contextual_judgment',
]);
export const researchPolicyInputSchema = z.object({
  observation: tacticalObservationSchema,
  patterns: cognitionTraceSchema.array().max(3),
  currentIntent: z
    .object({
      id: z.string(),
      goal: z.string(),
      expiresAt: z.number(),
      dependencies: z.string().array().max(3),
    })
    .nullable(),
  candidates: z
    .array(
      z.object({
        id: z.string(),
        action: matchActionSchema,
        feasible: z.boolean(),
        evidenceIds: z.string().array().max(22),
        closesAt: z.number().finite(),
      }),
    )
    .max(48),
  budget: z.object({
    evaluations: z.number().int().min(1).max(48),
    forecasts: z.number().int().min(0).max(3),
  }),
});
export const researchPolicyDecisionSchema = z.object({
  policy: researchPolicyIdSchema,
  observedAt: z.number(),
  recognisedAt: z.number(),
  selectedCandidateId: z.string().nullable(),
  intention: z.string().nullable(),
  continuation: z.enum(['new', 'continue', 'cancel', 'wait']),
  evidenceIds: z.string().array().max(22),
  reasons: z.string().array().min(1).max(12),
  evaluations: z.number().int().nonnegative().max(48),
  forecasts: z.number().int().nonnegative().max(3),
});
export type ResearchPolicyInput = z.infer<typeof researchPolicyInputSchema>;
export type ResearchPolicyDecision = z.infer<typeof researchPolicyDecisionSchema>;
export type ResearchDecisionPolicy = (
  input: Readonly<ResearchPolicyInput>,
) => ResearchPolicyDecision;
/** Executable acceptance boundary shared by all future adapters. It cannot access match RNG. */
export const validateResearchDecision = (
  rawInput: ResearchPolicyInput,
  rawDecision: ResearchPolicyDecision,
) => {
  const input = researchPolicyInputSchema.parse(rawInput),
    decision = researchPolicyDecisionSchema.parse(rawDecision);
  const known = new Set([
    input.observation.observerId,
    ...input.observation.visible.map((p) => p.id),
  ]);
  const selected = input.candidates.find((c) => c.id === decision.selectedCandidateId);
  if (new Set(input.candidates.map((c) => c.id)).size !== input.candidates.length)
    throw Error('Duplicate candidate provenance');
  for (const candidate of input.candidates) {
    if (candidate.action.actorId !== input.observation.observerId)
      throw Error('Player agency mismatch');
    if (candidate.evidenceIds.some((id) => !known.has(id)))
      throw Error('Unobserved candidate provenance');
    const action = candidate.action;
    if (action.type === 'pass' && !known.has(action.receiverId)) throw Error('Unobserved receiver');
    if (action.type === 'challenge' && !known.has(action.opponentId))
      throw Error('Unobserved challenger');
    if (
      (action.type === 'cross' || action.type === 'header') &&
      action.intendedTargetId &&
      !known.has(action.intendedTargetId)
    )
      throw Error('Unobserved target');
  }
  if (decision.observedAt !== input.observation.at || decision.recognisedAt < decision.observedAt)
    throw Error('Invalid observation chronology');
  if (decision.evidenceIds.some((id) => !known.has(id))) throw Error('Unobserved evidence');
  if (
    decision.evaluations > input.budget.evaluations ||
    decision.forecasts > input.budget.forecasts
  )
    throw Error('Research budget exceeded');
  if (
    decision.selectedCandidateId !== null &&
    (!selected ||
      !selected.feasible ||
      selected.closesAt <= decision.recognisedAt ||
      selected.evidenceIds.some((id) => !known.has(id)))
  )
    throw Error('Unavailable candidate');
  if (
    selected?.action.actorId !== undefined &&
    selected.action.actorId !== input.observation.observerId
  )
    throw Error('Player agency mismatch');
  if (selected?.action.type === 'pass' && !known.has(selected.action.receiverId))
    throw Error('Unobserved receiver');
  if (
    (selected?.action.type === 'cross' || selected?.action.type === 'header') &&
    selected.action.intendedTargetId &&
    !known.has(selected.action.intendedTargetId)
  )
    throw Error('Unobserved target');
  if (
    decision.continuation === 'continue' &&
    (!input.currentIntent ||
      input.currentIntent.expiresAt <= decision.recognisedAt ||
      input.currentIntent.dependencies.some((id) => !known.has(id)))
  )
    throw Error('Expired intent');
  return decision;
};

export const researchPolicySpecificationSchema = z.object({
  policy: researchPolicyIdSchema,
  algorithm: z.string().array().min(3),
  hypotheses: z.string().array().min(2),
  falsifiers: z.string().array().min(2),
  traceExtras: z.string().array().min(2),
});
export const PR187_POLICY_SPECIFICATIONS = researchPolicySpecificationSchema.array().parse([
  {
    policy: 'opportunity_driven',
    algorithm: [
      'Observe local event; generate at most 48 feasible contact windows',
      'Prioritise recognised windows by closing time and opportunity cost within a fixed risk budget',
      'Select only after recognition plus action preparation fits the window; cancel on visible closure',
    ],
    hypotheses: [
      'More physically released transient opportunities than B at equal perception',
      'No increase in unobserved opportunity use; no future RNG access',
    ],
    falsifiers: [
      'Selected actions routinely expire before release',
      'Progress depends on privileged opponent knowledge',
    ],
    traceExtras: [
      'window_open/close',
      'missed_window_reason',
      'recognition/preparation/release timestamps',
    ],
  },
  {
    policy: 'hierarchical_intent',
    algorithm: [
      'Choose one tactical goal and at most three dependent role intentions from learned patterns',
      'Continue while visible preconditions and cover hold; evaluate a maximum of three local continuations',
      'Reassess only after meaningful new evidence, expiry or physical failure; no guaranteed teammate action',
    ],
    hypotheses: [
      'Fewer redundant rankings and coordination failures than B under rehearsed triggers',
      'Novel events cancel stale commitments without worsening cover integrity',
    ],
    falsifiers: [
      'Continuations persist after dependencies fail',
      'Predicted cooperation is assigned as completed movement or possession',
    ],
    traceExtras: [
      'goal/intent/dependency IDs',
      'continuation/cancellation evidence',
      'expected_vs_actual_cooperation',
    ],
  },
  {
    policy: 'contextual_judgment',
    algorithm: [
      'Construct a bounded interpretation from local evidence, confidence, pressure and coach demands',
      'Apply individual risk budgets and near-tie discretion to observed feasible candidates',
      'Record compliance and decision regret separately from subsequent execution and outcome',
    ],
    hypotheses: [
      'Players make reproducibly different explainable choices in near ties',
      'Personal incentives cannot override clearly superior team options or create new abilities',
    ],
    falsifiers: [
      'Ambition alone maps directly to shooting',
      'Distinct choices require unrestricted action noise or physical skill bonuses',
    ],
    traceExtras: [
      'interpreted_context/risk_budget',
      'instruction_compliance/regret',
      'confidence/pressure/incentive bounds',
    ],
  },
]);
