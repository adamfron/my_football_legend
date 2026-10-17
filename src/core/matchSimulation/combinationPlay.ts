import type { MatchAction, MatchPlayerState, TacticalMatchState } from './matchState';
import type { CombinationIntent, CombinationResult } from './combinationState';
import {
  attacksRight,
  clampPitchPoint,
  distance,
  distanceToSegment,
  signedForwardDistance,
} from './matchSpace';
import { isHumanControlled } from './actionAgency';
import { canParticipatePhysically } from './matchInjuries';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { isRestartSetup } from './restartPhase';
import {
  deriveBuildUpSupport,
  deriveFlankRunAssignments,
  calculateOffsideLine,
  constrainTargetOnside,
  applyRoleRelationships,
} from './tacticalPositioning';
import { deriveMovementCapability } from './locomotion';
import { projectDynamicIntervention, earliestDynamicIntervention } from './dynamicIntervention';
import { projectPassReception } from './passReception';
import { evaluatePassDecision } from './passDecision';

const available = (state: TacticalMatchState, p: MatchPlayerState) =>
  canParticipatePhysically(p) && !state.discipline?.[p.id]?.sentOff;
const live = (state: TacticalMatchState) =>
  state.scenario === 'open_play' &&
  !isRestartSetup(state) &&
  !state.postGoal &&
  !['half_time', 'full_time', 'abandoned'].includes(state.status ?? '');
const onside = (state: TacticalMatchState, p: MatchPlayerState) => {
  const line = calculateOffsideLine(state, p.team);
  return attacksRight(p)
    ? p.position.x <= Math.max(52.5, line) + 0.01
    : p.position.x >= Math.min(52.5, line) - 0.01;
};
const finish = (
  state: TacticalMatchState,
  result: CombinationResult['result'],
): TacticalMatchState => {
  if (!state.combinationIntent) return state;
  const { combinationIntent, ...rest } = state;
  const runner = state.players.find((p) => p.id === combinationIntent.runnerId);
  return {
    ...rest,
    lastCombination: {
      ...combinationIntent,
      ...(runner ? { runMetres: distance(runner.position, combinationIntent.origin) } : {}),
      result,
      endedAt: state.time,
    },
  };
};

/** Cheap lifetime/contact validation. No candidate search or hidden rollouts on physics ticks. */
export const reconcileCombination = (state: TacticalMatchState): TacticalMatchState => {
  let intent = state.combinationIntent;
  if (!intent) return state;
  if (!live(state)) return finish(state, 'restart');
  if (state.possessionTeam !== intent.team) return finish(state, 'possession_lost');
  if (state.time >= intent.expiresAt) return finish(state, 'expired');
  const participants = [intent.initiatorId, intent.partnerId, intent.runnerId].map((id) =>
    state.players.find((p) => p.id === id),
  );
  if (participants.some((p) => !p || !available(state, p)))
    return finish(state, 'participant_unavailable');
  const runner = participants[2]!;
  const human = state.playerMovementIntent;
  if (
    isHumanControlled(state, runner.id) &&
    (!human || human.actorId !== runner.id || distance(human.target, intent.target) > 3)
  )
    return finish(state, 'human_command');
  const metres = distance(runner.position, intent.origin);
  if (
    intent.runStartedAt === undefined &&
    metres >= 0.8 &&
    Math.hypot(runner.velocity.x, runner.velocity.y) > 1 &&
    distance(intent.origin, intent.target) - distance(runner.position, intent.target) > 0.4 &&
    (intent.kind !== 'pass_and_go' ||
      signedForwardDistance(intent.origin, runner.position, runner) > 0.4)
  )
    intent = { ...intent, runStartedAt: state.time, runMetres: metres };
  // Keep only physically observed milestones, not a per-tick historical track.
  const passId = intent.continuationPassId ?? intent.firstPassId;
  const pass = [state.lastResolvedPass, state.lastPassDiagnostic].find(
    (p) => p?.passId === passId && p.resolvedAt !== undefined,
  );
  if (pass) {
    if (pass.finalResult !== 'completed')
      return finish({ ...state, combinationIntent: intent }, 'contact_failed');
    if (intent.phase === 'continuation_flight')
      return finish(
        { ...state, combinationIntent: { ...intent, runMetres: metres } },
        pass.actualReceiverId === intent.runnerId ? 'completed' : 'alternative_selected',
      );
    if (intent.phase === 'first_flight') {
      if (pass.actualReceiverId !== intent.partnerId) return finish(state, 'alternative_selected');
      intent = { ...intent, phase: 'available', firstCompletedAt: pass.resolvedAt };
    }
  }
  if (state.ball.ownerId && ![intent.partnerId, intent.runnerId].includes(state.ball.ownerId))
    return finish(state, 'alternative_selected');
  if (
    intent.phase !== 'continuation_flight' &&
    distance(runner.position, intent.target) >
      deriveMovementCapability(runner).maximumSprintSpeed * (intent.expiresAt - state.time) + 1
  )
    return finish(state, 'unreachable');
  return intent === state.combinationIntent ? state : { ...state, combinationIntent: intent };
};

