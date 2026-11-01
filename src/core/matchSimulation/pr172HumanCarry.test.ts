// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pushedTouchFixture } from '../../../scripts/pr168Fixtures';
import { carryProbe } from '../../../scripts/pr171Probes';
import { deriveCarryPursuit } from './carryPursuit';
import { humanPossessionRedecisionReason } from './possessionAgency';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { distance } from './matchSpace';

describe('PR172 human carry intention', () => {
  it('continues the exact PR171 open-space stride past the former heavy-touch prompt', () => {
    const result = carryProbe('straight');
    const prompt = result.firstPrompt as { at: number; gate: { signature: string } } | null;
    if (prompt) {
      expect(prompt.at).toBeGreaterThan(601.45);
      expect(prompt.gate.signature).not.toContain('heavy_touch');
    } else {
      // PR210 no longer guarantees an ordinary menu between a recovery and the
      // real later loss. This exact stride still recovers and executes a touch.
      expect(result.recoveredAt).not.toBeNull();
      expect(result.physicalContactAt).toBeGreaterThanOrEqual(result.recoveredAt!);
      expect(result.lastLoss!.at).toBeGreaterThan(result.physicalContactAt!);
      expect(result.endOwner).not.toBe(result.actorId);
    }
  });
  it.each([false, true])(
    'recovers the ball before completing a crossed waypoint, reversed=%s',
    (reversed) => {
      const { state, actorId } = pushedTouchFixture({ loose: true, reversed });
      const actor = state.players.find((p) => p.id === actorId)!;
      state.ballCarrierIntent = { ...state.ballCarrierIntent!, target: { ...actor.position } };
      expect(deriveCarryPursuit(state, actor)).toBeDefined();
      expect(humanPossessionRedecisionReason(state)).not.toBe('carry_decision_waypoint');
      const target = state.ballCarrierIntent.target;
      const next = stepTacticalMatchAfterDecisionProbe(state);
      expect(next.ballCarrierIntent?.target).toEqual(target);
      expect(next.ball.ownerId).toBeUndefined();
      expect(distance(next.ball, state.ball)).toBeGreaterThan(0);
    },
  );
  it('keeps a genuinely arriving challenge actionable during a recoverable stride', () => {
    const { state, actorId } = pushedTouchFixture({ loose: false, gap: 2.6 });
    const actor = state.players.find((p) => p.id === actorId)!;
    const opponent = state.players.find(
      (p) => p.team !== actor.team && p.slot.position !== 'goalkeeper',
    )!;
    opponent.position = { x: actor.position.x + 2, y: actor.position.y };
    state.actionCooldown = 0;
    expect(deriveCarryPursuit(state, actor)).toBeDefined();
    expect(humanPossessionRedecisionReason(state)).toBe('major_pressure');
    expect(projectPlayerDecisionOpportunity(state)).toBeDefined();
  });
  // All nine eight-second PR171 probes remain in the opt-in before/after runner.
  // CI isolates invalidation at the real state transition instead of repeating that cohort.
  it.each(['intercepted', 'unreachable', 'out', 'expired'])(
    'invalidates a %s pursuit without granting physical recovery',
    (name) => {
      const { state, actorId } = pushedTouchFixture({
        loose: true,
        gap: name === 'unreachable' ? 20 : 2.6,
        boundary: name === 'out',
      });
      const actor = state.players.find((p) => p.id === actorId)!;
      if (name === 'intercepted') {
        const foe = state.players.find(
          (p) => p.team !== actor.team && p.slot.position !== 'goalkeeper',
        )!;
        foe.position = { x: state.ball.x, y: state.ball.y };
        state.ball.ownerId = foe.id;
        state.ball.lastTouchPlayerId = foe.id;
      }
      if (name === 'expired') state.ballCarrierIntent!.expiresAt = state.time;
      if (name === 'out') state.ball.y = -0.2;
      expect(deriveCarryPursuit(state, actor)).toBeUndefined();
      const next = stepTacticalMatchAfterDecisionProbe(state);
      expect(next.ball.ownerId).not.toBe(actorId);
      expect(next.ballCarrierIntent).toBeUndefined();
    },
  );
});
