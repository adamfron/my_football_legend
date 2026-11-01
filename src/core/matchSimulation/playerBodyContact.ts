import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { deriveMovementCapability } from './locomotion';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { canParticipatePhysically } from './matchInjuries';

export const playerBodyImpulseSelectionSchema = z.literal('upright-pair-dev-v1');
const vector = z.object({ x: z.number().finite(), y: z.number().finite() });
export const continuousPlayerContactsSchema = z
  .array(
    z.object({
      participants: z.tuple([z.string(), z.string()]),
      beganAt: z.number().nonnegative(),
    }),
  )
  .max(22);
export const playerBodyContactSchema = z.object({
  at: z.number().nonnegative(),
  participants: z.tuple([z.string(), z.string()]),
  kind: z.enum(['impact', 'support', 'separating', 'unresolved']),
  reason: z.string(),
  normal: vector,
  masses: z.tuple([z.number().positive(), z.number().positive()]),
  before: z.tuple([vector, vector]),
  after: z.tuple([vector, vector]),
  normalImpulse: z.number().nonnegative(),
  tangentImpulse: z.number().finite(),
  momentumBefore: vector,
  momentumAfter: vector,
  energyBefore: z.number().nonnegative(),
  energyAfter: z.number().nonnegative(),
  restitution: z.number().min(0).max(1),
  clearance: z.number().finite(),
  correctionIterations: z.number().int().nonnegative().max(8),
  balanceBefore: z.tuple([z.number(), z.number()]),
  balanceAfter: z.tuple([z.number(), z.number()]),
  remainderSeconds: z.number().nonnegative().optional(),
  positionsAtContact: z.tuple([vector, vector]).optional(),
  remainderPositions: z.tuple([vector, vector]).optional(),
  locomotionWorkBefore: z.number().finite().optional(),
  locomotionWorkAfter: z.number().finite().optional(),
  refereeOutcome: z.string().optional(),
  actualRemainderSeconds: z.number().nonnegative().optional(),
  continuationUnresolvedReason: z.string().optional(),
});
export const playerBodyContactsSchema = z.array(playerBodyContactSchema).max(8);

/** Same upright 34cm torso core as PR212's standing contact witness. The wider
 * locomotion personal-space/compliance constraint is not a second impact surface.
 * Restitution is an uncalibrated engineering assumption; tangent friction is zero. */
export const PLAYER_BODY_CONTACT = {
  diameter: 0.68,
  rearmClearance: 0.01,
  tolerance: 1e-8,
  restitution: 0.05,
} as const;
const length = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);
export const playerPairKey = (a: string, b: string) => [a, b].sort().join('\u0000');
export const playerBodyClearance = (a: MatchPlayerState, b: MatchPlayerState) =>
  Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) -
  PLAYER_BODY_CONTACT.diameter;
export const supportedUprightPair = (a: MatchPlayerState, b: MatchPlayerState) =>
  [a, b].every(
    (p) =>
      !isMatchGoalkeeper(p) &&
      canParticipatePhysically(p) &&
      (!p.verticalJump || p.verticalJump.phase === 'ready') &&
      Number.isFinite(p.profile.weightKg) &&
      p.profile.weightKg > 0 &&
      length(p.velocity) <= 12,
  );

/** Geometric identity survives new ticks, owner/ball episodes and discrete attempts. */
export const retainPlayerBodyContacts = (state: TacticalMatchState) =>
  (state.continuousPlayerContacts ?? []).filter((c) => {
    const a = state.players.find((p) => p.id === c.participants[0]);
    const b = state.players.find((p) => p.id === c.participants[1]);
    return (
      a &&
      b &&
      supportedUprightPair(a, b) &&
      playerBodyClearance(a, b) <= PLAYER_BODY_CONTACT.rearmClearance
    );
  });

/** Exact entry for the canonical constant-velocity transport segment. Initial
 * overlap and tangent contact are explicitly uncertain, never clean new impacts. */
export const findPlayerBodyContact = (
  a: MatchPlayerState,
  b: MatchPlayerState,
  seconds: number,
  continuous: boolean,
) => {
  const x = a.position.x - b.position.x,
    y = a.position.y - b.position.y;
  const vx = a.velocity.x - b.velocity.x,
    vy = a.velocity.y - b.velocity.y;
  const gap = playerBodyClearance(a, b);
  if (gap < -PLAYER_BODY_CONTACT.tolerance && !continuous)
    return { at: 0, unresolved: 'initial_body_overlap' };
  const closing = x * vx + y * vy;
  if (closing >= -1e-10) return undefined;
  if (continuous && gap <= PLAYER_BODY_CONTACT.tolerance) return { at: 0 };
  const speed2 = vx * vx + vy * vy;
  if (speed2 <= 1e-12) return undefined;
  const c = x * x + y * y - PLAYER_BODY_CONTACT.diameter ** 2;
  const d = closing * closing - speed2 * c;
  if (d < 0) return undefined;
  const at = (-closing - Math.sqrt(d)) / speed2;
  if (at < -1e-10 || at > seconds) return undefined;
  return d <= 1e-10
    ? { at: Math.max(0, at), unresolved: 'near_tangent_body' }
    : { at: Math.max(0, at) };
};

