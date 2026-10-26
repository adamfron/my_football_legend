import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { matchActionSchema } from './matchState';
import {
  boundedPolicySchema,
  boundedRuntimeSchema,
  usesBoundedIntelligence,
} from './boundedIntelligenceState';
import { boundedSceneSchema, observeBoundedScene, type BoundedScene } from './boundedPerception';
import {
  constructBoundedCandidates,
  runBoundedPolicy,
  intentFromDecision,
  boundedDecisionSchema,
  boundedCandidateSchema,
} from './boundedDecision';
import {
  familiaritySchema,
  recognisePattern,
  tacticalObservationSchema,
} from './tacticalCognition';
import { tacticalRoleFor } from './tacticalRoles';
import { clampPitchPoint, distance } from './matchSpace';
import { updateOpponentKnowledge } from './opponentKnowledge';
import { angleForVector } from './playerOrientation';

export const boundedTraceSchema = z.object({
  candidates: z.array(boundedCandidateSchema).max(48).optional(),
  stage: z.enum(['decision', 'pattern', 'attempt']),
  at: z.number(),
  actorId: z.string(),
  decision: boundedDecisionSchema.optional(),
  scene: boundedSceneSchema.optional(),
  action: matchActionSchema.optional(),
  reason: z.string(),
  released: z.boolean().optional(),
  actualChange: z.boolean().optional(),
  preparationMargin: z.number().optional(),
  contactFailure: z
    .enum([
      'not_prepared',
      'not_owner',
      'height',
      'out_of_reach',
      'motor_recovery',
      'wrong_foot',
      'canonical_rules',
      'executed_without_release',
    ])
    .optional(),
});
export type BoundedTrace = z.infer<typeof boundedTraceSchema>;
type Observer = (trace: Readonly<BoundedTrace>) => void;
let observer: Observer | undefined;
export const withBoundedObserver = <T>(next: Observer | undefined, run: () => T): T => {
  const previous = observer;
  observer = next;
  try {
    return run();
  } finally {
    observer = previous;
  }
};
export const observeBoundedTrace = (trace: BoundedTrace) => {
  // The observer receives no world object and cannot mutate the decision or action.
  if (observer) observer(boundedTraceSchema.parse(trace));
};
export const inspectBoundedAction = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const scene = observeBoundedScene(state, actor),
    candidates = constructBoundedCandidates(scene);
  const decision = runBoundedPolicy(boundedPolicySchema.parse(state.decisionPolicy), {
    scene,
    candidates,
  });
  return {
    scene,
    candidates,
    decision,
    action: candidates.find((c) => c.id === decision.selectedCandidateId)?.action,
  };
};
/** Scheduler state is explicit and serialisable; diagnostic inspection remains pure. */
export const boundedDecisionSignature = (s: BoundedScene) =>
  JSON.stringify([
    s.signature,
    s.ball?.ownerId,
    s.contactReady,
    Math.round((s.ball?.height ?? 0) * 2),
    s.scoreDifference,
    Math.round(
      Math.min(
        36,
        ...s.visible.filter((p) => p.team !== s.team).map((p) => distance(p.position, s.position)),
      ) * 2,
    ),
    s.visible.map((p) => [
      p.id,
      Math.round(p.position.x / 3),
      Math.round(p.position.y / 3),
      Math.round(p.velocity.x / 2),
      Math.round(p.velocity.y / 2),
    ]),
  ]);
