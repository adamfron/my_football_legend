import { z } from 'zod';
import { pitchPointSchema } from './matchSpace';

export const tacticalIntentSchema = z.enum([
  'seek_space',
  'support_ball',
  'run_beyond',
  'attack_near_post',
  'attack_far_post',
  'attack_central',
  'attack_second_ball',
  'short_option',
  'overlap',
  'rest_defence',
  'press_ball',
  'cover_press',
  'screen_lane',
  'mark_opponent',
  'protect_zone',
  'counter_outlet',
  'attack_landing_zone',
]);
export type TacticalIntent = z.infer<typeof tacticalIntentSchema>;

export const tacticalZoneSchema = z.object({
  centre: pitchPointSchema,
  radius: z.number().positive(),
  timing: z.number().nonnegative().default(0),
});
export const situationalRoleSchema = z.object({
  key: z.string(),
  side: z.enum(['attacking', 'defending']),
  intent: tacticalIntentSchema,
  count: z.tuple([z.number().int().nonnegative(), z.number().int().positive()]),
  criteria: z.array(
    z.enum(['aerial', 'set_piece', 'pace', 'defending', 'passing', 'game_reading', 'nearest']),
  ),
  zone: tacticalZoneSchema.optional(),
  legalConstraints: z
    .array(
      z.enum([
        'pitch_bounds',
        'own_half',
        'restart_distance',
        'outside_penalty_area',
        'behind_penalty_mark',
        'wall_distance',
        'offside',
      ]),
    )
    .default(['pitch_bounds']),
});
export type SituationalRole = z.infer<typeof situationalRoleSchema>;

export const tacticalSituationDefinitionSchema = z.object({
  scenario: z.enum([
    'kick_off',
    'goal_kick',
    'gk_short',
    'corner',
    'free_kick_far',
    'free_kick_close',
    'free_kick_wide',
    'penalty',
  ]),
  attackingRoles: z.array(situationalRoleSchema),
  defendingRoles: z.array(situationalRoleSchema),
  executionChoices: z.array(z.enum(['short_pass', 'long_delivery', 'direct_shot', 'combination'])),
  releaseSeconds: z.number().positive(),
});
export type TacticalSituationDefinition = z.infer<typeof tacticalSituationDefinitionSchema>;

const role = (
  key: string,
  side: 'attacking' | 'defending',
  intent: TacticalIntent,
  count: [number, number],
  criteria: SituationalRole['criteria'],
  centre?: { x: number; y: number },
): SituationalRole => ({
  key,
  side,
  intent,
  count,
  criteria,
  ...(centre ? { zone: { centre, radius: 8, timing: 0 } } : {}),
  legalConstraints: ['pitch_bounds'],
});

/** Declarative tactical vocabulary. Geometry resolves these zones for the current XI and seed. */
export const TACTICAL_SITUATION_PLAYBOOK: Record<
  TacticalSituationDefinition['scenario'],
  TacticalSituationDefinition
