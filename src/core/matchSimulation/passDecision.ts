import { z } from 'zod';
import { distance, distanceToSegment, type PitchPoint } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import {
  derivePassLaunchPlan,
  type PassDelivery,
  type PassLaunchIntent,
  type PassLaunchPlan,
} from './passLaunchPlan';
import { estimatePlayerArrivalTime } from './playerArrival';
import { BALL_PHYSICS } from './ballPhysics';
import { deriveMovementCapability } from './locomotion';
import { derivePassDifficulty } from './passExecution';
import { resolveReceptionOutcome } from './passReception';
import { angleForVector, integrateFacing } from './playerOrientation';

export const passDecisionQualitySchema = z.object({
  expectedCompletion: z.number().min(0).max(1),
  selectionQuality: z.number().min(0).max(1),
  passerAbility: z.number().min(0).max(100),
  pressure: z.number().min(0).max(1),
  length: z.number().nonnegative(),
  ballEta: z.number().nonnegative(),
  receiverEta: z.number().nonnegative(),
  defenderEta: z.number().nonnegative(),
  laneOccupation: z.number().int().nonnegative(),
  boundaryMargin: z.number(),
  receiverLateBy: z.number().nonnegative(),
  targetPredictedOutOfPlay: z.boolean(),
  utilityAdjustment: z.number(),
  executionUncertaintyMetres: z.number().nonnegative().optional(),
  expectedReceptionQuality: z.number().min(0).max(1).optional(),
  expectedRetainedPossession: z.number().min(0).max(1).optional(),
  receiverAdjustmentCost: z.number().nonnegative().optional(),
});
export type PassDecisionQuality = z.infer<typeof passDecisionQualitySchema>;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Prune only runners whose fastest possible travel cannot beat the current physical ETA.
 * The bound includes initial momentum, the 0.8m contact envelope and the estimator's 10s cap.
 * Survivors still use the identical 25ms acceleration/turn projection. */
const earliestDefenderArrival = (
  state: TacticalMatchState,
  players: MatchPlayerState[],
  target: PitchPoint,
) => {
  const candidates = players
    .map((player) => ({
      player,
      lowerBound: Math.min(
        10,
        Math.max(0, distance(player.position, target) - 0.8) /
          Math.max(
            Math.hypot(player.velocity.x, player.velocity.y),
            deriveMovementCapability(player).maximumSprintSpeed,
          ),
      ),
    }))
    .sort((a, b) => a.lowerBound - b.lowerBound);
  let earliest = 99;
  for (const { player, lowerBound } of candidates) {
    if (lowerBound > earliest + 1e-9) continue;
    earliest = Math.min(
      earliest,
      estimatePlayerArrivalTime(state, player, target, 'intercept').estimatedTime,
    );
  }
  return earliest;
};

/** Selection evaluates the intended physical solution before any execution error is sampled.
 * Read quality changes recognition of risk; it never grants a team an accuracy bonus. */
