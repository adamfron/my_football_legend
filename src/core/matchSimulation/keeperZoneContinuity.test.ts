// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { ownsOrdinaryLowBallInterval } from './ordinaryContactInterval';

const incident = JSON.parse(
  gunzipSync(
    readFileSync('docs/performance/pr216/next-keeper-zone-starvation-release-v2.json.gz'),
  ).toString(),
) as { initial: TacticalMatchState; terminal: TacticalMatchState };
const reload = (s: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;

it.each(['terminal'] as const)(
  'resumes the exact keeper-zone %s through real foot contact and native reloads',
  (key) => {
    const initial = reload(incident[key]);
    expect(ownsOrdinaryLowBallInterval(initial, 0.025)).toBe(true);
    expect(initial.ball.ownerId).toBeUndefined();
    let a = initial,
      b = reload(a),
      first: TacticalMatchState['lastGroundContact'];
    for (let i = 0; i < 400; i++) {
      a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
      b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
      expect(a.executionWitnesses?.unresolved).toBeUndefined();
      if (!first && a.lastGroundContact && a.lastGroundContact.at > initial.time)
        first = a.lastGroundContact;
      if (!first) expect(a.ball.ownerId).toBeUndefined();
      if (i % 40 === 0) {
        expect(reload(a)).toEqual(reload(b));
        b = reload(b);
      }
    }
    expect(first?.executed).toBe(true);
    expect(first?.surfaceContact?.available).toBe(true);
    expect(first!.at).toBeGreaterThan(initial.time);
    expect(first!.at).toBeLessThan(initial.time + 0.5);
    expect(a.decisionIndex).toBeGreaterThan(initial.decisionIndex);
    expect(Math.hypot(a.ball.x - initial.ball.x, a.ball.y - initial.ball.y)).toBeGreaterThan(0.5);
  },
);

it('retains the earlier keeper/body overlap as invalid input under upright keeper support', () => {
  const s = reload(incident.initial);
  const out = stepTacticalMatchAfterDecisionProbe(s, 0.025);
  expect(out.executionWitnesses?.unresolved?.source).toBe('initial_body_overlap');
  for(const p of out.players)
    expect(p.position).toEqual(s.players.find(q=>q.id===p.id)!.position);
});

it('preserves held-ball, high-ball and shot authority while low foot play stays shared', () => {
  const s = reload(incident.initial);
  const keeper = s.players.find((p) => p.slot.position === 'goalkeeper' && p.team === 'away')!;
  expect(ownsOrdinaryLowBallInterval(s, 0.025)).toBe(true);
  expect(ownsOrdinaryLowBallInterval({ ...s, ball: { ...s.ball, ownerId: keeper.id } }, 0.025)).toBe(true);
  expect(ownsOrdinaryLowBallInterval({ ...s, ball: { ...s.ball, velocity: { x: 1, y: 0, z: 0 } } }, 0.025)).toBe(true);
  for (const ball of [
    { ...s.ball, heldByKeeperId: keeper.id },
    { ...s.ball, height: 1 },
    { ...s.ball, height: 0.4, velocity: { x: 1, y: 0, z: 0 } },
    { ...s.ball, shot: s.lastShot! },
  ])
    expect(ownsOrdinaryLowBallInterval({ ...s, ball }, 0.025)).toBe(false);
});
