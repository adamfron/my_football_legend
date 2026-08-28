import type { CareerState, EventDecision, EventInstance } from '../../../types/domain';
import type { EventResolution } from '../resolveEventChoice';
export type EventResolver = (
  career: CareerState,
  event: EventInstance,
  decision: EventDecision,
) => EventResolution;
const resolverRegistry: Record<string, EventResolver> = {};
export const registerEventResolver = (definitionId: string, resolver: EventResolver): void => {
  resolverRegistry[definitionId] = resolver;
};
export const getEventResolver = (definitionId: string) => resolverRegistry[definitionId];
