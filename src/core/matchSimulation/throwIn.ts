import { z } from 'zod';
import { distance, pitchPointSchema } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

/** Metres: a legal receiver must remain inside one achievable throw's delivery range. */
export const THROW_IN_MAXIMUM_RANGE_METRES = 35;
export const throwInRestrictionSchema = z.object({
  throwerId: z.string(),
  releasedAt: z.number().nonnegative(),
});
export type ThrowInRestriction = z.infer<typeof throwInRestrictionSchema>;
export const throwInDiagnosticSchema = z.object({
  throwerId: z.string(),
  chosenReceiverId: z.string(),
  requestedReceiverId: z.string(),
  requestedTarget: pitchPointSchema,
  releaseTarget: pitchPointSchema,
  actualReleaseVector: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
  }),
  releasedAt: z.number().nonnegative(),
  nextContactPlayerId: z.string().optional(),
  nextContactAt: z.number().nonnegative().optional(),
  fallbackReason: z
    .enum(['receiver_missing', 'receiver_wrong_team', 'receiver_out_of_range'])
    .optional(),
});
export type ThrowInDiagnostic = z.infer<typeof throwInDiagnosticSchema>;

export const isLegalThrowInReceiver = (thrower: MatchPlayerState, receiver: MatchPlayerState) =>
  receiver.id !== thrower.id &&
  receiver.team === thrower.team &&
  pitchPointSchema.safeParse(receiver.position).success &&
  distance(thrower.position, receiver.position) <= THROW_IN_MAXIMUM_RANGE_METRES;

/** The restriction survives restart presentation expiry and ends on any other physical touch. */
export const canContactAfterThrowIn = (state: TacticalMatchState, playerId: string) =>
  state.throwInRestriction?.throwerId !== playerId;

export const applyThrowInContact = (
  state: TacticalMatchState,
  playerId: string,
): TacticalMatchState => {
  if (!state.throwInRestriction || !canContactAfterThrowIn(state, playerId)) return state;
  const next = { ...state };
  delete next.throwInRestriction;
  if (state.lastThrowInDiagnostic)
    next.lastThrowInDiagnostic = {
      ...state.lastThrowInDiagnostic,
      nextContactPlayerId: playerId,
      nextContactAt: state.time,
    };
  return next;
};
