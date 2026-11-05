import { z } from 'zod';
import type { TacticalMatchState } from './matchState';

export const passCompletionCreditSchema = z.enum([
  'credited',
  'not_completed',
  'passer_recovery',
  'missing_contact',
  'missing_resolution',
]);

/** A team control result and a credited pass describe different football facts.
 * Recovering one's own delivery never creates a pass to oneself. */
export const passCompletionCredit = (
  pass: NonNullable<TacticalMatchState['lastPassDiagnostic']>,
): z.infer<typeof passCompletionCreditSchema> => {
  if (pass.finalResult !== 'completed') return 'not_completed';
  if (!pass.actualContactPoint) return 'missing_contact';
  if (pass.resolvedAt === undefined) return 'missing_resolution';
  if ((pass.actualReceiverId ?? pass.intendedReceiverId) === pass.passerId)
    return 'passer_recovery';
  return 'credited';
};
