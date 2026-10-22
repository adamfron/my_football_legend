import { z } from 'zod';
import { attacksRight, distance, distanceToSegment, type PitchPoint } from './matchSpace';
import type { MatchAction, MatchPlayerState, TacticalMatchState } from './matchState';
import { STATE_VALUE_CONFIG as config, usesTacticalRoles } from './decisionPolicyConfig';
import { deriveTacticalRolePhase, forecastWaiting, roleControlledValue } from './roleTactics';
import { evaluateTransitionOpportunity } from './attackingTransition';
import { evaluatePassDecision } from './passDecision';
import { derivePassLaunchPlan, type PassLaunchPlan } from './passLaunchPlan';
import { projectCarryOpportunity } from './carryOpportunity';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { preparationMarginForAction } from './onBallPreparation';
import { estimateCarrierContactWindow } from './ballContactGeometry';
import { deriveMovementCapability } from './locomotion';
import { canParticipatePhysically } from './matchInjuries';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { secondLastOpponentLine, isDirectOffsideExemptRestart } from './offside';
import { canReleaseControlledAction } from './decisionReadiness';
import { assessFirstTouch } from './firstTouch';
import { projectCrossOpportunity } from './crossOpportunity';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const stateValueFeaturesSchema = z.object({
  territory: z.number().min(0).max(1),
  shotAccess: z.number().min(0).max(1),
  space: z.number().min(0).max(1),
  outlets: z.number().int().nonnegative(),
  transition: z.number().min(0).max(1),
  value: z.number().finite(),
});
export const decisionOutcomeBranchSchema = z.object({
  kind: z.enum(['controlled', 'contested', 'opponent', 'restart', 'goal']),
  probability: z.number().min(0).max(1),
  elapsed: z.number().nonnegative(),
  reward: z.number().finite(),
  value: z.number().finite(),
});
export const stateValueEvaluationSchema = z.object({
  value: z.number().finite(),
  before: z.number().finite(),
  effort: z.number().nonnegative(),
  branches: z
    .array(decisionOutcomeBranchSchema)
    .refine((b) => Math.abs(b.reduce((s, x) => s + x.probability, 0) - 1) < 1e-8),
  reasons: z.array(z.string()),
});
export type StateValueEvaluation = z.infer<typeof stateValueEvaluationSchema>;

/** Explicit uncalibrated engineering value in goal-difference proxy units. This reads geometry,
 * never future seeded execution. The same function values the controlled endpoint of every family. */
export const evaluateControlledState = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  point: PitchPoint,
  elapsed = 0,
) => {
  const dir = attacksRight(actor) ? 1 : -1;
  const goal = { x: dir > 0 ? 105 : 0, y: 34 };
  const depth = dir > 0 ? point.x : 105 - point.x;
  const opponents = state.players.filter(
    (p) => p.team !== actor.team && canParticipatePhysically(p),
  );
  const nearest = Math.min(
    15,
    ...opponents.map((p) =>
      distance(point, {
        x: p.position.x + p.velocity.x * Math.min(0.5, elapsed),
        y: p.position.y + p.velocity.y * Math.min(0.5, elapsed),
      }),
    ),
  );
  const space = clamp(nearest / 9);
  const angle = clamp(1 - Math.abs(point.y - 34) / Math.max(10, distance(point, goal) * 0.7));
  const blockers = opponents.filter(
    (p) =>
      !isMatchGoalkeeper(p) &&
      dir * (p.position.x - point.x) > 0 &&
      distanceToSegment(p.position, point, goal) < 2,
  ).length;
  const shotAccess =
    Math.exp(-Math.pow(distance(point, goal) / 21, 1.6)) * angle * Math.exp(-blockers * 0.35);
  const outlets = state.players.filter(
    (p) =>
      p.team === actor.team &&
      p.id !== actor.id &&
      canParticipatePhysically(p) &&
      distance(p.position, point) < 23 &&
      dir * (p.position.x - point.x) > -3 &&
      !opponents.some((d) => distanceToSegment(d.position, point, p.position) < 1.6),
  ).length;
  const opportunity = evaluateTransitionOpportunity(state, actor, point);
  const transition =
    state.decisionAblation === 'transitions' || !opportunity.active
      ? 0
      : opportunity.exposure * clamp(opportunity.recoverySeconds / Math.max(0.5, elapsed + 1));
  const territory = clamp(depth / 105);
  const phase =
    state.decisionPolicy === 'phase-role-hybrid-v1'
      ? deriveTacticalRolePhase(state, actor.team)
      : undefined;
  const value =
    (0.004 + 0.024 * territory ** 2 + 0.14 * shotAccess) * (0.4 + space * 0.6) +
    Math.min(3, outlets) * 0.002 * territory +
    config.transitionValue *
      transition *
      (0.25 + territory * 0.75) *
      (phase === 'rapid_transition' ? 1.6 : 1) +
    roleControlledValue(state, actor, point, elapsed) +
    (phase === 'build_up' ? 0.008 * Math.min(3, outlets) * space : 0);
  return { territory, shotAccess, space, outlets, transition, value };
};

