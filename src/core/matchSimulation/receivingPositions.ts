import { usesLocalReception } from './situationalAwarenessState';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { observeBoundedScene, knownBoundedPlayers, type BoundedScene } from './boundedPerception';
import type { ActivePerceptionRuntime } from './activePerceptionState';
import { clampPitchPoint, distance, distanceToSegment } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { observedOffsideAssessment, estimateUsefulContact } from './opportunityWindows';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';
import { locallyObservedReception } from './localReception';

/** Small departures from a player's own role/formation, never a common free-space target. */
export const evaluateReceivingPosition = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  s: BoundedScene = observeBoundedScene(state, actor),
) => {
  const known = knownBoundedPlayers(s);
  const carrier = known.find((p) => p.id === s.ball?.ownerId && p.team === s.team);
  if (!carrier || carrier.id === actor.id || distance(carrier.position, s.position) > 30) return;
  const defensive =
    actor.duty === 'defend' ||
    actor.slot.position === 'center_back' ||
    s.instructions.includes('hold_position');
  if (defensive)
    return {
      target: { ...actor.target },
      origin: { ...s.position },
      observedAt: s.at,
      expiresAt: s.at + 0.5,
      personalValue: 0,
      teamValue: 1,
      baselineValue: 1,
      reason: 'protect_role_and_rest_defence',
    };
  const friends = known.filter((p) => p.team === s.team && p.id !== carrier.id && !p.keeper),
    foes = known.filter((p) => p.team !== s.team);
  const width = /winger|left_midfielder|right_midfielder/.test(actor.slot.position);
  const evaluate = (target: { x: number; y: number }) => {
    const lane = Math.min(
      8,
      ...foes.map((p) => distanceToSegment(p.position, carrier.position, target)),
    );
    const space = Math.min(8, ...foes.map((p) => distance(p.position, target)));
    const orientation = Math.abs(
      normalizeAngle(
        angleForVector({ x: carrier.position.x - target.x, y: carrier.position.y - target.y }) -
          s.facing,
      ),
    );
    const personal =
      lane * 0.22 +
      space * 0.2 -
      orientation * 0.15 -
      Math.abs(distance(target, carrier.position) - 12) * 0.035;
    const separation = Math.min(8, ...friends.map((p) => distance(p.position, target)));
    const anchorCost = distance(target, actor.neutralAnchor) * 0.025;
    const team =
      separation * 0.12 - anchorCost + (width ? Math.min(16, Math.abs(target.y - 34)) * 0.025 : 0);
    return {
      target,
      personal,
      team,
      value: personal + team - distance(target, s.position) * 0.055,
    };
  };
  const baseline = evaluate(s.position);
  const options = [
    s.position,
    ...[-4, 0, 4].flatMap((dx) =>
      [-4, 0, 4].map((dy) => clampPitchPoint({ x: s.position.x + dx, y: s.position.y + dy })),
    ),
  ]
    .map(evaluate)
    .filter((p) => {
      const offside = observedOffsideAssessment(s, p.target);
      return offside.uncertain || offside.risk === 0;
    })
    .sort((a, b) => b.value - a.value || a.target.x - b.target.x || a.target.y - b.target.y);
  const best = options[0];
  if (!best || best.value < baseline.value + 0.18 || distance(best.target, s.position) < 1) return;
  return {
    target: best.target,
    origin: { ...s.position },
    observedAt: s.at,
    expiresAt: s.at + 0.65,
    personalValue: best.personal,
    teamValue: best.team,
    baselineValue: baseline.value,
    reason: width
      ? 'create_width_with_receiving_lane'
      : s.direction * (best.target.x - carrier.position.x) < 0
        ? 'support_behind_observed_pressure'
        : 'separate_from_mark_and_prepare_half_turn',
  };
};

/** At most two possible intermediaries, reusing the existing role-local search.
 * Conditional ownership lives only in this local scene; no pass is scheduled. */
