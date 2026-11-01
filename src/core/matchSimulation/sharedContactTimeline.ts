import { z } from 'zod';
import { temporalStrikePlanSchema, temporalFootPathSchema } from './temporalFootStrike';

/** Local seconds from the current canonical ball segment, never intention time. */
export const sharedContactEventSchema = z.object({
  at: z.number().finite().nonnegative(),
  rank: z.number().int().nonnegative(),
  key: z.string(),
  kind: z.enum([
    'boundary',
    'body',
    'foot',
    'strike',
    'uncertain',
    'expiry',
    'challenge',
    'challenge_body',
    'challenge_expiry',
    'player_constraint',
  ]),
  playerId: z.string().optional(),
});
export const sharedContactSelectionSchema = z.literal('standing-contact-dev-v1');
export const physicalChallengeAttemptSchema = z.object({
  version: sharedContactSelectionSchema,
  selectedAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
  plan: temporalStrikePlanSchema,
  path: temporalFootPathSchema,
});
export const continuousFootContactsSchema = z
  .array(
    z.object({
      actorId: z.string(),
      foot: z.enum(['left', 'right']),
      prepared: z
        .object({
          path: temporalFootPathSchema,
          facingAngle: z.number().finite(),
          selectedAt: z.number().nonnegative(),
        })
        .optional(),
    }),
  )
  .max(44);

/** Only contacts in the same 1ns bucket tie. Legal terminals retain precedence. */
export const compareSharedContactEvents = (
  a: z.infer<typeof sharedContactEventSchema>,
  b: z.infer<typeof sharedContactEventSchema>,
) =>
  Math.round(a.at * 1e9) - Math.round(b.at * 1e9) ||
  a.rank - b.rank ||
  (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
