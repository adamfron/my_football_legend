import type { CareerState, EventInstance } from '../../types/domain';
import { RandomGenerator } from '../random/RandomGenerator';
import { getEventDefinition } from './eventRegistry';

export const instantiateEvent = (
  career: CareerState,
  definitionId: string,
): { career: CareerState; event: EventInstance } => {
  const definition = getEventDefinition(definitionId);
  const event: EventInstance = {
    id: `event_${definitionId}_${career.historyFacts.length}`,
    definitionId,
    context: { season: career.currentSeason, date: career.currentDate },
    cast: Object.fromEntries(definition.cast.map((role) => [role, role])),
    randomState: RandomGenerator.fromSeed(`${career.seed}:${definitionId}`).export(),
    createdFactIds: [],
    threadChanges: {},
  };
  return { career: { ...career, activeEvent: event }, event };
};
