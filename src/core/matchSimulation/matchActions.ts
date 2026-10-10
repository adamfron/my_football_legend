import { isMatchGoalkeeper } from './matchGoalkeeper';
import { selectRestartAction } from './restartLifecycle';
import { enumerateContextualRestartActions } from './restartOptions';
import { endStoppage } from './stoppageLedger';
import { isRestartSetup } from './restartPhase';
import { canParticipatePhysically } from './matchInjuries';
import { hasPendingPlayerDecision } from './playerDecision';
import { isHumanControlled, isShotAction, requiresHumanRestart } from './actionAgency';
import { enumerateFirstTimePasses, canExecuteFirstTimePass } from './firstTimePassing';
import { beginDefensiveChallenge, enumerateDefensiveChallengeActions } from './defensiveChallenges';
import { emitCanonicalActionEvents } from './actionEvents';
import { reconcileControlledBallContact } from './ballContactGeometry';
import {
  deriveBuildUpReliefWeight,
  deriveSolutionPenalty,
  TEAM_THREAT_TUNING,
  threatChannel,
} from './teamThreatMemory';
import { evaluatePassDecision } from './passDecision';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { RandomGenerator } from '../random/RandomGenerator';
import {
  clampPitchPoint,
  distance,
  distanceToSegment,
  fieldValue,
  signedForwardDistance,
} from './matchSpace';
import type { ActionSource, MatchAction, MatchPlayerState, TacticalMatchState } from './matchState';
import { resolveCanonicalShot } from './shotResolver';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { evaluateRunSpace } from './reachableSpace';
import {
  captureOffsideSnapshot,
  isDirectOffsideExemptRestart,
  secondLastOpponentLine,
} from './offside';
import { projectPassReception, receptionPreparationSchema } from './passReception';
import { estimatePlayerArrivalTime } from './playerArrival';
import { deriveAerialLaunchPlan, deriveLaunchVelocity } from './ballPhysics';
import {
  canContactAfterThrowIn,
  isLegalThrowInReceiver,
  throwInDiagnosticSchema,
  type ThrowInDiagnostic,
} from './throwIn';
import { derivePassLaunchPlan } from './passLaunchPlan';
import { deriveSpacePassPlan, type SpacePassPlan } from './spacePassing';
import { interpretPassExecution } from './passExecution';
import { projectReceiverReadiness } from './receiverReadiness';
import { deriveFinalThirdOccupations, deriveFlankRelationship } from './tacticalPositioning';
import {
  deriveEconomicalMovementCost,
  deriveTeamTacticalPreferences,
  type TacticalPreferences,
} from './tacticalPreferences';
import { preparationMarginForAction } from './onBallPreparation';
import {
  canExecuteCanonicalShot,
  canonicalShotStyleUtility,
  enumerateCanonicalShootingOptions,
} from './shootingOptions';
import {
  commitHumanPossessionDecision,
  hasActiveHumanPossession,
  reconcileHumanPossession,
} from './possessionAgency';
import { deriveBallContactAccess, estimateCarrierContactWindow } from './ballContactGeometry';

const opponents = (state: TacticalMatchState, actor: MatchPlayerState) =>
  state.players.filter((p) => p.team !== actor.team);
export const evaluatePressure = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const nearby = opponents(state, actor)
    .map((defender) => ({ defender, metres: distance(defender.position, actor.position) }))
    .filter(({ metres }) => metres < 14)
    .sort((a, b) => a.metres - b.metres);
  if (!nearby.length) return { value: 0, nearestChallengerId: undefined };
  const first = nearby[0]!;
  const closing = Math.max(
    0,
    -(
      (first.defender.velocity.x * (first.defender.position.x - actor.position.x) +
        first.defender.velocity.y * (first.defender.position.y - actor.position.y)) /
      Math.max(0.2, first.metres)
    ),
  );
  const defensive =
    (first.defender.profile.attributes.tackling +
      first.defender.profile.attributes.positioning +
      first.defender.profile.attributes.aggression +
      first.defender.profile.attributes.gameReading) /
    400;
  const control =
    (actor.profile.attributes.dribbling +
      actor.profile.attributes.technique +
      actor.profile.attributes.composure +
      actor.profile.attributes.agility) /
    400;
  return {
    value: Math.max(
      0,
      Math.min(
        1,
        (1 - first.metres / 14) * 0.62 +
          Math.min(0.15, closing / 35) +
          Math.min(0.15, (nearby.length - 1) * 0.06) +
          (defensive - control) * 0.18,
      ),
    ),
    nearestChallengerId: first.defender.id,
  };
};
const pressure = (state: TacticalMatchState, actor: MatchPlayerState) =>
  evaluatePressure(state, actor).value;

/** Pressure makes prolonged protection unstable. Free patience and late corner retention remain useful. */
export const derivePossessionUrgency = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  value = pressure(state, actor),
) => {
  const age = Math.max(0, state.time - (state.ballOwnershipStartedAt ?? state.time));
  const preparation =
    state.onBallPreparation?.actorId === actor.id
      ? Math.max(0, state.onBallPreparation.readyAt - state.onBallPreparation.gainedAt)
      : 0;
  const corner =
    (actor.team === 'home' ? actor.position.x : 105 - actor.position.x) > 94 &&
    Math.abs(actor.position.y - 34) > 25;
  const protectingLead =
    state.time > 80 * 60 &&
    state.score[actor.team] > state.score[actor.team === 'home' ? 'away' : 'home'];
  return (
    Math.min(1, (Math.max(0, value - 0.38) * Math.max(0, age - preparation)) / 2.8) *
    (corner && protectingLead ? 0.28 : 1)
  );
};

export const shotUtility = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const opportunity = evaluateShootingOpportunity(state, actor);
  const styleModifier = state.teams[actor.team].style === 'direct' ? 3 : 0;
  const extremeRangePenalty = Math.pow(Math.max(0, opportunity.distance - 22) / 8, 1.55) * 12;
  return (
    4 +
    Math.pow(opportunity.effectiveScoringExpectation, 1.18) * 150 -
    opportunity.pressure * 12 -
    opportunity.blockingDefenders * 4 +
    styleModifier -
    extremeRangePenalty
  );
};

/** Reusable value of preserving the current terminal attacking state. */
export const terminalOpportunityValue = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const opportunity = evaluateShootingOpportunity(state, actor);
  const goalDistance = distance(actor.position, { x: actor.team === 'home' ? 105 : 0, y: 34 });
  return Math.max(
    0,
    opportunity.effectiveScoringExpectation * 62 + Math.max(0, 22 - goalDistance) * 0.7,
  );
};

