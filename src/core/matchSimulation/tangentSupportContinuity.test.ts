// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { findPlayerBodyContact, playerBodyClearance } from './playerBodyContact';

const failure = JSON.parse(gunzipSync(readFileSync(
  'docs/performance/pr216/failure-keeper-cycle-v11.json.gz',
)).toString()) as { initial: TacticalMatchState; terminal: TacticalMatchState };
const reload = (s: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;
const ids = ['geometry:anchor:14', 'geometry:opponent:8'];

it('preserves new grazing-impact uncertainty while allowing the same latched support intersection', () => {
  const c = failure.terminal.multiBodyResolutions!.find(c => c.reason === 'near_tangent_body')!;
  const impulse = c.impulses[0]!;
  const [a, b] = ids.map((id, i) => ({
    ...failure.initial.players.find(p => p.id === id)!,
    position: {
      x: impulse.positionsAtContact![i]!.x - impulse.before[i]!.x * 0.003,
      y: impulse.positionsAtContact![i]!.y - impulse.before[i]!.y * 0.003,
    },
    velocity: impulse.before[i]!,
  }));
  expect(playerBodyClearance(a!, b!)).toBeGreaterThan(1e-8);
  expect(findPlayerBodyContact(a!, b!, 0.025, false)?.unresolved).toBe('near_tangent_body');
  const supported = findPlayerBodyContact(a!, b!, 0.025, true)!;
  expect(supported.unresolved).toBeUndefined();
  expect(supported.at).toBeCloseTo(0.003, 6);
});

it('continues the native third-body-induced support recontact without penetration or saved divergence', () => {
  let a = reload(failure.initial), b = reload(a), repaired = false;
  for (let i = 0; i < 400; i++) {
    a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
    b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
    expect(a.executionWitnesses?.unresolved).toBeUndefined();
    const pair = ids.map(id => a.players.find(p => p.id === id)!);
    expect(playerBodyClearance(pair[0]!, pair[1]!)).toBeGreaterThanOrEqual(-1e-7);
    for (const c of a.multiBodyResolutions ?? []) {
      expect(c.maximumPenetration).toBeLessThanOrEqual(1e-7);
      expect(c.energyAfter).toBeLessThanOrEqual(c.energyBefore + 1e-7);
      if (c.at > 3699.663 && c.at < 3699.664 && ids.every(id => c.participants.includes(id))) {
        repaired = true;
        expect(c.unresolved).toBe(false);
        expect(c.positionCorrection).toBe(0);
        expect(c.impulses[0]!.kind).toBe('support');
        expect(c.impulses[0]!.restitution).toBe(0);
        for (const axis of ['x', 'y'] as const)
          expect(c.momentumAfter[axis]).toBeCloseTo(c.momentumBefore[axis], 9);
      }
    }
    if (i % 40 === 0) { expect(reload(a)).toEqual(reload(b)); b = reload(b); }
  }
  expect(repaired).toBe(true);
  expect(a.decisionIndex).toBeGreaterThan(failure.initial.decisionIndex);
}, 15_000);
