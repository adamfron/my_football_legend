import { z } from 'zod';
import type { FootballerProfile, PlayerAttributes, PlayerPosition } from '../types/domain';
import { ATTRIBUTE_PRESENTATION_BY_KEY } from './attributePresentation';

type Attribute = keyof PlayerAttributes;
export const footballArchetypeDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  eligiblePositions: z.array(z.string()).min(1),
  description: z.string().min(1),
  strengths: z.array(z.string()),
  secondaryStrengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  generationBias: z.record(z.string(), z.number().int().min(-20).max(20)),
});
export interface FootballArchetypeDefinition {
  id: string;
  label: string;
  eligiblePositions: readonly PlayerPosition[];
  description: string;
  strengths: readonly Attribute[];
  secondaryStrengths: readonly Attribute[];
  weaknesses: readonly Attribute[];
  generationBias: Partial<Record<Attribute, number>>;
}
const d = (
  id: string,
  label: string,
  pos: PlayerPosition[],
  generationBias: Partial<Record<Attribute, number>>,
  description?: string,
): FootballArchetypeDefinition => {
  const strengths = Object.keys(generationBias).filter(
    (k) => generationBias[k as Attribute]! > 0,
  ) as Attribute[];
  const weaknesses = Object.keys(generationBias).filter(
    (k) => generationBias[k as Attribute]! < 0,
  ) as Attribute[];
  const result = {
    id,
    label,
    eligiblePositions: pos,
    description:
      description ??
      `Profil bazujący na ${strengths
        .slice(0, 3)
        .map((k) => ATTRIBUTE_PRESENTATION_BY_KEY[k].label.toLocaleLowerCase('pl'))
        .join(', ')}.`,
    strengths,
    secondaryStrengths: strengths.slice(2),
    weaknesses,
    generationBias,
  };
  footballArchetypeDefinitionSchema.parse(result);
  return result;
};
const ST: PlayerPosition[] = ['striker'],
  W: PlayerPosition[] = ['left_winger', 'right_winger'],
  AM: PlayerPosition[] = ['attacking_midfielder'],
  DM: PlayerPosition[] = ['defensive_midfielder'],
  FB: PlayerPosition[] = ['left_back', 'right_back'],
  CB: PlayerPosition[] = ['center_back'];
const b = (positive: Attribute[], negative: Attribute[] = [], amount = 8) =>
  Object.fromEntries([
    ...positive.map((k) => [k, amount]),
    ...negative.map((k) => [k, -amount]),
  ]) as Partial<Record<Attribute, number>>;