/** A near-future reception point for a genuine run, distinct from a line-breaking through ball. */
export const deriveLeadPass = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  receiver: MatchPlayerState,
) => {
  const projection = projectPassReception(state, passer, receiver, 'lead');
  if (projection.semanticIntent !== 'lead') return undefined;
  const speed = Math.hypot(receiver.velocity.x, receiver.velocity.y);
  if (isMatchGoalkeeper(receiver) && speed < 1.2) return undefined;
  const desired = {
    x: receiver.target.x - receiver.position.x,
    y: receiver.target.y - receiver.position.y,
  };
  const motion = speed > 0.7 ? receiver.velocity : desired;
  const motionLength = Math.hypot(motion.x, motion.y);
  if (motionLength < 1.2 || projection.leadDistance < 1.6) return undefined;
  const toPasser = {
    x: passer.position.x - receiver.position.x,
    y: passer.position.y - receiver.position.y,
  };
  // A receiver running substantially back at the ball gets the ordinary feet option instead.
  if (
    (motion.x * toPasser.x + motion.y * toPasser.y) / motionLength >
    0.45 * Math.hypot(toPasser.x, toPasser.y)
  )
    return undefined;
  const receiverEta = estimatePlayerArrivalTime(state, receiver, projection.releaseTarget);
  const defenderEta = Math.min(
    ...opponents(state, passer).map(
      (defender) =>
        estimatePlayerArrivalTime(state, defender, projection.releaseTarget, 'intercept')
          .estimatedTime,
    ),
  );
  if (!receiverEta.reachable || defenderEta < receiverEta.estimatedTime + 0.12) return undefined;
  const laneRisk = opponents(state, passer).filter(
    (defender) =>
      distanceToSegment(defender.position, passer.position, projection.releaseTarget) < 2.5,
  ).length;
  if (laneRisk >= 2) return undefined;
  return { projection, receiverEta: receiverEta.estimatedTime, defenderEta, laneRisk };
};

