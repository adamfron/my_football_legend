import type { CareerState, EventDecision, EventInstance, PositionGroup } from '../../types/domain';
import { hasCareerFactType, hasCareerTag } from '../history/careerMemory';

const positionGroups: Record<PositionGroup, readonly string[]> = {
  goalkeeper: ['goalkeeper'],
  defender: ['center_back', 'left_back'],
  midfielder: ['central_midfielder', 'central_midfielder', 'central_midfielder'],
  attacker: ['left_winger', 'striker'],
  outfield: [
    'center_back',
    'left_back',
    'central_midfielder',
    'central_midfielder',
    'central_midfielder',
    'left_winger',
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
  const eventTags = Array.isArray(event.context.tags) ? (event.context.tags as string[]) : [];
  const hasTag = (tag: string) => eventTags.includes(tag) || hasCareerTag(career, tag);
  return (
    (!availability.positions || availability.positions.includes(career.player.primaryPosition)) &&
    (!availability.positionGroups ||
      availability.positionGroups.some((group) =>
        positionGroups[group].includes(career.player.primaryPosition),
      )) &&
    (!availability.requiredFacts ||
      availability.requiredFacts.every((fact) => hasCareerFactType(career, fact))) &&
    (!availability.excludedFacts ||
      availability.excludedFacts.every((fact) => !hasCareerFactType(career, fact))) &&
    (!availability.requiredTags || availability.requiredTags.every(hasTag))
  );
};

export const getAvailableDecisions = (
  career: CareerState,
  event: EventInstance,
  decisions: EventDecision[],
) => decisions.filter((decision) => isDecisionAvailable(career, event, decision));
