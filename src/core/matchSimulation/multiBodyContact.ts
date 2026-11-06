import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { canParticipatePhysically } from './matchInjuries';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { ownsOrdinaryLowBallInterval } from './ordinaryContactInterval';
import {
  PLAYER_BODY_CONTACT,
  playerBodyClearance,
  playerPairKey,
  playerBodyContactSchema,
  resolvePlayerBodyImpulse,
  supportedUprightPair,
} from './playerBodyContact';

export const MULTI_BODY = {
  // A connected component may contain any member of the validated 22-player
  // roster. Pair work remains bounded by 22 choose 2 and the same 64 sweeps.
  maximumBodies: 22,
  iterations: 32,
  completionIterations: PLAYER_BODY_CONTACT.maximumCorrectionIterations,
  fiveBodyIterations: PLAYER_BODY_CONTACT.maximumCorrectionIterations,
  events: 16,
  footEvaluations: 2560,
  contactTolerance: 1e-7,
  velocityTolerance: 1e-4,
  maximumCorrection: 0.002,
  minimum: { x: 0.4, y: 0.4 },
  maximum: { x: 104.6, y: 67.6 },
} as const;
const vector = z.object({ x: z.number().finite(), y: z.number().finite() });
export const restartReentrySchema = z.object({
  awardId: z.string(),
  playerIds: z.array(z.string()).max(22),
});
const ordinaryBounds = (
  player?: MatchPlayerState,
): { minimum: { x: number; y: number }; maximum: { x: number; y: number } } => ({
  minimum: {
    ...MULTI_BODY.minimum,
    x: player && isMatchGoalkeeper(player) ? 0 : MULTI_BODY.minimum.x,
  },
  maximum: {
    ...MULTI_BODY.maximum,
    x: player && isMatchGoalkeeper(player) ? 105 : MULTI_BODY.maximum.x,
  },
});
const outsideOrdinaryBounds = (player: MatchPlayerState) => {
  const bounds = ordinaryBounds(player);
  return (['x', 'y'] as const).some(
    (axis) =>
      player.position[axis] < bounds.minimum[axis] || player.position[axis] > bounds.maximum[axis],
  );
};
/** A first touch completes the law context, not the finite return from staging. */
export const markRestartReentry = (state: TacticalMatchState): TacticalMatchState => {
  if (state.experimentalPlayerBodyImpulse !== 'upright-cluster-dev-v1' || !state.restart)
    return state;
  const playerIds = state.players.filter(outsideOrdinaryBounds).map((p) => p.id);
  return playerIds.length
    ? {
        ...state,
        restartReentry: {
          awardId: state.restart.awardId ?? `${state.seed}:restart:${state.restart.startedAt}`,
          playerIds,
        },
      }
    : state;
};
export const pruneRestartReentry = (state: TacticalMatchState): TacticalMatchState => {
  if (!state.restartReentry) return state;
  const playerIds = state.players
    .filter((p) => state.restartReentry!.playerIds.includes(p.id) && outsideOrdinaryBounds(p))
    .map((p) => p.id);
  if (playerIds.length === state.restartReentry.playerIds.length) return state;
  if (playerIds.length) return { ...state, restartReentry: { ...state.restartReentry, playerIds } };
  const { restartReentry: _completed, ...next } = state;
  void _completed;
  return next;
};
export const multiBodyResolutionSchema = z.object({
  at: z.number().nonnegative(),
  participants: z.string().array().max(22),
  reason: z.string(),
  iterations: z.number().int().min(0).max(MULTI_BODY.fiveBodyIterations),
  pairChecks: z.number().int().min(0).max(231),
  momentumBefore: vector,
  momentumAfter: vector,
  boundaryImpulse: vector,
  energyBefore: z.number().nonnegative(),
  energyAfter: z.number().nonnegative(),
  residualClosingSpeed: z.number().nonnegative(),
  maximumPenetration: z.number().nonnegative(),
  positionCorrection: z.number().nonnegative(),
  unresolved: z.boolean(),
  impulses: playerBodyContactSchema
    .array()
    .max(
      (MULTI_BODY.fiveBodyIterations * MULTI_BODY.maximumBodies * (MULTI_BODY.maximumBodies - 1)) /
        2,
    ),
  motorWorkAt: z.number().nonnegative().optional(),
  motorWork: z
    .array(
      z.object({
        actorId: z.string(),
        mass: z.number().positive(),
        beforeVelocity: vector,
        actuatorVelocity: vector,
        kineticWork: z.number().finite(),
      }),
    )
    .max(22)
    .optional(),
});
export const multiBodyResolutionsSchema = multiBodyResolutionSchema.array().max(MULTI_BODY.events);