/** Human availability is physical/tactical feasibility, deliberately not NPC utility. */
export const deriveHumanLeadPass = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  receiver: MatchPlayerState,
) => {
  const projection = projectPassReception(state, passer, receiver, 'lead');
  if (projection.semanticIntent !== 'lead') return undefined;
  const motion = Math.hypot(receiver.velocity.x, receiver.velocity.y);
  if (isMatchGoalkeeper(receiver) && motion < 1.2) return undefined;
  const tacticalRun = distance(receiver.position, receiver.target);
  if (Math.max(motion, tacticalRun) < 1.2 || projection.leadDistance < 1.6) return undefined;
  // The canonical launch/readiness plan decides whether the attempt physically exists. Risk and
  // defender advantage remain reasons for AI not to choose it, rather than hiding it from a human.
  const receiverEta = estimatePlayerArrivalTime(state, receiver, projection.releaseTarget);
  if (!receiverEta.reachable || projection.estimatedBallArrival < 0.1) return undefined;
  return { projection, receiverEta: receiverEta.estimatedTime };
};
export const enumerateAvailableActions = (
  state: TacticalMatchState,
  actorId: string,
): MatchAction[] => {
  if (state.status === 'abandoned' || state.status === 'full_time' || state.status === 'half_time')
    return [];
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return [];
  if (isRestartSetup(state))
    return state.restart.takerId === actorId ? enumerateRestartActions(state) : [];
  if (state.ball.ownerId !== actorId)
    return [
      ...enumerateCanonicalShootingOptions(state, actorId),
      ...enumerateFirstTimePasses(state, actorId),
      ...enumerateDefensiveChallengeActions(state, actorId),
    ];
  const dir = actor.team === 'home' ? 1 : -1;
  const carryTargets = [
    { x: actor.position.x + dir * 6, y: actor.position.y },
    { x: actor.position.x + dir * 10, y: actor.position.y + (34 - actor.position.y) * 0.35 },
    { x: actor.position.x + dir * 5, y: actor.position.y + (actor.position.y < 34 ? -5 : 5) },
    { x: actor.position.x - dir * 3, y: actor.position.y + (34 - actor.position.y) * 0.25 },
  ].map(clampPitchPoint);
  const actions: MatchAction[] = [
    { type: 'hold', actorId },
    ...carryTargets.map((target) => ({ type: 'carry' as const, actorId, target })),
  ];
  const advanced = fieldValue(actor.position, actor.team) > 54;
  const channelWidth = Math.abs(actor.position.y - 34);
  const deliveryAngle = Math.abs(actor.position.x - (actor.team === 'home' ? 105 : 0));
  if (advanced && channelWidth >= 12 && deliveryAngle <= 44) {
    const occupations = deriveFinalThirdOccupations(state, actor.team).filter(
      ({ occupation }) => occupation !== 'rest_defence' && occupation !== 'wide_support',
    );
    for (const assignment of occupations) {
      const receiver = state.players.find((player) => player.id === assignment.playerId);
      if (!receiver) continue;
      const receiverProjection = projectPassReception(state, actor, receiver, 'lead');
      const target = {
        x: assignment.target.x * 0.7 + receiverProjection.releaseTarget.x * 0.3,
        y: assignment.target.y * 0.7 + receiverProjection.releaseTarget.y * 0.3,
      };
      const byline =
        deliveryAngle < 13 && signedForwardDistance(target, actor.position, actor.team) < -1;
      const intent =
        byline && ['penalty_spot', 'edge_support'].includes(assignment.occupation)
          ? 'cutback'
          : assignment.occupation === 'far_post' || deliveryAngle > 25
            ? 'floated'
            : 'driven';
      actions.push({
        type: 'cross',
        actorId,
        target,
        intendedTargetId: receiver.id,
        intent,
      });
    }
  }
  actions.push(...enumerateCanonicalShootingOptions(state, actorId));
  state.players
    .filter(
      (p) => p.team === actor.team && p.id !== actorId && distance(p.position, actor.position) < 68,
    )
    .forEach((p) => {
      const progress = dir * (p.position.x - actor.position.x),
        length = distance(p.position, actor.position);
      const intent = length > 42 ? 'direct' : progress > 8 ? 'progressive' : 'support';
      const projection = projectPassReception(state, actor, p, intent);
      actions.push({
        type: 'pass',
        actorId,
        receiverId: p.id,
        target: projection.releaseTarget,
        intent,
      });
      if (length >= 22 && (progress > 5 || Math.abs(p.position.y - actor.position.y) > 20))
        actions.push({
          type: 'pass',
          actorId,
          receiverId: p.id,
          target: projectPassReception(state, actor, p, intent, 'lofted').releaseTarget,
          intent,
          delivery: 'lofted',
        });
      const lead = deriveLeadPass(state, actor, p);
      const space =
        progress > 8 && p.duty !== 'defend' ? evaluateRunSpace(state, actor, p) : undefined;
      const through =
        lead && space && space.utility >= 6
          ? projectPassReception(state, actor, p, 'through')
          : undefined;
      if (lead && distance(lead.projection.releaseTarget, projection.releaseTarget) >= 1.6) {
        actions.push({
          type: 'pass',
          actorId,
          receiverId: p.id,
          target:
            through?.semanticIntent === 'through'
              ? through.releaseTarget
              : lead.projection.releaseTarget,
          intent: through?.semanticIntent === 'through' ? 'through' : 'lead',
        });
        if (through?.semanticIntent === 'through') {
          const laneBlocked = opponents(state, actor).some(
            (defender) =>
              distanceToSegment(defender.position, actor.position, through.releaseTarget) < 2.5,
          );
          const line = secondLastOpponentLine(state, actor.team);
          const highLine = actor.team === 'home' ? line < 82 : line > 23;
          if (
            laneBlocked &&
            highLine &&
            (actor.profile.attributes.passing + actor.profile.attributes.technique) / 2 >= 55
          )
            actions.push({
              type: 'pass',
              actorId,
              receiverId: p.id,
              target: projectPassReception(state, actor, p, 'through', 'lofted').releaseTarget,
              intent: 'through',
              delivery: 'lofted',
            });
        }
      }
    });
  return actions;
};
export const scoreActionForAI = (
  state: TacticalMatchState,
  actorId: string,
  action: MatchAction,
  suppliedPreferences?: TacticalPreferences,
): number => {
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return -Infinity;
  if (action.type === 'space_pass') {
    const plan = deriveSpacePassPlan(state, actor, action.target);
    if (!plan) return -Infinity;
    return (
      scoreActionForAI(
        state,
        actorId,
        {
          type: 'pass',
          actorId,
          receiverId: plan.receiverId,
          target: plan.requestedSpace,
          requestedSpace: plan.requestedSpace,
          intent: plan.intent,
          delivery: plan.delivery,
        },
        suppliedPreferences,
      ) +
      Math.min(8, plan.anticipationAdvantage * 5) -
      plan.groundLaneRisk * (plan.delivery === 'ground' ? 4 : 1)
    );
  }
  if (action.type === 'challenge') {
    const attributes = actor.profile.attributes;
    const opponent = state.players.find((player) => player.id === action.opponentId);
    if (!opponent) return -Infinity;
    const danger = 100 - fieldValue(opponent.position, actor.team);
    const disciplineRisk = (state.discipline?.[actorId]?.yellowCards ?? 0) * 25;
    if (action.technique === 'standing') return 35 + attributes.tackling * 0.15;
    if (action.technique === 'committed')
      return 22 + danger * 0.16 + attributes.aggression * 0.13 - disciplineRisk;
    if (action.technique === 'slide')
      return 14 + danger * 0.2 + attributes.tackling * 0.1 - disciplineRisk;
    return 8 + danger * 0.3 + attributes.aggression * 0.12 - disciplineRisk * 1.4;
  }
  const style = state.teams[actor.team].style;
  const preferences = suppliedPreferences ?? deriveTeamTacticalPreferences(state, actor.team);
  const underPressure = pressure(state, actor);
  const urgency = derivePossessionUrgency(state, actor, underPressure);
  const memory = state.teams[actor.team].threatMemory;
  const buildUpSafety =
    (actor.team === 'home' ? actor.position.x : 105 - actor.position.x) < 48
      ? (memory?.response.buildUpSafety ?? 0) *
        deriveBuildUpReliefWeight(state, actor, underPressure)
      : 0;
  const preparationMargin = preparationMarginForAction(state, actor, action);
  const preparationPenalty = preparationMargin < 0 ? Math.min(65, -preparationMargin * 55) : 0;
  if (action.type === 'hold') {
    const fieldProgress = fieldValue(actor.position, actor.team);
    const scanningContext =
      state.teams[actor.team].phase === 'positional_attack' &&
      fieldProgress < 70 &&
      underPressure < 0.38;
    const scanningQuality =
      (actor.profile.attributes.gameReading + actor.profile.attributes.composure) / 20;
    const controlAge =
      state.ballOwnershipStartedAt !== undefined
        ? Math.max(0, state.time - state.ballOwnershipStartedAt)
        : 0;
    const physicalPreparation =
      state.onBallPreparation?.actorId === actor.id
        ? Math.max(0, state.onBallPreparation.readyAt - state.onBallPreparation.gainedAt)
        : 0;
    const readyAfter = Math.max(npcPossessionDecisionDelay(state, actor), physicalPreparation);
    // Scanning has a purpose and an end. Repeated hold selections do not restart control age;
    // after preparation, release/carry gains value while a briefly useful shield can still win
    // against unsafe alternatives. This removes permanent idle ownership without a hold quota.
    const completedScanningPenalty =
      !isRestartSetup(state) && controlAge >= readyAfter
        ? Math.min(46, 18 + (controlAge - readyAfter) * 7)
        : 0;
    const utility =
      35 +
      (preferences.possessionPatience - 0.5) * 40 +
      (scanningContext ? 8 + scanningQuality : 0) -
      underPressure * (scanningContext ? 30 : 18) -
      completedScanningPenalty -
      buildUpSafety * underPressure * 14;
    const shieldingQuality =
      (actor.profile.attributes.strength +
        actor.profile.attributes.firstTouch +
        actor.profile.attributes.composure) /
      300;
    // A modest retention floor keeps a last-resort shield preferable to several losing actions.
    // It is far below a useful release and depends on ball protection, not elapsed-match totals.
    return underPressure >= 0.65
      ? Math.max(utility, 14 + shieldingQuality * 8 - underPressure * 4) -
          urgency * 35 -
          deriveSolutionPenalty(state, actor, 'hold', actor.position, undefined, 0.3)
      : utility;
  }
  if (action.type === 'carry') {
    const contact = estimateCarrierContactWindow(state, actor, action.target);
    const contactDelay = Math.max(0, contact.earliestContactAt - state.time);
    const interceptors = opponents(state, actor).filter(
      (player) => distance(player.position, state.ball) < 8,
    );
    const contactRisk = Math.max(
      0,
      ...interceptors.map((defender) => {
        const access = deriveBallContactAccess(state, defender, actor);
        const beatenToContact = Math.max(
          0,
          Math.min(
            1,
            (contactDelay + 0.15 - access.defenderEta) / Math.max(0.2, contactDelay + 0.15),
          ),
        );
        return (
          beatenToContact *
          Math.max(contact.exposure, access.exposure) *
          (1 - access.shielding * 0.65)
        );
      }),
    );
    return (
      18 +
      (fieldValue(action.target, actor.team) - fieldValue(actor.position, actor.team)) * 1.3 +
      (actor.profile.attributes.dribbling +
        actor.profile.attributes.agility +
        actor.profile.attributes.pace +
        actor.profile.attributes.composure) /
        16 -
      Math.max(
        underPressure,
        Math.max(
          0,
          1 -
            Math.min(...opponents(state, actor).map((p) => distance(p.position, action.target))) /
              9,
        ),
      ) *
        30 -
      buildUpSafety * underPressure * 18 -
      opponents(state, actor).filter(
        (p) =>
          distance(p.position, actor.position) < 6 &&
          distanceToSegment(p.position, actor.position, action.target) < 1.7,
      ).length *
        (12 + urgency * 12) *
        (1 - actor.profile.attributes.dribbling / 160) +
      Math.max(
        0,
        distance(
          action.target,
          state.players.find((p) => p.id === state.nearestChallengerId)?.position ?? actor.position,
        ) -
          distance(
            actor.position,
            state.players.find((p) => p.id === state.nearestChallengerId)?.position ??
              actor.position,
          ),
      ) *
        underPressure *
        2 -
      deriveSolutionPenalty(state, actor, 'carry', action.target, undefined, 0.5) -
      deriveEconomicalMovementCost(actor, action.target) * 2 -
      contact.difficulty * (8 + underPressure * 10) -
      contactRisk * 30
    );
  }
  if (action.type === 'shot')
    return (
      shotUtility(state, actor) + canonicalShotStyleUtility(state, action) - preparationPenalty
    );
  if (action.type === 'header')
    return action.intent === 'header_shot'
      ? shotUtility(state, actor) + canonicalShotStyleUtility(state, action)
      : 35;
  if (action.type === 'cross') {
    const targets = state.players.filter(
      (p) => p.team === actor.team && distance(p.position, action.target) < 15,
    );
    const density = opponents(state, actor).filter(
      (p) => distance(p.position, action.target) < 12,
    ).length;
    const a = actor.profile.attributes;
    const delivery = (a.passing + a.technique + a.gameReading + a.composure) / 20;
    return (
      24 +
      delivery +
      targets.length * 9 -
      density * 6 -
      distance(actor.position, action.target) * 0.35 -
      underPressure * 22 +
      (action.intent === 'cutback' ? 8 : 0) +
      (style === 'direct' ? 7 : 0)
    );
  }
  const receiver = state.players.find((p) => p.id === action.receiverId)!;
  const decision = evaluatePassDecision(
    state,
    actor,
    receiver,
    action.target,
    action.intent,
    action.delivery,
    undefined,
    Boolean(action.firstTime),
  );
  const line = secondLastOpponentLine(state, actor.team);
  const offsideLine =
    actor.team === 'home' ? Math.max(state.ball.x, line) : Math.min(state.ball.x, line);
  const offsideRisk =
    actor.team === 'home'
      ? receiver.position.x > Math.max(52.5, offsideLine) + 0.01
      : receiver.position.x < Math.min(52.5, offsideLine) - 0.01;
  const length = distance(actor.position, action.target);
  const progression =
    fieldValue(action.target, actor.team) - fieldValue(actor.position, actor.team);
  const receiverPressure = pressure(state, receiver);
  const markerSeparation = Math.min(
    15,
    ...opponents(state, actor).map((opponent) => distance(opponent.position, receiver.position)),
  );
  const widthGained = Math.abs(action.target.y - 34) - Math.abs(actor.position.y - 34);
  const carrierClearance = Math.min(
    15,
    ...opponents(state, actor).map((opponent) => distance(opponent.position, actor.position)),
  );
  // Changing flank has value when it opens space or escapes a congested pocket.
  // Merely crossing the centre line must not make a neutral return a useful wall pass.
  const spaceReleased = Math.max(0, markerSeparation - carrierClearance) / 15;
  const switchOpportunity = Math.max(spaceReleased, underPressure - receiverPressure, 0);
  const switchValue =
    Math.sign(actor.position.y - 34) !== Math.sign(action.target.y - 34)
      ? Math.min(12, Math.abs(action.target.y - actor.position.y) * 0.22) * switchOpportunity
      : 0;
  const escapesPressure = Math.max(0, underPressure - receiverPressure) * 14;
  const recycleValue =
    action.intent === 'support' && progression > -9 && markerSeparation >= 5
      ? 3 + escapesPressure + switchValue * 0.5
      : 0;
  // Returning to the previous passer is valuable as a wall pass when it escapes pressure or
  // creates a forward opening. An unchanged two-player exchange otherwise needs movement first.
  const lastPass = state.lastPassDiagnostic;
  const returning =
    lastPass?.intendedReceiverId === actorId &&
    lastPass.passerId === action.receiverId &&
    lastPass.resolvedAt !== undefined &&
    state.time - lastPass.resolvedAt < 12;
  const receiverMoved = lastPass ? distance(actor.position, lastPass.receiverPositionAtRelease) : 0;
  const usefulWallPass =
    (underPressure > 0.62 && receiverPressure < underPressure - 0.2) ||
    progression > 9 ||
    switchValue > 6 ||
    receiverMoved > 4;
  const staleReturnPenalty =
    returning && !usefulWallPass
      ? 30 * Math.max(0.35, 1 - (state.time - lastPass!.resolvedAt!) / 12)
      : 0;
  const laneRisk = opponents(state, actor).filter(
    (p) => distanceToSegment(p.position, actor.position, action.target) < 3.5,
  ).length;
  const technical =
    (actor.profile.attributes.passing +
      actor.profile.attributes.technique +
      actor.profile.attributes.gameReading +
      actor.profile.attributes.composure) /
    20;
  const styleIntent =
    action.intent === 'direct' || action.intent === 'through'
      ? (preferences.verticality - 0.4) * 36
      : (preferences.possessionPatience - 0.5) * 14;
  const space = action.intent === 'through' ? evaluateRunSpace(state, actor, receiver) : undefined;
  const throughContext =
    action.intent === 'through'
      ? space && space.defenderArrival - space.attackerArrival >= 0.2
        ? -10
        : -38
      : 0;
  const threatLoss = Math.max(
    0,
    terminalOpportunityValue(state, actor) - fieldValue(action.target, actor.team) * 0.32,
  );
  const rememberedReceiver =
    memory?.pressuredPlayers.find((player) => player.playerId === receiver.id)?.score ?? 0;
  const receiverBuildUp =
    (actor.team === 'home' ? receiver.position.x : 105 - receiver.position.x) < 48;
  const safeOutlet = length <= 28 && receiverPressure < 0.42 && laneRisk <= 1;
  const pressureEscaped = Math.max(
    0,
    Math.min(1, (underPressure - receiverPressure) / TEAM_THREAT_TUNING.meaningfulPressureEscape),
  );
  // Recycle away from the repeated trap without prohibiting progression or making GK-only loops.
  const adaptationValue =
    buildUpSafety *
      ((safeOutlet
        ? pressureEscaped *
          (12 +
            (progression <= 4 && (receiver.duty === 'defend' || isMatchGoalkeeper(receiver))
              ? 9
              : 0))
        : 0) -
        receiverPressure * 19 -
        laneRisk * 7) -
    (receiverBuildUp
      ? (memory?.response.buildUpSafety ?? 0) *
        Math.min(
          4,
          rememberedReceiver + (memory?.buildUpLosses[threatChannel(receiver.position)] ?? 0) * 0.3,
        ) *
        receiverPressure *
        9
      : 0);
  return (
    28 +
    decision.utilityAdjustment +
    urgency * decision.expectedCompletion * 24 -
    deriveSolutionPenalty(
      state,
      actor,
      action.intent,
      action.target,
      receiver.id,
      decision.expectedCompletion,
    ) +
    adaptationValue +
    progression * (state.teams[actor.team].phase === 'attacking_transition' ? 1.5 : 1.05) -
    length * 0.3 -
    receiverPressure * 17 -
    laneRisk * 10 +
    markerSeparation * 0.7 +
    Math.max(0, widthGained) * 0.35 * switchOpportunity +
    switchValue +
    recycleValue -
    staleReturnPenalty +
    technical +
    styleIntent +
    throughContext +
    -threatLoss -
    (offsideRisk && !isDirectOffsideExemptRestart(state) ? 80 : 0) -
    preparationPenalty +
    (action.intent === 'lead'
      ? Math.min(12, Math.max(0, decision.defenderEta - decision.receiverEta) * 8) *
        decision.expectedCompletion
      : 0) +
    (space ? Math.max(-35, Math.min(25, space.utility)) : 0)
  );
};
export interface RankedAiAction {
  action: MatchAction;
  canonicalScore: number;
  deterministicNoise: number;
  score: number;
}
/** Canonical AI ranking; safe for diagnostics because its noise is seed-derived, not stateful RNG. */
export const rankAvailableActionsForAI = (
  state: TacticalMatchState,
  actorId: string,
): RankedAiAction[] => {
  const rng = RandomGenerator.fromSeed(`${state.seed}:decision:${state.decisionIndex}:${actorId}`);
  const actor = state.players.find((player) => player.id === actorId);
  const preferences = actor ? deriveTeamTacticalPreferences(state, actor.team) : undefined;
  return enumerateAvailableActions(state, actorId)
    .map((action) => {
      const canonicalScore = scoreActionForAI(state, actorId, action, preferences);
      const deterministicNoise = (rng.float() - 0.5) * 8;
      return {
        action,
        canonicalScore,
        deterministicNoise,
        score: canonicalScore + deterministicNoise,
      };
    })
    .sort((a, b) => b.score - a.score);
};
/** Reception is followed by scanning/control time in ordinary possession. Pressure, transitions
 * and a live scoring chance shorten that time, so rapid combinations remain contextual. This
 * delays the actual decision rather than reducing exported pass statistics. */
