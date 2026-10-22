import { z } from 'zod';
import { attacksRight, distance, pitchPointSchema } from './matchSpace';
import type { MatchAction, MatchPlayerState, TacticalMatchState } from './matchState';
import { deriveFinalThirdOccupations } from './tacticalPositioning';
import { deriveAerialLaunchPlan } from './ballPhysics';
import { estimatePlayerArrivalTime } from './playerArrival';
import { canParticipatePhysically } from './matchInjuries';

export const crossOpportunitySchema = z.object({
  receiverId: z.string(),
  target: pitchPointSchema,
  intent: z.enum(['floated', 'driven', 'cutback']),
  occupation: z.string(),
  ballArrival: z.number().positive(),
  receiverArrival: z.number().nonnegative(),
  defenderArrival: z.number().nonnegative(),
  contactHeight: z.number().nonnegative(),
});
export type CrossOpportunity = z.infer<typeof crossOpportunitySchema>;

/** The same launch profile as execution. Timing gates a candidate, not its outcome. */
export const projectCrossOpportunity = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  action: Extract<MatchAction, { type: 'cross' }>,
  occupation = 'explicit',
): CrossOpportunity | undefined => {
  const receiver = state.players.find((p) => p.id === action.intendedTargetId);
  if (
    !receiver ||
    receiver.team !== actor.team ||
    receiver.id === actor.id ||
    !canParticipatePhysically(receiver) ||
    state.discipline?.[receiver.id]?.sentOff
  )
    return;
  const cutback = action.intent === 'cutback';
  const contactHeight = action.intent === 'floated' ? 1.9 : cutback ? 0.2 : 0.65;
  const launch = cutback
    ? undefined
    : deriveAerialLaunchPlan(
        state.ball,
        action.target,
        action.intent === 'floated' ? 'cross' : 'driven_cross',
        {
          ability: (actor.profile.attributes.passing + actor.profile.attributes.technique) / 2,
          arrivalHeight: contactHeight,
          executionError: action.intent === 'floated' ? 0.2 : -0.7,
        },
      );
  const ballArrival =
    launch?.predictedFlightTime ?? Math.max(0.35, distance(actor.position, action.target) / 25);
  const receiverArrival = estimatePlayerArrivalTime(
    state,
    receiver,
    action.target,
    'intercept',
  ).estimatedTime;
  if (receiverArrival > ballArrival + 0.25) return;
  const defenders = state.players
    .filter(
      (p) =>
        p.team !== actor.team && canParticipatePhysically(p) && !state.discipline?.[p.id]?.sentOff,
    )
    .sort((a, b) => distance(a.position, action.target) - distance(b.position, action.target))
    .slice(0, 2);
  const defenderArrival = Math.min(
    99,
    ...defenders.map(
      (p) => estimatePlayerArrivalTime(state, p, action.target, 'intercept').estimatedTime,
    ),
  );
  return {
    receiverId: receiver.id,
    target: action.target,
    intent: action.intent,
    occupation,
    ballArrival,
    receiverArrival,
    defenderArrival,
    contactHeight,
  };
};

/** Delivery alternatives follow reachable occupation, current location and a late runner.
 * An empty box has no invented receiver, while strong marking remains a live contest. */
export const deriveCrossOpportunities = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
): CrossOpportunity[] => {
  const depth = attacksRight(actor) ? actor.position.x : 105 - actor.position.x;
  if (depth < 61 || Math.abs(actor.position.y - 34) < 12 || state.ball.ownerId !== actor.id)
    return [];
  return deriveFinalThirdOccupations(state, actor.team)
    .flatMap((assignment) => {
      const receiver = state.players.find((p) => p.id === assignment.playerId);
      if (!receiver) return [];
      const byline =
        depth > 89 &&
        (attacksRight(actor)
          ? assignment.target.x < actor.position.x
          : assignment.target.x > actor.position.x);
      const intents: ('floated' | 'driven' | 'cutback')[] =
        byline && ['edge_support', 'penalty_spot'].includes(assignment.occupation)
          ? ['cutback', 'driven']
          : ['floated', 'driven'];
      // The assigned zone is a destination, not proof the runner can already receive there.
      // Include a current/velocity-led point for an early delivery to a physically present player.
      const targets = [
        assignment.target,
        {
          x: Math.max(0.4, Math.min(104.6, receiver.position.x + receiver.velocity.x * 0.5)),
          y: Math.max(0.4, Math.min(67.6, receiver.position.y + receiver.velocity.y * 0.5)),
        },
      ].filter((p, i, all) => i === 0 || distance(p, all[0]!) > 3);
      return targets
        .filter((p) => (attacksRight(actor) ? p.x : 105 - p.x) > 76 && Math.abs(p.y - 34) < 23)
        .flatMap((target) =>
          intents.flatMap((intent) => {
            const projected = projectCrossOpportunity(
              state,
              actor,
              { type: 'cross', actorId: actor.id, intendedTargetId: receiver.id, target, intent },
              assignment.occupation,
            );
            return projected ? [projected] : [];
          }),
        );
    })
    .slice(0, 8);
};

export const enumerateCrossChoices = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
): MatchAction[] =>
  deriveCrossOpportunities(state, actor).map((c) => ({
    type: 'cross',
    actorId: actor.id,
    intendedTargetId: c.receiverId,
    target: c.target,
    intent: c.intent,
  }));
