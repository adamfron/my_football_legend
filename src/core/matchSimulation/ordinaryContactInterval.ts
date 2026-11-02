import type { TacticalMatchState } from './matchState';
import { isMatchGoalkeeper } from './matchGoalkeeper';

/** Low ordinary football has one owner across reception, carry and release.
 * First-time intentions, shot rebounds, aerials and keeper zones retain their lawful owner.
 * Never service this ball in both the shared interval and a historical branch. */
export const ownsOrdinaryLowBallInterval = (s: TacticalMatchState, dt: number) => {
  if (
    s.experimentalPlayerBodyImpulse !== 'upright-cluster-dev-v1' ||
    s.scenario !== 'open_play' ||
    s.restart ||
    s.postGoal ||
    s.goalCompletionUntil !== undefined ||
    s.pendingStrike ||
    s.defensiveChallenge ||
    s.pendingReceptionIntent ||
    s.ball.heldByKeeperId ||
    s.ball.shot ||
    (!s.ball.ownerId && !s.ball.travelKind && s.ball.looseSince === undefined) ||
    (s.ball.height ?? 0.11) + Math.max(0, s.ball.velocity?.z ?? 0) * dt > 0.24 ||
    (s.lastShot && s.pendingPossessionLoss?.id === `${s.seed}:shot-rebound:${s.lastShot.shotId}`)
  )
    return false;
  const travel = Math.hypot(s.ball.velocity?.x ?? 0, s.ball.velocity?.y ?? 0) * dt;
  return !s.players.some(
    (p) =>
      isMatchGoalkeeper(p) &&
      Math.hypot(p.position.x - s.ball.x, p.position.y - s.ball.y) <=
        3 + travel + Math.hypot(p.velocity.x, p.velocity.y) * dt,
  );
};
