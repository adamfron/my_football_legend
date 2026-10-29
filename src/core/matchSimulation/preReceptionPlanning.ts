import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { observeBoundedScene, knownBoundedPlayers, type BoundedScene } from './boundedPerception';
import { constructBoundedCandidates, type BoundedCandidate } from './boundedDecision';
import { type PreReceptionPlan } from './activePerceptionState';
import { angleForVector } from './playerOrientation';
import { distance } from './matchSpace';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';

/** A conditional local scene asks what could follow reception. Ownership here is
 * hypothetical and never written into the match or passed to the action executor. */
export const prepareObservedReception = (
  s: BoundedScene,
  old?: PreReceptionPlan,
): PreReceptionPlan | undefined => {
  const b = s.ball;
  if (!b || b.ownerId || b.height > 2.5) return;
  const v = b.velocity,
    speed2 = v.x * v.x + v.y * v.y;
  if (speed2 < 1) return;
  const tau = ((s.position.x - b.position.x) * v.x + (s.position.y - b.position.y) * v.y) / speed2;
  if (tau < 0.1 || tau > 2.2) return;
  const point = { x: b.position.x + v.x * tau, y: b.position.y + v.y * tau };
  if (
    point.x < 0 ||
    point.x > 105 ||
    point.y < 0 ||
    point.y > 68 ||
    distance(point, s.position) > Math.max(1.5, s.capability.runSpeed * tau * 0.65)
  )
    return;
  const conditional: BoundedScene = {
    ...s,
    position: point,
    readyAt: s.at + tau,
    ball: { ...b, position: point, ownerId: s.observerId },
    contactReady: false,
  };
  const candidates = constructBoundedCandidates(conditional)
    .filter((c) => c.action.type !== 'hold' && c.legal !== false && c.risk < 0.88)
    .sort((a, b) => b.benefit - a.benefit || a.id.localeCompare(b.id));
  // Retain plausible alternatives, not exactly three or a prescribed pass sequence.
  const best = candidates[0];
  const options = candidates
    .filter((c) => best && c.benefit >= best.benefit - 0.06)
    .slice(0, 3)
    .map((c) => {
      const target = 'target' in c.action ? c.action.target : null;
      return {
        id: c.id,
        kind: c.action.type as 'pass' | 'carry' | 'shot',
        target,
        receiverId: c.action.type === 'pass' ? c.action.receiverId : null,
        requiredFacing: target
          ? angleForVector({ x: target.x - point.x, y: target.y - point.y })
          : s.facing,
        preparationSeconds: Math.max(0, c.readyAt - s.at),
        evidence: c.evidenceIds.map((id) => {
          const k = s.knowledge?.find((k) => k.id === id);
          return { id, observedAt: k?.observedAt ?? s.at, uncertainty: k?.uncertainty ?? 0.15 };
        }),
        confidence: c.confidence,
        expiresAt: Math.min(s.at + tau + 0.8, c.opportunity?.closesAt ?? s.at + tau + 0.8),
        difficulty: c.risk,
        benefit: c.benefit,
        goal: c.goal,
      };
    });
  const invalidated = (old?.options ?? [])
    .filter((c) => !options.some((n) => n.id === c.id))
    .map((c) => ({ id: c.id, reason: 'latest_observed_lane_or_target_changed' }))
    .slice(0, 3);
  return {
    actorId: s.observerId,
    createdAt: old?.createdAt ?? s.at,
    reviewedAt: s.at,
    expectedContactAt: s.at + tau,
    expectedPoint: point,
    incomingVelocity: { ...v },
    expiresAt: s.at + tau + 0.8,
    options,
    invalidated,
    status: 'preparing',
    receptionAt: null,
    usedId: null,
  };
};