const balanceAfterImpulse = (p: MatchPlayerState, dv: number): MatchPlayerState => {
  if (dv <= 1e-12) return p;
  const plant = p.plantBalance ?? { balance: 1, load: 0, support: 'both' as const };
  // Specific impulse / attainable change of velocity during 200ms support recovery.
  // Bounded disturbance only: this is not support-polygon failure or falling geometry.
  const load = Math.min(1, dv / (deriveMovementCapability(p).acceleration * 0.2));
  const supportFactor = plant.support === 'both' ? 0.3 : 0.45;
  return {
    ...p,
    plantBalance: {
      ...plant,
      load: Math.max(plant.load, load),
      balance: Math.max(0.35, plant.balance - supportFactor * load),
    },
  };
};

/** Isolated two-body normal impulse. No ground impulse, force from intention,
 * angular body momentum, tangential friction, possession, foul or injury is inferred. */
export const resolvePlayerBodyImpulse = (
  a: MatchPlayerState,
  b: MatchPlayerState,
  at: number,
  continuous = false,
  restitution: number = PLAYER_BODY_CONTACT.restitution,
  unresolved?: string,
) => {
  const dx = a.position.x - b.position.x,
    dy = a.position.y - b.position.y;
  const d = Math.hypot(dx, dy);
  const normal = d > 1e-12 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
  const m = a.profile.weightKg,
    n = b.profile.weightKg;
  const vn = (a.velocity.x - b.velocity.x) * normal.x + (a.velocity.y - b.velocity.y) * normal.y;
  const reason =
    unresolved ??
    (!supportedUprightPair(a, b)
      ? 'unsupported_body_state'
      : Math.abs(d - PLAYER_BODY_CONTACT.diameter) > PLAYER_BODY_CONTACT.tolerance && !continuous
        ? 'no_surface_intersection'
        : vn >= -1e-10
          ? 'separating_or_resting'
          : 'closing_surface');
  const canResolve = reason === 'closing_surface';
  const e = continuous ? 0 : Math.max(0, Math.min(1, restitution));
  const j = canResolve ? (-(1 + e) * vn) / (1 / m + 1 / n) : 0;
  let pa = {
    ...a,
    velocity: { x: a.velocity.x + (j * normal.x) / m, y: a.velocity.y + (j * normal.y) / m },
  };
  let pb = {
    ...b,
    velocity: { x: b.velocity.x - (j * normal.x) / n, y: b.velocity.y - (j * normal.y) / n },
  };
  pa = balanceAfterImpulse(pa, j / m);
  pb = balanceAfterImpulse(pb, j / n);
  const momentum = (p: MatchPlayerState, q: MatchPlayerState) => ({
    x: m * p.velocity.x + n * q.velocity.x,
    y: m * p.velocity.y + n * q.velocity.y,
  });
  const energy = (p: MatchPlayerState, q: MatchPlayerState) =>
    0.5 * (m * length(p.velocity) ** 2 + n * length(q.velocity) ** 2);
  const evidence = playerBodyContactSchema.parse({
    at,
    participants: [a.id, b.id],
    kind: canResolve
      ? continuous
        ? 'support'
        : 'impact'
      : reason === 'separating_or_resting'
        ? 'separating'
        : 'unresolved',
    reason,
    normal,
    masses: [m, n],
    before: [a.velocity, b.velocity],
    after: [pa.velocity, pb.velocity],
    normalImpulse: j,
    tangentImpulse: 0,
    momentumBefore: momentum(a, b),
    momentumAfter: momentum(pa, pb),
    energyBefore: energy(a, b),
    energyAfter: energy(pa, pb),
    restitution: e,
    clearance: d - PLAYER_BODY_CONTACT.diameter,
    correctionIterations: 0,
    balanceBefore: [a.plantBalance?.balance ?? 1, b.plantBalance?.balance ?? 1],
    balanceAfter: [pa.plantBalance?.balance ?? 1, pb.plantBalance?.balance ?? 1],
  });
  return { players: [pa, pb] as const, evidence };
};