export const evaluateProspectivePosition = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  old?: ActivePerceptionRuntime['positions'][string],
): ActivePerceptionRuntime['positions'][string] | undefined => {
  const scene = observeBoundedScene(state, actor);
  const memory = state.activePerceptionRuntime?.memory[actor.id];
  const situation = memory?.situation;
  const previous = old?.prospective;
  const possessor = situation?.possessor;
  const protectedRole =
    actor.duty === 'defend' ||
    actor.slot.position === 'center_back' ||
    scene.instructions.includes('hold_position');
  // A short, evidence-bounded lease applies only after the original conditional
  // intention was already supported. A remembered proximity inference is not
  // ownership; do not refresh beyond the age of the actual observation.
  const supportEvidence = Boolean(
    usesLocalReception(state) &&
      previous &&
      previous.status !== 'withdrawn' &&
      possessor?.id === previous.intermediaryId &&
      possessor.team === actor.team &&
      possessor.confidence >= 0.25 &&
      scene.at >= possessor.evidenceAt &&
      scene.at - possessor.evidenceAt < 0.6 &&
      scene.visible.some((p) => p.id === previous.intermediaryId && p.team === actor.team) &&
      !protectedRole,
  );
  const continueSupported = supportEvidence && previous?.status === 'supported';
  const withdraw = (reason: string) =>
    old && previous
      ? {
          ...old,
          observedAt: scene.at,
          expiresAt: scene.at,
          reason,
          prospective: { ...previous, status: 'withdrawn' as const },
        }
      : undefined;
  if (usesLocalReception(state) && previous) {
    if (protectedRole) return withdraw('carrier_unavailable_or_role_protected');
    // A fast optical motion estimate near B is evidence of flight, not proof
    // that B controlled the ball. No physical velocity enters this decision.
    const ball = scene.ball;
    if (
      previous.status === 'supported' &&
      scene.visible.some((p) => p.id === previous.intermediaryId && p.team === actor.team) &&
      ball?.observedAt !== undefined &&
      scene.at >= ball.observedAt &&
      scene.at - ball.observedAt < 0.3 &&
      ball.motionEvidenceAt !== undefined &&
      ball.motionEvidenceAt !== null &&
      scene.at >= ball.motionEvidenceAt &&
      scene.at - ball.motionEvidenceAt < 0.3 &&
      Math.hypot(ball.velocity.x, ball.velocity.y) > 4
    )
      return withdraw('observed_flight_contradicts_supported_possession');
  }
  if (
    previous &&
    (previous.status === 'withdrawn' || (scene.at >= previous.horizonAt && !continueSupported))
  ) {
    if (scene.at < previous.horizonAt + 0.5) return withdraw('prospective_expired_or_withdrawn');
    old = undefined;
  }
  if (
    !possessor &&
    situation?.phase === 'flight' &&
    previous &&
    previous.status !== 'withdrawn' &&
    scene.at < previous.horizonAt
  ) {
    const intermediary = scene.visible.find((p) => p.id === previous.intermediaryId);
    const ball = scene.ball;
    const speed2 = ball ? ball.velocity.x ** 2 + ball.velocity.y ** 2 : 0;
    const tau =
      ball && intermediary && speed2 > 1
        ? ((intermediary.position.x - ball.position.x) * ball.velocity.x +
            (intermediary.position.y - ball.position.y) * ball.velocity.y) /
          speed2
        : -1;
    if (
      ball &&
      intermediary &&
      tau >= 0 &&
      tau <= 2 &&
      distance(intermediary.position, {
        x: ball.position.x + ball.velocity.x * tau,
        y: ball.position.y + ball.velocity.y * tau,
      }) < 3
    )
      return { ...old!, observedAt: scene.at };
    return withdraw('observed_flight_contradicts_intermediary');
  }
  if (
    !possessor ||
    possessor.team !== actor.team ||
    possessor.confidence < 0.25 ||
    scene.at - possessor.evidenceAt > 0.9
  )
    return withdraw('possession_evidence_lost_or_opponent');
  if (
    previous &&
    previous.status !== 'withdrawn' &&
    (scene.at < previous.horizonAt || continueSupported)
  ) {
    if (possessor.id === previous.intermediaryId) {
      const pressure = Math.min(
        12,
        ...scene.visible
          .filter((p) => p.team !== actor.team)
          .map((p) => distance(p.position, scene.position)),
      );
      if (
        pressure < 2.5 ||
        (usesLocalReception(state) &&
          scene.visible.some(
            (p) => p.team !== actor.team && distance(p.position, old!.target) < 2.5,
          ))
      )
        return withdraw('support_now_marked');
      return {
        ...old!,
        observedAt: scene.at,
        expiresAt: supportEvidence
          ? Math.max(old!.expiresAt, Math.min(scene.at + 0.35, possessor.evidenceAt + 0.6))
          : old!.expiresAt,
        prospective: { ...previous, status: 'supported' },
      };
    }
    if (possessor.id !== previous.carrierId) return withdraw('alternative_possessor_observed');
  }
  const carrier = scene.visible.find((p) => p.id === possessor.id && p.team === actor.team);
  if (
    !carrier ||
    carrier.id === actor.id ||
    actor.duty === 'defend' ||
    actor.slot.position === 'center_back' ||
    scene.instructions.includes('hold_position')
  )
    return withdraw('carrier_unavailable_or_role_protected');
  const foes = scene.visible.filter((p) => p.team !== actor.team);
  if (old?.prospective && foes.some((p) => distance(p.position, old!.target) < 2.5))
    return withdraw('support_target_now_marked');
  const hypotheses = scene.visible
    .filter((p) => p.team === actor.team && !p.keeper && ![actor.id, carrier.id].includes(p.id))
    .filter(
      (p) =>
        distance(p.position, carrier.position) >= 5 &&
        distance(p.position, carrier.position) <= 22 &&
        distance(p.position, actor.position) <= 24,
    )
    .map((p) => {
      const lane = Math.min(
        8,
        ...foes.map((q) => distanceToSegment(q.position, carrier.position, p.position)),
      );
      const space = Math.min(8, ...foes.map((q) => distance(q.position, p.position)));
      return {
        p,
        confidence: Math.min(0.8, possessor.confidence * (0.4 + lane / 20 + space / 20)),
      };
    })
    .filter((h) => h.confidence >= 0.4 + (1 - scene.attributes.gameReading / 100) * 0.2)
    .sort((a, b) => b.confidence - a.confidence || a.p.id.localeCompare(b.p.id))
    .slice(0, 2);
  for (const hypothesis of hypotheses) {
    const conditional: BoundedScene = {
      ...scene,
      ball: {
        position: { ...hypothesis.p.position },
        height: 0.11,
        velocity: { x: 0, y: 0, z: 0 },
        ownerId: hypothesis.p.id,
      },
    };
    const job = evaluateReceivingPosition(state, actor, conditional);
    if (!job || job.reason === 'protect_role_and_rest_defence') continue;
    // Wingers retain their side/width. Native capability, inertia and turn cost
    // bound feasibility; reading never changes running or contact capability.
    if (
      /winger|left_midfielder|right_midfielder/.test(actor.slot.position) &&
      Math.abs(job.target.y - 34) + 0.1 < Math.abs(actor.position.y - 34)
    )
      continue;
    const travel = estimateUsefulContact(
      { position: actor.position, velocity: actor.velocity, facing: actor.facingAngle },
      job.target,
      scene.capability.runSpeed,
      scene.capability.acceleration,
    );
    if (travel.playableSeconds > 2) continue;
    if (foes.some((p) => distance(p.position, hypothesis.p.position) < 2.5)) continue;
    const same =
      old?.prospective?.intermediaryId === hypothesis.p.id && scene.at < old.prospective.horizonAt;
    const createdAt = same ? old!.prospective!.createdAt : scene.at;
    const familiarity = scene.config.players[actor.id] ?? scene.config.knowledge;
    const recognisedAt =
      createdAt +
      0.12 +
      (1 - scene.attributes.gameReading / 100) * 0.7 +
      (1 - familiarity.system) * 0.1;
    const horizonAt = same ? old!.prospective!.horizonAt : createdAt + 2;
    // Do not chase a target that keeps walking away at each review.
    const target = same ? old!.target : job.target;
    return {
      ...job,
      target,
      origin: same ? old!.origin : job.origin,
      expiresAt: horizonAt,
      reason: 'conditional_two_pass_support',
      prospective: {
        carrierId: carrier.id,
        intermediaryId: hypothesis.p.id,
        createdAt,
        recognisedAt,
        horizonAt,
        confidence: hypothesis.confidence,
        status: 'conditional',
        hypotheses: hypotheses.map((h) => ({ intermediaryId: h.p.id, confidence: h.confidence })),
      },
    };
  }
  return withdraw('future_lane_or_intermediary_unavailable');
};
export const advanceReceivingPositions = (state: TacticalMatchState): TacticalMatchState => {
  if (
    (!state.experimentalReceivingPositions && !state.prospectiveMovement) ||
    !state.activePerceptionRuntime ||
    state.restart ||
    state.postGoal
  )
    return state;
  const span = startPerformanceSpan('receiving_positions'),
    positions = { ...state.activePerceptionRuntime.positions };
  const activeIds = new Set(state.players.map((p) => p.id));
  for (const id of Object.keys(positions)) if (!activeIds.has(id)) delete positions[id];
  for (const p of state.players) {
    if (
      p.slot.position === 'goalkeeper' ||
      state.discipline?.[p.id]?.sentOff ||
      (state.playerAgencyEnabled !== false && p.id === state.controlledFootballerId)
    ) {
      delete positions[p.id];
      continue;
    }
    if (positions[p.id] && state.time - positions[p.id]!.observedAt < 0.3 - 1e-8) continue;
    const next = state.prospectiveMovement
      ? evaluateProspectivePosition(state, p, positions[p.id])
      : evaluateReceivingPosition(state, p);
    if (next) positions[p.id] = next;
    else delete positions[p.id];
  }
  endPerformanceSpan('receiving_positions', span);
  return { ...state, activePerceptionRuntime: { ...state.activePerceptionRuntime, positions } };
};
export const receivingPositionTarget = (s: TacticalMatchState, p: MatchPlayerState) => {
  if (
    (!s.experimentalReceivingPositions && !s.prospectiveMovement) ||
    s.restart ||
    s.postGoal ||
    s.ball.ownerId === p.id ||
    (usesLocalReception(s)
      ? Boolean(locallyObservedReception(s, p))
      : s.receptionPreparation?.actorId === p.id)
  )
    return;
  const job = s.activePerceptionRuntime?.positions[p.id];
  if (job?.prospective && s.ballCarrierIntent?.actorId === p.id) return;
  if (
    job?.prospective &&
    (job.prospective.status === 'withdrawn' || s.time < job.prospective.recognisedAt)
  )
    return;
  // Protection is a decision not to recruit this player for an attacking job.
  // Let the ordinary structural/defensive controller keep updating its target.
  // Recycling that target as a new override would freeze its own future updates.
  return job && job.reason !== 'protect_role_and_rest_defence' && s.time < job.expiresAt
    ? job.target
    : undefined;
};
