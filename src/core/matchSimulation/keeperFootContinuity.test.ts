// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { applyCanonicalBallControl, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { deriveLowerBodyGeometry } from './lowerBodyGeometry';
import { ownsOrdinaryLowBallInterval } from './ordinaryContactInterval';
import { assessFirstTouch } from './firstTouch';
const fixture = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr216/keeper-foot-entry-origin-v6.json.gz')).toString(),
) as { initial: TacticalMatchState; before: TacticalMatchState };
const reload = (s: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;

it('keeps a keeper foot carry solid before a standing challenge activates shared contact', () => {
  let a = reload(fixture.initial), b = reload(a);
  const initial = a;
  expect(ownsOrdinaryLowBallInterval(a, 0.025)).toBe(true);
  for (let i = 0; i < 400; i++) {
    a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
    b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
    expect(a.executionWitnesses?.unresolved).toBeUndefined();
    const keeper = a.players.find(p=>p.id==='geometry:opponent:0')!;
    const g = deriveLowerBodyGeometry(keeper);
    const gap = Math.min(...[g.left.foot,g.right.foot].map(f=>
      Math.hypot(f.x-a.ball.x,f.y-a.ball.y,f.z-Math.max(0.11,a.ball.height??0.11))-0.145));
    expect(gap).toBeGreaterThanOrEqual(-1e-6);
    if(i%40===0) { expect(reload(a)).toEqual(reload(b)); b=reload(b); }
  }
  expect(a.time).toBeGreaterThan(5233.5);
  expect(a.decisionIndex).toBeGreaterThan(initial.decisionIndex);
}, 15_000);

it('does not award keeper foot ownership from the historical broad control radius', () => {
  const s = reload(fixture.before), keeper = s.players.find(p=>p.id==='geometry:opponent:0')!;
  s.ball = { x:keeper.position.x+0.65,y:keeper.position.y,height:0.11,
    velocity:{x:0,y:0,z:0},looseSince:s.time };
  const out = applyCanonicalBallControl(s,keeper.id);
  expect(out.ball.ownerId).toBeUndefined();
  expect(out.ball).toEqual(s.ball);
});

it('gives identical stationary touch quality before and after JSON normalises signed zero', () => {
  const s = reload(fixture.before);
  const actor = { ...s.players.find(p=>p.id==='geometry:opponent:0')!, velocity:{x:0,y:0} };
  const point = {x:s.ball.x,y:s.ball.y};
  const a = assessFirstTouch({ ...s, ball:{...s.ball,velocity:{x:-0,y:-0,z:0}} },actor,point,point,'cushion');
  const b = assessFirstTouch({ ...s, ball:{...s.ball,velocity:{x:0,y:0,z:0}} },actor,point,point,'cushion');
  expect(a).toEqual(b);
  expect(a.incomingAngle).toBe(0);
});