export const advancePreReceptionPlans = (state: TacticalMatchState): TacticalMatchState => {
  if (
    (!state.experimentalActivePerception && !state.situationalAwareness) ||
    state.activePerceptionConfig?.preparation === false ||
    !state.activePerceptionRuntime ||
    state.restart ||
    state.postGoal
  )
    return state;
  const runtime = state.activePerceptionRuntime;
  const span = startPerformanceSpan('pre_reception_candidates');
  const plans: typeof runtime.plans = {};
  for (const p of state.players) {
    if (
      state.discipline?.[p.id]?.sentOff ||
      (state.playerAgencyEnabled !== false && p.id === state.controlledFootballerId)
    )
      continue;
    const old = runtime.plans[p.id];
    if (old && state.time < old.expiresAt) plans[p.id] = old;
    if (state.ball.ownerId === p.id || (old && state.time - old.reviewedAt < 0.15 - 1e-8)) continue;
    const scene = observeBoundedScene(state, p);
    if (
      state.situationalAwareness &&
      (!scene.ball ||
        scene.ball.motionEvidenceAt == null ||
        state.time - scene.ball.motionEvidenceAt > 0.5 ||
        (scene.ball.uncertainty ?? Infinity) > 3)
    ) {
      delete plans[p.id];
      continue;
    }
    const plan = prepareObservedReception(scene, old?.status === 'preparing' ? old : undefined);
    if (plan) plans[p.id] = plan;
  }
  endPerformanceSpan('pre_reception_candidates', span);
  return { ...state, activePerceptionRuntime: { ...runtime, plans } };
};

export const revalidatePreparedOptions = (
  s: BoundedScene,
  plan: PreReceptionPlan,
  candidates: BoundedCandidate[],
): PreReceptionPlan => {
  const invalidated = plan.options.flatMap((option) => {
    const c = candidates.find((c) => c.id === option.id);
    const reason =
      s.at >= option.expiresAt
        ? 'opportunity_expired'
        : distance(s.position, plan.expectedPoint) > 4
          ? 'actual_reception_differs'
          : !c
            ? 'evidence_no_longer_available'
            : c.legal === false
              ? 'observed_offside'
              : c.risk > 0.8
                ? 'observed_lane_closed'
                : option.target &&
                    'target' in c.action &&
                    distance(option.target, c.action.target) > 3
                  ? 'target_moved'
                  : null;
    return reason ? [{ id: option.id, reason }] : [];
  });
  return {
    ...plan,
    reviewedAt: s.at,
    receptionAt: plan.receptionAt ?? s.at,
    invalidated,
    status: invalidated.length === plan.options.length ? 'revised' : 'revalidated',
  };
};
export const preparedRecognitionLatency = (
  s: BoundedScene,
  plan: PreReceptionPlan | undefined,
  normal: number,
) => {
  if (!plan || s.at >= plan.expiresAt || plan.status === 'revised' || !plan.options.length)
    return normal;
  const preparation = Math.max(
    0,
    Math.min(1, (s.at - plan.createdAt) / Math.max(0.15, normal * 2)),
  );
  const pressure = Math.min(
    12,
    ...knownBoundedPlayers(s)
      .filter((p) => p.team !== s.team)
      .map((p) => distance(p.position, s.position)),
  );
  // Composure stabilises a prepared choice under urgency; it does not improve foot physics.
  const stability = pressure < 4 ? 0.35 + s.attributes.composure / 160 : 0.9;
  return Math.max(0.025, normal * (1 - 0.7 * preparation * Math.min(1, stability)));
};

export const preparedContinuation = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const prep = state.receptionPreparation,
    plan = state.activePerceptionRuntime?.plans[actor.id];
  if (!prep || prep.actorId !== actor.id) return prep;
  const option = plan?.options[0];
  const valid =
    plan &&
    state.time < plan.expiresAt &&
    option?.kind === 'carry' &&
    option.target &&
    option.difficulty < 0.65;
  return {
    ...prep,
    runOn: undefined,
    continuation: valid
      ? {
          target: option.target!,
          mode: 'carry' as const,
          createdAt: plan.createdAt,
          expiresAt: plan.expiresAt,
          incomingVelocity: { x: plan.incomingVelocity.x, y: plan.incomingVelocity.y },
        }
      : undefined,
  };
};
