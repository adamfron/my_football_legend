import { z } from 'zod';
import type { PlayerAttributes } from '../../types/domain';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { canParticipatePhysically } from './matchInjuries';
import { TACTICAL_PREFERENCE_DEFAULTS } from './tacticalPreferences';

export const roleFamilySchema = z.enum([
  'goalkeeper',
  'centre_back',
  'fullback',
  'defensive_midfield',
  'central_midfield',
  'attacking_midfield',
  'winger',
  'striker',
]);
export const roleInstructionSchema = z.enum([
  'width',
  'depth',
  'come_short',
  'combine',
  'overlap',
  'underlap',
  'central_support',
  'cover',
  'distribute_long',
  'cross',
  'box',
  'shoot',
  'press',
  'hold_position',
  'counter',
]);
export const tacticalRoleIdSchema = z.enum([
  'traditional_keeper',
  'sweeper_keeper',
  'distributing_keeper',
  'stopper',
  'covering_defender',
  'ball_playing_defender',
  'defensive_fullback',
  'attacking_fullback',
  'inverted_fullback',
  'wide_playmaker_fullback',
  'anchor',
  'ball_winner',
  'deep_playmaker',
  'playmaker',
  'box_to_box',
  'controlling_midfielder',
  'mezzala',
  'creative_ten',
  'shadow_striker',
  'pressing_midfielder',
  'traditional_winger',
  'inside_forward',
  'wide_playmaker',
  'defensive_winger',
  'target_forward',
  'false_nine',
  'advanced_forward',
  'poacher',
  'pressing_forward',
]);
export type TacticalRoleId = z.infer<typeof tacticalRoleIdSchema>;
export const tacticalRoleSchema = z.object({
  id: tacticalRoleIdSchema,
  family: roleFamilySchema,
  label: z.string(),
  instructions: z.array(roleInstructionSchema).min(1),
  attributes: z.array(z.string()).min(1),
  partners: z.array(roleInstructionSchema),
  departWhen: z.array(
    z.enum([
      'dominant_opportunity',
      'defensive_emergency',
      'no_cover',
      'physical_contact',
      'human_command',
    ]),
  ),
});
export type TacticalRole = z.infer<typeof tacticalRoleSchema>;
type Instruction = z.infer<typeof roleInstructionSchema>;
const role = (
  id: TacticalRoleId,
  family: TacticalRole['family'],
  label: string,
  instructions: Instruction[],
  attributes: (keyof PlayerAttributes)[],
  partners: Instruction[] = [],
): TacticalRole =>
  tacticalRoleSchema.parse({
    id,
    family,
    label,
    instructions,
    attributes,
    partners,
    departWhen: [
      'dominant_opportunity',
      'defensive_emergency',
      'no_cover',
      'physical_contact',
      'human_command',
    ],
  });

