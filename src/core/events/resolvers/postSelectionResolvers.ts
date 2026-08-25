import type {
  CareerState,
  EventDecision,
  EventInstance,
  PlayerAttributes,
  RelationshipScores,
} from '../../../types/domain';
import { RandomGenerator } from '../../random/RandomGenerator';
import { COACH_ID, RIVAL_ID } from '../academyArc';
import {
  SENIOR_CAPTAIN_ID,
  makePathFact,
  postSelectionEventSequence,
  selectionOutcomeFor,
  type OpeningMonthRole,
} from '../postSelectionPath';
import type { EventResolution, ResolutionTier } from '../resolveEventChoice';

const finalEvents = new Set([
  'senior_trial_role_decision',
  'development_plan_assessment',
  'academy_extra_match_role_decision',
]);
const attrsFor = (position: string): (keyof PlayerAttributes)[] =>
  position === 'goalkeeper'
    ? ['composure', 'vision', 'leadership']
    : ['technique', 'composure', position.includes('back') ? 'defending' : 'pace'];
const tier = (score: number): ResolutionTier =>
  score >= 72 ? 'success' : score >= 56 ? 'mixed' : 'failure';
const choices: Record<string, OpeningMonthRole[]> = {
  senior_trial_role_decision: [
    'senior_training_rotation',
    'senior_trial_extended',
    'weekly_senior_access',
  ],
  development_plan_assessment: [
    'weekly_senior_access',
    'academy_leader',
    'individual_development_plan',
  ],
  academy_extra_match_role_decision: [
    'senior_trial_extended',
    'weekly_senior_access',
    'academy_leader',
    'academy_match_opportunity',
  ],
};
const factTypes: Record<string, string> = {
  senior_dressing_room_arrival: 'senior_dressing_room_first_impression',
  senior_first_training: 'senior_first_training_result',
  development_plan_meeting: 'individual_development_plan_created',
  rival_promoted_reaction: 'rival_promotion_response',
  academy_extra_match: 'academy_extra_match_result',
};
export const resolvePostSelectionEvent = (
  career: CareerState,
  event: EventInstance,
  decision: EventDecision,
): EventResolution => {
  const rng = RandomGenerator.import(event.randomState).fork(decision.id);
  const coach = career.relationships[COACH_ID];
  const base =
    attrsFor(career.player.primaryPosition).reduce((n, k) => n + career.player.attributes[k], 0) /
      3 +
    career.player.fitness * 0.12 +
    career.player.morale * 0.08 +
    (coach?.trust ?? 50) * 0.05 +
    rng.int(-12, 12);
  const resultTier = tier(base);
  let role: OpeningMonthRole | undefined;
  if (finalEvents.has(event.definitionId)) {
    const roles = choices[event.definitionId]!;
    role = roles[Math.min(roles.length - 1, Math.max(0, Math.floor((base - 42) / 14)))]!;
  }
  const factType = role
    ? 'opening_month_role_assigned'
    : (factTypes[event.definitionId] ?? `${event.definitionId}_choice`);
  const relationshipChanges: Record<string, Partial<RelationshipScores>> = {};
  if (event.definitionId === 'senior_dressing_room_arrival')
    relationshipChanges[SENIOR_CAPTAIN_ID] = decision.id.endsWith('seek_role')
      ? { trust: 7, respect: 3 }
      : decision.id.endsWith('confident')
        ? { respect: 5 }
        : { trust: 4 };
  if (event.definitionId === 'rival_promoted_reaction')
    relationshipChanges[RIVAL_ID] =
      decision.id === 'rival_congratulate'
        ? { trust: 7, gratitude: 6 }
        : decision.id === 'rival_cold_response'
          ? { resentment: 9, rivalry: 6 }
          : { rivalry: 3 };
  const fact = makePathFact(
    career,
    factType,
    {
      eventId: event.definitionId,
      decisionId: decision.id,
      resultTier,
      ...(role
        ? { role, coachAssessment: resultTier, selectionOutcome: selectionOutcomeFor(career) }
        : {
            positionGroup:
              career.player.primaryPosition === 'goalkeeper' ? 'goalkeeper' : 'outfield',
          }),
    },
    role ? 100 : 78,
  );
  return {
    tier: resultTier,
    objectiveOutcome: role ?? decision.id,
    moraleDelta: resultTier === 'failure' ? -2 : 2,
    fitnessDelta:
      event.definitionId.includes('training') || event.definitionId === 'academy_extra_match'
        ? -5
        : 0,
    reputationDelta: resultTier === 'success' ? 2 : 0,
    relationshipChanges,
    interpretations: [],
    fact,
  };
};
export const nextPostSelectionEvent = (career: CareerState, current: string) => {
  const outcome = selectionOutcomeFor(career);
  if (!outcome) return undefined;
  const sequence = postSelectionEventSequence(outcome);
  return sequence[sequence.indexOf(current) + 1];
};
