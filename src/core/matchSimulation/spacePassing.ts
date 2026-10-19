import { attacksRight } from './matchSpace';
import { isMatchGoalkeeper } from './matchGoalkeeper';
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
import { earliestDefenderArrival } from './passDecision';
import { clampPitchPoint } from './matchSpace';
import type { MatchAction } from './matchState';
import { canParticipatePhysically } from './matchInjuries';
import { STATE_VALUE_CONFIG } from './decisionPolicyConfig';

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
      const arrival = estimatePlayerArrivalTime(state, player, target, 'intercept').estimatedTime;
      const score =
        arrival +
        Math.max(0, distance(projected, target) - remaining) * 0.12 -
        Math.max(0, advancing) * 0.1 +
        (isMatchGoalkeeper(player) ? 2 : 0);
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
  const defenderArrival = earliestDefenderArrival(state, defenders, target);
  const keeper = defenders.find((player) => isMatchGoalkeeper(player));
  const keeperArrival = keeper
    ? estimatePlayerArrivalTime(state, keeper, target, 'intercept').estimatedTime
    : 99;
  const progress = signedForwardDistance(passer.position, target, passer);
  const ledForward = signedForwardDistance(receiver.position, target, passer);
  const line = secondLastOpponentLine(state, passer.team);
  const beyondLine = attacksRight(passer) ? target.x > line + 1 : target.x < line - 1;
  const intent =
    progress > 8 && ledForward > 2 && (candidate.advancing > 0.8 || beyondLine)
      ? 'through'
      : distance(receiver.position, target) > 2 && candidate.advancing > 0.7
        ? 'lead'
        : metres > 38 && progress > 8
          ? 'direct'
          : progress > 8
            ? 'progressive'
            : 'support';
  const ability =
    (passer.profile.attributes.passing +
      passer.profile.attributes.technique +
      passer.profile.attributes.gameReading) /
    3;
  const highLine = attacksRight(passer) ? line < 82 : line > 23;
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

/** Three meaningful zones at a possession decision, including stationary prospective runners.
 * Release-time offside and the shared race/flight forecast prune candidates, never grant success. */
export const enumerateNpcSpacePasses = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
): MatchAction[] => {
  const dir = attacksRight(passer) ? 1 : -1;
  const line = secondLastOpponentLine(state, passer.team);
  const legalLine = attacksRight(passer)
    ? Math.max(52.5, line, state.ball.x)
    : Math.min(52.5, line, state.ball.x);
  const runners = state.players
    .filter(
      (p) =>
        p.team === passer.team &&
        p.id !== passer.id &&
        !isMatchGoalkeeper(p) &&
        p.duty !== 'defend' &&
        distance(p.position, passer.position) < 42 &&
        signedForwardDistance(passer.position, p.position, passer) > 2 &&
        (attacksRight(passer)
          ? p.position.x <= legalLine + 0.01
          : p.position.x >= legalLine - 0.01),
    )
    .sort(
      (a, b) =>
        distance(a.position, passer.position) - distance(b.position, passer.position) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3);
  const actions: MatchAction[] = [];
  for (const runner of runners) {
    const wide = Math.abs(runner.position.y - 34) > 17;
    const target = clampPitchPoint({
      x: runner.position.x + dir * (wide ? 10 : 8),
      y: runner.position.y + (wide ? (34 - runner.position.y) * 0.08 : 0),
    });
    const plan = deriveSpacePassPlan(state, passer, target);
    if (
      !plan ||
      plan.receiverId !== runner.id ||
      plan.anticipationAdvantage < 0.2 ||
      plan.receiverArrival > plan.launchPlan.predictedArrivalTime + 0.3 ||
      Math.min(target.y, 68 - target.y, target.x, 105 - target.x) < 2
    )
      continue;
    actions.push({ type: 'space_pass', actorId: passer.id, target });
  }
  return actions;
};

/** The existing space-pass concept, extended with independent prospective corridors. No accepted
 * lead projection or existing sprint is required. The common planner subsequently checks arrival. */
export const prospectiveSpaceTargets = (state: TacticalMatchState, passer: MatchPlayerState) => {
  const dir = attacksRight(passer) ? 1 : -1;
  const line = secondLastOpponentLine(state, passer.team);
  const legalLine = attacksRight(passer)
    ? Math.max(52.5, line, state.ball.x)
    : Math.min(52.5, line, state.ball.x);
  return state.players
    .filter(
      (p) =>
        p.team === passer.team &&
        p.id !== passer.id &&
        !isMatchGoalkeeper(p) &&
        canParticipatePhysically(p) &&
        !state.discipline?.[p.id]?.sentOff &&
        distance(p.position, passer.position) < 65 &&
        dir * (p.position.x - passer.position.x) > 1 &&
        dir * (p.position.x - legalLine) <= 0.01,
    )
    .map((receiver) => ({
      receiver,
      priority:
        dir * (receiver.position.x - passer.position.x) * 0.35 +
        receiver.profile.attributes.pace * 0.12 -
        distance(receiver.position, passer.position) * 0.1,
    }))
    .sort((a, b) => b.priority - a.priority || a.receiver.id.localeCompare(b.receiver.id))
    .slice(0, STATE_VALUE_CONFIG.maxRunners)
    .flatMap(({ receiver }) => {
      const length = Math.min(11, Math.max(4, distance(passer.position, receiver.position) * 0.24));
      return [0, receiver.position.y < 34 ? 4 : -4].map((diagonal) => ({
        receiver,
        target: clampPitchPoint({
          x: receiver.position.x + dir * length,
          y: receiver.position.y + diagonal,
        }),
      }));
    });
};
