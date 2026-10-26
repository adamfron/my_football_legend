import { z } from 'zod';

export const calibrationPairSchema = z.object({
  probability: z.number().min(0).max(1),
  outcome: z.boolean(),
});
export const calibrationScoreSchema = z.object({
  count: z.number().int().nonnegative(),
  meanPrediction: z.number().nullable(),
  observedRate: z.number().nullable(),
  bias: z.number().nullable(),
  brier: z.number().nullable(),
  clippedLogLoss: z.number().nullable(),
  logLossEpsilon: z.number(),
  wilson95: z.tuple([z.number(), z.number()]).nullable(),
  bins: z.array(
    z.object({
      lower: z.number(),
      upper: z.number(),
      count: z.number().int(),
      meanPrediction: z.number().nullable(),
      observedRate: z.number().nullable(),
    }),
  ),
});
/** Positive bias means overprediction. Wilson intervals are descriptive only for
 * paired/clustered development samples; their nominal coverage is not asserted. */
export const scoreCalibration = (raw: z.infer<typeof calibrationPairSchema>[]) => {
  const pairs = calibrationPairSchema.array().parse(raw),
    n = pairs.length,
    epsilon = 1e-12;
  const mean = (fn: (p: z.infer<typeof calibrationPairSchema>) => number) =>
    n ? pairs.reduce((s, p) => s + fn(p), 0) / n : null;
  const observed = mean((p) => Number(p.outcome)),
    prediction = mean((p) => p.probability);
  const z95 = 1.959963984540054;
  const centre = observed === null ? 0 : (observed + (z95 * z95) / (2 * n)) / (1 + (z95 * z95) / n);
  const half =
    observed === null
      ? 0
      : (z95 * Math.sqrt((observed * (1 - observed)) / n + (z95 * z95) / (4 * n * n))) /
        (1 + (z95 * z95) / n);
  return calibrationScoreSchema.parse({
    count: n,
    meanPrediction: prediction,
    observedRate: observed,
    bias: prediction === null || observed === null ? null : prediction - observed,
    brier: mean((p) => (p.probability - Number(p.outcome)) ** 2),
    clippedLogLoss: mean(
      (p) =>
        -Math.log(
          Math.max(epsilon, Math.min(1 - epsilon, p.outcome ? p.probability : 1 - p.probability)),
        ),
    ),
    logLossEpsilon: epsilon,
    wilson95: n ? [Math.max(0, centre - half), Math.min(1, centre + half)] : null,
    bins: Array.from({ length: 5 }, (_, i) => {
      const xs = pairs.filter((p) => Math.min(4, Math.floor(p.probability * 5)) === i);
      return {
        lower: i / 5,
        upper: (i + 1) / 5,
        count: xs.length,
        meanPrediction: xs.length ? xs.reduce((s, p) => s + p.probability, 0) / xs.length : null,
        observedRate: xs.length ? xs.filter((p) => p.outcome).length / xs.length : null,
      };
    }),
  });
};