export const advanceBoundedOwnerDecision = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const runtime = state.boundedRuntime ?? boundedRuntimeSchema.parse({});
  const perception =
    0.3 -
    ((actor.profile.attributes.gameReading + actor.profile.attributes.concentration) / 200) * 0.18;
  if (state.time < (state.ballOwnershipStartedAt ?? state.time) + perception)
    return { state, action: undefined };
  const scene = observeBoundedScene(state, actor),
    signature = boundedDecisionSignature(scene);
  // Reconsider meaningful bounded evidence sooner than unchanged geometry.
  // Quiet review depends on the player's perception/fatigue and the OWN previous
  // action. Preparation and actual feet remain authoritative, with no universal
  // decision timer and no full-state signature borrowed from the old policies.
  const quietReview =
    runtime.lastAction === 'hold'
      ? perception * (2 + scene.fatigue)
      : runtime.lastAction === 'carry'
        ? perception * (1.4 + scene.fatigue)
        : Math.max(perception, scene.readyAt - scene.at);
  // A deliberated release already has a preparation intention. Its first playable
  // contact is a motor event, not a new visual observation requiring another full
  // perception latency. Revalidate current visible candidates below; no stale kick
  // is guaranteed and finite foot recovery still gates scene.contactReady.
  const preparedContact =
    runtime.lastActorId === actor.id &&
    runtime.preparationCandidateId != null &&
    scene.contactReady;
  if (
    !preparedContact &&
    runtime.lastActorId === actor.id &&
    state.time - runtime.lastDecisionAt <
      (signature !== runtime.decisionSignature ? perception : quietReview) - 1e-8
  )
    return { state, action: undefined };
  const candidates = constructBoundedCandidates(scene);
  const decision = runBoundedPolicy(boundedPolicySchema.parse(state.decisionPolicy), {
    scene,
    candidates,
  });
  const result = {
    scene,
    decision,
    action: candidates.find((c) => c.id === decision.selectedCandidateId)?.action,
  };
  const next = {
    ...state,
    boundedRuntime: {
      ...runtime,
      lastActorId: actor.id,
      lastDecisionAt: state.time,
      decisionSignature: signature,
      lastAction: boundedRuntimeSchema.shape.lastAction.parse(result.action?.type ?? 'none'),
      intent: intentFromDecision(result.scene, result.decision),
      preparationCandidateId: result.decision.preparationCandidateId,
    },
  };
  const preparing = candidates.find((c) => c.id === decision.preparationCandidateId);
  if (preparing && 'target' in preparing.action && next.onBallPreparation?.micro) {
    next.onBallPreparation = {
      ...next.onBallPreparation,
      micro: {
        ...next.onBallPreparation.micro,
        orientationTarget: angleForVector({
          x: preparing.action.target.x - actor.position.x,
          y: preparing.action.target.y - actor.position.y,
        }),
        passingAngle: angleForVector({
          x: preparing.action.target.x - actor.position.x,
          y: preparing.action.target.y - actor.position.y,
        }),
      },
    };
  }
  observeBoundedTrace({
    stage: 'decision',
    at: state.time,
    actorId: actor.id,
    scene: result.scene,
    decision: result.decision,
    ...(state.experimentalTransitionIntelligence ? { candidates } : {}),
    reason: result.decision.reasons.join('|'),
    ...(result.action ? { action: result.action } : {}),
  });
  return { state: next, action: result.action };
};

/** Runs at 10Hz, then ordinary locomotion integrates every body at 40Hz.
 * Reuses PR186 recognition, with live dependency cancellation and separate arrival.
 * Default formation/defensive/GK controllers still have historical full-state access;
 * this module does not certify those controllers as bounded perception.
 */
