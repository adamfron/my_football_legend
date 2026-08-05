import type { CareerState, EventInstance } from '../../types/domain';
import { ensureCoach, ensureRival, makeEventInstance } from './academyArc';
import { getEventDefinition } from './eventRegistry';
export const instantiateEvent = (career: CareerState, definitionId: string): { career: CareerState; event: EventInstance } => {
  const withCast = ensureRival(ensureCoach(career)); getEventDefinition(definitionId);
  const event = makeEventInstance(withCast, definitionId);
  return { career: { ...withCast, activeEvent: event }, event };
};
