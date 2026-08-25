import type { CareerState, EventDecision, EventInstance, PositionGroup } from '../../types/domain';

const positionGroups: Record<PositionGroup, readonly string[]> = {
  goalkeeper: ['goalkeeper'],
  defender: ['center_back', 'full_back'],
  midfielder: ['defensive_midfielder', 'central_midfielder', 'attacking_midfielder'],
  attacker: ['winger', 'striker'],
  outfield: [
    'center_back',
    'full_back',
    'defensive_midfielder',
    'central_midfielder',
    'attacking_midfielder',
    'winger',
    'striker',
  ],
};

export const isDecisionAvailable = (
  career: CareerState,
  event: EventInstance,
  decision: EventDecision,
): boolean => {
  const availability = decision.availability;
  if (!availability) return true;
  const facts = new Set(career.historyFacts.map((fact) => fact.factType));
  const eventTags = Array.isArray(event.context.tags) ? (event.context.tags as string[]) : [];
  const tags = new Set([...eventTags, ...career.historyFacts.flatMap((fact) => fact.tags)]);
  return (
    (!availability.positions || availability.positions.includes(career.player.primaryPosition)) &&
    (!availability.positionGroups ||
      availability.positionGroups.some((group) =>
        positionGroups[group].includes(career.player.primaryPosition),
      )) &&
    (!availability.requiredFacts || availability.requiredFacts.every((fact) => facts.has(fact))) &&
    (!availability.excludedFacts || availability.excludedFacts.every((fact) => !facts.has(fact))) &&
    (!availability.requiredTags || availability.requiredTags.every((tag) => tags.has(tag)))
  );
};

export const getAvailableDecisions = (
  career: CareerState,
  event: EventInstance,
  decisions: EventDecision[],
) => decisions.filter((decision) => isDecisionAvailable(career, event, decision));