export const npcPossessionDecisionDelay = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const progress = fieldValue(actor.position, actor.team);
  const danger = Math.max(0, Math.min(1, state.currentPressure));
  const transition =
    state.teams[actor.team].phase === 'attacking_transition' &&
    progress > 55 &&
    state.timeSincePossessionChanged < 2;
  const scoringRange = progress > 82 && Math.abs(actor.position.y - 34) < 18;
  // Most pressure represents a nearby marker, not an imminent tackle. Only genuinely intense
  // pressure removes most scanning time; ordinary midfield possession gives support runs time.
  const patience = deriveTeamTacticalPreferences(state, actor.team).possessionPatience;
  const scanning = 4.2 + patience * 1.8 - danger * danger * danger * 4.8;
  const skill =
    (actor.profile.attributes.firstTouch +
      actor.profile.attributes.gameReading +
      actor.profile.attributes.composure) /
    300;
  return Math.max(
    0.35,
    Math.min(scanning, transition ? 1.05 : Infinity, scoringRange ? 0.65 : Infinity) +
      (0.55 - skill) * 0.4,
  );
};

export const chooseNpcAction = (
  state: TacticalMatchState,
  actorId: string,
): MatchAction | undefined => rankAvailableActionsForAI(state, actorId)[0]?.action;

