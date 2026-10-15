import { z } from 'zod';
import { RandomGenerator } from './random/RandomGenerator';

const side = z.object({
  strength: z.number().min(0).max(100),
  players: z.number().int().min(7).max(11),
  condition: z.number().min(0).max(100),
});
export const summaryContinuationInputSchema = z.object({
  seed: z.string().min(1),
  remainingSeconds: z.number().min(0).max(7200),
  score: z.object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }),
  home: side,
  away: side,
});

/** Same bounded quality/home context as routine summary football, integrated over
 * the actual suffix duration. No full 90-minute draw or physical hidden ticks. */
export const simulateSummaryRemainder = (raw: z.input<typeof summaryContinuationInputSchema>) => {
  const input = summaryContinuationInputSchema.parse(raw);
  const rng = RandomGenerator.fromSeed(input.seed);
  const poisson = (lambda: number) => {
    if (lambda <= 0) return 0;
    let product = 1,
      goals = -1;
    do {
      goals++;
      product *= Math.max(Number.EPSILON, rng.float());
    } while (product > Math.exp(-lambda));
    return goals;
  };
  const goals = (team: 'home' | 'away') => {
    const opponent = team === 'home' ? 'away' : 'home';
    const own = input[team],
      other = input[opponent];
    const edge = (team === 'home' ? 2.5 : 0) + (own.strength - other.strength) * 0.64;
    const rate = Math.max(0.15, Math.min(3, 1.15 + edge / 24));
    const numbers = Math.max(0.55, Math.min(1.5, own.players / other.players));
    const condition = 0.7 + own.condition / 333;
    const scoreContext =
      input.score[team] > input.score[opponent]
        ? 0.97
        : input.score[team] < input.score[opponent]
          ? 1.03
          : 1;
    return poisson(((rate * input.remainingSeconds) / 5400) * numbers * condition * scoreContext);
  };
  return { home: goals('home'), away: goals('away') };
};
