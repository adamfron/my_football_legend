// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { attacksRight, distance } from './matchSpace';
import { evaluateAerialContact } from './aerialPlay';
import { evaluateControlledState } from './decisionStateValue';
import { roleControlledValue } from './roleTactics';

const validate = (state: TacticalMatchState): TacticalMatchState => {
  tacticalMatchStateSchema.parse(state);
  return state;
};
const load = (name: string): TacticalMatchState =>
  validate(
    JSON.parse(
      gunzipSync(readFileSync(`docs/performance/pr183-evidence/${name}.json.gz`)).toString(),
    ),
  );
const blocked = (): TacticalMatchState =>
  validate(
    JSON.parse(
      gunzipSync(
        readFileSync('docs/performance/pr183-evidence/liveness-blocker.json.gz'),
      ).toString(),
    ).state,
  );

describe('PR183 closure: loose airborne contacts', () => {
  it('plays a physically reachable shot rebound by header without awarding secure possession', () => {
    const before = blocked();
    const after = stepTacticalMatchAfterDecisionProbe(before, 0.025);
    expect(after.decisionIndex).toBe(before.decisionIndex + 1);
    expect(after.latestAction?.type).toBe('header');
    const winner = before.players.find((p) => p.id === after.lastAerialContact?.winnerId)!;
    expect(evaluateAerialContact(winner, before.ball)).toBeDefined();
    expect(distance(after.lastAerialContact!.point, before.ball)).toBeLessThan(0.05);
    expect(after.ball.lastTouchPlayerId).toBe(winner.id);
    expect(after.ball.ownerId).toBeUndefined();
    expect(after.ball.releaseHeight).toBeGreaterThan(1.5);
    expect(Math.hypot(after.ball.velocity!.x, after.ball.velocity!.y)).toBeGreaterThan(5);
    tacticalMatchStateSchema.parse(after);
  });

  it('does not manufacture a header when every body is out of contact range', () => {
    const before = blocked();
    before.players = before.players.map((p) => ({
      ...p,
      position: { x: 90, y: 60 },
      target: { x: 90, y: 60 },
      velocity: { x: 0, y: 0 },
    }));
    const after = stepTacticalMatchAfterDecisionProbe(before, 0.025);
    expect(after.decisionIndex).toBe(before.decisionIndex);
    expect(after.ball.ownerId).toBeUndefined();
    expect(after.ball.height).toBeLessThan(before.ball.height!);
    expect(after.ball.lastTouchPlayerId).toBe(before.ball.lastTouchPlayerId);
  });

  it('does not repeat the same header while the new ball flight is still leaving its contact', () => {
    const before = blocked();
    let after = stepTacticalMatchAfterDecisionProbe(before, 0.025);
    const headerId = after.lastAerialContact!.id;
    const index = after.decisionIndex;
    after = stepTacticalMatchAfterDecisionProbe(after, 0.025);
    expect(after.decisionIndex).toBe(index);
    expect(after.lastAerialContact!.id).toBe(headerId);
    expect(after.ball.ownerId).toBeUndefined();
  });
});

describe('PR183 closure: frozen long R3 retreats', () => {
  it.each(['pr183-development-ww-1', 'pr183-validation-ww-1', 'pr183-validation-sw-1'])(
    'finds an actual pass before another extreme retreat: %s',
    (id) => {
      const initial = load(`closure-retreat-${id}`);
      let state = initial;
      const actorId = state.ball.ownerId!;
      const actor = state.players.find((p) => p.id === actorId)!;
      const direction = attacksRight(actor) ? 1 : -1;
      let retreat = 0;
      while (state.time < initial.time + 30 && state.ball.ownerId === actorId) {
        state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
        retreat = Math.max(
          retreat,
          (actor.position.x - state.players.find((p) => p.id === actorId)!.position.x) * direction,
        );
      }
      expect(retreat).toBeLessThan(12);
      expect(state.lastPassDiagnostic?.releasedAt ?? 0).toBeGreaterThan(initial.time);
      expect(state.time).toBeLessThan(initial.time + 20);
    },
  );

  it('values equally connected central possession less near its own goal', () => {
    const state = load('closure-retreat-pr183-development-ww-1');
    const actor = state.players.find((p) => p.id === state.ball.ownerId)!;
    const move = (dx: number) => ({
      ...state,
      players: state.players.map((p) => ({
        ...p,
        position: { x: Math.max(0, p.position.x + dx), y: p.position.y },
        velocity: { x: 0, y: 0 },
      })),
    });
    const advanced = move(0),
      deep = move(-20);
    const a = advanced.players.find((p) => p.id === actor.id)!;
    const b = deep.players.find((p) => p.id === actor.id)!;
    const front = evaluateControlledState(advanced, a, a.position);
    const rear = evaluateControlledState(deep, b, b.position);
    expect(front.outlets).toBe(rear.outlets);
    expect(front.space).toBeCloseTo(rear.space, 10);
    expect(front.value).toBeGreaterThan(rear.value);
    expect(roleControlledValue(advanced, a, a.position, 0)).toBeGreaterThan(
      roleControlledValue(deep, b, b.position, 0),
    );
  });
});