/** Instructions describe destinations and consequences, never new execution abilities. */
export const TACTICAL_ROLES: readonly TacticalRole[] = [
  role(
    'traditional_keeper',
    'goalkeeper',
    'Bramkarz klasyczny',
    ['cover', 'distribute_long'],
    ['handling', 'reflexes', 'oneOnOnes'],
  ),
  role(
    'sweeper_keeper',
    'goalkeeper',
    'Bramkarz libero',
    ['cover', 'central_support'],
    ['goalkeeperSweeping', 'pace', 'gameReading'],
  ),
  role(
    'distributing_keeper',
    'goalkeeper',
    'Bramkarz rozgrywający',
    ['come_short', 'combine'],
    ['goalkeeperKicking', 'passing', 'composure'],
  ),
  role(
    'stopper',
    'centre_back',
    'Stoper',
    ['press', 'cover'],
    ['tackling', 'strength', 'aggression'],
    ['cover'],
  ),
  role(
    'covering_defender',
    'centre_back',
    'Obrońca asekurujący',
    ['cover', 'hold_position'],
    ['positioning', 'pace', 'gameReading'],
  ),
  role(
    'ball_playing_defender',
    'centre_back',
    'Obrońca rozgrywający',
    ['cover', 'central_support', 'distribute_long'],
    ['passing', 'technique', 'composure'],
    ['come_short'],
  ),
  role(
    'defensive_fullback',
    'fullback',
    'Boczny obrońca defensywny',
    ['cover', 'hold_position', 'width'],
    ['tackling', 'positioning', 'concentration'],
  ),
  role(
    'attacking_fullback',
    'fullback',
    'Boczny obrońca ofensywny',
    ['overlap', 'width', 'cross', 'counter'],
    ['pace', 'stamina', 'passing'],
    ['cover', 'underlap'],
  ),
  role(
    'inverted_fullback',
    'fullback',
    'Boczny obrońca odwrócony',
    ['underlap', 'central_support', 'combine'],
    ['firstTouch', 'passing', 'gameReading'],
    ['width', 'cover'],
  ),
  role(
    'wide_playmaker_fullback',
    'fullback',
    'Boczny rozgrywający',
    ['come_short', 'width', 'cross'],
    ['passing', 'technique', 'gameReading'],
    ['depth'],
  ),
  role(
    'anchor',
    'defensive_midfield',
    'Kotwica',
    ['cover', 'hold_position', 'central_support'],
    ['positioning', 'concentration', 'tackling'],
  ),
  role(
    'ball_winner',
    'defensive_midfield',
    'Odbierający',
    ['press', 'cover', 'counter'],
    ['tackling', 'stamina', 'aggression'],
    ['cover'],
  ),
  role(
    'deep_playmaker',
    'defensive_midfield',
    'Cofnięty rozgrywający',
    ['come_short', 'central_support', 'distribute_long', 'cover'],
    ['passing', 'gameReading', 'composure'],
    ['depth'],
  ),
  role(
    'playmaker',
    'central_midfield',
    'Rozgrywający',
    ['come_short', 'central_support', 'combine'],
    ['passing', 'technique', 'gameReading'],
    ['depth'],
  ),
  role(
    'box_to_box',
    'central_midfield',
    'Pomocnik od pola do pola',
    ['box', 'counter', 'cover'],
    ['stamina', 'pace', 'positioning'],
    ['hold_position'],
  ),
  role(
    'controlling_midfielder',
    'central_midfield',
    'Kontrolujący pomocnik',
    ['central_support', 'hold_position', 'cover', 'combine'],
    ['firstTouch', 'composure', 'passing'],
  ),
  role(
    'mezzala',
    'central_midfield',
    'Mezzala',
    ['underlap', 'box', 'combine'],
    ['technique', 'dribbling', 'stamina'],
    ['width', 'cover'],
  ),
  role(
    'creative_ten',
    'attacking_midfield',
    'Kreatywna dziesiątka',
    ['come_short', 'combine', 'shoot'],
    ['passing', 'gameReading', 'technique'],
    ['depth'],
  ),
  role(
    'shadow_striker',
    'attacking_midfield',
    'Cofnięty napastnik',
    ['depth', 'box', 'shoot'],
    ['finishing', 'positioning', 'pace'],
    ['come_short'],
  ),
  role(
    'pressing_midfielder',
    'attacking_midfield',
    'Pressujący pomocnik',
    ['press', 'combine', 'counter'],
    ['stamina', 'aggression', 'gameReading'],
    ['cover'],
  ),
  role(
    'traditional_winger',
    'winger',
    'Skrzydłowy klasyczny',
    ['width', 'depth', 'cross', 'counter'],
    ['pace', 'dribbling', 'passing'],
    ['box', 'cover'],
  ),
  role(
    'inside_forward',
    'winger',
    'Schodzący napastnik',
    ['underlap', 'depth', 'box', 'shoot'],
    ['finishing', 'dribbling', 'pace'],
    ['width', 'overlap'],
  ),
  role(
    'wide_playmaker',
    'winger',
    'Skrzydłowy rozgrywający',
    ['come_short', 'combine', 'width'],
    ['passing', 'technique', 'gameReading'],
    ['overlap', 'depth'],
  ),
  role(
    'defensive_winger',
    'winger',
    'Skrzydłowy defensywny',
    ['width', 'cover', 'press'],
    ['stamina', 'tackling', 'positioning'],
  ),
  role(
    'target_forward',
    'striker',
    'Napastnik docelowy',
    ['come_short', 'box', 'combine'],
    ['strength', 'heading', 'firstTouch'],
    ['depth', 'cross'],
  ),
  role(
    'false_nine',
    'striker',
    'Fałszywa dziewiątka',
    ['come_short', 'central_support', 'combine'],
    ['passing', 'firstTouch', 'gameReading'],
    ['depth', 'box'],
  ),
  role(
    'advanced_forward',
    'striker',
    'Wysunięty napastnik',
    ['depth', 'box', 'counter', 'shoot'],
    ['pace', 'positioning', 'finishing'],
    ['come_short'],
  ),
  role(
    'poacher',
    'striker',
    'Łowca bramek',
    ['box', 'depth', 'shoot', 'hold_position'],
    ['finishing', 'positioning', 'concentration'],
    ['cross', 'combine'],
  ),
  role(
    'pressing_forward',
    'striker',
    'Pressujący napastnik',
    ['press', 'depth', 'counter'],
    ['stamina', 'aggression', 'pace'],
    ['cover'],
  ),
];
export const ROLE_BY_ID = Object.fromEntries(TACTICAL_ROLES.map((r) => [r.id, r])) as Record<
  TacticalRoleId,
  TacticalRole
