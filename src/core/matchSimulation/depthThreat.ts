import { z } from 'zod';
import {
  attacksRight,
  clampPitchPoint,
  distance,
  distanceToSegment,
  pitchPointSchema,
} from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { secondLastOpponentLine } from './offside';
import { deriveMovementCapability } from './locomotion';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { canParticipatePhysically } from './matchInjuries';
import { isMatchGoalkeeper } from './matchGoalkeeper';

export const depthThreatSchema = z.object({
  runnerId: z.string(),
  target: pitchPointSchema,
  releaseIn: z.number().nonnegative(),
  onsideAtPreparation: z.boolean(),
  laneClearance: z.number().nonnegative(),
  forwardSpeed: z.number().nonnegative(),
  credible: z.boolean(),
});
export type DepthThreat = z.infer<typeof depthThreatSchema>;

/** Observable preparation only. No future action, RNG sample or execution outcome is read. */
export const passerReleaseHorizon = (state: TacticalMatchState, passer: MatchPlayerState) => {
  const preparation = state.onBallPreparation;
  const remaining = preparation?.actorId === passer.id ? preparation.readyAt - state.time : 0;
  const towardGoal = attacksRight(passer) ? Math.PI / 2 : -Math.PI / 2;
  const turn = Math.abs(normalizeAngle(towardGoal - passer.facingAngle));
  return Math.min(1.2, Math.max(0.12, remaining, state.actionCooldown, turn / 5));
};

/** A shoulder is a staging point. As release approaches, velocity must carry the runner
 * to the line, rather than braking at a destination perpetually 1–3 m short of it. */
export const timedDepthTarget = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  runner: MatchPlayerState,
  channelY: number,
) => {
  const dir = attacksRight(passer) ? 1 : -1;
  const line =
    dir > 0
      ? Math.max(52.5, state.ball.x, secondLastOpponentLine(state, passer.team))
      : Math.min(52.5, state.ball.x, secondLastOpponentLine(state, passer.team));
  const releaseIn = passerReleaseHorizon(state, passer);
  const capability = deriveMovementCapability(runner);
  const forwardSpeed = Math.max(0, dir * runner.velocity.x);
  const remaining = dir * (line - runner.position.x);
  const travelBeforeRelease =
    forwardSpeed * releaseIn + 0.5 * capability.acceleration * releaseIn ** 2;
  const readingError = (1 - runner.profile.attributes.gameReading / 100) * 0.9;
  const launching = remaining > travelBeforeRelease + readingError || releaseIn < 0.25;
  const depth =
    remaining < -0.3
      ? line - dir * (1 + readingError)
      : launching
        ? line + dir * Math.min(10, capability.maximumSprintSpeed * 1.1)
        : line - dir * (travelBeforeRelease + readingError);
  return clampPitchPoint({ x: depth, y: channelY });
};

/** Credibility is local geometry and current motion, not the fact that someone has a run ID. */
export const observeDepthThreats = (state: TacticalMatchState): DepthThreat[] => {
  const passer = state.players.find((p) => p.id === state.ball.ownerId);
  if (!passer || state.restart || state.scenario !== 'open_play') return [];
  const dir = attacksRight(passer) ? 1 : -1;
  const line =
    dir > 0
      ? Math.max(52.5, state.ball.x, secondLastOpponentLine(state, passer.team))
      : Math.min(52.5, state.ball.x, secondLastOpponentLine(state, passer.team));
  const releaseIn = passerReleaseHorizon(state, passer);
  const opponents = state.players.filter(
    (p) =>
      p.team !== passer.team && canParticipatePhysically(p) && !state.discipline?.[p.id]?.sentOff,
  );
  return state.players
    .filter(
      (p) =>
        p.team === passer.team &&
        p.id !== passer.id &&
        !isMatchGoalkeeper(p) &&
        canParticipatePhysically(p) &&
        !state.discipline?.[p.id]?.sentOff,
    )
    .flatMap((runner) => {
      const gap = dir * (line - runner.position.x);
      if (gap < -2 || gap > 16 || dir * (runner.position.x - passer.position.x) < 4) return [];
      const forwardSpeed = Math.max(0, dir * runner.velocity.x);
      const target = clampPitchPoint({
        x: runner.position.x + dir * Math.min(12, forwardSpeed * 1.4 + 2),
        y: runner.position.y + runner.velocity.y * 0.7,
      });
      const laneClearance = Math.min(
        12,
        ...opponents
          .filter(
            (p) => distance(p.position, passer.position) > 2 && dir * (target.x - p.position.x) > 3,
          )
          .map((p) => distanceToSegment(p.position, passer.position, target)),
      );
      const onsideAtPreparation = dir * (runner.position.x - line) <= 0.1;
      return [
        {
          runnerId: runner.id,
          target,
          releaseIn,
          onsideAtPreparation,
          laneClearance,
          forwardSpeed,
          credible:
            onsideAtPreparation &&
            forwardSpeed > 1.2 &&
            gap < forwardSpeed * 1.5 + 5 &&
            releaseIn < 0.7 &&
            laneClearance > 1.4,
        },
      ];
    });
};

