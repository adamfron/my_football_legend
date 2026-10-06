import { z } from 'zod';
import { RandomGenerator } from '../random/RandomGenerator';
import { distance, pitchPointSchema } from './matchSpace';
import type { TacticalMatchState, MatchPlayerState } from './matchState';

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
  const rng = RandomGenerator.fromSeed(active.id);
  const rival = state.players.find((p) => p.id === active.opponentId);
  const contested = Boolean(
    rival &&
      distance(rival.position, state.ball) <= radius &&
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
  if (rival)
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
