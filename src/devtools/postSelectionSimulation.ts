import { RandomGenerator } from '../core/random/RandomGenerator';
import type { OpeningMonthRole } from '../core/events/postSelectionPath';
import type { SelectionOutcome } from '../core/events/resolvers/secondWeekResolvers';
export interface PostSelectionSimulationReport {
  samples: number;
  paths: Record<SelectionOutcome, number>;
  roles: Record<string, number>;
  byPosition: Record<string, Record<string, number>>;
  averageNewPeople: number;
  averageNewFacts: number;
  rivalRelations: Record<string, number>;
  unreachablePaths: SelectionOutcome[];
}
export const simulatePostSelectionPaths = (samples = 500): PostSelectionSimulationReport => {
  const pathsList: SelectionOutcome[] = [
    'player_invited',
    'both_invited',
    'rival_invited_player_plan',
    'extended_assessment',
  ];
  const positions = ['goalkeeper', 'defender', 'midfielder', 'forward'];
  const roleMap: Record<SelectionOutcome, OpeningMonthRole[]> = {
    player_invited: ['senior_training_rotation', 'senior_trial_extended', 'weekly_senior_access'],
    both_invited: ['senior_training_rotation', 'senior_trial_extended', 'weekly_senior_access'],
    rival_invited_player_plan: [
      'weekly_senior_access',
      'academy_leader',
      'individual_development_plan',
    ],
    extended_assessment: [
      'senior_trial_extended',
      'weekly_senior_access',
      'academy_leader',
      'academy_match_opportunity',
    ],
  };
  const paths = Object.fromEntries(pathsList.map((x) => [x, 0])) as Record<
    SelectionOutcome,
    number
  >;
  const roles: Record<string, number> = {};
  const byPosition: Record<string, Record<string, number>> = {};
  const rivalRelations = { friendly: 0, competitive: 0, tense: 0 };
  let people = 0,
    facts = 0;
  for (let i = 0; i < samples; i++) {
    const rng = RandomGenerator.fromSeed(`post-path-simulation:${i}`);
    const path = pathsList[rng.int(0, 3)]!;
    const position = positions[rng.int(0, 3)]!;
    const role = rng.pick(roleMap[path]);
    paths[path]++;
    roles[role] = (roles[role] ?? 0) + 1;
    (byPosition[position] ??= {})[role] = ((byPosition[position] ??= {})[role] ?? 0) + 1;
    people += path === 'player_invited' || path === 'both_invited' ? 2 : 0;
    facts += 5;
    rivalRelations[rng.pick(['friendly', 'competitive', 'tense'] as const)]++;
  }
  return {
    samples,
    paths,
    roles,
    byPosition,
    averageNewPeople: people / samples,
    averageNewFacts: facts / samples,
    rivalRelations,
    unreachablePaths: pathsList.filter((p) => paths[p] === 0),
  };
};