>;
export const rolePlanSchema = z.object({
  initial: z.record(z.string(), tacticalRoleIdSchema),
  assignments: z.record(z.string(), tacticalRoleIdSchema),
  changes: z
    .array(
      z.object({
        at: z.number().nonnegative(),
        playerId: z.string(),
        from: tacticalRoleIdSchema,
        to: tacticalRoleIdSchema,
        reason: z.enum(['explicit', 'substitution']),
      }),
    )
    .max(64),
});
export type RolePlan = z.infer<typeof rolePlanSchema>;
export const roleFamilyFor = (player: Pick<MatchPlayerState, 'slot'>): TacticalRole['family'] => {
  const p = player.slot.position;
  if (p === 'goalkeeper') return 'goalkeeper';
  if (p === 'center_back') return 'centre_back';
  if (p.includes('back')) return 'fullback';
  if (p === 'central_midfielder')
    return player.slot.duty === 'defend'
      ? 'defensive_midfield'
      : player.slot.duty === 'attack' && player.slot.y <= 31
        ? 'attacking_midfield'
        : 'central_midfield';
  if (p.includes('winger')) return 'winger';
  return 'striker';
};
export const rolesForPlayer = (player: Pick<MatchPlayerState, 'slot'>) =>
  TACTICAL_ROLES.filter(
    (r) =>
      r.family === roleFamilyFor(player) ||
      (player.slot.position === 'central_midfielder' &&
        (r.family === 'central_midfield' || r.id === 'deep_playmaker')),
  );
export const roleSuitability = (player: MatchPlayerState, definition: TacticalRole) => {
  const attributes = player.profile.attributes;
  const skill =
    definition.attributes.reduce((s, k) => s + attributes[k as keyof PlayerAttributes], 0) /
    (100 * definition.attributes.length);
  const condition = player.fitness?.longTermCapacity ?? 1;
  return (
    skill * (0.8 + 0.2 * condition) -
    (definition.instructions.some((i) => ['depth', 'press', 'overlap'].includes(i))
      ? (1 - condition) * 0.15
      : 0)
  );
};

/** Two bounded coordinate sweeps over at most five roles per slot. Opposition evidence is
 * the visible formation/preferences; no opponent hidden attributes or future random draws. */
