import type { TacticalMatchState, MatchPlayerState } from './matchState';
import type { PhysicalBall } from './ballPhysics';
import { advanceSurfaceBall, surfaceRequestSchema, sweepSurface } from './ballSurfaceContact';
import { canContactAfterThrowIn } from './throwIn';
import { canParticipatePhysically } from './matchInjuries';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { recordPhysicalContactFitness } from './matchFitness';

/** Opt-in non-shot delivery experiment. Existing policies retain their objective;
 * the local controller only presents an already reachable chest/connected leg.
 * Human decisions, headers, keeper actions and rule awards retain their own paths. */
export const advanceExperimentalBodyReception = (
  state: TacticalMatchState,
  previousPlayers: MatchPlayerState[],
  ball: PhysicalBall,
  dt: number,
) => {
  const experiment = state.experimentalBodyContacts;
  if (
    !experiment ||
    state.ball.shot ||
    state.ball.ownerId ||
    state.restart ||
    state.scenario !== 'open_play'
  )
    return;
  const locks = new Set(experiment.locks);
  const candidates = state.players.flatMap((p) => {
    if (
      isMatchGoalkeeper(p) ||
      !canParticipatePhysically(p) ||
      state.discipline?.[p.id]?.sentOff ||
      !canContactAfterThrowIn(state, p.id) ||
      p.id === state.currentActorId
    )
      return [];
    if (state.playerAgencyEnabled !== false && p.id === state.controlledFootballerId) return [];
    const previous = previousPlayers.find((v) => v.id === p.id) ?? p;
    const prep =
      state.receptionPreparation?.actorId === p.id
        ? Math.max(0, state.time - dt - state.receptionPreparation.awarenessAt)
        : 0;
    const surfaces = ['chest', ...(p.lowerBodyPose ? ['thigh', 'knee', 'lower_leg'] : [])] as const;
    const entries = surfaces.map((surface) => ({
      player: p,
      previous,
      request: surfaceRequestSchema.parse({
        objective: 'settle',
        intendedSurface: surface,
        foot: p.lowerBodyPose?.activeLeg ?? p.profile.dominantFoot,
        desiredVelocity: { ...p.velocity, z: 0 },
        preparationSeconds: prep,
        readyAt: experiment.readyAt[p.id] ?? 0,
      }),
    }));
    const intended = surfaceRequestSchema.parse({
      ...entries[0]!.request,
      intendedSurface: ball.position.z > (p.profile.heightCm / 100) * 0.56 ? 'chest' : 'thigh',
    });
    if (locks.has(p.id)) {
      if (entries.some((c) => sweepSurface(ball, ball, p, p, c.request, 0))) return [];
      locks.delete(p.id);
    }
    return entries.map((c) => ({ ...c, intention: intended }));
  });
  const result = advanceSurfaceBall({ ...state, time: state.time - dt }, ball, dt, candidates);
  const contact = result.contacts[0];
  if (!contact)
    return locks.size !== experiment.locks.length
      ? {
          state: { ...state, experimentalBodyContacts: { ...experiment, locks: [...locks] } },
          contact: undefined,
        }
      : undefined;
  const b = result.ball;
  return {
    state: {
      ...state,
      aerialContactLocks: [
        ...(state.aerialContactLocks ?? []).filter((v) => v.playerId !== contact.playerId),
        {
          playerId: contact.playerId,
          point: { x: contact.point.x, y: contact.point.y },
          at: contact.at,
        },
      ].slice(-22),
      experimentalBodyContacts: {
        ...experiment,
        locks: [...locks, contact.playerId].slice(-22),
        readyAt: {
          ...experiment.readyAt,
          [contact.playerId]: contact.at + contact.recoverySeconds,
        },
        last: contact,
      },
      players: state.players.map((p) =>
        p.id === contact.playerId
          ? recordPhysicalContactFitness(
              p,
              Math.min(1, Math.hypot(contact.impulse.x, contact.impulse.y, contact.impulse.z) / 8),
              dt,
            )
          : p,
      ),
      ball: {
        ...state.ball,
        flightTime: (state.ball.flightTime ?? 0) + dt,
        distanceTravelled:
          (state.ball.distanceTravelled ?? 0) +
          Math.hypot(
            contact.point.x - ball.position.x,
            contact.point.y - ball.position.y,
            contact.point.z - ball.position.z,
          ) +
          Math.hypot(
            b.position.x - contact.point.x,
            b.position.y - contact.point.y,
            b.position.z - contact.point.z,
          ),
        x: b.position.x,
        y: b.position.y,
        height: b.position.z,
        velocity: b.velocity,
        spin: b.spin ?? { x: 0, y: 0, z: 0 },
        airborne: b.airborne,
        bounceCount: b.bounceCount,
        lastTouchPlayerId: contact.playerId,
      },
    } satisfies TacticalMatchState,
    contact,
  };
};
