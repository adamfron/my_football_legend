import type { TacticalMatchState } from './matchState';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { isRestartSetup } from './restartPhase';

/** Low ordinary football has one owner across reception, carry and release.
 * First-time intentions, aerials and active keeper paths retain their owner.
 * Never service this ball in both the shared interval and a historical branch. */
export const ownsOrdinaryLowBallInterval = (s: TacticalMatchState, dt: number) => {
  if (
    s.experimentalPlayerBodyImpulse !== 'upright-cluster-dev-v1' ||
    (s.scenario !== 'open_play' && s.restart?.phase !== 'release') ||
    isRestartSetup(s) ||
    s.postGoal ||
    s.goalCompletionUntil !== undefined ||
    s.pendingStrike ||
    s.defensiveChallenge?.physicalAttempt ||
    s.pendingReceptionIntent ||
    s.ball.heldByKeeperId ||
    s.ball.shot ||
    (!s.ball.ownerId &&
      (s.ball.height ?? 0.11) + Math.min(0, s.ball.velocity?.z ?? 0) * dt > 0.65)
  )
    return false;
  const travel = Math.hypot(s.ball.velocity?.x ?? 0, s.ball.velocity?.y ?? 0) * dt;
  const keeperNear = s.players.some(
    (p) =>
      isMatchGoalkeeper(p) &&
      Math.hypot(p.position.x - s.ball.x, p.position.y - s.ball.y) <=
        3 + travel + Math.hypot(p.velocity.x, p.velocity.y) * dt,
  );
  // Reserve a rebound for an active keeper intervention, not its entire lineage.
  // A low rebound outside that reach must meet the same solid feet as a pass.
  if (
    !s.ball.ownerId &&
    s.lastShot &&
    s.pendingPossessionLoss?.id === `${s.seed}:shot-rebound:${s.lastShot.shotId}` &&
    keeperNear &&
    ((s.ball.height ?? 0.11) > 0.24 ||
      Math.hypot(s.ball.velocity?.x ?? 0, s.ball.velocity?.y ?? 0, s.ball.velocity?.z ?? 0) > 0.5)
  ) return false;
  // Low foot play has the same authority before acquisition, during a carry,
  // and when a challenge starts. Held balls and live shots were excluded above.
  if ((s.ball.height ?? 0.11) <= 0.24) return true;
  return !keeperNear;
};
