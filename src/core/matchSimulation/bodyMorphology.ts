import { z } from 'zod';

export const fullBodySkeletonEditionSchema = z.literal('full-body-skeleton-dev-v1');
const ratio = (min: number, max: number) => z.number().finite().min(min).max(max);
const limbSchema = z
  .object({
    thigh: ratio(0.18, 0.29),
    shank: ratio(0.18, 0.29),
    footLength: ratio(0.1, 0.2),
    footWidth: ratio(0.035, 0.085),
    upperArm: ratio(0.13, 0.22),
    forearm: ratio(0.11, 0.2),
    handLength: ratio(0.07, 0.14),
    handWidth: ratio(0.03, 0.075),
    /** Radians about the hip-to-ankle axis; geometry, never a diagnosis. */
    kneeAlignment: ratio(-0.25, 0.25),
    soleArch: z.enum(['unspecified', 'low', 'neutral', 'high']),
  })
  .strict();

/** Dimensions are fractions of clamped physical height, independently authored.
 * These are engineering acceptance bounds, not population/medical estimates. */
export const bodyMorphologySchema = z
  .object({
    version: z.literal('body-morphology-dev-v1'),
    range: z.enum(['ordinary', 'stress']),
    pelvisWidth: ratio(0.08, 0.18),
    shoulderWidth: ratio(0.19, 0.34),
    lowerTrunk: ratio(0.08, 0.17),
    upperTrunk: ratio(0.12, 0.23),
    neck: ratio(0.025, 0.07),
    headLength: ratio(0.1, 0.16),
    headWidth: ratio(0.07, 0.12),
    left: limbSchema,
    right: limbSchema,
  })
  .strict()
  .superRefine((m, ctx) => {
    for (const side of ['left', 'right'] as const) {
      const l = m[side];
      if (l.footWidth >= l.footLength || l.handWidth >= l.handLength)
        ctx.addIssue({
          code: 'custom',
          path: [side],
          message: 'Terminal segment width exceeds length',
        });
      if (
        m.range === 'ordinary' &&
        (Math.abs(l.thigh - 0.245) > 0.035 ||
          Math.abs(l.shank - 0.246) > 0.035 ||
          Math.abs(l.kneeAlignment) > 0.12)
      )
        ctx.addIssue({
          code: 'custom',
          path: [side],
          message: 'Use explicit stress range for this geometry',
        });
    }
    const leg = Math.max(m.left.thigh + m.left.shank, m.right.thigh + m.right.shank);
    const stature = leg + m.lowerTrunk + m.upperTrunk + m.neck + m.headLength;
    if (stature < 0.86 || stature > 1.14)
      ctx.addIssue({ code: 'custom', message: 'Incoherent total body proportions' });
    if (
      m.range === 'ordinary' &&
      Math.abs(m.left.thigh + m.left.shank - m.right.thigh - m.right.shank) > 0.04
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Large leg asymmetry requires explicit stress range',
      });
  });
export type BodyMorphology = z.infer<typeof bodyMorphologySchema>;
export const defaultBodyMorphology = (): BodyMorphology => {
  const limb = () => ({
    thigh: 0.245,
    shank: 0.246,
    footLength: 0.155,
    footWidth: 0.065,
    upperArm: 0.175,
    forearm: 0.15,
    handLength: 0.105,
    handWidth: 0.05,
    kneeAlignment: 0,
    soleArch: 'unspecified' as const,
  });
  return {
    version: 'body-morphology-dev-v1',
    range: 'ordinary',
    pelvisWidth: 0.11,
    shoulderWidth: 0.29,
    lowerTrunk: 0.12,
    upperTrunk: 0.18,
    neck: 0.045,
    headLength: 0.13,
    headWidth: 0.095,
    left: limb(),
    right: limb(),
  };
};
export const bodyHeight = (heightCm: number) => Math.max(1.4, Math.min(2.2, heightCm / 100));

/** Default geometry keeps the historical arithmetic path, including exact rounding. */
export const hasIndividualLowerBody = (m?: BodyMorphology) =>
  !!m &&
  (m.pelvisWidth !== 0.11 ||
    (['left', 'right'] as const).some(
      (side) => m[side].thigh !== 0.245 || m[side].shank !== 0.246 || m[side].kneeAlignment !== 0,
    ));

export const individualHipOffset = (height: number, m?: BodyMorphology) =>
  hasIndividualLowerBody(m) ? (height * m!.pelvisWidth) / 2 : height * 0.055;
export const individualFootReach = (height: number, side: 'left' | 'right', m?: BodyMorphology) =>
  hasIndividualLowerBody(m)
    ? height * (m![side].thigh + m![side].shank) * (0.43 / 0.491)
    : height * 0.43;
