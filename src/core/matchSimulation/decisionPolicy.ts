import type { MatchAction, MatchPlayerState, TacticalMatchState } from './matchState';
import type { RankedAiAction } from './matchActions';
import { STATE_VALUE_CONFIG as config } from './decisionPolicyConfig';
import { attacksRight, distance, clampPitchPoint } from './matchSpace';
import { prospectiveSpaceTargets } from './spacePassing';
import { deriveFeasiblePassPlans, derivePassLaunchPlan } from './passLaunchPlan';
import { enumerateCarryChoices } from './carryOpportunity';
import { enumerateCanonicalShootingOptions } from './shootingOptions';
import { enumerateCrossChoices } from './crossOpportunity';
import { evaluateStateValueAction } from './decisionStateValue';
import { RandomGenerator } from '../random/RandomGenerator';
import { canParticipatePhysically } from './matchInjuries';
import { enumerateCombinationPasses } from './combinationPlay';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';
import { estimatePlayerArrivalTime, withArrivalForecastCache } from './playerArrival';
import { roleReceivingTargets } from './roleTactics';

/** At most 48 meaningfully different actions. Feasibility is independent of legacy utility gates. */
export const enumerateStateValueActions = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
): MatchAction[] => {
  const actions: MatchAction[] = [
    { type: 'hold', actorId: actor.id },
    ...enumerateCarryChoices(state, actor),
    ...enumerateCanonicalShootingOptions(state, actor.id),
    ...enumerateCrossChoices(state, actor),
  ];
  const existing = state.ballCarrierIntent;
  if (existing?.actorId === actor.id && state.time < existing.expiresAt)
    actions.push({
      type: 'carry',
      actorId: actor.id,
      target: existing.target,
      movementMode: existing.movementMode,
    });
  const dir = attacksRight(actor) ? 1 : -1;
  const addPass = (
    receiver: MatchPlayerState,
    target: { x: number; y: number },
    spatial: boolean,
    firstTime = false,
  ) => {
    const metres = distance(actor.position, target);
    if (
      metres < 2 ||
      metres > 68 ||
      !canParticipatePhysically(receiver) ||
      state.discipline?.[receiver.id]?.sentOff
    )
      return;
    const progress = dir * (target.x - actor.position.x);
    const intent = spatial
      ? 'through'
      : progress > 8
        ? metres > 42
          ? 'direct'
          : 'progressive'
        : 'support';
    const plans =
      state.decisionAblation === 'delivery'
        ? [derivePassLaunchPlan(state, actor, receiver, target, intent)]
        : deriveFeasiblePassPlans(state, actor, receiver, target, intent, metres > 22);
    for (const deliveryPlan of plans.slice(0, config.maxDeliveries)) {
      if (deliveryPlan.feasible === false) continue;
      if (spatial) {
        // The arrival forecast uses acceleration/turning and the receiver's finite awareness.
        const readiness = deliveryPlan.receiverReadiness;
        const arrival =
          estimatePlayerArrivalTime(state, receiver, target, 'intercept').estimatedTime +
          readiness.awareAt;
        if (
          Math.max(arrival, readiness.earliestUsefulContactTime) >
          deliveryPlan.predictedArrivalTime + 0.3
        )
          continue;
      }
      if (
        actions.some(
          (a) =>
            a.type === 'pass' &&
            a.receiverId === receiver.id &&
            distance(a.target, target) < 0.8 &&
            Math.abs((a.deliveryPlan?.speed ?? 0) - deliveryPlan.speed) < 0.5 &&
            a.delivery === (deliveryPlan.elevation > 0 ? 'lofted' : 'ground'),
        )
      )
        continue;
      actions.push({
        type: 'pass',
        actorId: actor.id,
        receiverId: receiver.id,
        target,
        intent,
        delivery: deliveryPlan.elevation > 0 ? 'lofted' : 'ground',
        deliveryPlan,
        ...(spatial ? { requestedSpace: target } : {}),
        ...(firstTime ? { firstTime } : {}),
      });
      if (actions.length >= config.maxCandidates) return;
    }
  };
  for (const { receiver, target } of roleReceivingTargets(state, actor))
    addPass(receiver, target, true);
  if (state.decisionAblation !== 'runs')
    for (const { receiver, target } of prospectiveSpaceTargets(state, actor))
      addPass(receiver, target, true);
  for (const receiver of state.players.filter((p) => p.team === actor.team && p.id !== actor.id)) {
    // Short velocity projection is a contact invitation. No invented future sprint is assumed.
    const horizon = Math.min(0.6, distance(actor.position, receiver.position) / 18);
    addPass(
      receiver,
      clampPitchPoint({
        x: receiver.position.x + receiver.velocity.x * horizon,
        y: receiver.position.y + receiver.velocity.y * horizon,
      }),
      false,
    );
    if (actions.length >= config.maxCandidates) break;
  }
  for (const action of enumerateCombinationPasses(state, actor)) {
    if (action.type !== 'pass' || actions.length >= config.maxCandidates) continue;
    const receiver = state.players.find((p) => p.id === action.receiverId);
    if (receiver)
      addPass(receiver, action.target, Boolean(action.requestedSpace), action.firstTime);
  }
  return actions.slice(0, config.maxCandidates);
};

const rankStateValueActionsCore = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  supplied?: MatchAction[],
): RankedAiAction[] => {
  const generation = startPerformanceSpan('decision_candidates');
  const actions = supplied ?? enumerateStateValueActions(state, actor);
  endPerformanceSpan('decision_candidates', generation);
  const valuation = startPerformanceSpan('decision_value');
  const competence =
    (actor.profile.attributes.gameReading + actor.profile.attributes.composure) / 200;
  const ranked = actions
    .flatMap((action) => {
      const evaluation = evaluateStateValueAction(state, actor, action);
      if (!evaluation) return [];
      const key = JSON.stringify(action);
      const noise =
        (RandomGenerator.fromSeed(
          `${state.seed}:state-value-v1:${state.decisionIndex}:${actor.id}:${key}`,
        ).float() -
          0.5) *
        config.competenceNoise *
        (1 - competence);
      return [
        {
          action,
          canonicalScore: evaluation.value,
          deterministicNoise: noise,
          score: evaluation.value + noise,
        },
      ];
    })
    .sort((a, b) => b.score - a.score);
  endPerformanceSpan('decision_value', valuation);
  return ranked;
};

export const rankStateValueActions = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  supplied?: MatchAction[],
): RankedAiAction[] =>
  state.experimentalCanonicalArrival
    ? withArrivalForecastCache(() => rankStateValueActionsCore(state, actor, supplied))
    : rankStateValueActionsCore(state, actor, supplied);
