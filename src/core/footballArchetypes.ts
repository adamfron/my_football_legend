import type { Player, PlayerAttributes, PlayerPosition } from '../types/domain';
import { ATTRIBUTE_PRESENTATION_BY_KEY } from './attributePresentation';
export interface FootballArchetypeDefinition {
  id: string;
  label: string;
  eligiblePositions: readonly PlayerPosition[];
  description: string;
  strengths: readonly (keyof PlayerAttributes)[];
  secondaryStrengths: readonly (keyof PlayerAttributes)[];
  weaknesses: readonly (keyof PlayerAttributes)[];
}
const d = (
  id: string,
  label: string,
  pos: PlayerPosition[],
  strengths: (keyof PlayerAttributes)[],
  description = `Profil bazujący na ${strengths
    .slice(0, 3)
    .map((key) => ATTRIBUTE_PRESENTATION_BY_KEY[key].label.toLocaleLowerCase('pl'))
    .join(', ')}.`,
  weaknesses: (keyof PlayerAttributes)[] = [],
): FootballArchetypeDefinition => ({
  id,
  label,
  eligiblePositions: pos,
  description,
  strengths,
  secondaryStrengths: strengths.slice(2),
  weaknesses,
});
const ST: PlayerPosition[] = ['striker'],
  W: PlayerPosition[] = ['left_winger', 'right_winger'],
  AM: PlayerPosition[] = ['attacking_midfielder'],
  DM: PlayerPosition[] = ['defensive_midfielder'],
  FB: PlayerPosition[] = ['left_back', 'right_back'];
export const FOOTBALL_ARCHETYPES: readonly FootballArchetypeDefinition[] = [
  d('poacher', 'Lis pola karnego', ST, ['finishing', 'gameReading', 'composure', 'firstTouch']),
  d('target_man', 'Target man', ST, ['strength', 'heading', 'jumping', 'firstTouch']),
  d(
    'false_nine',
    'Fałszywa dziewiątka',
    ['striker', 'attacking_midfielder'],
    ['technique', 'passing', 'firstTouch', 'gameReading'],
  ),
  d('complete_forward', 'Napastnik kompletny', ST, ['finishing', 'technique', 'pace', 'strength']),
  d(
    'raumdeuter',
    'Raumdeuter',
    ['striker', 'left_winger', 'right_winger', 'attacking_midfielder'],
    ['gameReading', 'pace', 'finishing', 'composure'],
  ),
  d('pressing_forward', 'Pressujący napastnik', ST, [
    'aggression',
    'determination',
    'stamina',
    'pace',
    'tackling',
  ]),
  d('classic_winger', 'Klasyczny skrzydłowy', W, ['pace', 'dribbling', 'passing', 'firstTouch']),
  d('inside_forward', 'Odwrócony skrzydłowy', W, [
    'technique',
    'dribbling',
    'finishing',
    'composure',
  ]),
  d(
    'wide_playmaker',
    'Boczny rozgrywający',
    [...W, ...FB],
    ['passing', 'gameReading', 'technique', 'composure'],
  ),
  d(
    'wing_back',
    'Wahadłowy',
    [...W, ...FB],
    ['stamina', 'pace', 'tackling', 'passing', 'aggression'],
  ),
  d('chaotic_dribbler', 'Chaotyczny drybler', W, ['dribbling', 'agility', 'pace']),
  d('classic_creator', 'Klasyczny kreator', AM, [
    'passing',
    'technique',
    'gameReading',
    'composure',
  ]),
  d('mezzala', 'Mezzala', AM, ['technique', 'dribbling', 'gameReading', 'agility', 'pace']),
  d('box_to_box', 'Box-to-box', [...AM, ...DM], ['stamina', 'determination', 'gameReading']),
  d(
    'withdrawn_forward',
    'Cofnięty napastnik',
    ['striker', 'attacking_midfielder'],
    ['finishing', 'gameReading', 'composure', 'firstTouch'],
  ),
  d('dribbling_creator', 'Dryblujący kreator', AM, [
    'technique',
    'dribbling',
    'agility',
    'gameReading',
  ]),
  d('regista', 'Regista', DM, ['passing', 'technique', 'gameReading', 'composure']),
  d('carillero', 'Carillero', DM, [
    'stamina',
    'gameReading',
    'concentration',
    'tackling',
    'passing',
  ]),
  d('ball_winner', 'Ball-winner', DM, ['aggression', 'determination', 'tackling', 'stamina']),
  d('deep_playmaker', 'Głęboki rozgrywający', DM, ['passing', 'technique', 'gameReading']),
  d('complete_midfielder', 'Kompletny pomocnik', DM, [
    'passing',
    'tackling',
    'stamina',
    'gameReading',
  ]),
  d('half_back', 'Pół-stoper', DM, [
    'strength',
    'heading',
    'tackling',
    'concentration',
    'gameReading',
  ]),
  ...['Defensywny boczny obrońca', 'Ofensywny boczny obrońca', 'Odwrócony boczny obrońca'].map(
    (x, i) =>
      d(`fullback_${i}`, x, FB, [
        i ? 'passing' : 'tackling',
        'stamina',
        'gameReading',
      ] as (keyof PlayerAttributes)[]),
  ),
  ...[
    'Klasyczny stoper',
    'Grający stoper',
    'Libero',
    'Agresywny obrońca',
    'Kompletny obrońca',
    'Dowódca obrony',
  ].map((x, i) =>
    d(
      `center_back_${i}`,
      x,
      ['center_back'],
      i === 5
        ? ['leadership', 'concentration', 'gameReading', 'composure']
        : ['tackling', 'heading', 'gameReading'],
    ),
  ),
  d('shot_stopper', 'Shot-stopper', ['goalkeeper'], ['reflexes', 'handling', 'oneOnOnes']),
  d(
    'sweeper_keeper',
    'Bramkarz-libero',
    ['goalkeeper'],
    ['goalkeeperSweeping', 'gameReading', 'pace', 'passing', 'technique', 'firstTouch'],
  ),
  d(
    'aerial_keeper',
    'Dominujący w powietrzu',
    ['goalkeeper'],
    ['handling', 'goalkeeperSweeping', 'jumping', 'strength'],
  ),
  d(
    'dictator_keeper',
    'Bramkarz-dyktator',
    ['goalkeeper'],
    ['leadership', 'gameReading', 'concentration', 'composure'],
  ),
];
export const getRankedFootballArchetypes = (p: Player, pos = p.primaryPosition) =>
  FOOTBALL_ARCHETYPES.filter((x) => x.eligiblePositions.includes(pos))
    .map((definition) => ({
      definition,
      score:
        definition.strengths.reduce((s, k) => s + p.attributes[k], 0) / definition.strengths.length,
    }))
    .sort((a, b) => b.score - a.score || a.definition.id.localeCompare(b.definition.id));

/** Registry order is the stable, canonical creator order. */
export const getEligibleFootballArchetypes = (position: PlayerPosition) =>
  FOOTBALL_ARCHETYPES.filter((definition) => definition.eligiblePositions.includes(position));

export const getFootballArchetype = (id: string | undefined) =>
  FOOTBALL_ARCHETYPES.find((definition) => definition.id === id);