export const ownsMultiBodyInterval = (s: TacticalMatchState, dt = 0.025) =>
  dt > 0 && s.experimentalPlayerBodyImpulse === 'upright-cluster-dev-v1';

/** Match the canonical motor's perimeter during dead-ball retrieval and staging. */
export const multiBodyMovementBounds = (s: TacticalMatchState, player?: MatchPlayerState) =>
  s.restart || s.postGoal
    ? { minimum: { x: -8, y: -8 }, maximum: { x: 113, y: 76 } }
    : (() => {
        const bounds = ordinaryBounds(player);
        if (
          player &&
          s.restartReentry?.playerIds.includes(player.id) &&
          player.position.x >= -8 &&
          player.position.x <= 113 &&
          player.position.y >= -8 &&
          player.position.y <= 76
        ) {
          // Shrink the authorized corridor with actual inward movement. Neither
          // coordinates nor the ordinary bounds of unmarked players are changed.
          for (const axis of ['x', 'y'] as const) {
            bounds.minimum[axis] = Math.min(bounds.minimum[axis], player.position[axis]);
            bounds.maximum[axis] = Math.max(bounds.maximum[axis], player.position[axis]);
          }
        }
        return bounds;
      })();

/** Conservative connected broad phase for this existing interval, not a second
 * movement authority. At 12m/s/body no reachable torso can enter from outside it. */
export const multiBodyParticipants = (s: TacticalMatchState, dt: number) => {
  const ids = new Set<string>();
  if (!ownsMultiBodyInterval(s, dt)) return ids;
  // Torso authority must not disappear when the ball changes owner or technique.
  // The broad phase covers the roster; each connected solve is roster-bounded.
  for (const p of s.players)
    if (
      canParticipatePhysically(p) &&
      !s.discipline?.[p.id]?.sentOff &&
      supportedUprightPair(p, p, true)
    )
      ids.add(p.id);
  if (ownsOrdinaryLowBallInterval(s, dt)) {
    const reach = 1.5 + (12 + Math.hypot(s.ball.velocity?.x ?? 0, s.ball.velocity?.y ?? 0)) * dt;
    for (const p of s.players)
      if (
        canParticipatePhysically(p) &&
        supportedUprightPair(p, p, true) &&
        !s.discipline?.[p.id]?.sentOff &&
        Math.hypot(p.position.x - s.ball.x, p.position.y - s.ball.y) <= reach
      )
        ids.add(p.id);
  }
  if (s.pendingStrike) ids.add(s.pendingStrike.actorId);
  if (s.defensiveChallenge?.physicalAttempt) {
    ids.add(s.defensiveChallenge.actorId);
    ids.add(s.defensiveChallenge.opponentId);
  }
  const players = [...s.players].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let pass = 0; pass < players.length; pass++) {
    const count = ids.size;
    for (const a of players.filter((p) => ids.has(p.id)))
      for (const b of players)
        if (
          !ids.has(b.id) &&
          canParticipatePhysically(b) &&
          (supportedUprightPair(b, b, true) ||
            s.pendingStrike ||
            s.defensiveChallenge?.physicalAttempt) &&
          playerBodyClearance(a, b) <=
            Math.max(
              24,
              Math.hypot(a.velocity.x, a.velocity.y) + Math.hypot(b.velocity.x, b.velocity.y),
            ) *
              dt +
              MULTI_BODY.contactTolerance
        )
          ids.add(b.id);
    if (ids.size === count) break;
  }
  return ids;
};

export const findPlayerMovementEdge = (
  p: MatchPlayerState,
  seconds: number,
  bounds = { minimum: MULTI_BODY.minimum, maximum: MULTI_BODY.maximum } as {
    minimum: { x: number; y: number };
    maximum: { x: number; y: number };
  },
) => {
  const events: { at: number; axis: 'x' | 'y'; edge: number }[] = [];
  for (const axis of ['x', 'y'] as const) {
    if (
      p.position[axis] < bounds.minimum[axis] - MULTI_BODY.contactTolerance ||
      p.position[axis] > bounds.maximum[axis] + MULTI_BODY.contactTolerance
    ) {
      events.push({ at: 0, axis, edge: p.position[axis] });
      continue;
    }
    const v = p.velocity[axis];
    if (Math.abs(v) < 1e-10) continue;
    const edge = v < 0 ? bounds.minimum[axis] : bounds.maximum[axis];
    const at = (edge - p.position[axis]) / v;
    if (at >= -1e-10 && at <= seconds) events.push({ at: Math.max(0, at), axis, edge });
  }
  return events.sort((a, b) => a.at - b.at || (a.axis < b.axis ? -1 : 1))[0];
};

/** Deterministically ordered sequential impulses, not exact simultaneous rigid-body
 * mechanics. Each approaching pair impulse is passive/dissipative and equal/opposite.
 * Only its first new impact has restitution. Later sweeps enforce zero-restition
 * support. A movement edge removes only outward normal velocity, with external
 * momentum explicitly measured. Position projection never changes velocity. */