export const FOOTBALL_ARCHETYPES: readonly FootballArchetypeDefinition[] = [
  d(
    'poacher',
    'Lis pola karnego',
    ST,
    b(['finishing', 'gameReading', 'composure', 'firstTouch'], ['tackling']),
  ),
  d(
    'target_man',
    'Target man',
    ST,
    b(['strength', 'heading', 'jumping', 'firstTouch'], ['pace', 'agility', 'dribbling']),
  ),
  d(
    'false_nine',
    'Fałszywa dziewiątka',
    ST,
    b(
      ['technique', 'passing', 'firstTouch', 'gameReading', 'composure'],
      ['heading', 'jumping', 'strength', 'finishing'],
      7,
    ),
  ),
  d(
    'complete_forward',
    'Napastnik kompletny',
    ST,
    b(
      [
        'finishing',
        'technique',
        'pace',
        'strength',
        'firstTouch',
        'gameReading',
        'composure',
        'heading',
      ],
      [],
      4,
    ),
  ),
  d(
    'raumdeuter',
    'Raumdeuter',
    [...ST, ...W, ...AM],
    b(['gameReading', 'pace', 'finishing', 'composure'], ['tackling', 'heading', 'dribbling']),
  ),
  d(
    'pressing_forward',
    'Pressujący napastnik',
    ST,
    b(
      ['stamina', 'aggression', 'determination', 'pace', 'tackling'],
      ['composure', 'technique', 'passing', 'finishing'],
      7,
    ),
  ),
  d(
    'classic_winger',
    'Klasyczny skrzydłowy',
    W,
    b(['pace', 'dribbling', 'passing', 'firstTouch'], ['strength', 'tackling']),
  ),
  d(
    'inside_forward',
    'Odwrócony skrzydłowy',
    W,
    b(['technique', 'dribbling', 'finishing', 'composure'], ['tackling', 'heading']),
  ),
  d(
    'wide_playmaker',
    'Boczny rozgrywający',
    [...W, ...FB],
    b(
      ['passing', 'technique', 'gameReading', 'composure', 'firstTouch'],
      ['pace', 'finishing', 'tackling', 'heading'],
      7,
    ),
  ),
  d(
    'wing_back',
    'Wahadłowy',
    [...W, ...FB],
    b(
      ['stamina', 'pace', 'tackling', 'passing', 'aggression', 'dribbling'],
      ['finishing', 'composure', 'technique', 'strength'],
      6,
    ),
  ),
  d(
    'chaotic_dribbler',
    'Chaotyczny drybler',
    W,
    b(['dribbling', 'agility', 'pace', 'technique'], ['gameReading', 'composure', 'passing']),
  ),
  d(
    'classic_creator',
    'Klasyczny kreator',
    AM,
    b(['passing', 'technique', 'gameReading', 'composure'], ['tackling', 'strength']),
  ),
  d(
    'mezzala',
    'Mezzala',
    AM,
    b(
      ['technique', 'passing', 'gameReading', 'stamina', 'agility', 'dribbling'],
      ['heading', 'strength', 'tackling'],
      6,
    ),
  ),
  d(
    'box_to_box',
    'Box-to-box',
    [...AM, ...DM],
    b(
      ['stamina', 'determination', 'gameReading', 'tackling', 'passing'],
      ['finishing', 'dribbling'],
      5,
    ),
  ),
  d(
    'withdrawn_forward',
    'Cofnięty napastnik',
    AM,
    b(
      ['finishing', 'gameReading', 'composure', 'firstTouch', 'technique'],
      ['tackling', 'heading', 'strength'],
      7,
    ),
  ),
  d(
    'dribbling_creator',
    'Dryblujący kreator',
    AM,
    b(
      ['dribbling', 'technique', 'agility', 'firstTouch', 'gameReading'],
      ['tackling', 'strength', 'concentration'],
      7,
    ),
  ),
  d(
    'regista',
    'Regista',
    DM,
    b(
      ['passing', 'technique', 'gameReading', 'composure', 'firstTouch'],
      ['strength', 'aggression', 'tackling', 'pace'],
      8,
    ),
    'Głęboko ustawiony rozgrywający, który organizuje grę dzięki podaniom, technice i czytaniu boiska.',
  ),
  d(
    'carillero',
    'Carillero',
    DM,
    b(
      ['stamina', 'gameReading', 'concentration', 'tackling', 'passing'],
      ['finishing', 'dribbling', 'strength', 'aggression'],
      6,
    ),
  ),
  d(
    'ball_winner',
    'Ball-winner',
    DM,
    b(
      ['tackling', 'aggression', 'determination', 'stamina', 'strength'],
      ['technique', 'composure', 'passing'],
      8,
    ),
  ),
  d(
    'complete_midfielder',
    'Kompletny pomocnik',
    DM,
    b(
      ['passing', 'tackling', 'stamina', 'technique', 'gameReading', 'composure', 'strength'],
      [],
      4,
    ),
  ),
  d(
    'half_back',
    'Pół-stoper',
    DM,
    b(
      ['tackling', 'strength', 'heading', 'concentration', 'gameReading'],
      ['dribbling', 'finishing', 'pace'],
      7,
    ),
  ),
  d(
    'fullback_defensive',
    'Defensywny boczny obrońca',
    FB,
    b(
      ['tackling', 'concentration', 'gameReading', 'strength', 'stamina'],
      ['dribbling', 'finishing'],
      7,
    ),
  ),
  d(
    'fullback_offensive',
    'Ofensywny boczny obrońca',
    FB,
    b(
      ['pace', 'stamina', 'dribbling', 'passing', 'firstTouch'],
      ['tackling', 'heading', 'strength'],
      7,
    ),
  ),
  d(
    'center_back_classic',
    'Klasyczny stoper',
    CB,
    b(
      ['tackling', 'heading', 'strength', 'concentration', 'jumping'],
      ['dribbling', 'technique', 'passing'],
      8,
    ),
  ),
  d(
    'center_back_ball_playing',
    'Grający stoper',
    CB,
    b(
      ['tackling', 'passing', 'firstTouch', 'gameReading', 'composure', 'technique'],
      ['aggression', 'heading', 'strength'],
      7,
    ),
  ),
  d(
    'center_back_libero',
    'Libero',
    CB,
    b(
      ['gameReading', 'technique', 'passing', 'dribbling', 'composure', 'pace', 'agility'],
      ['heading', 'strength', 'tackling'],
      7,
    ),
  ),
  d(
    'center_back_aggressive',
    'Agresywny obrońca',
    CB,
    b(
      ['tackling', 'aggression', 'determination', 'strength', 'heading'],
      ['composure', 'passing', 'dribbling'],
      8,
    ),
  ),
  d(
    'center_back_complete',
    'Kompletny obrońca',
    CB,
    b(
      [
        'tackling',
        'heading',
        'strength',
        'concentration',
        'gameReading',
        'pace',
        'passing',
        'composure',
      ],
      [],
      4,
    ),
  ),
  d(
    'center_back_leader',
    'Dowódca obrony',
    CB,
    b(
      ['leadership', 'concentration', 'gameReading', 'composure', 'tackling', 'heading'],
      ['pace', 'dribbling'],
      7,
    ),
  ),
  d(
    'shot_stopper',
    'Shot-stopper',
    ['goalkeeper'],
    b(['reflexes', 'handling', 'oneOnOnes'], ['passing', 'goalkeeperSweeping'], 9),
  ),
  d(
    'sweeper_keeper',
    'Bramkarz-libero',
    ['goalkeeper'],
    b(
      ['goalkeeperSweeping', 'gameReading', 'passing', 'technique', 'firstTouch', 'pace'],
      ['reflexes', 'handling'],
      7,
    ),
  ),
  d(
    'aerial_keeper',
    'Dominujący w powietrzu',
    ['goalkeeper'],
    b(['handling', 'goalkeeperSweeping', 'jumping', 'strength'], ['passing', 'technique'], 8),
  ),
  d(
    'dictator_keeper',
    'Bramkarz-dyktator',
    ['goalkeeper'],
    b(
      ['leadership', 'gameReading', 'concentration', 'composure', 'handling', 'oneOnOnes'],
      ['pace', 'goalkeeperSweeping'],
      6,
    ),
  ),
];
export const getRankedFootballArchetypes = (p: FootballerProfile, pos = p.primaryPosition) =>
  FOOTBALL_ARCHETYPES.filter((x) => x.eligiblePositions.includes(pos))
    .map((definition) => ({
      definition,
      score:
        definition.strengths.reduce((s, k) => s + p.attributes[k], 0) / definition.strengths.length,
    }))
    .sort((a, b) => b.score - a.score || a.definition.id.localeCompare(b.definition.id));
export const getEligibleFootballArchetypes = (position: PlayerPosition) =>
  FOOTBALL_ARCHETYPES.filter((d) => d.eligiblePositions.includes(position));
export const getFootballArchetype = (id: string | undefined) =>
  FOOTBALL_ARCHETYPES.find((d) => d.id === id);
