import type { EventDefinition } from '../../types/domain';

const definitions = new Map<string, EventDefinition>();

export const registerEventDefinition = (definition: EventDefinition): void => {
  definitions.set(definition.id, definition);
};

export const getEventDefinition = (id: string): EventDefinition => {
  const definition = definitions.get(id);
  if (!definition) throw new Error(`Unknown event definition: ${id}`);
  return definition;
};

export const getEventDefinitions = (): EventDefinition[] => [...definitions.values()];
