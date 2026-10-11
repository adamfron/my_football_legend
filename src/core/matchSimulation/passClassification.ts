import { z } from 'zod';
import { distance, signedForwardDistance, type PitchPoint, type TeamSide } from './matchSpace';
import type { PassDelivery, PassLaunchIntent } from './passLaunchPlan';

export const passClassificationSchema = z.object({
  length: z.enum(['short', 'medium', 'long']),
  direction: z.enum(['backward', 'lateral', 'progressive']),
  purpose: z.enum(['support', 'switch', 'lead', 'through', 'direct_attack', 'space']),
  delivery: z.enum(['ground', 'lofted']),
});
/** Derived metadata keeps persisted actions/event identities backward compatible. Legacy
 * long backward `direct` actions still execute, but cannot acquire direct-attack utility. */
export const classifyPass = (
  from: PitchPoint,
  target: PitchPoint,
  team: TeamSide,
  intent: PassLaunchIntent,
  delivery: PassDelivery = 'ground',
  spatial = false,
) => {
  const metres = distance(from, target),
    progress = signedForwardDistance(from, target, team);
  return passClassificationSchema.parse({
    length: metres <= 15 ? 'short' : metres <= 30 ? 'medium' : 'long',
    direction: progress > 5 ? 'progressive' : progress < -2 ? 'backward' : 'lateral',
    purpose: spatial
      ? 'space'
      : intent === 'lead' || intent === 'through'
        ? intent
        : intent === 'direct' && progress > 8
          ? 'direct_attack'
          : Math.abs(target.y - from.y) > 20 && Math.sign(target.y - 34) !== Math.sign(from.y - 34)
            ? 'switch'
            : 'support',
    delivery,
  });
};
