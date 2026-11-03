// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { ownsOrdinaryLowBallInterval } from './ordinaryContactInterval';
import { canContactAfterThrowIn } from './throwIn';
const fixture = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr216/release-foot-entry-origin-keeper-v3.json.gz')).toString(),
) as { initial: TacticalMatchState; terminal: TacticalMatchState };
const reload = (s: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;

it('keeps low-foot collision authority after a throw is released, before presentation expires', () => {
  let a = reload(fixture.initial), b = reload(a);
  const initial = a, thrower = a.throwInRestriction!.throwerId;
  expect(a.restart?.phase).toBe('release');
  expect(ownsOrdinaryLowBallInterval(a, 0.025)).toBe(true);
  expect(canContactAfterThrowIn(a, thrower)).toBe(false);
  let contact: TacticalMatchState['lastGroundContact'];
  for (let i = 0; i < 400; i++) {
    a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
    b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
    expect(a.executionWitnesses?.unresolved).toBeUndefined();
    if (!contact && a.lastGroundContact && a.lastGroundContact.at > initial.time)
      contact = a.lastGroundContact;
    if (!contact) expect(canContactAfterThrowIn(a, thrower)).toBe(false);
    if (i % 40 === 0) {
      expect(reload(a)).toEqual(reload(b));
      b = reload(b);
    }
  }
  expect(contact?.executed).toBe(true);
  expect(contact?.surfaceContact?.available).toBe(true);
  expect(contact!.at).toBeLessThan(4843.075);
  expect(contact!.actorId).not.toBe(thrower);
  expect(a.decisionIndex).toBeGreaterThan(initial.decisionIndex);
}, 15_000);

it('retains restart setup authority and the historical pair prototype', () => {
  const s = reload(fixture.initial);
  expect(ownsOrdinaryLowBallInterval({ ...s, restart: { ...s.restart!, phase: 'preparing' } }, 0.025)).toBe(false);
  expect(ownsOrdinaryLowBallInterval({ ...s, experimentalPlayerBodyImpulse: 'upright-pair-dev-v1' }, 0.025)).toBe(false);
});