export const assignTacticalRoles = (state: TacticalMatchState): RolePlan => {
  const assignments: Record<string, TacticalRoleId> = {};
  for (const side of ['home', 'away'] as const) {
    const players = state.players
      .filter(
        (p) => p.team === side && canParticipatePhysically(p) && !state.discipline?.[p.id]?.sentOff,
      )
      .sort((a, b) => a.slotIndex - b.slotIndex || a.id.localeCompare(b.id));
    const prefs =
      state.teams[side].tacticalPreferences ??
      TACTICAL_PREFERENCE_DEFAULTS[state.teams[side].style];
    const opposition = state.teams[side === 'home' ? 'away' : 'home'];
    const line =
      opposition.tacticalPreferences?.blockHeight ??
      TACTICAL_PREFERENCE_DEFAULTS[opposition.style].blockHeight;
    for (let sweep = 0; sweep < 2; sweep++)
      for (const player of players) {
        const others = players
          .filter((p) => p.id !== player.id)
          .map((p) => ({ p, r: assignments[p.id] ? ROLE_BY_ID[assignments[p.id]!] : undefined }));
        const score = (r: TacticalRole) => {
          const has = (i: Instruction) => r.instructions.includes(i);
          const cover = others.filter(({ r }) => r?.instructions.includes('cover')).length;
          const attackers = others.filter(({ r }) => r?.instructions.includes('depth')).length;
          const neighbours = others.filter(
            ({ p }) => Math.abs(p.neutralAnchor.y - player.neutralAnchor.y) < 22,
          );
          const compatible = r.partners.filter((i) =>
            neighbours.some(({ r: n }) => n?.instructions.includes(i)),
          ).length;
          return (
            roleSuitability(player, r) +
            compatible * 0.035 +
            (has('depth') ? ((line - 0.5) * player.profile.attributes.pace) / 350 : 0) +
            (has('press') ? (prefs.organisedPress - 0.5) * 0.14 : 0) +
            (has('combine') ? (prefs.possessionPatience - 0.5) * 0.12 : 0) +
            (has('counter') ? (prefs.verticality - 0.5) * 0.12 : 0) -
            (has('overlap') && cover < 3 ? 0.3 : 0) -
            (r.id === 'false_nine' && attackers < 1 ? 0.22 : 0) -
            (has('depth') && attackers >= 4 ? 0.12 : 0) +
            (has('cover') && cover < 3 ? 0.09 : 0)
          );
        };
        assignments[player.id] = [...rolesForPlayer(player)].sort(
          (a, b) => score(b) - score(a) || a.id.localeCompare(b.id),
        )[0]!.id;
      }
  }
  return { initial: { ...assignments }, assignments, changes: [] };
};
export const tacticalRoleFor = (state: TacticalMatchState, player: MatchPlayerState) => {
  const id = state.rolePlan?.assignments[player.id];
  if (id && rolesForPlayer(player).some((r) => r.id === id)) return ROLE_BY_ID[id];
  return [...rolesForPlayer(player)].sort(
    (a, b) => roleSuitability(player, b) - roleSuitability(player, a) || a.id.localeCompare(b.id),
  )[0]!;
};
export const changeTacticalRole = (
  state: TacticalMatchState,
  playerId: string,
  roleId: TacticalRoleId,
): TacticalMatchState => {
  const player = state.players.find((p) => p.id === playerId);
  if (
    !player ||
    !canParticipatePhysically(player) ||
    state.discipline?.[playerId]?.sentOff ||
    !rolesForPlayer(player).some((r) => r.id === roleId)
  )
    throw new Error('Role is incompatible with the available player/position');
  const plan = state.rolePlan ?? assignTacticalRoles(state);
  const from = plan.assignments[playerId] ?? tacticalRoleFor(state, player).id;
  if (from === roleId) return state;
  if (plan.changes.length >= 64) throw new Error('Role adjustment budget exhausted');
  const { decisionReadiness: previousReadiness, ...rest } = state;
  void previousReadiness;
  return {
    ...rest,
    rolePlan: {
      ...plan,
      assignments: { ...plan.assignments, [playerId]: roleId },
      changes: [
        ...plan.changes,
        { at: state.time, playerId, from, to: roleId, reason: 'explicit' },
      ],
    },
  };
};
