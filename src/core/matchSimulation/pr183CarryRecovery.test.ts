// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pushedTouchFixture } from '../../../scripts/pr168Fixtures';
import { deriveCarryPursuit } from './carryPursuit';
import { deriveCarryExecution } from './carryExecution';
import { authoritativeMovementTarget } from './movementAuthority';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { distance } from './matchSpace';

describe('PR183 shared deliberate-touch recovery', () => {
  it.each([false, true])(
    'keeps the same physical chase for human and NPC, reversed=%s',
    (reversed) => {
      const { state, actorId } = pushedTouchFixture({ loose: true, reversed });
      const actor = state.players.find((p) => p.id === actorId)!;
      const human = deriveCarryPursuit(state, actor);
      expect(human).toBeDefined();
      state.playerAgencyEnabled = false;
      state.ballCarrierIntent!.humanSelected = false;
      expect(deriveCarryPursuit(state, actor)).toEqual(human);
      const execution = deriveCarryExecution(state, actor, state.ballCarrierIntent!);
      state.ballCarrierIntent!.pursuingBall = execution.pursuingBall;
      state.ballCarrierIntent!.localTarget = execution.localTarget;
      expect(authoritativeMovementTarget(state, actor, { x: 10, y: 10 })).toEqual(human!.target);
      const next = stepTacticalMatchAfterDecisionProbe(state, 0.025);
      expect(next.ballCarrierIntent?.actorId).toBe(actorId);
      expect(next.ball.ownerId).toBeUndefined();
      expect(distance(next.ball, state.ball)).toBeGreaterThan(0);
      expect(
        distance(next.players.find((p) => p.id === actorId)!.position, actor.position),
      ).toBeGreaterThan(0);
    },
  );

  it.each(['opponent_touch', 'release', 'unreachable', 'new_movement'] as const)(
    'ends the NPC chase after %s without reserving possession',
    (cause) => {
      const { state, actorId } = pushedTouchFixture({
        loose: true,
        gap: cause === 'unreachable' ? 20 : 2.6,
      });
      const actor = state.players.find((p) => p.id === actorId)!;
      state.ballCarrierIntent!.humanSelected = false;
      state.playerAgencyEnabled = false;
      if (cause === 'opponent_touch')
        state.ball.lastTouchPlayerId = state.players.find((p) => p.team !== actor.team)!.id;
      if (cause === 'release') state.ball.travelKind = 'pass';
      if (cause === 'new_movement')
        state.playerMovementIntent = {
          actorId,
          type: 'hold_shape',
          target: actor.position,
          startedAt: state.time,
          expiresAt: state.time + 2,
        };
      expect(deriveCarryPursuit(state, actor)).toBeUndefined();
      expect(state.ball.ownerId).toBeUndefined();
    },
  );
});