export const advanceBoundedPatterns = (state: TacticalMatchState): TacticalMatchState => {
  if (!usesBoundedIntelligence(state)) return state;
  const runtime = state.boundedRuntime ?? boundedRuntimeSchema.parse({});
  if (state.time - runtime.lastPatternScanAt < 0.1 - 1e-8) return state;
  const patterns = { ...runtime.patterns },
    sightings = { ...runtime.sightings },
    opponents = { ...runtime.opponents },
    selfEvidence = { ...runtime.selfEvidence };
  if (
    state.restart ||
    state.postGoal ||
    state.ball.x < 0 ||
    state.ball.x > 105 ||
    state.ball.y < 0 ||
    state.ball.y > 68
  ) {
    for (const [id, p] of Object.entries(patterns))
      if (!p.cancelled) patterns[id] = { ...p, cancelled: 'stoppage' };
    return {
      ...state,
      boundedRuntime: { ...runtime, patterns, lastPatternScanAt: state.time, intent: null },
    };
  }
  for (const actor of state.players) {
    if (actor.slot.position === 'goalkeeper' || state.discipline?.[actor.id]?.sentOff) continue;
    if (
      actor.position.x < 0 ||
      actor.position.x > 105 ||
      actor.position.y < 0 ||
      actor.position.y > 68
    )
      continue;
    const scene = observeBoundedScene(state, actor),
      old = patterns[actor.id];
    if (scene.config.opponentLearning) opponents[actor.id] = updateOpponentKnowledge(scene);
    const feedback = scene.selfFeedback;
    if (
      scene.config.psychology &&
      feedback &&
      !selfEvidence[actor.id]?.seenEvents?.includes(feedback.key)
    )
      selfEvidence[actor.id] = {
        value: (selfEvidence[actor.id]?.value ?? 0) * 0.8 + feedback.value * 0.2,
        lastEvent: feedback.key,
        seenEvents: [...(selfEvidence[actor.id]?.seenEvents ?? []), feedback.key].slice(-8),
      };
    const source = scene.visible.find((p) => p.id === scene.ball?.ownerId && p.team === actor.team);
    const seenOwner = scene.ball?.ownerId;
    const seenTeam =
      seenOwner === actor.id
        ? actor.team
        : (scene.visible.find((p) => p.id === seenOwner)?.team ?? null);
    const previous = sightings[actor.id];
    if (scene.ball)
      sightings[actor.id] = {
        ownerId: seenOwner ?? null,
        team: seenTeam,
        regainedAt:
          seenTeam === actor.team &&
          previous?.team !== null &&
          previous?.team !== undefined &&
          previous.team !== actor.team
            ? state.time
            : (previous?.regainedAt ?? null),
      };
    const cover = source
      ? scene.visible.filter(
          (p) =>
            p.team === actor.team &&
            p.id !== source.id &&
            scene.direction * (source.position.x - p.position.x) > 3,
        ).length
      : 0;
    const defenders = scene.visible
      .filter((p) => p.team !== actor.team)
      .map((p) => scene.direction * p.position.x)
      .sort((a, b) => b - a);
    const offside =
      defenders.length >= 2 &&
      scene.direction * actor.position.x >
        Math.max(
          52.5 * scene.direction,
          defenders[1]!,
          scene.direction * (scene.ball?.position.x ?? actor.position.x),
        );
    const cancellation =
      state.restart || state.postGoal
        ? 'stoppage'
        : !scene.config.patterns
          ? 'patterns_disabled'
          : !source
            ? 'lost_possession_or_sight'
            : old?.sourceId !== source.id && old
              ? 'carrier_changed'
              : cover < 2
                ? 'missing_cover'
                : offside
                  ? 'offside'
                  : old && old.signature !== scene.signature
                    ? 'coaching_changed'
                    : old && old.expiresAt <= state.time
                      ? 'expired'
                      : old &&
                          scene.visible.some(
                            (p) => p.team !== actor.team && distance(p.position, old.target) < 1.5,
                          )
                        ? 'opponent_blocks_target'
                        : null;
    if (old && !old.cancelled) {
      const arrivedAt =
        old.arrivedAt ?? (distance(actor.position, old.target) < 1 ? state.time : null);
      patterns[actor.id] = { ...old, arrivedAt, cancelled: cancellation };
      if (cancellation || arrivedAt !== old.arrivedAt)
        observeBoundedTrace({
          stage: 'pattern',
          at: state.time,
          actorId: actor.id,
          reason: cancellation ? `cancel:${cancellation}` : 'tactical_target_arrived',
        });
      continue;
    }
    if (cancellation || !source || scene.ball?.ownerId === actor.id || !scene.config.patterns)
      continue;
    if (old && state.time < old.expiresAt + 0.25) continue;
    const pressed = scene.visible.some(
      (p) => p.team !== actor.team && distance(p.position, source.position) < 5,
    );
    const regain = sightings[actor.id]?.regainedAt;
    const counter =
      regain !== null &&
      regain !== undefined &&
      state.time - regain < 2.5 &&
      Math.hypot(source.velocity.x, source.velocity.y) > 1;
    const pattern = pressed
      ? 'press_triangle'
      : source.preparing && source.role === 'deep_playmaker'
        ? 'playmaker_run'
        : counter
          ? 'counter_support'
          : null;
    if (!pattern) continue;
    const role = tacticalRoleFor(state, actor);
    const knowledge = scene.config.players[actor.id] ?? scene.config.knowledge;
    const familiarity = familiaritySchema.parse({
      pattern,
      signature: scene.signature,
      roleId: role.id,
      partnerId: source.id,
      ...knowledge,
    });
    // Discount only system recognition on a relevant changed instruction; role and
    // partner knowledge remain intact, as do other players' records.
    if (old && old.signature !== scene.signature) familiarity.system *= 0.5;
    const observation = tacticalObservationSchema.parse({
      observerId: actor.id,
      team: actor.team,
      at: state.time,
      position: scene.position,
      direction: scene.direction,
      ball: scene.ball?.position ?? null,
      ownerId: source.id,
      visible: scene.visible
        .filter(
          (p) =>
            p.position.x >= 0 && p.position.x <= 105 && p.position.y >= 0 && p.position.y <= 68,
        )
        .map((p) => ({
          id: p.id,
          team: p.team,
          position: p.position,
          velocity: p.velocity,
          ...(p.role ? { role: p.role } : {}),
        })),
      trigger: pattern,
      sourceId: source.id,
    });
    const recognition = recognisePattern(
      observation,
      actor,
      familiarity,
      scene.config.coach,
      'prepared',
    );
    if (recognition.recognitionAt === null || !recognition.target) continue;
    patterns[actor.id] = {
      actorId: actor.id,
      sourceId: source.id,
      pattern,
      observedAt: state.time,
      recognisedAt: recognition.recognitionAt,
      expiresAt: recognition.expiresAt,
      target: recognition.target,
      origin: { ...actor.position },
      arrivedAt: null,
      cancelled: null,
      signature: scene.signature,
    };
    observeBoundedTrace({
      stage: 'pattern',
      at: state.time,
      actorId: actor.id,
      reason: `observed:${pattern}:recognised_at:${recognition.recognitionAt.toFixed(4)}`,
    });
  }
  // Removal handles substitutions, injuries and departures without resurrecting identities.
  for (const id of Object.keys(patterns))
    if (!state.players.some((p) => p.id === id)) delete patterns[id];
  for (const id of Object.keys(sightings))
    if (!state.players.some((p) => p.id === id)) delete sightings[id];
  return {
    ...state,
    boundedRuntime: {
      ...runtime,
      lastPatternScanAt: state.time,
      patterns,
      sightings,
      opponents,
      selfEvidence,
      intent:
        runtime.intent && runtime.intent.actorId === state.ball.ownerId ? runtime.intent : null,
    },
  };
};
export const boundedPatternTarget = (state: TacticalMatchState, actor: MatchPlayerState) => {
  if (
    !usesBoundedIntelligence(state) ||
    state.restart ||
    state.postGoal ||
    state.ball.ownerId === actor.id
  )
    return undefined;
  const intent = state.boundedRuntime?.patterns[actor.id];
  if (
    !intent ||
    intent.cancelled ||
    state.time < intent.recognisedAt ||
    state.time >= intent.expiresAt
  )
    return undefined;
  return clampPitchPoint(intent.target);
};
