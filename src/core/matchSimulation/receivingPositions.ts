import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { observeBoundedScene, knownBoundedPlayers } from './boundedPerception';
import { clampPitchPoint, distance, distanceToSegment } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { observedOffsideAssessment } from './opportunityWindows';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';

/** Small departures from a player's own role/formation, never a common free-space target. */
export const evaluateReceivingPosition = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const s = observeBoundedScene(state, actor),
    known = knownBoundedPlayers(s);
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
export const advanceReceivingPositions = (state: TacticalMatchState): TacticalMatchState => {
  if (
    !state.experimentalReceivingPositions ||
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
    const next = evaluateReceivingPosition(state, p);
    if (next) positions[p.id] = next;
    else delete positions[p.id];
  }
  endPerformanceSpan('receiving_positions', span);
  return { ...state, activePerceptionRuntime: { ...state.activePerceptionRuntime, positions } };
};
export const receivingPositionTarget = (s: TacticalMatchState, p: MatchPlayerState) => {
  if (
    !s.experimentalReceivingPositions ||
    s.restart ||
    s.postGoal ||
    s.ball.ownerId === p.id ||
    s.receptionPreparation?.actorId === p.id
  )
    return;
  const job = s.activePerceptionRuntime?.positions[p.id];
  // Protection is a decision not to recruit this player for an attacking job.
  // Let the ordinary structural/defensive controller keep updating its target.
  // Recycling that target as a new override would freeze its own future updates.
  return job && job.reason !== 'protect_role_and_rest_defence' && s.time < job.expiresAt
    ? job.target
    : undefined;
};
