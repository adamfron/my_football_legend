import { z } from 'zod';
import { attacksRight, distance, type PitchPoint } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { canParticipatePhysically } from './matchInjuries';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { STATE_VALUE_CONFIG } from './decisionPolicyConfig';
import { deriveMovementCapability } from './locomotion';
import { secondLastOpponentLine } from './offside';
import { clampPitchPoint } from './matchSpace';

export const transitionOpportunitySchema = z.object({
  active: z.boolean(),
  exposure: z.number().min(0).max(1),
  opponentsAhead: z.number().int().nonnegative(),
  cover: z.number().int().nonnegative(),
  recoverySeconds: z.number().nonnegative(),
  runway: z.number().nonnegative(),
});
/** Direction, momentum and available cover describe a temporary opportunity. A forward pass alone
 * is not a counterattack, and an advanced team is allowed to sprint back and stop it. */
export const evaluateTransitionOpportunity = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  point: PitchPoint = actor.position,
) => {
  const dir = attacksRight(actor) ? 1 : -1;
  const defenders = state.players.filter(
    (p) => p.team !== actor.team && canParticipatePhysically(p) && !isMatchGoalkeeper(p),
  );
  const covering = defenders.filter((p) => dir * (p.position.x - point.x) > 0);
  const opponentsAhead = defenders.length - covering.length;
  const runway = Math.min(45, ...covering.map((p) => Math.max(0, dir * (p.position.x - point.x))));
  const recoverySeconds = Math.min(
    8,
    ...defenders
      .filter((p) => !covering.includes(p))
      .map((p) => {
        const speed = deriveMovementCapability(p).maximumSprintSpeed;
        const returning = Math.max(0, dir * p.velocity.x);
        return (
          distance(p.position, point) / Math.max(2, speed) +
          (speed - returning) / deriveMovementCapability(p).acceleration
        );
      }),
  );
  const exposure = Math.max(
    0,
    Math.min(
      1,
      (opponentsAhead / Math.max(1, defenders.length)) * 0.5 +
        Math.min(1, runway / 30) * 0.3 +
        (Math.max(0, 3 - covering.length) / 3) * 0.2,
    ),
  );
  const change = state.lastPossessionChange;
  const active = Boolean(
    change &&
      change.to === actor.team &&
      state.possessionTeam === actor.team &&
      state.time - change.at <= STATE_VALUE_CONFIG.transitionSeconds &&
      exposure > 0.2,
  );
  return { active, exposure, opponentsAhead, cover: covering.length, recoverySeconds, runway };
};

export const deriveTransitionRuns = (state: TacticalMatchState) => {
  const owner = state.players.find((p) => p.id === state.ball.ownerId);
  if (
    !owner ||
    state.decisionAblation === 'transitions' ||
    !evaluateTransitionOpportunity(state, owner).active
  )
    return [];
  const dir = attacksRight(owner) ? 1 : -1;
  const cover = state.players.filter(
    (p) =>
      p.team === owner.team &&
      p.id !== owner.id &&
      !isMatchGoalkeeper(p) &&
      canParticipatePhysically(p) &&
      dir * (owner.position.x - p.position.x) > 3,
  );
  if (cover.length < 2) return [];
  const line = secondLastOpponentLine(state, owner.team);
  const legal = dir > 0 ? Math.max(52.5, line, state.ball.x) : Math.min(52.5, line, state.ball.x);
  return state.players
    .filter(
      (p) =>
        p.team === owner.team &&
        p.id !== owner.id &&
        p.duty !== 'defend' &&
        canParticipatePhysically(p) &&
        !isMatchGoalkeeper(p) &&
        !(state.playerAgencyEnabled !== false && state.controlledFootballerId === p.id),
    )
    .sort(
      (a, b) =>
        b.profile.attributes.pace +
        dir * b.position.x -
        (a.profile.attributes.pace + dir * a.position.x),
    )
    .slice(0, 2)
    .map((p) => ({
      playerId: p.id,
      target: clampPitchPoint({
        x:
          dir > 0
            ? Math.min(legal - 0.7, p.position.x + 14)
            : Math.max(legal + 0.7, p.position.x - 14),
        y: p.position.y + (34 - p.position.y) * 0.08,
      }),
    }));
};
