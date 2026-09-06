import { tacticalSequenceSchema, type TacticalFrame, type TacticalSequence } from './model';

const basePlayers = () => {
  const home = [
    [8, 34],
    [24, 8],
    [24, 25],
    [24, 43],
    [24, 60],
    [43, 13],
    [43, 34],
    [43, 55],
    [58, 12],
    [55, 34],
    [58, 56],
  ];
  const away = [
    [97, 34],
    [81, 8],
    [81, 25],
    [81, 43],
    [81, 60],
    [65, 13],
    [65, 34],
    [65, 55],
    [48, 12],
    [50, 34],
    [48, 56],
  ];
  return [
    ...home.map(([x, y], index) => ({
      id: `home-${index}`,
      team: 'home' as const,
      x: x!,
      y: y!,
      protagonist: index === 6,
      goalkeeper: index === 0,
    })),
    ...away.map(([x, y], index) => ({
      id: `away-${index}`,
      team: 'away' as const,
      x: x!,
      y: y!,
      goalkeeper: index === 0,
    })),
  ];
};
const move = (
  frame: TacticalFrame,
  timestampMs: number,
  changes: Record<string, [number, number]>,
  ball: TacticalFrame['ball'],
): TacticalFrame => ({
  timestampMs,
  players: frame.players.map((player) =>
    changes[player.id]
      ? { ...player, x: changes[player.id]![0], y: changes[player.id]![1] }
      : { ...player },
  ),
  ball,
});
const initial = (players = basePlayers(), ownerId = 'home-6'): TacticalFrame => ({
  players,
  ball: { x: 43, y: 34, ownerId },
  timestampMs: 0,
});

const build = (
  id: string,
  result: string,
  middle: Parameters<typeof move>[2],
  end: Parameters<typeof move>[2],
  balls: [TacticalFrame['ball'], TacticalFrame['ball']],
  players?: TacticalFrame['players'],
  aliases?: Record<string, string>,
): TacticalSequence => {
  const start = initial(players, aliases?.['home-6']);
  const remap = (changes: Record<string, [number, number]>) =>
    Object.fromEntries(Object.entries(changes).map(([id, value]) => [aliases?.[id] ?? id, value]));
  const remapBall = (ball: TacticalFrame['ball']) => ({
    ...ball,
    ...(ball.ownerId ? { ownerId: aliases?.[ball.ownerId] ?? ball.ownerId } : {}),
  });
  return tacticalSequenceSchema.parse({
    id,
    durationMs: 3200,
    result,
    frames: [
      start,
      move(start, 1600, remap(middle), remapBall(balls[0])),
      move(start, 3200, remap(end), remapBall(balls[1])),
    ],
  });
};

export const createTacticalScenarios = (context?: {
  players: TacticalFrame['players'];
  aliases: Record<string, string>;
}) => [
  {
    id: 'progressive-pass',
    title: 'Podanie progresywne',
    situation: 'Masz piłkę między liniami. Partner rusza za linię obrony.',
    choice: 'Podaj prostopadle',
    sequence: build(
      'progressive-pass',
      'Podanie dotarło. Utrzymujecie piłkę bliżej bramki.',
      { 'home-6': [46, 34], 'home-9': [64, 31], 'away-6': [62, 36] },
      { 'home-9': [72, 30], 'home-6': [57, 35], 'home-8': [66, 16], 'away-6': [68, 37] },
      [
        { x: 57, y: 32, height: 0.6 },
        { x: 72, y: 30, ownerId: 'home-9' },
      ],
      context?.players,
      context?.aliases,
    ),
  },
  {
    id: 'interception',
    title: 'Ryzykowne podanie',
    situation: 'Masz piłkę między liniami. Obrońca czyta korytarz podania.',
    choice: 'Zaryzykuj podanie',
    sequence: build(
      'interception',
      'Obrońca przeciął podanie. Rywale przejęli piłkę.',
      { 'home-9': [64, 31], 'away-6': [58, 33] },
      { 'home-6': [50, 35], 'home-9': [66, 31], 'away-6': [61, 33], 'away-9': [52, 36] },
      [
        { x: 55, y: 33, height: 0.3 },
        { x: 61, y: 33, ownerId: 'away-6' },
      ],
      context?.players,
      context?.aliases,
    ),
  },
  {
    id: 'shot',
    title: 'Strzał',
    situation: 'Atakujesz przed polem karnym. Bramkarz skraca kąt.',
    choice: 'Uderz nad obrońcą',
    sequence: build(
      'shot',
      'Bramkarz odbił piłkę i zatrzymał akcję.',
      { 'home-6': [76, 34], 'away-0': [96, 35], 'away-6': [79, 34] },
      { 'home-6': [78, 34], 'away-0': [98, 38], 'away-6': [80, 34] },
      [
        { x: 87, y: 35, height: 3.5 },
        { x: 98, y: 38, height: 0.5, ownerId: 'away-0' },
      ],
      context?.players,
      context?.aliases,
    ),
  },
];
