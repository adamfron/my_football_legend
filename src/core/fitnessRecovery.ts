import { z } from 'zod';
import type { FootballerCondition } from '../types/domain';
import { recoverConditionAfterDays } from './matchSimulation/matchFitness';

const simulationDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const footballerConditionSchema = z.object({
  capacity: z.number().min(0).max(100).finite(),
  lastUpdatedDate: simulationDate,
  lastAppearanceDate: simulationDate.optional(),
  lastAppearanceMinutes: z.number().nonnegative().finite().optional(),
  lastMatchId: z.string().min(1).optional(),
  source: z.enum(['canonical', 'summary']).optional(),
  injuryUntilDate: simulationDate.optional(),
  injuryStatus: z.enum(['discomfort', 'playable', 'unable', 'absence']).optional(),
});

export const restDaysBetween = (from: string, to: string): number =>
  Math.max(0, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
export const conditionRecoveryDate = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Recovery follows canonical dates; no wall clock and no second calendar. */
export const recoverFootballerCondition = (
  condition: FootballerCondition,
  date: string,
  stamina: number,
): FootballerCondition => {
  if (date <= condition.lastUpdatedDate) return condition;
  const days = restDaysBetween(condition.lastUpdatedDate, date);
  const restrictedDays = condition.injuryUntilDate
    ? Math.min(days, restDaysBetween(condition.lastUpdatedDate, condition.injuryUntilDate))
    : 0;
  // The existing stamina attribute represents conditioning. Injury rehabilitation is slower,
  // while successive rest days gradually restore capacity rather than resetting it at kickoff.
  const effectiveDays = days - restrictedDays * 0.55;
  const capacity = recoverConditionAfterDays(condition.capacity, stamina, effectiveDays);
  const recovered = { ...condition, capacity, lastUpdatedDate: date };
  if (condition.injuryUntilDate && date >= condition.injuryUntilDate) {
    delete recovered.injuryUntilDate;
    delete recovered.injuryStatus;
  }
  return recovered;
};

export const isConditionAvailable = (condition: FootballerCondition | undefined): boolean =>
  condition?.injuryStatus !== 'unable' && condition?.injuryStatus !== 'absence';
