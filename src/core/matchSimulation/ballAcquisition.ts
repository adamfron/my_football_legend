import { z } from 'zod';
import { RandomGenerator } from '../random/RandomGenerator';
import { distance, pitchPointSchema } from './matchSpace';
import type { TacticalMatchState, MatchPlayerState } from './matchState';
import { playerContactGeometry } from './ballContactGeometry';
import { canContactAfterThrowIn } from './throwIn';

export const ballAcquisitionSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  opponentId: z.string().optional(),
  startedAt: z.number().nonnegative(),
  readyAt: z.number().nonnegative(),
  ballEpisode: z.number().int().nonnegative(),
  origin: pitchPointSchema,
  controlQuality: z.number().min(0).max(1),
  incomingSpeed: z.number().nonnegative(),
});
export type BallAcquisition = z.infer<typeof ballAcquisitionSchema>;

const groundContactDistance = (state: TacticalMatchState, player: MatchPlayerState) => {
  const geometry = playerContactGeometry(player);
  return Math.min(
    distance(geometry.leftFoot, state.ball),
    distance(geometry.rightFoot, state.ball),
  );
};
const canGroundContact = (state: TacticalMatchState, player: MatchPlayerState) =>
  !state.discipline?.[player.id]?.sentOff &&
  canContactAfterThrowIn(state, player.id) &&
  (state.ball.height ?? 0) < 0.5 &&
  groundContactDistance(state, player) <= playerContactGeometry(player).footReach;

/** Proximity nominates an attempt. It cannot award secure control/canonical possession. */
export const advanceBallAcquisition = (
  state: TacticalMatchState,
  claimant: MatchPlayerState | undefined,
  radius: number,
): {
  state: TacticalMatchState;
  securedPlayerId?: string;
  failedVelocity?: { x: number; y: number };
} => {
  if (state.ball.ownerId) return { state };
  const active = state.ballAcquisition;
  const candidate = state.players.find((p) => p.id === active?.candidateId) ?? claimant;
  if (
    !candidate ||
    distance(candidate.position, state.ball) > radius ||
    (active &&
      (active.ballEpisode !== (state.ballEpisode ?? 0) || distance(state.ball, active.origin) > 3))
  ) {
    if (!active) return { state };
    const next = { ...state };
    delete next.ballAcquisition;
    return { state: next };
  }
  if (active && !canGroundContact(state, candidate)) {
    // Anticipation cannot reserve a loose ball. A different legal foot already
    // at the ball starts its own preparation, with no borrowed clock or outcome.
    const available = state.players
      .filter((player) => player.id !== candidate.id && canGroundContact(state, player))
      .sort(
        (a, b) =>
          groundContactDistance(state, a) - groundContactDistance(state, b) ||
          a.id.localeCompare(b.id),
      )[0];
    if (available) {
      const next = { ...state };
      delete next.ballAcquisition;
      return advanceBallAcquisition(next, available, radius);
    }
  }
  if (!active) {
    const rival = state.players
      .filter((p) => p.team !== candidate.team && distance(p.position, state.ball) <= radius + 0.3)
      .sort(
        (a, b) =>
          distance(a.position, state.ball) - distance(b.position, state.ball) ||
          a.id.localeCompare(b.id),
      )[0];
    const a = candidate.profile.attributes;
    const controlQuality = (a.firstTouch + a.technique + a.composure + a.strength) / 400;
    const incomingSpeed = Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0);
    const attempt = ballAcquisitionSchema.parse({
      id: `${state.seed}:acquisition:${state.ballEpisode ?? 0}:${candidate.id}`,
      candidateId: candidate.id,
      ...(rival ? { opponentId: rival.id } : {}),
      startedAt: state.time,
      readyAt: state.time + 0.1 + (1 - controlQuality) * 0.18 + incomingSpeed * 0.015,
      ballEpisode: state.ballEpisode ?? 0,
      origin: { x: state.ball.x, y: state.ball.y },
      controlQuality,
      incomingSpeed,
    });
    return { state: { ...state, ballAcquisition: attempt } };
  }
  if (state.time < active.readyAt) return { state };
  // The broad radius nominates a pursuit, not a contact. Keep that attempt while the
  // ordinary loose-ball assignment brings the claimant to the ball. Securing from
  // two metres stopped the chase and made the new finite-control envelope reject
  // a possession that had never involved an actual foot contact.
  if (!canGroundContact(state, candidate)) return { state };
  const rng = RandomGenerator.fromSeed(active.id);
  const rival = state.players.find((p) => p.id === active.opponentId);
  const contested = Boolean(
    rival &&
      canGroundContact(state, rival) &&
      distance(rival.position, state.ball) < distance(candidate.position, state.ball) + 0.35,
  );
  const secured =
    (active.incomingSpeed < 5 && !contested) ||
    rng.float() <
      Math.max(
        0.15,
        0.48 + active.controlQuality * 0.48 - active.incomingSpeed / 90 - (contested ? 0.22 : 0),
      );
  const next = { ...state };
  delete next.ballAcquisition;
  if (!secured) {
    // Failed control is a real contact and new trajectory, still a loose ball. No turnover.
    return {
      state: { ...next, ball: { ...next.ball, lastTouchPlayerId: candidate.id } },
      failedVelocity: { x: (rng.float() - 0.5) * 5, y: (rng.float() - 0.5) * 5 },
    };
  }
  if (contested && rival)
    next.defensiveEpisodes = [
      ...(next.defensiveEpisodes ?? []),
      {
        participants: [candidate.id, rival.id].sort() as [string, string],
        ballEpisode: state.ballEpisode ?? 0,
        resolvedAt: state.time,
        position: { x: state.ball.x, y: state.ball.y },
      },
    ].slice(-22);
  return { state: next, securedPlayerId: candidate.id };
};
