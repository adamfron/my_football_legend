// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { shotProbeFixture, PR171_SHOT_CASES } from '../../../scripts/pr171Probes';
import { enumerateCanonicalShootingOptions, canExecuteCanonicalShot } from './shootingOptions';
import { resolveMatchAction, rankAvailableActionsForAI } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { playerContactGeometry } from './ballContactGeometry';
import { distance } from './matchSpace';

describe('PR172 shot contact and identity', () => {
  it('rejects a settled kick at a recoverable pushed ball without granting contact or release', () => {
    const { state, actorId } = shotProbeFixture('pushed_ball');
    const action = {
      type: 'shot' as const,
      actorId,
      intent: 'driven' as const,
      contact: 'settled' as const,
      target: { x: 105, y: 34 },
    };
    expect(
      distance(state.players.find((p) => p.id === actorId)!.position, state.ball),
    ).toBeGreaterThan(2);
    expect(enumerateCanonicalShootingOptions(state, actorId)).toHaveLength(0);
    expect(canExecuteCanonicalShot(state, action)).toBe(false);
    expect(resolveMatchAction(state, action, 'human_selected')).toBe(state);
    expect(state.ball.shot).toBeUndefined();
  });
  it('revalidates a previously available shot when a real touch or interception removes contact', () => {
    const { state, actorId } = shotProbeFixture('unmarked_striker');
    const shot = enumerateCanonicalShootingOptions(state, actorId).find((a) => a.type === 'shot')!;
    expect(shot.type).toBe('shot');
    if (shot.type !== 'shot') throw new Error('Missing shot');
    expect(canExecuteCanonicalShot(state, shot)).toBe(true);
    const pushed = { ...state, ball: { ...state.ball, x: state.ball.x + 4 } };
    expect(resolveMatchAction(pushed, shot, 'human_selected')).toBe(pushed);
    const intercepted = {
      ...state,
      ball: { ...state.ball, ownerId: state.players.find((p) => p.team === 'away')!.id },
    };
    expect(resolveMatchAction(intercepted, shot, 'human_selected')).toBe(intercepted);
  });
  it.each(PR171_SHOT_CASES.filter((n) => n !== 'pushed_ball'))(
    'keeps the controlled %s opportunities physically conditional',
    (name) => {
      const { state, actorId } = shotProbeFixture(name);
      const ranking = rankAvailableActionsForAI(state, actorId);
      expect(ranking.length).toBeGreaterThan(0);
      const action = ranking[0]!.action;
      const after = resolveMatchAction(state, action, 'autonomous_npc');
      if (action.type === 'shot' && canExecuteCanonicalShot(state, action)) {
        const id = `${state.seed}:shot:${state.decisionIndex + 1}:${actorId}`;
        expect(after.ball.shot?.shotId).toBe(id);
        let next = after;
        for (let i = 0; i < 160 && !next.lastShot?.outcome; i++)
          next = stepTacticalMatchAfterDecisionProbe(next);
        expect(next.ball.shot?.shotId ?? next.lastShot?.shotId).toBe(id);
        expect(next.statistics!.players.reduce((n, p) => n + p.shots, 0)).toBe(1);
      }
    },
  );
  it('uses the actual finite foot envelope rather than a new control radius', () => {
    const { state, actorId } = shotProbeFixture('unmarked_striker');
    const actor = state.players.find((p) => p.id === actorId)!,
      feet = playerContactGeometry(actor);
    state.ball = { ...state.ball, ...feet.rightFoot };
    expect(enumerateCanonicalShootingOptions(state, actorId).length).toBeGreaterThan(0);
    state.ball = { ...state.ball, x: actor.position.x + 5, y: actor.position.y };
    expect(enumerateCanonicalShootingOptions(state, actorId)).toHaveLength(0);
  });
});
