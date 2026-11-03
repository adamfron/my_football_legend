// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { ownsOrdinaryLowBallInterval } from './ordinaryContactInterval';
import { isMatchGoalkeeper } from './matchGoalkeeper';

const fixture = JSON.parse(gunzipSync(readFileSync(
  'docs/performance/pr216/rebound-entry-origin-v8.json.gz',
)).toString()) as { initial: TacticalMatchState; before: TacticalMatchState };
const reload = (s: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;

it('intercepts a fast low header rebound before the recorded foot entry and preserves native continuation', () => {
  let a = reload(fixture.initial), b = reload(a);
  expect(ownsOrdinaryLowBallInterval(a, 0.025)).toBe(true);
  let contactAt: number | undefined;
  for (let i = 0; i < 400; i++) {
    a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
    b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
    expect(a.executionWitnesses?.unresolved).toBeUndefined();
    if (!contactAt && (a.lastGroundContact?.at ?? 0) > fixture.initial.time)
      contactAt = a.lastGroundContact!.at;
    if (i % 40 === 0) { expect(reload(a)).toEqual(reload(b)); b = reload(b); }
  }
  expect(contactAt).toBeGreaterThan(fixture.initial.time);
  expect(contactAt).toBeLessThan(1349.15);
  expect(a.time).toBeGreaterThan(1349.35);
  expect(a.decisionIndex).toBeGreaterThan(fixture.initial.decisionIndex);
}, 15_000);

it('reserves near-keeper rebounds while returning an acquired ground ball to foot contact', () => {
  const s = reload(fixture.before);
  const keeper = s.players.find(isMatchGoalkeeper)!;
  const near = { ...s, ball: { ...s.ball, x: keeper.position.x, y: keeper.position.y } };
  expect(ownsOrdinaryLowBallInterval(s, 0.025)).toBe(true);
  expect(ownsOrdinaryLowBallInterval(near, 0.025)).toBe(false);
  expect(ownsOrdinaryLowBallInterval({ ...near, ball: { ...near.ball, ownerId: keeper.id } }, 0.025)).toBe(true);
  expect(ownsOrdinaryLowBallInterval({ ...s, ball: { ...s.ball, height: 0.4 } }, 0.025)).toBe(true);
  expect(ownsOrdinaryLowBallInterval({ ...near, ball: { ...near.ball, height: 0.4 } }, 0.025)).toBe(false);
  expect(ownsOrdinaryLowBallInterval({ ...s, ball: { ...s.ball, height: 0.7 } }, 0.025)).toBe(false);
  expect(ownsOrdinaryLowBallInterval({ ...s, ball: { ...s.ball, heldByKeeperId: keeper.id } }, 0.025)).toBe(false);
});

it('keeps one contact owner as a rebound rises through the strike-height boundary', () => {
  const failure = JSON.parse(gunzipSync(readFileSync(
    'docs/performance/pr216/settled-rebound-failure-v9.json.gz',
  )).toString()) as { recent: TacticalMatchState[] };
  let a = reload(failure.recent.find(s => s.time > 837.3)!);
  let b = reload(a);
  let aboveStrikeHeight = false;
  for (let i = 0; i < 400; i++) {
    a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
    b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
    aboveStrikeHeight ||= (a.ball.height ?? 0.11) > 0.24;
    expect(a.executionWitnesses?.unresolved).toBeUndefined();
    if (i % 40 === 0) { expect(reload(a)).toEqual(reload(b)); b = reload(b); }
  }
  expect(aboveStrikeHeight).toBe(true);
  expect(a.time).toBeGreaterThan(837.425);
}, 15_000);
