import { z } from 'zod';
import type { MatchPlayerState } from './matchState';
import {
  shotContactSchema,
  shotExecutionErrorProfileSchema,
  type ShotExecutionErrorProfile,
} from './shotIntent';

export const shootingDifficultyContextSchema = z.object({
  distance: z.number().nonnegative(),
  angle: z.number().min(0).max(1),
  pressure: z.number().min(0).max(1),
  orientation: z.number().min(0).max(1),
  weakFoot: z.number().min(0).max(1),
  incomingSpeed: z.number().nonnegative(),
  ballHeight: z.number().nonnegative(),
  contact: shotContactSchema,
  intent: z.enum(['driven', 'placed', 'chip', 'header']),
  targetWindow: z.number().min(0).max(1),
  blockers: z.number().nonnegative(),
});
export type ShootingDifficultyContext = z.infer<typeof shootingDifficultyContextSchema>;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Continuous angular execution uncertainty becomes metres at the target plane. Relevant
 * skills answer specific demands: composure handles pressure, technique airborne contact/turn,
 * finishing (heading for headers) placement. No outcome gate, range cliff or sigma ceiling. */
export const deriveShootingDifficulty = (
  shooter: MatchPlayerState,
  context: ShootingDifficultyContext,
): ShotExecutionErrorProfile => {
  const a = shooter.profile.attributes;
  const primary = (context.contact === 'header' ? a.heading : a.finishing) / 100;
  const technique = a.technique / 100;
  const composure = a.composure / 100;
  const bodyControl = a.agility / 100;
  const primaryError = (1 - primary) ** 2;
  const techniqueError = (1 - technique) ** 2;
  const composureError = (1 - composure) ** 2;
  const bodyError = (1 - bodyControl) ** 2;
  const distanceDifficulty = (context.distance / 18) ** 1.25;
  const angleDifficulty = 1 - context.angle;
  const ballMovementDifficulty =
    context.contact === 'settled' ? context.incomingSpeed / 55 : context.incomingSpeed / 38;
  const ballHeightDifficulty =
    context.contact === 'header'
      ? Math.abs(context.ballHeight - shooter.profile.heightCm / 100) / 1.5
      : Math.max(0, context.ballHeight - 0.11) / 1.5;
  const contactDifficulty =
    context.contact === 'settled'
      ? 0
      : (context.contact === 'volley'
          ? 0.9
          : context.contact === 'half_volley'
            ? 0.6
            : context.contact === 'header'
              ? 0.45
              : 0.3) +
        ballMovementDifficulty * 0.7 +
        ballHeightDifficulty * 0.5;
  const blockerDifficulty = 1 - Math.exp(-context.blockers * 0.6);
  const base = 0.012 + primaryError * 0.145 + techniqueError * 0.032;
  const range = distanceDifficulty * 0.013 * (0.22 + primaryError * 0.78);
  const angle = angleDifficulty * 0.04 * (0.2 + techniqueError * 0.8);
  const pressure = context.pressure ** 1.3 * (0.08 + composureError * 0.92);
  const orientation =
    context.orientation ** 1.4 * 0.11 * (0.2 + techniqueError * 0.8) * (0.45 + bodyError * 0.55);
  const weakFoot = context.weakFoot * 0.09 * (0.5 + techniqueError * 0.5);
  const contact =
    contactDifficulty *
    0.08 *
    (0.2 +
      (context.contact === 'header' ? primaryError * 0.6 + techniqueError * 0.4 : techniqueError) *
        0.8);
  const window =
    (context.targetWindow * 0.025 + blockerDifficulty * 0.014) * (0.2 + primaryError * 0.8);
  const style =
    context.intent === 'placed'
      ? 0.88
      : context.intent === 'driven'
        ? 1.12
        : context.intent === 'chip'
          ? 1.05
          : 1;
  const horizontalSigmaMetres =
    (0.12 +
      context.distance *
        (base + range + angle + pressure + orientation + weakFoot + contact + window)) *
    style;
  const verticalSigmaMetres =
    (0.1 +
      context.distance *
        (base * 0.82 +
          range * 0.85 +
          angle * 0.8 +
          pressure * 1.08 +
          orientation * 0.8 +
          weakFoot +
          contact * 1.15 +
          window * 0.75)) *
    style;
  const intrinsicDifficulty =
    1 +
    distanceDifficulty * 0.25 +
    angleDifficulty * 0.4 +
    context.pressure * 0.7 +
    context.orientation ** 1.4 * 0.65 +
    context.weakFoot * 0.4 +
    contactDifficulty * 0.5 +
    context.targetWindow * 0.25 +
    blockerDifficulty * 0.2;
  const skill = primary ** 0.7 * technique ** 0.3;
  const executionQuality = clamp01(
    skill * Math.exp(-(pressure + orientation + contact + weakFoot) * 3),
  );
  return shotExecutionErrorProfileSchema.parse({
    executionQuality,
    horizontalSigma: horizontalSigmaMetres / 3.66,
    verticalSigma: verticalSigmaMetres / 2.44,
    distanceDifficulty,
    angleDifficulty,
    pressureDifficulty: context.pressure,
    contactDifficulty,
    orientationDifficulty: context.orientation,
    weakFootDifficulty: context.weakFoot,
    intrinsicDifficulty,
    horizontalSigmaMetres,
    verticalSigmaMetres,
    ballMovementDifficulty,
    ballHeightDifficulty,
    targetWindowDifficulty: context.targetWindow,
    blockerDifficulty,
  });
};

/** RNG-free approximation used for action ranking. It describes placement in a useful goal
 * window, not a second save/goal resolver. Actual flight, blocks and keeper reach remain physical. */
export const approximateShotPlacement = (profile: ShotExecutionErrorProfile) => {
  const horizontal = profile.horizontalSigma * 3.66;
  const vertical = profile.verticalSigma * 2.44;
  return clamp01(
    (1 - Math.exp(-1.8 / Math.max(0.01, horizontal))) *
      (1 - Math.exp(-1.6 / Math.max(0.01, vertical))),
  );
};
