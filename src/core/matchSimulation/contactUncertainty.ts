import { z } from 'zod';
import { physicalPointSchema } from './matchSpace';

export const contactResidualSchema = z.object({
  stratum: z.string().min(1),
  along: z.number().finite(),
  across: z.number().finite(),
  seconds: z.number().finite(),
});
export type ContactResidual = z.infer<typeof contactResidualSchema>;
export const empiricalContactRegionSchema = z.object({
  stratum: z.string(),
  count: z.number().int().min(3),
  bias: physicalPointSchema,
  covariance: z
    .object({ xx: z.number().positive(), xy: z.number().finite(), yy: z.number().positive() })
    .refine((c) => c.xx * c.yy - c.xy * c.xy > 0),
  timing: z.object({
    biasSeconds: z.number().finite(),
    varianceSeconds2: z.number().nonnegative(),
  }),
  interpretation: z.literal('empirical-diagnostic-unvalidated'),
});
export type EmpiricalContactRegion = z.infer<typeof empiricalContactRegionSchema>;

/** Fit actual residuals in a single trajectory/phase/horizon stratum. No jitter,
 * invented prior variance or pooling of incompatible trajectories. Training fit
 * alone cannot establish Gaussian tails or predictive coverage. */
export const fitContactRegion = (
  samples: readonly ContactResidual[],
): EmpiricalContactRegion | undefined => {
  if (samples.length < 3 || new Set(samples.map((s) => s.stratum)).size !== 1) return;
  const n = samples.length;
  const mean = (key: 'along' | 'across' | 'seconds') => samples.reduce((v, s) => v + s[key], 0) / n;
  const x = mean('along'),
    y = mean('across'),
    t = mean('seconds');
  let xx = 0,
    xy = 0,
    yy = 0,
    tt = 0;
  for (const s of samples) {
    xx += (s.along - x) ** 2;
    xy += (s.along - x) * (s.across - y);
    yy += (s.across - y) ** 2;
    tt += (s.seconds - t) ** 2;
  }
  const result = empiricalContactRegionSchema.safeParse({
    stratum: samples[0]!.stratum,
    count: n,
    bias: { x, y },
    covariance: { xx: xx / (n - 1), xy: xy / (n - 1), yy: yy / (n - 1) },
    timing: { biasSeconds: t, varianceSeconds2: tt / (n - 1) },
    interpretation: 'empirical-diagnostic-unvalidated',
  });
  return result.success ? result.data : undefined;
};

/** Rotate the empirical along/across covariance into pitch x/y. k is a level,
 * not a probability. These diagnostics have no edge to physical contact. */
export const contactEllipse = (
  fit: EmpiricalContactRegion,
  expected: { x: number; y: number },
  direction: number,
  k = 1,
) => {
  if (!Number.isFinite(direction) || !Number.isFinite(k) || k <= 0)
    throw Error('Invalid ellipse level/direction');
  const c = Math.cos(direction),
    s = Math.sin(direction),
    v = fit.covariance;
  const xx = c * c * v.xx - 2 * c * s * v.xy + s * s * v.yy;
  const xy = c * s * (v.xx - v.yy) + (c * c - s * s) * v.xy;
  const yy = s * s * v.xx + 2 * c * s * v.xy + c * c * v.yy;
  const delta = Math.hypot(xx - yy, 2 * xy);
  const maximumEigenvalue = (xx + yy + delta) / 2;
  const minimumEigenvalue = (xx * yy - xy * xy) / maximumEigenvalue;
  return {
    centre: {
      x: expected.x + c * fit.bias.x - s * fit.bias.y,
      y: expected.y + s * fit.bias.x + c * fit.bias.y,
    },
    covariance: { xx, xy, yy },
    major: k * Math.sqrt(maximumEigenvalue),
    minor: k * Math.sqrt(minimumEigenvalue),
    rotation: Math.atan2(2 * xy, xx - yy) / 2,
    k,
    interpretation: fit.interpretation,
  };
};
export const residualInsideRegion = (
  fit: EmpiricalContactRegion,
  residual: ContactResidual,
  k = 1,
) => {
  if (residual.stratum !== fit.stratum || !Number.isFinite(k) || k <= 0) return false;
  const x = residual.along - fit.bias.x,
    y = residual.across - fit.bias.y,
    v = fit.covariance;
  return (v.yy * x * x - 2 * v.xy * x * y + v.xx * y * y) / (v.xx * v.yy - v.xy * v.xy) <= k * k;
};