/** Creation runs once after a real pass release. Intended roles never award the next contact. */
export const observeCombinationRelease = (
  previous: TacticalMatchState,
  released: TacticalMatchState,
): TacticalMatchState => {
  let next = reconcileCombination(released);
  if (
    next.combinationIntent &&
    next.decisionIndex > previous.decisionIndex &&
    next.ball.lastTouchPlayerId === next.combinationIntent.partnerId &&
    ['shot', 'cross', 'header'].includes(next.latestAction?.type ?? '') &&
    next.ball.travelKind
  )
    next = finish(next, 'alternative_selected');
  const pass = next.lastPassDiagnostic;
  if (
    !pass ||
    pass.passId === previous.lastPassDiagnostic?.passId ||
    pass.releasedAt !== next.time ||
    !live(previous)
  )
    return next;
  const active = next.combinationIntent;
  if (active && pass.passerId === active.partnerId && active.phase !== 'continuation_flight') {
    if (pass.intendedReceiverId === active.runnerId && active.runStartedAt !== undefined)
      return {
        ...next,
        combinationIntent: {
          ...active,
          phase: 'continuation_flight',
          continuationPassId: pass.passId,
          expiresAt: Math.min(
            active.startedAt + 6,
            next.time + (pass.ballArrivalEstimate ?? 1) + 0.8,
          ),
        },
      };
    next = finish(next, 'alternative_selected');
  }
  if (next.combinationIntent) return next;
  const a = previous.players.find((p) => p.id === pass.passerId),
    b = previous.players.find((p) => p.id === pass.intendedReceiverId);
  if (
    !a ||
    !b ||
    !available(previous, a) ||
    !available(previous, b) ||
    distance(a.position, b.position) > 28 ||
    distance(a.position, b.position) < 4 ||
    (pass.selectionQuality?.expectedCompletion ?? 0) < 0.5 ||
    (pass.selectionQuality?.expectedRetainedPossession ?? 0) < 0.32
  )
    return next;
  const dir = attacksRight(a) ? 1 : -1;
  const foes = previous.players.filter((p) => p.team !== a.team && available(previous, p));
  const restCover = previous.players.filter(
    (p) =>
      p.team === a.team &&
      available(previous, p) &&
      p.id !== a.id &&
      p.id !== b.id &&
      !isMatchGoalkeeper(p) &&
      signedForwardDistance(p.position, a.position, a) > 5,
  ).length;
  const candidates: {
    runner: MatchPlayerState;
    target: { x: number; y: number };
    kind: CombinationIntent['kind'];
  }[] = [];
  const nearbyPresser = foes.some((p) => distance(p.position, a.position) < 9);
  const humanRun =
    previous.playerMovementIntent?.actorId === a.id ? previous.playerMovementIntent : undefined;
  if (
    !isMatchGoalkeeper(a) &&
    a.duty !== 'defend' &&
    restCover >= 2 &&
    nearbyPresser &&
    (attacksRight(a) ? a.position.x : 105 - a.position.x) > 32 &&
    (!isHumanControlled(previous, a.id) || humanRun)
  ) {
    const metres = Math.min(10, 4 + deriveMovementCapability(a).runSpeed * 0.7);
    for (const lateral of [0, -4, 4])
      candidates.push({
        runner: a,
        kind: 'pass_and_go',
        target:
          humanRun?.target ??
          clampPitchPoint({ x: a.position.x + dir * metres, y: a.position.y + lateral }),
      });
  }
  // Preserve the actual existing third-man/flank assignment across the owner change.
  for (const assignment of deriveBuildUpSupport(previous, a.team)
    .filter((s) => s.role === 'third_man')
    .slice(0, 1)) {
    const runner = previous.players.find((p) => p.id === assignment.playerId)!;
    if (runner.id !== b.id && restCover >= 2)
      candidates.push({ runner, target: assignment.target, kind: 'third_man' });
  }
  for (const assignment of deriveFlankRunAssignments(previous, a.team)) {
    if (assignment.relationship === 'provide_width') continue;
    const runner = previous.players.find((p) => p.id === assignment.playerId)!;
    if (runner.id !== b.id)
      candidates.push({
        runner,
        target: applyRoleRelationships(previous, runner, runner.idealTarget ?? runner.target),
        kind: assignment.relationship,
      });
  }
  const usefulMovement = (
    runner: MatchPlayerState,
    target: { x: number; y: number },
    kind: CombinationIntent['kind'],
  ) =>
    kind === 'third_man'
      ? distance(runner.position, target) > 2 && signedForwardDistance(b.position, target, b) > 2
      : signedForwardDistance(runner.position, target, runner) > 2;
  const viable = candidates
    .filter(
      ({ runner, target, kind }) =>
        available(previous, runner) &&
        onside(previous, runner) &&
        (!isHumanControlled(previous, runner.id) || humanRun?.actorId === runner.id) &&
        usefulMovement(runner, target, kind) &&
        distance(runner.position, target) < 17,
    )
    .map((candidate) => {
      const target = constrainTargetOnside(
        candidate.target,
        calculateOffsideLine(previous, a.team),
        candidate.runner,
      );
      const clearance = Math.min(15, ...foes.map((p) => distance(p.position, target)));
      const lane = Math.min(
        6,
        ...foes.map((p) => distanceToSegment(p.position, b.position, target)),
      );
      return {
        ...candidate,
        target,
        score: clearance + lane - distance(candidate.runner.position, target) * 0.2,
      };
    })
    .filter((c) => c.score > 2 && usefulMovement(c.runner, c.target, c.kind))
    .sort((a, b) => b.score - a.score || a.runner.id.localeCompare(b.runner.id));
  // At most two distinct runners: an infeasible wide job must not hide a feasible passer run.
  const shortlisted = viable
    .filter((c, i) => viable.findIndex((p) => p.runner.id === c.runner.id) === i)
    .slice(0, 2);
  const best = shortlisted.find((candidate) => {
    const capability = deriveMovementCapability(candidate.runner);
    const arrival = projectDynamicIntervention(
      candidate.runner,
      candidate.target,
      capability.runSpeed,
    );
    const defender = earliestDynamicIntervention(previous, candidate.runner, candidate.target);
    return arrival.reached && defender.seconds >= arrival.seconds + 0.12;
  });
  if (!best) return next;
  return {
    ...next,
    combinationIntent: {
      id: `${pass.passId}:combination`,
      team: a.team,
      kind: best.kind,
      initiatorId: a.id,
      partnerId: b.id,
      runnerId: best.runner.id,
      firstPassId: pass.passId,
      startedAt: next.time,
      expiresAt: next.time + Math.min(4.5, Math.max(2.5, (pass.ballArrivalEstimate ?? 1) + 2.2)),
      origin: { ...best.runner.position },
      target: best.target,
      phase: 'first_flight',
      runMetres: 0,
    },
  };
};

