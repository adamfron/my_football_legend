import { z } from 'zod';
import {
  distance,
  distanceToSegment,
  pitchPointSchema,
  signedForwardDistance,
  type PitchPoint,
} from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { derivePassLaunchPlan, passLaunchPlanSchema } from './passLaunchPlan';
import { estimatePlayerArrivalTime } from './playerArrival';
import { secondLastOpponentLine } from './offside';

export const spacePassPlanSchema = z.object({
  requestedSpace: pitchPointSchema,
  receiverId: z.string(),
  intent: z.enum(['support', 'progressive', 'direct', 'lead', 'through']),
  delivery: z.enum(['ground', 'lofted']),
  launchPlan: passLaunchPlanSchema,
  receiverArrival: z.number().nonnegative(),
  defenderArrival: z.number().nonnegative(),
  groundLaneRisk: z.number().int().nonnegative(),
  keeperArrival: z.number().nonnegative(),
  anticipationAdvantage: z.number().finite(),
  predictionHorizon: z.number().positive().max(4),
});
export type SpacePassPlan = z.infer<typeof spacePassPlanSchema>;

/** One bounded release-time analysis, never a per-tick candidate tree. Trajectory alignment and
 * arrival capability select a runner; controlled identity and presentation are deliberately absent. */
export const deriveSpacePassPlan = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  requested: PitchPoint,
): SpacePassPlan | undefined => {
  const validatedTarget = pitchPointSchema.safeParse(requested);
  if (!validatedTarget.success) return undefined;
  // Ball destinations preserve the selected in-play coordinate, including the painted line.
  // The movement margin used for player bodies must not silently rewrite a football intention.
  const target = validatedTarget.data;
  const metres = distance(passer.position, target);
  if (metres < 1.5 || metres > 75) return undefined;
  const horizon = Math.min(4, Math.max(0.5, metres / 12));
  const candidates = state.players
    .filter((player) => player.team === passer.team && player.id !== passer.id)
    .map((player) => {
      const toTarget = { x: target.x - player.position.x, y: target.y - player.position.y };
      const remaining = Math.max(0.1, distance(player.position, target));
      const advancing =
        (player.velocity.x * toTarget.x + player.velocity.y * toTarget.y) / remaining;
      const projected = {
        x: player.position.x + player.velocity.x * horizon,
        y: player.position.y + player.velocity.y * horizon,
      };
      const pace = 4.8 + player.profile.attributes.pace * 0.035;
      const score =
        remaining / pace +
        Math.max(0, distance(projected, target) - remaining) * 0.12 -
        Math.max(0, advancing) * 0.1 +
        (player.profile.primaryPosition === 'goalkeeper' ? 2 : 0);
      return { player, score, advancing };
    })
    .sort((a, b) => a.score - b.score || a.player.id.localeCompare(b.player.id));
  const candidate = candidates[0];
  if (!candidate) return undefined;
  const receiver = candidate.player;
  const receiverArrival = estimatePlayerArrivalTime(
    state,
    receiver,
    target,
    'intercept',
  ).estimatedTime;
  if (receiverArrival > 6) return undefined;
  const defenders = state.players.filter((player) => player.team !== passer.team);
  const groundLaneRisk = defenders.filter((player) => {
    const predicted = {
      x: player.position.x + player.velocity.x * Math.min(horizon, 1.2),
      y: player.position.y + player.velocity.y * Math.min(horizon, 1.2),
    };
    return (
      distanceToSegment(predicted, passer.position, target) < 2.4 &&
      distance(player.position, passer.position) > 2
    );
  }).length;
  const defenderArrival = Math.min(
    99,
    ...defenders.map(
      (player) =>
        distance(player.position, target) / (4.8 + player.profile.attributes.pace * 0.035) +
        (1 - player.profile.attributes.gameReading / 100) * 0.35,
    ),
  );
  const keeper = defenders.find((player) => player.profile.primaryPosition === 'goalkeeper');
  const keeperArrival = keeper
    ? distance(keeper.position, target) / (4.8 + keeper.profile.attributes.pace * 0.035)
    : 99;
  const progress = signedForwardDistance(passer.position, target, passer.team);
  const ledForward = signedForwardDistance(receiver.position, target, passer.team);
  const line = secondLastOpponentLine(state, passer.team);
  const beyondLine = passer.team === 'home' ? target.x > line + 1 : target.x < line - 1;
  const intent =
    progress > 8 && ledForward > 2 && (candidate.advancing > 0.8 || beyondLine)
      ? 'through'
      : distance(receiver.position, target) > 2 && candidate.advancing > 0.7
        ? 'lead'
        : metres > 38
          ? 'direct'
          : progress > 8
            ? 'progressive'
            : 'support';
  const ability =
    (passer.profile.attributes.passing +
      passer.profile.attributes.technique +
      passer.profile.attributes.gameReading) /
    3;
  const highLine = passer.team === 'home' ? line < 82 : line > 23;
  // A loft is an interpretation of a blocked lane + credible run, not a guaranteed successful option.
  const delivery =
    groundLaneRisk > 0 &&
    ability >= 55 &&
    ((intent === 'through' && highLine && candidate.advancing > 1) ||
      (metres > 30 && Math.abs(target.y - passer.position.y) > 20))
      ? 'lofted'
      : 'ground';
  const launchPlan = derivePassLaunchPlan(state, passer, receiver, target, intent, delivery);
  return spacePassPlanSchema.parse({
    requestedSpace: target,
    receiverId: receiver.id,
    intent,
    delivery,
    launchPlan,
    receiverArrival,
    defenderArrival,
    groundLaneRisk,
    keeperArrival,
    anticipationAdvantage: Math.min(defenderArrival, keeperArrival) - receiverArrival,
    predictionHorizon: horizon,
  });
};
