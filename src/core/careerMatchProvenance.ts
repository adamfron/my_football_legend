import { z } from 'zod';
import { playerMatchStatsSchema, teamAccountingSchema } from './matchSimulation/playerMatchStats';
import { matchInjurySchema } from './matchSimulation/matchInjuries';
import { substitutionFactSchema } from './matchSimulation/substitutions';
import { cardFactSchema } from './matchSimulation/matchRules';
import { matchEventSchema } from './matchSimulation/matchEventFeed';
import { formationSlotSchema } from '../schemas/domainSchemas';

export const careerMatchParticipantSchema = z.object({
  id: z.string().min(1).max(256),
  team: z.enum(['home', 'away']),
  started: z.boolean(),
  stats: playerMatchStatsSchema,
  condition: z.number().min(0).max(100),
  injury: matchInjurySchema.optional(),
  position: formationSlotSchema.shape.position,
});

/** Bounded football facts only. Never a physics checkpoint or a second result ledger. */
export const careerMatchContinuationSchema = z.object({
  version: z.literal(1),
  source: z.literal('canonical_plus_summary'),
  handoffAt: z.number().nonnegative().max(10800),
  remainingSeconds: z.number().nonnegative().max(7200),
  seed: z.string().min(1).max(512),
  prefixFingerprint: z.string().min(1),
  coverage: z.literal('canonical_prefix_only_except_minutes_and_condition'),
  prefix: z.object({
    period: z.enum(['first_half', 'second_half', 'half_time']),
    periodEndAt: z.number().nonnegative().max(10800),
    score: z.object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }),
    participants: z.array(careerMatchParticipantSchema).min(22).max(40),
    activeIds: z.array(z.string()).max(22),
    teamAccounting: z.object({ home: teamAccountingSchema, away: teamAccountingSchema }),
    cards: z.array(cardFactSchema).max(80),
    substitutions: z.array(substitutionFactSchema).max(10),
    substitutionUsage: z.object({
      home: z.number().int().nonnegative(),
      away: z.number().int().nonnegative(),
    }),
    substitutionOpportunities: z.object({
      home: z.number().int().nonnegative(),
      away: z.number().int().nonnegative(),
    }),
    events: z.array(matchEventSchema).max(160),
    controlledEvidenceFingerprint: z.string().min(1),
    unresolvedDecision: z
      .object({
        decisionId: z.string(),
        selectedAt: z.number().nonnegative(),
        selectedIntent: z.string(),
        disposition: z.literal('unresolved_at_handoff'),
      })
      .optional(),
    unselectedDecision: z.boolean(),
  }),
});
export type CareerMatchContinuation = z.infer<typeof careerMatchContinuationSchema>;