/** Live routine play waits for contextual possession readiness. Explicit human/DEV choices and
 * pure AI policy inspection continue using the same unrestricted canonical action ranking. */
export const chooseNpcRoutineAction = (
  state: TacticalMatchState,
  actorId: string,
): MatchAction | undefined => {
  const actor = state.players.find((player) => player.id === actorId);
  if (!actor) return undefined;
  if (
    !isRestartSetup(state) &&
    state.ball.ownerId === actorId &&
    state.ballOwnershipStartedAt !== undefined &&
    state.time - state.ballOwnershipStartedAt < npcPossessionDecisionDelay(state, actor)
  )
    return undefined;
  return chooseNpcAction(state, actorId);
};

/** Reception is an alternative, not a mandatory preliminary action for NPC finishing. */
export const chooseIncomingShotAction = (
  state: TacticalMatchState,
  actorId: string,
): MatchAction | undefined => {
  const control: MatchAction = { type: 'hold', actorId };
  // The receiver has not yet possessed the ball. The previous carrier's completed scanning
  // clock must not devalue a fresh control and force every routine reception into a layoff.
  const controlValue = scoreActionForAI(
    { ...state, ballOwnershipStartedAt: state.time },
    actorId,
    control,
  );
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return undefined;
  return rankAvailableActionsForAI(state, actorId).find(
    ({ action, score }) =>
      (isShotAction(action)
        ? canExecuteCanonicalShot(state, action)
        : action.type === 'pass' && action.firstTime && canExecuteFirstTimePass(state, action)) &&
      score >
        controlValue +
          (action.type === 'pass'
            ? 18 +
              (1 - evaluatePressure(state, actor).value) * 18 +
              Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0) / 5 +
              Math.abs(
                normalizeAngle(
                  angleForVector({
                    x: action.target.x - actor.position.x,
                    y: action.target.y - actor.position.y,
                  }) - actor.facingAngle,
                ),
              ) *
                6
            : 0),
  )?.action;
};

/** Stale choices cannot install a decision for an actor/target outside the active roster.
 * A setup throw retains its existing deterministic legal-receiver fallback. */
export const hasActiveMatchActionParticipants = (
  state: TacticalMatchState,
  action: MatchAction,
) => {
  if (state.status === 'abandoned' || state.status === 'full_time' || state.status === 'half_time')
    return false;
  const actor = state.players.find((player) => player.id === action.actorId);
  if (!actor || !canParticipatePhysically(actor)) return false;
  if (action.type === 'pass')
    return (
      (state.scenario === 'throw_in' &&
        isRestartSetup(state) &&
        state.restart.takerId === actor.id) ||
      (action.receiverId !== actor.id &&
        state.players.some(
          (player) =>
            player.id === action.receiverId &&
            player.team === actor.team &&
            canParticipatePhysically(player),
        ))
    );
  if (action.type === 'challenge')
    return state.players.some(
      (player) =>
        player.id === action.opponentId &&
        player.team !== actor.team &&
        canParticipatePhysically(player),
    );
  if (action.type === 'cross' || action.type === 'header')
    return (
      !action.intendedTargetId ||
      state.players.some(
        (player) => player.id === action.intendedTargetId && canParticipatePhysically(player),
      )
    );
  return true;
};

export const resolveMatchAction = (
  state: TacticalMatchState,
  action: MatchAction,
  source: ActionSource = 'autonomous_npc',
): TacticalMatchState => {
  let next = resolveMatchActionCanonical(state, action, source);
  if (next === state) return state;
  if (isRestartSetup(state) && action.type !== 'hold' && next.decisionIndex > state.decisionIndex) {
    const restart = state.restart!;
    next = endStoppage({
      ...next,
      restartTouchRestriction: {
        awardId: restart.awardId ?? state.seed + ':restart:' + restart.startedAt,
        scenario: state.scenario,
        takerId: restart.takerId,
        team: restart.restartTeam,
        indirect: restart.indirect ?? false,
        touchedByOther: false,
      },
    });
  }
  // A reserved proposal is a request for human ownership, not a football action.
  // Preserve the ledger exactly, including absent or old retained entries.
  if (
    source !== 'human_selected' &&
    isShotAction(action) &&
    isHumanControlled(state, action.actorId)
  )
    return next;
  return emitCanonicalActionEvents(state, reconcileControlledBallContact(next));
};