/** Loss cost includes the opponent's immediate ball state and the actual rest defence. */
export const turnoverStateValue = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  point: PitchPoint,
  elapsed: number,
) => {
  const opponents = state.players.filter(
    (p) => p.team !== actor.team && canParticipatePhysically(p),
  );
  const winner = [...opponents].sort(
    (a, b) => distance(a.position, point) - distance(b.position, point),
  )[0];
  if (!winner) return 0;
  const dir = attacksRight(actor) ? 1 : -1;
  const cover = state.players.filter(
    (p) =>
      p.team === actor.team &&
      p.id !== actor.id &&
      !isMatchGoalkeeper(p) &&
      canParticipatePhysically(p) &&
      dir * (point.x - p.position.x) > 2,
  );
  const runners = opponents.filter(
    (p) =>
      !isMatchGoalkeeper(p) &&
      dir * (point.x - p.position.x) > 0 &&
      distance(p.position, point) < 40,
  );
  const recovery = Math.min(
    6,
    ...cover.map(
      (p) => distance(p.position, point) / deriveMovementCapability(p).maximumSprintSpeed,
    ),
  );
  const exposed = clamp((runners.length + 1 - cover.length) / 4) * clamp(recovery / 4);
  const value = evaluateControlledState(
    { ...state, decisionAblation: 'transitions' },
    winner,
    point,
    elapsed,
  ).value;
  const trailing = state.time > 75 * 60 && state.score[actor.team] < state.score[winner.team];
  const protecting = state.time > 80 * 60 && state.score[actor.team] > state.score[winner.team];
  return (
    -(value + 0.075 * exposed) * config.turnoverWeight * (trailing ? 0.85 : protecting ? 1.15 : 1)
  );
};

/** One bounded next-action forecast using PR174's actual shared run. The receiver remains free
 * to choose a shot, a return/third-man ball or a safe outlet at the real next decision. */
const continuationValue = (
  state: TacticalMatchState,
  receiver: MatchPlayerState,
  point: PitchPoint,
  elapsed: number,
) => {
  const plan = state.combinationIntent;
  if (
    state.decisionAblation === 'continuation' ||
    !plan ||
    plan.team !== receiver.team ||
    state.time + elapsed >= plan.expiresAt
  )
    return 0;
  const runner = state.players.find((p) => p.id === plan.runnerId);
  if (!runner || runner.id === receiver.id || !canParticipatePhysically(runner)) return 0;
  const ability = deriveMovementCapability(runner);
  const remaining = distance(runner.position, plan.target);
  const fraction = Math.min(
    1,
    (Math.hypot(runner.velocity.x, runner.velocity.y) * elapsed +
      ability.acceleration * elapsed ** 2 * 0.5) /
      Math.max(1, remaining),
  );
  const next = {
    x: runner.position.x + (plan.target.x - runner.position.x) * fraction,
    y: runner.position.y + (plan.target.y - runner.position.y) * fraction,
  };
  const blocked = state.players.some(
    (p) => p.team !== receiver.team && distanceToSegment(p.position, point, next) < 2,
  );
  if (blocked || distance(point, next) > 28) return 0;
  return (
    Math.max(
      0,
      evaluateControlledState(state, runner, next, elapsed + 1).value -
        evaluateControlledState(state, receiver, point, elapsed).value,
    ) * config.continuationWeight
  );
};

