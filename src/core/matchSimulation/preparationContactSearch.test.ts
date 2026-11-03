// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { canonicalStrikeFoot } from './pendingStrike';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
const recorded = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr216/search-bound-origin-keeper-v4.json.gz')).toString(),
) as { initial: TacticalMatchState };
const reload = (s: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;

it('uses the actual pre-onset phase bound, retaining the full bound when a segment crosses onset', () => {
  const s = reload(recorded.initial), p = s.pendingStrike!;
  const actor = s.players.find(a=>a.id===p.actorId)!;
  const before = canonicalStrikeFoot(p, actor, actor, p.plan.foot, s.time, 0.025, 0);
  const idle = canonicalStrikeFoot(undefined, actor, actor, p.plan.foot, s.time, 0.025, 0);
  expect(p.selectedAt + p.path.onset).toBeGreaterThan(s.time + 0.025);
  expect(before.speedBound).toBe(idle.speedBound);
  expect(before.accelerationBound).toBe(idle.accelerationBound);
  for (const axis of ['x', 'y', 'z'] as const)
    expect(before.position[axis]).toBeCloseTo(idle.position[axis], 12);
  const crossing = canonicalStrikeFoot(p, actor, actor, p.plan.foot, s.time + 0.02, 0.025, 0);
  expect(crossing.accelerationBound).toBeUndefined();
  expect(crossing.speedBound).toBeGreaterThanOrEqual(p.path.speedBound);
  const completed = canonicalStrikeFoot(p, actor, actor, p.plan.foot,
    p.selectedAt + p.path.onset + p.path.duration + 0.03, 0.025, 0);
  expect(completed.accelerationBound).toBeDefined();
  expect(completed.speedBound).toBeLessThan(p.path.speedBound);
});

it('continues the recorded conservative-search exhaustion with native saved equivalence', () => {
  let a = reload(recorded.initial), b = reload(a);
  const initial = a;
  for (let i = 0; i < 400; i++) {
    a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
    b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
    expect(a.executionWitnesses?.unresolved).toBeUndefined();
    if (i % 40 === 0) {
      expect(reload(a)).toEqual(reload(b));
      b = reload(b);
    }
  }
  expect(a.decisionIndex).toBeGreaterThan(initial.decisionIndex);
  expect(a.lastGroundContact!.at).toBeGreaterThan(initial.time);
});