export const evaluatePassDecision = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  receiver: MatchPlayerState,
  target: PitchPoint,
  intent: PassLaunchIntent,
  delivery: PassDelivery = 'ground',
  suppliedPlan?: PassLaunchPlan,
  firstTime = false,
): PassDecisionQuality => {
  const plan =
    suppliedPlan ?? derivePassLaunchPlan(state, passer, receiver, target, intent, delivery);
  const origin = state.ball.ownerId === passer.id ? state.ball : passer.position;
  const length = distance(origin, target);
  const a = passer.profile.attributes;
  const passerAbility = (a.passing * 2 + a.technique + a.composure) / 4;
  const opponents = state.players.filter((p) => p.team !== passer.team);
  const nearest = Math.min(14, ...opponents.map((p) => distance(p.position, passer.position)));
  const pressure = clamp(1 - nearest / 14);
  const arrival = estimatePlayerArrivalTime(state, receiver, target, 'intercept').estimatedTime;
  // A runner can react while already moving; a stationary receiver must first recognize the ball.
  const receiverEta =
    arrival +
    (Math.hypot(receiver.velocity.x, receiver.velocity.y) > 0.7
      ? 0.04
      : plan.receiverReadiness.awareAt);
  const defenderEta = earliestDefenderArrival(state, opponents, target);
  const dx = target.x - origin.x,
    dy = target.y - origin.y;
  const squared = Math.max(0.001, dx * dx + dy * dy);
  const laneOccupation = opponents.filter((p) => {
    const fraction = ((p.position.x - origin.x) * dx + (p.position.y - origin.y) * dy) / squared;
    if (fraction <= 0.07 || fraction >= 0.94) return false;
    const point = { x: origin.x + dx * fraction, y: origin.y + dy * fraction };
    return (
      distanceToSegment(p.position, origin, target) < (delivery === 'lofted' ? 1 : 2.1) &&
      estimatePlayerArrivalTime(state, p, point, 'intercept').estimatedTime <
        plan.predictedArrivalTime * fraction + 0.18
    );
  }).length;
  const boundaryMargin = Math.min(target.x, 105 - target.x, target.y, 68 - target.y);
  const boundaryTravel =
    Math.min(
      dx > 0 ? (105 - target.x) / dx : dx < 0 ? -target.x / dx : Infinity,
      dy > 0 ? (68 - target.y) / dy : dy < 0 ? -target.y / dy : Infinity,
    ) * length;
  const receiverLateBy = Math.max(0, receiverEta - plan.predictedArrivalTime - 0.12);
  const escapeSeconds = boundaryTravel / Math.max(0.5, plan.predictedArrivalSpeed);
  const rollingRunout = plan.predictedArrivalSpeed ** 2 / (2 * BALL_PHYSICS.rollingDeceleration);
  const targetPredictedOutOfPlay =
    boundaryMargin < 0 ||
    (delivery === 'ground' && receiverLateBy > escapeSeconds && rollingRunout > boundaryTravel);
  const runner = intent === 'lead' || intent === 'through';
  const boundaryRisk = runner
    ? clamp((3.5 - boundaryMargin) / 3.5)
    : clamp((1.2 - boundaryMargin) / 1.2);
  const raceRisk = clamp((receiverEta - defenderEta + 0.35) / 1.1);
  const timingRisk = clamp(receiverLateBy / 0.7);
  const geometricCompletion = clamp(
    0.96 -
      laneOccupation * 0.21 -
      raceRisk * 0.4 -
      timingRisk * 0.45 -
      boundaryRisk * 0.22 -
      pressure * (1 - passerAbility / 100) * 0.14,
  );
  const execution = derivePassDifficulty(state, passer, target, intent, delivery, {
    firstTime,
    receiverSpeed: Math.hypot(receiver.velocity.x, receiver.velocity.y),
  });
  const receivingClearance = Math.min(14, ...opponents.map((p) => distance(p.position, target)));
  const receivingPressure = clamp(1 - receivingClearance / 14);
  // Receiver opportunity to meet the error envelope before a recovering opponent arrives.
  const adjustmentWindow = Math.max(
    0,
    Math.min(plan.predictedArrivalTime - receiverEta, defenderEta - receiverEta),
  );
  const reachableRadius = 0.9 + Math.min(3, adjustmentWindow * 1.5);
  const executionReach =
    1 - Math.exp(-(reachableRadius ** 2) / (2 * execution.uncertaintyMetres ** 2));
  const incomingDirection = { x: dx / Math.max(0.001, length), y: dy / Math.max(0.001, length) };
  const predictedReception = resolveReceptionOutcome(
    {
      ...state,
      time: state.time + plan.predictedArrivalTime,
      currentPressure: receivingPressure,
      ball: {
        x: target.x,
        y: target.y,
        height: delivery === 'lofted' ? 0.35 : 0.11,
        velocity: {
          x: incomingDirection.x * plan.predictedArrivalSpeed,
          y: incomingDirection.y * plan.predictedArrivalSpeed,
          z: 0,
        },
      },
      receptionPreparation: {
        actorId: receiver.id,
        sourceActorId: passer.id,
        releasedAt: state.time,
        awarenessAt: state.time + plan.receiverReadiness.awareAt,
        expectedContactPoint: target,
        expectedArrivalTime: state.time + plan.predictedArrivalTime,
        movement: runner ? 'run_onto_ball' : 'meet_ball',
        ballEpisode: 'forecast',
        readiness: plan.receiverReadiness,
      },
    },
    {
      ...receiver,
      position: target,
      facingAngle: integrateFacing(
        receiver.facingAngle,
        angleForVector({ x: -dx, y: -dy }),
        receiver.profile.attributes.agility,
        Math.hypot(receiver.velocity.x, receiver.velocity.y),
        Math.max(0, plan.predictedArrivalTime - plan.receiverReadiness.awareAt),
      ),
    },
    target,
  );
  const expectedReceptionQuality = predictedReception.quality?.score ?? 0;
  const receiverAdjustmentCost = execution.uncertaintyMetres * (1 + receivingPressure);
  const receptionRetention = clamp((expectedReceptionQuality - 0.25) / 0.5);
  const recoveryRisk = clamp((plan.predictedArrivalTime - defenderEta + 0.3) / 2) * 0.35;
  const expectedCompletion = geometricCompletion * executionReach;
  const expectedRetainedPossession = expectedCompletion * receptionRetention * (1 - recoveryRisk);
  const selectionQuality = targetPredictedOutOfPlay ? 0 : expectedCompletion;
  const read = (a.gameReading + a.composure) / 200;
  const urgency =
    state.time >= 75 * 60 &&
    state.score[passer.team] < state.score[passer.team === 'home' ? 'away' : 'home']
      ? 0.15
      : 0;
  const appetite = clamp(
    0.35 +
      urgency +
      (state.teams[passer.team].phase === 'attacking_transition' ? 0.18 : 0) -
      (state.teams[passer.team].threatMemory?.response.caution ?? 0) *
        0.2 *
        clamp((pressure - 0.4) / 0.6),
  );
  return {
    expectedCompletion,
    selectionQuality,
    passerAbility,
    pressure,
    length,
    ballEta: plan.predictedArrivalTime,
    receiverEta,
    defenderEta,
    laneOccupation,
    boundaryMargin,
    receiverLateBy,
    targetPredictedOutOfPlay,
    executionUncertaintyMetres: execution.uncertaintyMetres,
    expectedReceptionQuality,
    expectedRetainedPossession,
    receiverAdjustmentCost,
    utilityAdjustment:
      -(1 - (targetPredictedOutOfPlay ? 0 : expectedRetainedPossession)) *
        (38 + read * 38) *
        (1 - appetite * 0.3) -
      receiverAdjustmentCost * (0.7 + read) -
      (targetPredictedOutOfPlay ? 65 + read * 25 : 0) +
      (runner && expectedCompletion > 0.62 ? (expectedCompletion - 0.62) * 22 : 0),
  };
};