/** Shared candidate recognition: a genuine moving runner still goes through ordinary launch,
 * interception, receiving and offside assessment. No role-based utility bonus. */
export const enumerateCombinationPasses = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
): MatchAction[] => {
  const intent = state.combinationIntent;
  if (
    !intent ||
    intent.partnerId !== passer.id ||
    intent.phase === 'continuation_flight' ||
    intent.runStartedAt === undefined ||
    state.time >= intent.expiresAt
  )
    return [];
  const runner = state.players.find((p) => p.id === intent.runnerId);
  if (!runner || !available(state, runner) || !onside(state, runner)) return [];
  const projection = projectPassReception(state, passer, runner, 'lead');
  const q = evaluatePassDecision(
    state,
    passer,
    runner,
    projection.releaseTarget,
    projection.semanticIntent,
    'ground',
    projection.launchPlan,
  );
  if (
    q.targetPredictedOutOfPlay ||
    q.receiverLateBy > 0.3 ||
    q.defenderEta < q.receiverEta + 0.12 ||
    q.laneOccupation > 0 ||
    q.expectedRetainedPossession! < 0.35
  )
    return [];
  return [
    {
      type: 'pass',
      actorId: passer.id,
      receiverId: runner.id,
      target: projection.releaseTarget,
      intent: projection.semanticIntent,
    },
  ];
};

/** Correct the old stale-return test only when the original passer actually ran and the
 * current independent physical pass assessment says the new lane remains usable. */
export const isMovingCombinationReturn = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  receiver: MatchPlayerState,
) => {
  const c = state.combinationIntent;
  return Boolean(
    c &&
      c.kind === 'pass_and_go' &&
      c.partnerId === actor.id &&
      c.runnerId === receiver.id &&
      c.runStartedAt !== undefined &&
      state.time < c.expiresAt &&
      distance(receiver.position, c.origin) >= 1.6,
  );
};