export const depthDefenceSchema = z.object({
  defenderId: z.string(),
  runnerId: z.string(),
  target: pitchPointSchema,
  intention: z.enum(['track', 'hold_line', 'handoff']),
  recoveryDisadvantage: z.number().finite(),
});

/** One marker owns each credible runner; nearby covering bodies retain their own jobs.
 * A noncredible/offside run leaves the line intact. No whole-block retreat offset exists. */
export const deriveDepthDefence = (
  state: TacticalMatchState,
  threats = observeDepthThreats(state),
) => {
  const passer = state.players.find((p) => p.id === state.ball.ownerId);
  if (!passer) return [];
  const dir = attacksRight(passer) ? 1 : -1;
  const defenders = state.players.filter(
    (p) =>
      p.team !== passer.team &&
      !isMatchGoalkeeper(p) &&
      canParticipatePhysically(p) &&
      !state.discipline?.[p.id]?.sentOff,
  );
  const assigned = new Set<string>();
  return threats
    .filter((t) => t.credible)
    .flatMap((threat) => {
      const runner = state.players.find((p) => p.id === threat.runnerId)!;
      const marker = defenders
        .filter(
          (p) =>
            !assigned.has(p.id) &&
            Math.abs(p.position.y - runner.position.y) < 13 &&
            dir * (p.position.x - runner.position.x) > -4,
        )
        .sort(
          (a, b) =>
            distance(a.position, runner.position) - distance(b.position, runner.position) ||
            a.id.localeCompare(b.id),
        )[0];
      if (!marker) return [];
      const toTarget = {
        x: threat.target.x - marker.position.x,
        y: threat.target.y - marker.position.y,
      };
      const turn = Math.abs(normalizeAngle(angleForVector(toTarget) - marker.facingAngle));
      const capability = deriveMovementCapability(marker);
      const turnTime =
        Math.max(0, turn - Math.PI / 3) / (2.2 + marker.profile.attributes.agility * 0.038);
      const recoveryDisadvantage =
        threat.forwardSpeed -
        Math.max(0, dir * marker.velocity.x) +
        turnTime * capability.acceleration;
      const cover = defenders.some(
        (p) =>
          p.id !== marker.id &&
          dir * (p.position.x - threat.target.x) > 1 &&
          Math.abs(p.position.y - threat.target.y) < 5,
      );
      // Deep cover can accept a handoff; a fast aligned marker may hold a coherent trap.
      const lineGap = dir * (marker.position.x - runner.position.x);
      const track =
        !cover &&
        (recoveryDisadvantage > 0.5 || lineGap < threat.forwardSpeed * threat.releaseIn + 2);
      assigned.add(marker.id);
      return [
        {
          defenderId: marker.id,
          runnerId: runner.id,
          intention: track
            ? ('track' as const)
            : cover
              ? ('handoff' as const)
              : ('hold_line' as const),
          target: track
            ? clampPitchPoint({
                x: Math.max(0.4, Math.min(104.6, threat.target.x + dir * 1.5)),
                y: runner.position.y + (34 - runner.position.y) * 0.08,
              })
            : marker.target,
          recoveryDisadvantage,
        },
      ];
    });
};
