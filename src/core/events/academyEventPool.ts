import type {
  CareerEventCandidate,
  CareerState,
  CareerWeek,
  PositionGroup,
} from '../../types/domain';
import { careerEventCandidateSchema } from '../../schemas/domainSchemas';
import { RandomGenerator } from '../random/RandomGenerator';

export const ACADEMY_ANCHORS = ['academy_coach_introduction', 'academy_first_scrimmage'] as const;

const candidate = (value: CareerEventCandidate) => careerEventCandidateSchema.parse(value);
export const ACADEMY_EVENT_POOL: CareerEventCandidate[] = [
  candidate({
    eventDefinitionId: 'academy_pressure_game',
    weight: 8,
    phases: ['academy'],
    requiredPositionGroups: ['outfield'],
    maxWeek: 5,
    oncePerCareer: true,
    recallTags: ['academy_training_pressure'],
  }),
  candidate({
    eventDefinitionId: 'academy_goalkeeper_pressure',
    weight: 8,
    phases: ['academy'],
    requiredPositionGroups: ['goalkeeper'],
    maxWeek: 5,
    oncePerCareer: true,
    recallTags: ['academy_training_pressure'],
  }),
  candidate({
    eventDefinitionId: 'academy_technical_test',
    weight: 7,
    phases: ['academy'],
    oncePerCareer: true,
    recallTags: ['academy_personal_showcase'],
  }),
  candidate({
    eventDefinitionId: 'academy_position_session',
    weight: 8,
    phases: ['academy'],
    oncePerCareer: true,
    recallTags: ['academy_position_training'],
  }),
  candidate({
    eventDefinitionId: 'academy_senior_year_training',
    weight: 5,
    phases: ['academy'],
    minWeek: 2,
    relationshipRole: 'mentor',
    oncePerCareer: true,
    recallTags: ['academy_mentor_help'],
  }),
  candidate({
    eventDefinitionId: 'academy_position_change',
    weight: 4,
    phases: ['academy'],
    requiredPositionGroups: ['outfield'],
    conflictsWith: ['academy_position_session'],
    oncePerCareer: true,
    recallTags: ['academy_position_change'],
  }),
  candidate({
    eventDefinitionId: 'academy_team_task',
    weight: 7,
    phases: ['academy'],
    oncePerCareer: true,
    recallTags: ['academy_team_sacrifice'],
  }),
  candidate({
    eventDefinitionId: 'academy_shared_training',
    weight: 6,
    phases: ['academy'],
    relationshipRole: 'peer',
    conflictsWith: ['academy_squad_conflict'],
    oncePerCareer: true,
    recallTags: ['academy_peer_training'],
  }),
  candidate({
    eventDefinitionId: 'academy_squad_conflict',
    weight: 5,
    phases: ['academy'],
    relationshipRole: 'peer',
    conflictsWith: ['academy_shared_training'],
    oncePerCareer: true,
    recallTags: ['academy_first_conflict'],
  }),
  candidate({
    eventDefinitionId: 'academy_mentor_advice',
    weight: 6,
    phases: ['academy'],
    relationshipRole: 'mentor',
    oncePerCareer: true,
    recallTags: ['academy_mentor_help'],
  }),
  candidate({
    eventDefinitionId: 'academy_dressing_room_ritual',
    weight: 7,
    phases: ['academy'],
    oncePerCareer: true,
    recallTags: ['academy_belonging'],
  }),
  candidate({
    eventDefinitionId: 'academy_help_teammate',
    weight: 6,
    phases: ['academy'],
    relationshipRole: 'peer',
    oncePerCareer: true,
    recallTags: ['academy_peer_help'],
  }),
  candidate({
    eventDefinitionId: 'academy_school_pressure',
    weight: 5,
    phases: ['academy'],
    oncePerCareer: true,
    recallTags: ['academy_school_pressure'],
  }),
  candidate({
    eventDefinitionId: 'academy_commute_problem',
    weight: 4,
    phases: ['academy'],
    oncePerCareer: true,
    recallTags: ['academy_life_pressure'],
  }),
  candidate({
    eventDefinitionId: 'academy_fatigue_week',
    weight: 5,
    phases: ['academy'],
    excludedFacts: ['academy_rest_prioritized'],
    oncePerCareer: true,
    recallTags: ['academy_fatigue'],
  }),
  candidate({
    eventDefinitionId: 'academy_first_expense',
    weight: 4,
    phases: ['academy'],
    oncePerCareer: true,
    recallTags: ['academy_first_expense'],
  }),
];

export const positionGroupFor = (position: string): PositionGroup =>
  position === 'goalkeeper'
    ? 'goalkeeper'
    : ['center_back', 'full_back'].includes(position)
      ? 'defender'
      : position.includes('midfielder')
        ? 'midfielder'
        : 'attacker';

const isEligible = (
  item: CareerEventCandidate,
  career: CareerState,
  week: CareerWeek,
  selected: string[],
) => {
  const facts = new Set(career.historyFacts.map((fact) => fact.factType));
  const tags = new Set(career.historyFacts.flatMap((fact) => fact.tags));
  const group = positionGroupFor(career.player.primaryPosition);
  return (
    item.phases.includes(week.phase) &&
    (item.minWeek === undefined || week.weekIndex >= item.minWeek) &&
    (item.maxWeek === undefined || week.weekIndex <= item.maxWeek) &&
    (!item.requiredPositionGroups ||
      item.requiredPositionGroups.includes(group) ||
      (group !== 'goalkeeper' && item.requiredPositionGroups.includes('outfield'))) &&
    (item.requiredFacts ?? []).every((fact) => facts.has(fact)) &&
    !(item.excludedFacts ?? []).some((fact) => facts.has(fact)) &&
    (item.requiredTags ?? []).every((tag) => tags.has(tag)) &&
    !(item.excludedTags ?? []).some((tag) => tags.has(tag)) &&
    (!item.oncePerCareer || !facts.has(`career_event_${item.eventDefinitionId}`)) &&
    !(item.conflictsWith ?? []).some((id) => selected.includes(id))
  );
};

/** Pure, deterministic selection for reusable academy colour events. */
export const selectCareerEventsForWeek = (career: CareerState, week: CareerWeek): string[] => {
  const rng = RandomGenerator.fromSeed(`${career.seed}:academy-pool:${week.id}`);
  const target = rng.bool(0.35) ? 2 : 1;
  const selected: string[] = [];
  while (selected.length < target) {
    const eligible = ACADEMY_EVENT_POOL.filter(
      (item) =>
        !selected.includes(item.eventDefinitionId) && isEligible(item, career, week, selected),
    );
    if (!eligible.length) break;
    selected.push(
      rng.weighted(eligible.map((item) => ({ item: item.eventDefinitionId, weight: item.weight }))),
    );
  }
  return selected;
};

export const buildAcademySequence = (career: CareerState): string[] => {
  const rng = RandomGenerator.fromSeed(`${career.seed}:academy-onboarding`);
  if (!rng.bool(0.5)) return [...ACADEMY_ANCHORS];
  const optionalPool = [
    'academy_team_task',
    'academy_pressure_game',
    'academy_shared_training',
    'academy_mentor_advice',
    'academy_school_pressure',
  ];
  const eligible = optionalPool.filter(
    (id) =>
      id !== 'academy_pressure_game' ||
      positionGroupFor(career.player.primaryPosition) !== 'goalkeeper',
  );
  return [...ACADEMY_ANCHORS, rng.pick(eligible)];
};
