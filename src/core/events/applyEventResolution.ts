import type { CareerState, RelationshipScores } from '../../types/domain';
import type { EventResolution } from './resolveEventChoice';

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const mergeRelationship = (
  current: RelationshipScores,
  changes: Partial<RelationshipScores>,
): RelationshipScores =>
  Object.fromEntries(
    Object.entries(current).map(([key, value]) => [
      key,
      clamp(value + (changes[key as keyof RelationshipScores] ?? 0)),
    ]),
  ) as unknown as RelationshipScores;

export const applyEventResolution = (
  career: CareerState,
  resolution: EventResolution,
): CareerState => {
  if (!career.activeEvent || career.activeEvent.result) return career;
  const relationships = { ...career.relationships };
  for (const [id, changes] of Object.entries(resolution.relationshipChanges)) {
    const current = relationships[id];
    if (current) relationships[id] = mergeRelationship(current, changes);
  }
  return {
    ...career,
    player: {
      ...career.player,
      morale: clamp(career.player.morale + resolution.moraleDelta),
      fitness: clamp(career.player.fitness + resolution.fitnessDelta),
      reputation: clamp(career.player.reputation + resolution.reputationDelta),
    },
    relationships,
    historyFacts: career.historyFacts.some((fact) => fact.id === resolution.fact.id)
      ? career.historyFacts
      : [...career.historyFacts, resolution.fact],
    activeEvent: {
      ...career.activeEvent,
      selectedDecisionId: String(resolution.fact.data.decisionId ?? ''),
      result: {
        tier: resolution.tier,
        objectiveOutcome: resolution.objectiveOutcome,
        interpretations: resolution.interpretations,
      },
      createdFactIds: [resolution.fact.id],
    },
  };
};

export const advanceActiveEvent = (career: CareerState): CareerState =>
  career.activeEvent?.result ? { ...career, activeEvent: undefined } : career;
