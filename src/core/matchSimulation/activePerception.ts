import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { observeBoundedScene } from './boundedPerception';
import {
  rememberedGeometry,
  type ActivePerceptionRuntime,
  type SpatialMemory,
} from './activePerceptionState';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { distance } from './matchSpace';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';
import { updateSituation } from './situationalAwareness';

export const emptyActiveRuntime = (): ActivePerceptionRuntime => ({
  lastUpdateAt: -1,
  memory: {},
  plans: {},
  positions: {},
  tempo: {},
});
export const usesActiveContext = (s: TacticalMatchState) =>
  Boolean(
    s.experimentalActivePerception ||
      s.experimentalReceivingPositions ||
      s.experimentalTeamTempo ||
      s.situationalAwareness,
  );

/** Logical attention, not anatomical neck animation. Rotation and acquisition take time;
 * no shoulder scan instantaneously sweeps the whole world. No exact unseen target directs it. */
export const nextAttention = (
  s: TacticalMatchState,
  p: MatchPlayerState,
  old?: SpatialMemory,
): SpatialMemory => {
  const a = p.profile.attributes,
    now = s.time;
  const known = rememberedGeometry(old, now, a.concentration, a.gameReading);
  const pressure = Math.min(
    36,
    ...known.filter((q) => q.team !== p.team).map((q) => distance(q.position, p.position)),
  );
  const ball = old?.ball;
  const incoming = ball && !ball.ownerId && distance(p.position, ball.position) < 22;
  const ballDistance = ball ? distance(p.position, ball.position) : 36;
  const arrival = ball
    ? ballDistance / Math.max(1, Math.hypot(ball.velocity.x, ball.velocity.y))
    : 4;
  const stable = pressure > 9 && (!incoming || arrival > 1.2);
  const canScan =
    s.experimentalActivePerception &&
    s.activePerceptionConfig?.scanning !== false &&
    pressure > 2.8 &&
    (!incoming || arrival > 0.48);
  const due = now >= (old?.nextScanAt ?? now + 0.1);
  const startScan = Boolean(canScan && due && now >= (old?.scanningUntil ?? 0));
  const scanSide = old?.scanSide ?? (p.slotIndex % 2 === 0 ? 1 : -1);
  const until = startScan ? now + 0.38 : (old?.scanningUntil ?? now);
  const offset = startScan ? scanSide * 1.65 : now < until ? (old?.targetOffset ?? 0) : 0;
  // Ball attention competes with the shoulder scan. An urgent flight/pressure can abort it.
  const base =
    ball && now - (old?.ballSeenAt ?? -10) < 0.5 && ball.ownerId !== p.id
      ? angleForVector({ x: ball.position.x - p.position.x, y: ball.position.y - p.position.y })
      : p.facingAngle;
  const desired = offset !== 0 && canScan ? p.facingAngle + offset : base;
  const bounded =
    p.facingAngle + Math.max(-1.8, Math.min(1.8, normalizeAngle(desired - p.facingAngle)));
  const dt = Math.min(0.3, Math.max(0.025, now - (old?.observedAt ?? now - 0.1)));
  const gaze = normalizeAngle(
    (old?.gaze ?? p.facingAngle) +
      Math.max(-5 * dt, Math.min(5 * dt, normalizeAngle(bounded - (old?.gaze ?? p.facingAngle)))),
  );
  return {
    gaze,
    targetOffset: offset,
    scanningUntil: canScan ? until : now,
    nextScanAt: startScan
      ? now +
        0.7 +
        (1 - a.gameReading / 100) * 1.1 +
        (p.slot.position.includes('midfielder') ? 0 : 0.25)
      : (old?.nextScanAt ?? now + 0.25),
    // Engineering cadence uses change/age, independent of the player's scan skill.
    nextObservationAt: now + (stable ? 0.2 : 0.1),
    observedAt: now,
    scans: (old?.scans ?? 0) + Number(startScan),
    scanSide: startScan ? (scanSide === 1 ? -1 : 1) : scanSide,
    directIds: [],
    entities: old?.entities ?? [],
    ball: old?.ball ?? null,
    ballSeenAt: old?.ballSeenAt ?? -10,
  };
};

export const advanceActivePerception = (state: TacticalMatchState): TacticalMatchState => {
  if (!usesActiveContext(state)) return state;
  const runtime = state.activePerceptionRuntime ?? emptyActiveRuntime();
  if (state.time - runtime.lastUpdateAt < 0.1 - 1e-8) return state;
  const span = startPerformanceSpan('spatial_memory');
  const memory: ActivePerceptionRuntime['memory'] = {};
  let next: TacticalMatchState = {
    ...state,
    activePerceptionRuntime: { ...runtime, memory, lastUpdateAt: state.time },
  };
  for (const p of state.players) {
    if (state.discipline?.[p.id]?.sentOff) continue;
    const old = runtime.memory[p.id];
    if (old && state.time < old.nextObservationAt - 1e-8) {
      memory[p.id] = old;
      continue;
    }
    const attention = nextAttention(state, p, old);
    memory[p.id] = attention;
    const gather = startPerformanceSpan('perception_gathering');
    const direct = observeBoundedScene(next, p, true);
    endPerformanceSpan('perception_gathering', gather);
    const ids = new Set(direct.visible.map((q) => q.id));
    const remembered = (old?.entities ?? []).filter(
      (q) =>
        !ids.has(q.id) &&
        state.time - q.observedAt < 0.65 + p.profile.attributes.concentration * 0.012,
    );
    const entities = [
      ...direct.visible.map((q) => ({
        ...q,
        position: { ...q.position },
        velocity: { ...q.velocity },
        observedAt: state.time,
        confidence: 0.9,
      })),
      ...remembered,
    ]
      .sort(
        (a, b) =>
          Number(ids.has(b.id)) - Number(ids.has(a.id)) ||
          distance(p.position, a.position) - distance(p.position, b.position) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 12);
    memory[p.id] = {
      ...attention,
      entities,
      directIds: entities.filter((q) => ids.has(q.id)).map((q) => q.id),
      ball: direct.ball ?? (old && state.time - old.ballSeenAt <= 0.35 ? old.ball : null),
      ballSeenAt: direct.ball ? state.time : (old?.ballSeenAt ?? -10),
      ...(state.situationalAwareness ? { situation: updateSituation(direct, old?.situation) } : {}),
    };
  }
  if (state.restart || state.postGoal)
    next = {
      ...next,
      activePerceptionRuntime: {
        ...next.activePerceptionRuntime!,
        plans: {},
        positions: {},
        tempo: {},
      },
    };
  endPerformanceSpan('spatial_memory', span);
  return next;
};