export const evaluateStateValueAction = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  action: MatchAction,
): StateValueEvaluation | undefined => {
  const before = evaluateControlledState(state, actor, actor.position).value;
  let point = actor.position,
    receiver = actor,
    controlled = 0.95,
    contested = 0.02,
    restart = 0,
    goal = 0,
    elapsed = 0.55,
    effort = 0;
  const reasons: string[] = [action.type];
  let futureState = state;
  // Incoming control ends at the next controllable touch, not after a stationary 2.5s hold.
  // This is an evaluation branch only; the live acquisition still requires canonical contact.
  const incomingControl =
    !state.ball.ownerId && (action.type === 'hold' || action.type === 'carry');
  if (incomingControl) {
    const target = action.type === 'carry' ? action.target : state.ball;
    const touch = assessFirstTouch(
      state,
      actor,
      state.ball,
      target,
      action.type === 'carry' ? 'directional' : 'cushion',
    );
    if (!touch.feasible) return undefined;
    elapsed = touch.recoverySeconds + (1 - touch.quality) * (0.18 + touch.relativeSpeed / 24);
    controlled = touch.quality;
    contested = (1 - controlled) * 0.65;
    reasons.push(
      `incoming-control:${touch.quality.toFixed(3)}`,
      `contact-seconds:${touch.contactSeconds.toFixed(3)}`,
    );
  }
  const margin = preparationMarginForAction(state, actor, action);
  if (margin < -1e-8) return undefined;
  if (
    state.ball.ownerId === actor.id &&
    !['hold', 'carry'].includes(action.type) &&
    !canReleaseControlledAction(state, actor)
  )
    return undefined;
  if (incomingControl) {
    if (action.type === 'carry') {
      const length = Math.max(0.01, distance(actor.position, action.target));
      const travel = Math.min(
        length,
        Math.hypot(actor.velocity.x, actor.velocity.y) * elapsed +
          (deriveMovementCapability(actor).acceleration * elapsed ** 2) / 2,
      );
      point = {
        x: actor.position.x + ((action.target.x - actor.position.x) * travel) / length,
        y: actor.position.y + ((action.target.y - actor.position.y) * travel) / length,
      };
    }
  } else if (action.type === 'pass') {
    const found = state.players.find((p) => p.id === action.receiverId);
    if (!found || !canParticipatePhysically(found)) return undefined;
    receiver = found;
    point = action.target;
    const line = secondLastOpponentLine(state, actor.team);
    if (
      !isDirectOffsideExemptRestart(state) &&
      (attacksRight(actor)
        ? receiver.position.x > Math.max(52.5, line, state.ball.x) + 0.01
        : receiver.position.x < Math.min(52.5, line, state.ball.x) - 0.01)
    )
      return undefined;
    const delivery: PassLaunchPlan =
      action.deliveryPlan ??
      derivePassLaunchPlan(state, actor, receiver, point, action.intent, action.delivery);
    if (delivery.feasible === false) return undefined;
    const evidence = evaluatePassDecision(
      state,
      actor,
      receiver,
      point,
      action.intent,
      action.delivery,
      delivery,
      Boolean(action.firstTime),
    );
    controlled = evidence.expectedRetainedPossession ?? evidence.expectedCompletion;
    if (action.firstTime) {
      const touch = assessFirstTouch(state, actor, state.ball, action.target, 'pass');
      if (!touch.feasible) return undefined;
      controlled *= touch.quality;
      reasons.push(
        `first-touch:${touch.quality.toFixed(3)}`,
        `relative-mps:${touch.relativeSpeed.toFixed(2)}`,
      );
    }
    contested = Math.max(0, evidence.expectedCompletion - controlled) * 0.65;
    restart = evidence.targetPredictedOutOfPlay
      ? (1 - controlled - contested) * 0.8
      : 0.01 * (1 - controlled);
    elapsed = delivery.predictedArrivalTime;
    effort = (config.effortWeight * delivery.speed) / 30;
    reasons.push(action.intent, `completion:${evidence.expectedCompletion.toFixed(3)}`);
  } else if (action.type === 'carry') {
    const opportunity = projectCarryOpportunity(state, actor, action.target, action.movementMode);
    const contact = estimateCarrierContactWindow(state, actor, opportunity.target);
    // Every carry, including a controlled dribble, earns only the reachable controlled envelope.
    const limit = Math.min(
      opportunity.freeDistance,
      (action.movementMode === 'sprint'
        ? deriveMovementCapability(actor).maximumSprintSpeed
        : deriveMovementCapability(actor).runSpeed) * config.valueHorizonSeconds,
    );
    const fraction = Math.min(1, limit / Math.max(0.01, distance(actor.position, action.target)));
    point = {
      x: actor.position.x + (action.target.x - actor.position.x) * fraction,
      y: actor.position.y + (action.target.y - actor.position.y) * fraction,
    };
    elapsed = Math.min(config.valueHorizonSeconds, Math.max(0.4, opportunity.carrierEta));
    const nearest = Math.min(
      12,
      ...state.players
        .filter((p) => p.team !== actor.team && canParticipatePhysically(p))
        .map((p) => distance(p.position, point)),
    );
    const skill =
      (actor.profile.attributes.dribbling +
        actor.profile.attributes.agility +
        actor.profile.attributes.strength) /
      300;
    controlled = clamp(
      0.97 - (1 - clamp(nearest / 6)) * (0.5 - skill * 0.25) - contact.exposure * 0.25,
    );
    contested = (1 - controlled) * 0.3;
    effort =
      (config.effortWeight *
        distance(actor.position, point) *
        (action.movementMode === 'sprint' ? 1.3 : 0.5)) /
      Math.max(0.25, actor.fitness?.burstReadiness ?? 1);
    reasons.push(`controlled-metres:${limit.toFixed(2)}`);
  } else if (
    action.type === 'shot' ||
    (action.type === 'header' && action.intent === 'header_shot')
  ) {
    const opportunity = evaluateShootingOpportunity(state, actor);
    goal = opportunity.effectiveScoringExpectation;
    controlled = 0;
    const support = state.players.filter(
      (p) =>
        p.team === actor.team &&
        p.id !== actor.id &&
        canParticipatePhysically(p) &&
        distance(p.position, action.target) < 22,
    ).length;
    contested = (1 - goal) * Math.min(0.3, 0.06 + support * 0.035);
    restart = (1 - goal - contested) * 0.45;
    elapsed = Math.max(0.2, opportunity.distance / 24);
    reasons.push('terminal-goal-branch');
  } else if (action.type === 'cross' || action.type === 'header') {
    const found = state.players.find((p) => p.id === action.intendedTargetId);
    if (!found || !canParticipatePhysically(found)) return undefined;
    point = action.target;
    receiver = found;
    const nearest = Math.min(
      12,
      ...state.players
        .filter((p) => p.team !== actor.team && canParticipatePhysically(p))
        .map((p) => distance(p.position, point)),
    );
    const skill = (actor.profile.attributes.passing + actor.profile.attributes.technique) / 200;
    controlled = clamp(
      0.2 + skill * 0.32 + Math.min(0.2, nearest / 30) - distance(actor.position, point) / 220,
    );
    contested = (1 - controlled) * 0.35;
    restart = (1 - controlled - contested) * 0.2;
    if (action.type === 'cross') {
      const crossing = projectCrossOpportunity(state, actor, action);
      if (!crossing) return undefined;
      elapsed = crossing.ballArrival;
      const race = clamp((crossing.defenderArrival - crossing.receiverArrival + 0.5) / 1.5);
      const contactSkill =
        action.intent === 'floated'
          ? found.profile.attributes.heading / 100
          : found.profile.attributes.firstTouch / 100;
      controlled = clamp(controlled * (0.55 + race * 0.45) * (0.65 + contactSkill * 0.35));
      contested = (1 - controlled) * (0.25 + (1 - race) * 0.4);
      restart = (1 - controlled - contested) * 0.2;
      reasons.push(`cross-arrival:${crossing.receiverArrival.toFixed(2)}/${elapsed.toFixed(2)}`);
    } else elapsed = distance(actor.position, point) / 18;
  } else if (action.type === 'hold') {
    const pressure = state.currentPressure;
    const strength =
      (actor.profile.attributes.strength + actor.profile.attributes.firstTouch) / 200;
    controlled = clamp(0.99 - pressure * (0.23 - strength * 0.12));
    contested = (1 - controlled) * 0.3;
    if (usesTacticalRoles(state)) {
      const forecast = forecastWaiting(state, actor);
      futureState = forecast.state;
      elapsed = forecast.diagnostic.horizon;
      controlled = clamp(1 - forecast.diagnostic.intervention);
      contested = (1 - controlled) * 0.3;
      reasons.push(
        `waiting:${forecast.diagnostic.reason}`,
        `support-metres:${forecast.diagnostic.supportMovement.toFixed(2)}`,
        `intervention:${forecast.diagnostic.intervention.toFixed(3)}`,
      );
    }
  } else return undefined;
  const loss = Math.max(0, 1 - controlled - contested - restart - goal);
  const success =
    evaluateControlledState(futureState, receiver, point, elapsed).value +
    continuationValue(futureState, receiver, point, elapsed);
  const opponent = turnoverStateValue(state, actor, point, elapsed);
  const branches: StateValueEvaluation['branches'] = [
    { kind: 'controlled', probability: controlled, elapsed, reward: 0, value: success },
    {
      kind: 'contested',
      probability: contested,
      elapsed: elapsed + 0.5,
      reward: 0,
      value: success * 0.35 + opponent * 0.65,
    },
    { kind: 'opponent', probability: loss, elapsed, reward: 0, value: opponent },
    {
      kind: 'restart',
      probability: restart,
      elapsed: elapsed + 2,
      reward: 0,
      value: opponent * 0.25,
    },
    { kind: 'goal', probability: goal, elapsed, reward: 1, value: 0 },
  ];
  const value =
    branches.reduce(
      (sum, b) =>
        sum + b.probability * (b.reward + Math.exp(-b.elapsed / config.discountSeconds) * b.value),
      0,
    ) -
    before -
    effort;
  return { value, before, effort, branches, reasons };
};