export const resolveMultiBodyContact = (
  state: TacticalMatchState,
  seedIds: string[],
  at: number,
) => {
  const boundsFor = (p: MatchPlayerState) => multiBodyMovementBounds(state, p);
  const ordered = [...state.players].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = new Set(seedIds);
  let pairChecks = 0;
  const pairs: [MatchPlayerState, MatchPlayerState][] = [];
  for (let i = 0; i < ordered.length; i++)
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i]!,
        b = ordered[j]!;
      pairChecks++;
      if (
        (supportedUprightPair(a, b, true) ||
          state.pendingStrike ||
          state.defensiveChallenge?.physicalAttempt) &&
        playerBodyClearance(a, b) <= MULTI_BODY.contactTolerance
      )
        pairs.push([a, b]);
    }
  for (let pass = 0; pass < ordered.length; pass++) {
    const count = ids.size;
    for (const [a, b] of pairs)
      if (ids.has(a.id) || ids.has(b.id)) {
        ids.add(a.id);
        ids.add(b.id);
      }
    if (ids.size === count) break;
  }
  let players = ordered.filter((p) => ids.has(p.id)).map((p) => ({ ...p }));
  const momentum = () =>
    players.reduce(
      (v, p) => ({
        x: v.x + p.profile.weightKg * p.velocity.x,
        y: v.y + p.profile.weightKg * p.velocity.y,
      }),
      { x: 0, y: 0 },
    );
  const energy = () =>
    players.reduce(
      (e, p) => e + 0.5 * p.profile.weightKg * (p.velocity.x ** 2 + p.velocity.y ** 2),
      0,
    );
  const momentumBefore = momentum(),
    energyBefore = energy();
  const boundaryImpulse = { x: 0, y: 0 };
  let reason = 'resolved',
    iterations = 0,
    positionCorrection = 0;
  const contacts: ReturnType<typeof resolvePlayerBodyImpulse>['evidence'][] = [];
  const activePairs = new Map(
    (state.continuousPlayerContacts ?? []).map((c) => [playerPairKey(...c.participants), c]),
  );
  const localPairs = pairs.filter(([a, b]) => ids.has(a.id) && ids.has(b.id));
  const closingSpeed = () =>
    localPairs.reduce((maximum, [a0, b0]) => {
      const a = players.find((p) => p.id === a0.id)!,
        b = players.find((p) => p.id === b0.id)!;
      const dx = a.position.x - b.position.x,
        dy = a.position.y - b.position.y;
      return Math.max(
        maximum,
        -((a.velocity.x - b.velocity.x) * dx + (a.velocity.y - b.velocity.y) * dy) /
          Math.max(Math.hypot(dx, dy), 1e-12),
      );
    }, 0);
  if (players.length > MULTI_BODY.maximumBodies) reason = 'body_count_bound';
  else if (players.some((p) => !supportedUprightPair(p, p, true)))
    reason = 'unsupported_body_state';
  else if (
    players.some((p) => {
      const bounds = boundsFor(p);
      return (['x', 'y'] as const).some(
        (axis) =>
          p.position[axis] < bounds.minimum[axis] - MULTI_BODY.contactTolerance ||
          p.position[axis] > bounds.maximum[axis] + MULTI_BODY.contactTolerance,
      );
    })
  )
    reason = 'initial_player_outside_movement_area';
  else if (localPairs.some(([a, b]) => playerBodyClearance(a, b) < -MULTI_BODY.maximumCorrection))
    reason = 'initial_body_overlap';
  else if (
    localPairs.some(([a, b]) => playerBodyClearance(a, b) < -PLAYER_BODY_CONTACT.tolerance)
  ) {
    // One finite projection sweep for shallow initial overlap. Restitution is
    // suppressed even when no previous episode existed; overlap proves no impact.
    for (const [a0, b0] of localPairs) {
      const a = players.find((p) => p.id === a0.id)!,
        b = players.find((p) => p.id === b0.id)!;
      const gap = playerBodyClearance(a, b);
      if (gap >= 0) continue;
      const d = gap + PLAYER_BODY_CONTACT.diameter;
      const n = { x: (a.position.x - b.position.x) / d, y: (a.position.y - b.position.y) / d };
      const inverse = 1 / a.profile.weightKg + 1 / b.profile.weightKg;
      const correction = Math.min(-gap, MULTI_BODY.maximumCorrection);
      a.position = {
        x: a.position.x + (n.x * correction) / (a.profile.weightKg * inverse),
        y: a.position.y + (n.y * correction) / (a.profile.weightKg * inverse),
      };
      b.position = {
        x: b.position.x - (n.x * correction) / (b.profile.weightKg * inverse),
        y: b.position.y - (n.y * correction) / (b.profile.weightKg * inverse),
      };
      positionCorrection += correction;
      if (
        !activePairs.has(playerPairKey(a.id, b.id)) &&
        activePairs.size >= PLAYER_BODY_CONTACT.maximumPersistentPairs
      ) {
        reason = 'persistent_storage_bound';
        break;
      }
      activePairs.set(playerPairKey(a.id, b.id), { participants: [a.id, b.id], beganAt: at });
    }
    for (const p of players) {
      const bounds = boundsFor(p);
      p.position = {
        x: Math.max(bounds.minimum.x, Math.min(bounds.maximum.x, p.position.x)),
        y: Math.max(bounds.minimum.y, Math.min(bounds.maximum.y, p.position.y)),
      };
    }
  }
  if (reason === 'resolved') {
    // Preserve the first 32 sweeps for smaller components. Only an unmet velocity
    // constraint earns bounded completion; five bodies retain their full budget.
    const iterationLimit = MULTI_BODY.completionIterations;
    for (let pass = 0; pass < iterationLimit; pass++) {
      iterations++;
      let changed = false;
      for (const [a0, b0] of localPairs) {
        const a = players.find((p) => p.id === a0.id)!,
          b = players.find((p) => p.id === b0.id)!;
        if (playerBodyClearance(a, b) > MULTI_BODY.contactTolerance) continue;
        const key = playerPairKey(a.id, b.id);
        if (
          !activePairs.has(key) &&
          activePairs.size >= PLAYER_BODY_CONTACT.maximumPersistentPairs
        ) {
          reason = 'persistent_storage_bound';
          break;
        }
        const result = resolvePlayerBodyImpulse(
          a,
          b,
          at,
          activePairs.has(key),
          undefined,
          undefined,
          true,
        );
        if (!result.evidence.normalImpulse) continue;
        changed = true;
        result.evidence.correctionIterations = pass + 1;
        result.evidence.positionsAtContact = [a.position, b.position];
        contacts.push(result.evidence);
        players = players.map((p) => result.players.find((q) => q.id === p.id) ?? p);
        if (!activePairs.has(key))
          activePairs.set(key, { participants: [a.id, b.id], beganAt: at });
      }
      for (const p of players) {
        const bounds = boundsFor(p);
        for (const axis of ['x', 'y'] as const)
          if (
            (p.position[axis] <= bounds.minimum[axis] + MULTI_BODY.contactTolerance &&
              p.velocity[axis] < 0) ||
            (p.position[axis] >= bounds.maximum[axis] - MULTI_BODY.contactTolerance &&
              p.velocity[axis] > 0)
          ) {
            boundaryImpulse[axis] -= p.profile.weightKg * p.velocity[axis];
            p.velocity = { ...p.velocity, [axis]: 0 };
            changed = true;
          }
      }
      if (reason !== 'resolved') break;
      if (!changed) break;
      if (
        players.length < 5 &&
        pass + 1 === MULTI_BODY.iterations &&
        closingSpeed() <= MULTI_BODY.velocityTolerance
      )
        break;
    }
  }
  let residualClosingSpeed = 0,
    maximumPenetration = 0;
  for (const [a0, b0] of localPairs) {
    const a = players.find((p) => p.id === a0.id)!,
      b = players.find((p) => p.id === b0.id)!;
    const dx = a.position.x - b.position.x,
      dy = a.position.y - b.position.y;
    const d = Math.hypot(dx, dy);
    residualClosingSpeed = Math.max(
      residualClosingSpeed,
      -((a.velocity.x - b.velocity.x) * dx + (a.velocity.y - b.velocity.y) * dy) /
        Math.max(d, 1e-12),
    );
    maximumPenetration = Math.max(maximumPenetration, PLAYER_BODY_CONTACT.diameter - d);
  }
  if (
    reason === 'resolved' &&
    (residualClosingSpeed > MULTI_BODY.velocityTolerance ||
      maximumPenetration > MULTI_BODY.contactTolerance)
  )
    reason = 'constraint_iteration_bound';
  if (reason === 'resolved' && players.some((p) => !supportedUprightPair(p, p, true)))
    reason = 'post_impact_speed_bound';
  const evidence = multiBodyResolutionSchema.parse({
    at,
    participants: players.map((p) => p.id),
    reason,
    iterations,
    pairChecks,
    momentumBefore,
    momentumAfter: momentum(),
    boundaryImpulse,
    energyBefore,
    energyAfter: energy(),
    residualClosingSpeed,
    maximumPenetration,
    positionCorrection,
    unresolved: reason !== 'resolved',
    impulses: contacts,
  });
  return { players, contacts, continuous: [...activePairs.values()], evidence };
};