const resolveMatchActionCanonical = (
  state: TacticalMatchState,
  action: MatchAction,
  source: ActionSource = 'autonomous_npc',
): TacticalMatchState => {
  // A cached UI/NPC choice must not resurrect a dismissed or otherwise unavailable actor.
  if (!hasActiveMatchActionParticipants(state, action)) return state;
  const actor = state.players.find((player) => player.id === action.actorId);
  if (!actor) return state;
  if (requiresHumanRestart(state, actor.id) && source !== 'human_selected') return state;

  if (state.restart?.origin === 'live_event' && isRestartSetup(state) && !state.restart.executing) {
    if (
      action.actorId !== state.restart.takerId ||
      !['pass', 'space_pass', 'cross', 'shot'].includes(action.type) ||
      (action.type === 'shot' && state.restart.indirect)
    )
      return state;
    return selectRestartAction(state, action, source);
  }
  // Last line of defence: no autonomous path (including DEV and restart recovery) may
  // manufacture a human shot. The pure agency projection exposes the same opportunity.
  if (isHumanControlled(state, actor.id) && isShotAction(action) && source !== 'human_selected')
    return !hasActiveHumanPossession(state) && canExecuteCanonicalShot(state, action)
      ? { ...state, shotAgencyRequest: action }
      : state;
  if (
    isRestartSetup(state) &&
    state.restart.indirect &&
    (action.type === 'shot' || (action.type === 'header' && action.intent === 'header_shot'))
  )
    return state;
  let spacePlan: SpacePassPlan | undefined;
  if (action.type === 'space_pass') {
    if (state.ball.ownerId !== actor.id || (isRestartSetup(state) && !state.restart?.executing))
      return state;
    spacePlan = deriveSpacePassPlan(state, actor, action.target);
    if (!spacePlan) return state;
    action = {
      type: 'pass',
      actorId: actor.id,
      receiverId: spacePlan.receiverId,
      target: spacePlan.requestedSpace,
      requestedSpace: spacePlan.requestedSpace,
      intent: spacePlan.intent,
      delivery: spacePlan.delivery,
    };
  }
  if (action.type === 'challenge') {
    if (
      source !== 'human_selected' &&
      source !== 'dev_ai_selected' &&
      hasPendingPlayerDecision(state, action.actorId)
    )
      return state;
    return beginDefensiveChallenge(state, action, source);
  }
  if (!canContactAfterThrowIn(state, action.actorId)) return state;
  const requestedThrow =
    isRestartSetup(state) && state.scenario === 'throw_in' && action.type === 'pass'
      ? action
      : undefined;
  let throwFallbackReason: ThrowInDiagnostic['fallbackReason'];
  if (isRestartSetup(state) && state.scenario === 'throw_in') {
    if (
      action.actorId !== state.restart.takerId ||
      action.type !== 'pass' ||
      action.receiverId === action.actorId
    )
      return state;
    const thrower = state.players.find((player) => player.id === action.actorId);
    if (!thrower) return state;
    const requestedReceiverId = action.receiverId;
    const selected = state.players.find((player) => player.id === requestedReceiverId);
    if (!selected || !isLegalThrowInReceiver(thrower, selected)) {
      throwFallbackReason = !selected
        ? 'receiver_missing'
        : selected.team !== thrower.team
          ? 'receiver_wrong_team'
          : 'receiver_out_of_range';
      const fallback = chooseRestartAction(state);
      if (!fallback || fallback.type !== 'pass') return state;
      action = fallback;
    }
    if (action.type !== 'pass') return state;
    const receiverId = action.receiverId;
    const receiver = state.players.find((player) => player.id === receiverId)!;
    const selectedAt = action.receiverPositionAtSelection;
    // Preserve selected space relative to its teammate when the receiver moved before release.
    const offset = selectedAt
      ? { x: action.target.x - selectedAt.x, y: action.target.y - selectedAt.y }
      : { x: 0, y: 0 };
    action = {
      ...action,
      target: clampPitchPoint({
        x: receiver.position.x + offset.x,
        y: receiver.position.y + offset.y,
      }),
    };
  }
  if (
    state.ball.ownerId !== action.actorId &&
    !(isShotAction(action)
      ? canExecuteCanonicalShot(state, action)
      : action.type === 'pass' && action.firstTime && canExecuteFirstTimePass(state, action))
  )
    return state;
  if (
    (action.type === 'shot' || (action.type === 'header' && action.intent === 'header_shot')) &&
    !canExecuteCanonicalShot(state, action)
  )
    return state;
  if (
    hasActiveHumanPossession(state) &&
    ['pass', 'shot', 'cross', 'header'].includes(action.type) &&
    source !== 'human_selected' &&
    source !== 'dev_ai_selected'
  )
    return state;
  // The current opportunity owns a meaningful choice; a controlled identity does not reserve
  // every shot/cross during autonomous circulation or after an explicit delegation.
  if (
    (action.type === 'shot' || action.type === 'cross') &&
    source !== 'human_selected' &&
    source !== 'dev_ai_selected' &&
    source !== 'restart_liveness_watchdog' &&
    hasPendingPlayerDecision(state, action.actorId)
  )
    return state;
  const restart =
    isRestartSetup(state) && action.type !== 'hold'
      ? { ...state.restart, phase: 'release' as const, executedAt: state.time }
      : state.restart;
  const offsideSnapshot = captureOffsideSnapshot(state, action);
  const consciouslySelected = source === 'human_selected' || source === 'dev_ai_selected';
  const prepared = consciouslySelected
    ? commitHumanPossessionDecision(state, action)
    : reconcileHumanPossession(state);
  const {
    ballCarrierIntent: _interruptedCarry,
    postActionAgencyCheckpoint: _checkpoint,
    shotAgencyRequest: _shotRequest,
    ...baseState
  } = prepared;
  void _interruptedCarry;
  void _checkpoint;
  void _shotRequest;
  if (action.type === 'hold')
    return {
      ...baseState,
      currentAction: action,
      latestAction: action,
      currentActionSource: source,
      latestActionSource: source,
      currentActorId: actor.id,
      // Scanning/orienting is canonical possession time, not a blanket delay after every touch.
      actionCooldown: 1.6,
      decisionIndex: state.decisionIndex + 1,
      ...(restart ? { restart } : {}),
    };
  if (action.type === 'carry') {
    const estimatedArrival = estimatePlayerArrivalTime(state, actor, action.target).estimatedTime;
    return {
      ...baseState,
      ballCarrierIntent: {
        actorId: actor.id,
        type: 'carry' as const,
        target: action.target,
        startedAt: state.time,
        estimatedArrival,
        startPosition: { ...actor.position },
        closestPointReached: { ...actor.position },
        humanSelected: consciouslySelected,
        movementMode: action.movementMode ?? 'carry',
        lastProgressAt: state.time,
        // Arrival is the primary lifetime; this bounded margin is only a safety net.
        expiresAt:
          state.time +
          (action.movementMode === 'retain'
            ? 8
            : Math.min(12, Math.max(1.8, estimatedArrival + 1.25))),
      },
      currentAction: action,
      latestAction: action,
      currentActionSource: source,
      latestActionSource: source,
      currentActorId: actor.id,
      actionCooldown: 1.3,
      decisionIndex: state.decisionIndex + 1,
      ...(consciouslySelected && action.actorId === state.controlledFootballerId
        ? {
            postActionAgencyCheckpoint: {
              actorId: actor.id,
              completedAction: 'carry' as const,
              at: state.time,
            },
          }
        : {}),
      ...(restart ? { restart } : {}),
    };
  }
  if (action.type === 'shot') {
    const shot = resolveCanonicalShot(
      {
        ...state,
        decisionIndex: state.decisionIndex + 1,
        currentPressure: evaluateShootingOpportunity(state, actor).pressure,
      },
      action,
    );
    const direction = actor.team === 'home' ? 1 : -1;
    const target = { ...shot.goalPoint, x: shot.goalPoint.x + direction * 2 };
    const duration = Math.max(0.28, distance(actor.position, target) / shot.speed);
    const shotElevation = shot.launchElevation;
    const shotVelocity = shot.launchVelocity;
    const penaltyReleased = state.scenario === 'penalty' && restart?.phase === 'release';
    const { restart: _shotRestart, ...shotBaseState } = baseState;
    void _shotRestart;
    return {
      ...shotBaseState,
      ...(penaltyReleased
        ? {
            scenario: 'open_play' as const,
            teams: {
              home: {
                ...state.teams.home,
                phase:
                  actor.team === 'home'
                    ? ('attacking_transition' as const)
                    : ('defensive_transition' as const),
                phaseElapsed: 0,
              },
              away: {
                ...state.teams.away,
                phase:
                  actor.team === 'away'
                    ? ('attacking_transition' as const)
                    : ('defensive_transition' as const),
                phaseElapsed: 0,
              },
            },
          }
        : {}),
      ball: {
        x: state.ball.x,
        y: state.ball.y,
        from: { x: state.ball.x, y: state.ball.y },
        target,
        travelKind: 'shot',
        sourceAction: action.type,
        flightTime: 0,
        distanceTravelled: 0,
        targetHeight: Math.max(0, shot.heightMetres),
        shot,
        height: state.ball.height ?? 0,
        releaseHeight: state.ball.height ?? 0,
        airborne: true,
        velocity: shotVelocity,
        spin: shot.launchSpin,
        launchVelocity: shotVelocity,
        launchSpeed: shot.speed,
        launchElevation: shotElevation,
        bounceCount: 0,
        lastTouchPlayerId: actor.id,
      },
      currentAction: action,
      latestAction: action,
      currentActionSource: source,
      latestActionSource: source,
      currentActorId: actor.id,
      actionCooldown: duration + 0.45,
      decisionIndex: state.decisionIndex + 1,
      ...(restart && !penaltyReleased ? { restart, restartAction: action } : {}),
    };
  }
  if (action.type === 'cross' || action.type === 'header') {
    const length = distance(actor.position, action.target);
    const isHeaderShot = action.type === 'header' && action.intent === 'header_shot';
    const headerShot =
      action.type === 'header' && isHeaderShot
        ? resolveCanonicalShot(
            {
              ...state,
              decisionIndex: state.decisionIndex + 1,
              currentPressure: evaluateShootingOpportunity(state, actor).pressure,
            },
            action,
          )
        : undefined;
    const crossPlan =
      action.type === 'cross' && action.intent !== 'cutback'
        ? deriveAerialLaunchPlan(
            state.ball,
            action.target,
            action.intent === 'floated' ? 'cross' : 'driven_cross',
            {
              ability: (actor.profile.attributes.passing + actor.profile.attributes.technique) / 2,
              arrivalHeight:
                action.intent === 'floated' ? 1.9 : action.intent === 'driven' ? 0.65 : 0.2,
              executionError:
                action.intent === 'floated' ? 0.2 : action.intent === 'driven' ? -0.7 : -1,
            },
          )
        : undefined;
    const duration =
      crossPlan?.predictedFlightTime ??
      Math.max(
        0.35,
        headerShot
          ? length / headerShot.speed
          : length / (action.type === 'cross' && action.intent === 'floated' ? 18 : 25),
      );
    const headerTarget = headerShot
      ? {
          ...headerShot.goalPoint,
          x: headerShot.goalPoint.x + (actor.team === 'home' ? 2 : -2),
        }
      : action.target;
    const launchSpeed =
      headerShot?.speed ??
      crossPlan?.speed ??
      (action.type === 'header'
        ? action.intent === 'header_clearance'
          ? 24
          : action.intent === 'flick'
            ? 10
            : 14
        : action.intent === 'floated'
          ? 22
          : 27);
    const elevation = headerShot
      ? headerShot.launchElevation
      : (crossPlan?.elevation ??
        (action.intent === 'floated' ? 0.42 : action.intent === 'driven' ? 0.2 : 0.1));
    const launchVelocity =
      headerShot?.launchVelocity ??
      crossPlan?.velocity ??
      deriveLaunchVelocity(
        action.type === 'header' ? state.ball : actor.position,
        headerTarget,
        launchSpeed,
        elevation,
      );
    return {
      ...baseState,
      ball: {
        x: state.ball.x,
        y: state.ball.y,
        from: { x: state.ball.x, y: state.ball.y },
        target: { ...headerTarget },
        ...(action.intendedTargetId ? { intendedReceiverId: action.intendedTargetId } : {}),
        travelKind:
          action.type === 'cross'
            ? state.scenario === 'corner'
              ? 'corner_delivery'
              : state.scenario.startsWith('free_kick')
                ? 'free_kick_delivery'
                : 'cross'
            : 'header',
        sourceAction: action.type,
        flightTime: 0,
        distanceTravelled: 0,
        ...(headerShot
          ? { targetHeight: Math.max(0, headerShot.heightMetres), shot: headerShot }
          : {}),
        height: action.type === 'header' ? (state.ball.height ?? 0) : 0,
        ...(action.type === 'header' ? { releaseHeight: state.ball.height ?? 0 } : {}),
        airborne: true,
        velocity: launchVelocity,
        launchVelocity,
        launchSpeed,
        launchElevation: elevation,
        bounceCount: 0,
        lastTouchPlayerId: actor.id,
      },
      currentAction: action,
      latestAction: action,
      currentActionSource: source,
      latestActionSource: source,
      currentActorId: actor.id,
      actionCooldown: duration + 0.35,
      decisionIndex: state.decisionIndex + 1,
      ...(offsideSnapshot ? { offsideSnapshot } : {}),
      ...(restart ? { restart, restartAction: action } : {}),
    };
  }
  const receiverId = action.receiverId;
  const receiver = state.players.find((p) => p.id === receiverId)!;
  const projection = spacePlan
    ? {
        releaseTarget: spacePlan.requestedSpace,
        expectedReceptionPoint: spacePlan.requestedSpace,
        semanticIntent: spacePlan.intent,
        launchPlan: spacePlan.launchPlan,
        receiverReadiness: spacePlan.launchPlan.receiverReadiness,
        receiverAwarenessDelay: spacePlan.launchPlan.receiverReadiness.awareAt,
        estimatedReceiverArrival: spacePlan.receiverArrival,
        leadDistance: distance(receiver.position, spacePlan.requestedSpace),
        receiverMovement: 'continue_run' as const,
        predictionHorizon: spacePlan.predictionHorizon,
      }
    : state.scenario === 'throw_in'
      ? undefined
      : projectPassReception(state, actor, receiver, action.intent, action.delivery);
  if (projection && projection.semanticIntent !== action.intent)
    action = { ...action, intent: projection.semanticIntent };
  const target = projection?.releaseTarget ?? action.target;
  const selectionQuality = evaluatePassDecision(
    state,
    actor,
    receiver,
    target,
    action.intent,
    action.delivery,
    projection?.launchPlan,
    Boolean(action.firstTime),
  );
  const execution = interpretPassExecution(
    state,
    actor,
    target,
    action.intent,
    action.delivery ?? 'ground',
    {
      firstTime: Boolean(action.firstTime),
      spatial: Boolean(action.requestedSpace) || action.intent === 'through',
      receiverSpeed: Math.hypot(receiver.velocity.x, receiver.velocity.y),
    },
  );
  const episode = `${state.seed}:pass:${state.decisionIndex}:${actor.id}`;
  const isThrowIn =
    isRestartSetup(state) && restart?.phase === 'release' && state.scenario === 'throw_in';
  const isLongDistribution =
    isRestartSetup(state) && restart?.phase === 'release' && state.scenario === 'goal_kick';
  const releasePosition = { x: state.ball.x, y: state.ball.y };
  const canonicalPlan =
    spacePlan?.launchPlan ??
    (action.delivery === 'lofted'
      ? derivePassLaunchPlan(state, actor, receiver, target, action.intent, 'lofted')
      : (projection?.launchPlan ??
        derivePassLaunchPlan(state, actor, receiver, target, action.intent)));
  const throwPlan = isThrowIn
    ? deriveAerialLaunchPlan(releasePosition, target, 'throw_in', {
        ability: (actor.profile.attributes.passing + actor.profile.attributes.technique) / 2,
      })
    : undefined;
  const distributionPlan = isLongDistribution
    ? deriveAerialLaunchPlan(releasePosition, execution.physicalTarget, 'long_pass', {
        ability: actor.profile.attributes.goalkeeperKicking,
      })
    : undefined;
  const duration =
    throwPlan?.predictedFlightTime ??
    distributionPlan?.predictedFlightTime ??
    canonicalPlan.predictedArrivalTime;
  const throwReadiness = isThrowIn
    ? projectReceiverReadiness(state, receiver, target, duration, 'support')
    : undefined;
  // Range error changes energy, but cannot manufacture unlimited foot speed from a bad aim.
  // Preserve the ordinary launch planner's 30 m/s physical ceiling.
  const sampledSpeed = Math.min(
    30,
    canonicalPlan.speed *
      Math.sqrt(
        Math.max(
          0.05,
          distance(releasePosition, execution.physicalTarget) /
            Math.max(0.1, distance(releasePosition, execution.intendedTarget)),
        ),
      ),
  );
  const launchSpeed = throwPlan?.speed ?? distributionPlan?.speed ?? sampledSpeed;
  const launchElevation =
    throwPlan?.elevation ?? distributionPlan?.elevation ?? canonicalPlan.elevation;
  const launchVelocity =
    throwPlan?.velocity ??
    distributionPlan?.velocity ??
    deriveLaunchVelocity(
      releasePosition,
      execution.physicalTarget,
      sampledSpeed,
      canonicalPlan.elevation,
    );
  const defenders = state.players.filter((p) => p.team !== actor.team);
  const bestDefenderArrival = Math.min(
    ...defenders.map(
      (p) => distance(p.position, target) / Math.max(2.5, 2.6 + p.profile.attributes.pace * 0.042),
    ),
  );
  return {
    ...baseState,
    ball: {
      x: state.ball.x,
      y: state.ball.y,
      from: releasePosition,
      target: throwPlan ? { ...target } : { ...execution.physicalTarget },
      intendedReceiverId: receiver.id,
      travelKind: isThrowIn
        ? 'throw_in'
        : isLongDistribution
          ? 'long_distribution'
          : action.intent === 'through'
            ? 'through_ball'
            : 'pass',
      sourceAction: action.requestedSpace ? 'space_pass' : action.type,
      executionType: execution.type,
      flightTime: 0,
      distanceTravelled: 0,
      ...(isThrowIn ? { releaseHeight: 1.9 } : {}),
      height: isThrowIn ? 1.9 : 0,
      airborne:
        isThrowIn ||
        isLongDistribution ||
        action.delivery === 'lofted' ||
        canonicalPlan.elevation > 0,
      velocity: launchVelocity,
      launchVelocity,
      launchSpeed,
      launchElevation,
      bounceCount: 0,
      lastTouchPlayerId: actor.id,
    },
    currentAction: action,
    latestAction: action,
    currentActionSource: source,
    latestActionSource: source,
    currentActorId: actor.id,
    actionCooldown: duration + 0.35,
    decisionIndex: state.decisionIndex + 1,
    ...(projection
      ? {
          receptionPreparation: receptionPreparationSchema.parse({
            actorId: receiver.id,
            sourceActorId: actor.id,
            releasedAt: state.time,
            awarenessAt: state.time + projection.receiverAwarenessDelay,
            expectedContactPoint: projection.expectedReceptionPoint,
            expectedArrivalTime: state.time + duration,
            movement:
              projection.receiverMovement === 'hold'
                ? 'wait'
                : projection.receiverMovement === 'meet_ball'
                  ? 'meet_ball'
                  : 'run_onto_ball',
            ballEpisode: episode,
            readiness: projection.receiverReadiness,
          }),
          lastPassDiagnostic: {
            receiverRelationshipAtRelease: deriveFlankRelationship(state, receiver),
            ...(action.firstTime
              ? {
                  actionSource: source,
                  incomingSpeed: execution.incomingSpeed ?? 0,
                  incomingHeight: execution.incomingHeight ?? 0,
                }
              : {}),
            selectionQuality,
            intendedTarget: execution.intendedTarget,
            physicalTarget: execution.physicalTarget,
            executionQuality: execution.quality,
            passId: episode,
            passerId: actor.id,
            intendedReceiverId: receiver.id,
            releasedAt: state.time,
            receiverPositionAtRelease: { ...receiver.position },
            receiverVelocityAtRelease: { ...receiver.velocity },
            predictedReceptionPoint: projection.expectedReceptionPoint,
            awarenessDelay: projection.receiverAwarenessDelay,
            receiverArrivalEstimate: projection.estimatedReceiverArrival,
            bestDefenderArrivalEstimate: Number.isFinite(bestDefenderArrival)
              ? bestDefenderArrival
              : 99,
            leadDistance: projection.leadDistance,
            intent: projection.semanticIntent,
            executionType: execution.type,
            delivery: action.delivery ?? 'ground',
            ...(action.requestedSpace ? { requestedSpace: action.requestedSpace } : {}),
            ballArrivalEstimate: duration,
            meetingErrorSeconds: projection.estimatedReceiverArrival - duration,
            predictionHorizon: projection.predictionHorizon,
          },
        }
      : {
          ...(throwReadiness
            ? {
                receptionPreparation: receptionPreparationSchema.parse({
                  actorId: receiver.id,
                  sourceActorId: actor.id,
                  releasedAt: state.time,
                  awarenessAt: state.time + throwReadiness.awareAt,
                  expectedContactPoint: target,
                  expectedArrivalTime: state.time + duration,
                  movement: distance(receiver.position, target) < 0.6 ? 'wait' : 'meet_ball',
                  ballEpisode: episode,
                  readiness: throwReadiness,
                }),
              }
            : {}),
          lastPassDiagnostic: {
            receiverRelationshipAtRelease: deriveFlankRelationship(state, receiver),
            selectionQuality,
            intendedTarget: execution.intendedTarget,
            physicalTarget: execution.physicalTarget,
            executionQuality: execution.quality,
            passId: episode,
            passerId: actor.id,
            intendedReceiverId: receiver.id,
            releasedAt: state.time,
            receiverPositionAtRelease: { ...receiver.position },
            receiverVelocityAtRelease: { ...receiver.velocity },
            predictedReceptionPoint: target,
            awarenessDelay: throwReadiness?.awareAt ?? 0,
            receiverArrivalEstimate: duration,
            bestDefenderArrivalEstimate: Number.isFinite(bestDefenderArrival)
              ? bestDefenderArrival
              : 99,
            leadDistance: distance(receiver.position, target),
            intent: action.intent,
            executionType: execution.type,
            delivery: action.delivery ?? 'ground',
            ...(action.requestedSpace ? { requestedSpace: action.requestedSpace } : {}),
            ballArrivalEstimate: throwPlan?.predictedFlightTime ?? duration,
          },
        }),
    ...(offsideSnapshot ? { offsideSnapshot } : {}),
    ...(restart ? { restart, restartAction: action } : {}),
    ...(isThrowIn
      ? {
          throwInRestriction: { throwerId: actor.id, releasedAt: state.time },
          lastThrowInDiagnostic: throwInDiagnosticSchema.parse({
            throwerId: actor.id,
            requestedReceiverId: requestedThrow?.receiverId ?? receiver.id,
            chosenReceiverId: receiver.id,
            requestedTarget: requestedThrow?.target ?? target,
            releaseTarget: target,
            actualReleaseVector: launchVelocity,
            releasedAt: state.time,
            ...(throwFallbackReason ? { fallbackReason: throwFallbackReason } : {}),
          }),
        }
      : {}),
  };
};

export const enumerateRestartActions = enumerateContextualRestartActions;

export const chooseRestartAction = (state: TacticalMatchState): MatchAction | undefined => {
  const restart = state.restart;
  if (!restart) return undefined;
  const spot = restart.spot ?? state.ball;
  const projected = {
    ...state,
    ball: { ...state.ball, ...spot, ownerId: restart.takerId },
    players: state.players.map((player) =>
      player.id === restart.takerId ? { ...player, position: spot } : player,
    ),
  };
  return enumerateRestartActions(state)
    .map((action, index) => ({
      action,
      index,
      score: scoreActionForAI(projected, action.actorId, action),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.action;
};
