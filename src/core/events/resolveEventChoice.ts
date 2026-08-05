import type { CareerState, EventDecision, HistoryFact, RelationshipScores } from '../../types/domain';
import { getEventResolver } from './resolvers/resolverRegistry';
export type ResolutionTier = 'criticalFailure' | 'failure' | 'mixed' | 'success' | 'criticalSuccess';
export interface SocialInterpretation { observerId: string; frame: 'mature'|'ambitious'|'selfish'|'team_oriented'|'cautious'|'brave'|'unreliable'; relationshipChanges: Partial<RelationshipScores>; public: boolean }
export interface EventResolution { tier: ResolutionTier; objectiveOutcome: string; moraleDelta: number; fitnessDelta: number; reputationDelta: number; relationshipChanges: Record<string, Partial<RelationshipScores>>; interpretations: SocialInterpretation[]; fact: HistoryFact; nextEventId?: string }
export { forceTierForTest, testTier } from './resolvers/firstWeekResolvers';
export const resolveEventChoice = (career: CareerState, decision: EventDecision): EventResolution => {
  const event = career.activeEvent;
  if (!event) throw new Error('Cannot resolve event choice without an active event.');
  const resolver = getEventResolver(event.definitionId);
  if (!resolver) throw new Error(`No resolver registered for event definition: ${event.definitionId}`);
  return resolver(career, event, decision);
};