> = {
  kick_off: {
    scenario: 'kick_off',
    attackingRoles: [
      role('taker', 'attacking', 'support_ball', [1, 1], ['set_piece']),
      role('angles', 'attacking', 'support_ball', [3, 5], ['passing']),
    ],
    defendingRoles: [role('compact_block', 'defending', 'protect_zone', [10, 10], ['defending'])],
    executionChoices: ['short_pass'],
    releaseSeconds: 4,
  },
  goal_kick: {
    scenario: 'goal_kick',
    attackingRoles: [
      role('contestants', 'attacking', 'attack_landing_zone', [2, 4], ['aerial'], { x: 61, y: 34 }),
      role('second_ball', 'attacking', 'attack_second_ball', [2, 3], ['game_reading'], {
        x: 54,
        y: 34,
      }),
      role('rest', 'attacking', 'rest_defence', [2, 3], ['defending'], { x: 39, y: 34 }),
    ],
    defendingRoles: [
      role('contest', 'defending', 'mark_opponent', [2, 4], ['aerial']),
      role('cover', 'defending', 'protect_zone', [3, 5], ['defending']),
    ],
    executionChoices: ['long_delivery'],
    releaseSeconds: 4,
  },
  gk_short: {
    scenario: 'gk_short',
    attackingRoles: [
      role('first_line', 'attacking', 'support_ball', [2, 4], ['passing']),
      role('width', 'attacking', 'seek_space', [2, 2], ['pace']),
      role('progression', 'attacking', 'run_beyond', [2, 4], ['passing']),
    ],
    defendingRoles: [
      role('first_press', 'defending', 'press_ball', [1, 3], ['nearest']),
      role('press_cover', 'defending', 'cover_press', [1, 2], ['defending']),
      role('screen', 'defending', 'screen_lane', [2, 3], ['game_reading']),
    ],
    executionChoices: ['short_pass'],
    releaseSeconds: 4,
  },
  corner: {
    scenario: 'corner',
    attackingRoles: [
      role('near', 'attacking', 'attack_near_post', [1, 3], ['aerial']),
      role('central', 'attacking', 'attack_central', [1, 2], ['aerial']),
      role('far', 'attacking', 'attack_far_post', [1, 2], ['aerial']),
      role('edge', 'attacking', 'attack_second_ball', [1, 1], ['game_reading']),
      role('rest', 'attacking', 'rest_defence', [2, 2], ['defending']),
    ],
    defendingRoles: [
      role('zone', 'defending', 'protect_zone', [2, 3], ['aerial']),
      role('markers', 'defending', 'mark_opponent', [3, 5], ['defending']),
      role('outlet', 'defending', 'counter_outlet', [0, 1], ['pace']),
    ],
    executionChoices: ['long_delivery', 'short_pass'],
    releaseSeconds: 4,
  },
  free_kick_far: {
    scenario: 'free_kick_far',
    attackingRoles: [
      role('targets', 'attacking', 'attack_landing_zone', [3, 5], ['aerial']),
      role('edge', 'attacking', 'attack_second_ball', [1, 1], ['passing']),
      role('rest', 'attacking', 'rest_defence', [2, 3], ['defending']),
    ],
    defendingRoles: [
      role('wall', 'defending', 'protect_zone', [0, 2], ['aerial']),
      role('markers', 'defending', 'mark_opponent', [3, 6], ['defending']),
    ],
    executionChoices: ['long_delivery', 'combination', 'direct_shot'],
    releaseSeconds: 4,
  },
  free_kick_close: {
    scenario: 'free_kick_close',
    attackingRoles: [
      role('rebound', 'attacking', 'attack_second_ball', [2, 4], ['pace']),
      role('decoy', 'attacking', 'run_beyond', [1, 3], ['pace']),
      role('rest', 'attacking', 'rest_defence', [2, 3], ['defending']),
    ],
    defendingRoles: [
      role('wall', 'defending', 'protect_zone', [3, 5], ['aerial']),
      role('cover', 'defending', 'mark_opponent', [3, 5], ['defending']),
    ],
    executionChoices: ['direct_shot', 'combination'],
    releaseSeconds: 4,
  },
  free_kick_wide: {
    scenario: 'free_kick_wide',
    attackingRoles: [
      role('near', 'attacking', 'attack_near_post', [1, 1], ['aerial']),
      role('central', 'attacking', 'attack_central', [2, 3], ['aerial']),
      role('far', 'attacking', 'attack_far_post', [1, 1], ['aerial']),
      role('edge', 'attacking', 'attack_second_ball', [1, 2], ['passing']),
      role('rest', 'attacking', 'rest_defence', [2, 2], ['defending']),
    ],
    defendingRoles: [
      role('line', 'defending', 'protect_zone', [2, 3], ['aerial']),
      role('markers', 'defending', 'mark_opponent', [3, 5], ['defending']),
    ],
    executionChoices: ['long_delivery', 'short_pass', 'combination'],
    releaseSeconds: 4,
  },
  penalty: {
    scenario: 'penalty',
    attackingRoles: [
      role('taker', 'attacking', 'attack_central', [1, 1], ['set_piece']),
      role('rebound', 'attacking', 'attack_second_ball', [3, 5], ['pace']),
      role('cover', 'attacking', 'rest_defence', [2, 3], ['defending']),
    ],
    defendingRoles: [
      role('rebound_markers', 'defending', 'mark_opponent', [4, 6], ['defending']),
      role('outlet', 'defending', 'counter_outlet', [0, 1], ['pace']),
    ],
    executionChoices: ['direct_shot'],
    releaseSeconds: 4,
  },
};

export const cornerPlanSchema = z.enum(['direct_near_post', 'direct_mixed_or_far', 'short_corner']);
export type CornerPlan = z.infer<typeof cornerPlanSchema>;
export const chooseCornerPlan = (seed: string): CornerPlan => {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return cornerPlanSchema.options[hash % cornerPlanSchema.options.length]!;
};
