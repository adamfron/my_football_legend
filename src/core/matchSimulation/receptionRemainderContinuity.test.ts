// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { playerBodyClearance } from './playerBodyContact';
const recorded = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr216/body-overlap-first-entry-keeper-v5.json.gz')).toString(),
) as { initial: TacticalMatchState };
const reload = (s: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;

it('searches the changed reception velocity through the released-restart remainder', () => {
  let a = reload(recorded.initial), b = reload(a);
  let firstBodyAt: number | undefined, footAt: number | undefined;
  for (let i = 0; i < 400; i++) {
    a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
    b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
    expect(a.executionWitnesses?.unresolved).toBeUndefined();
    const one = a.players.find(p=>p.id==='geometry:opponent:1')!;
    const three = a.players.find(p=>p.id==='geometry:opponent:3')!;
    expect(playerBodyClearance(one,three)).toBeGreaterThanOrEqual(-1e-7);
    if(i===0) {
      footAt = a.lastGroundContact!.at;
      const c = a.multiBodyResolutions!.find(c=>c.participants.includes(one.id)&&c.participants.includes(three.id));
      expect(c?.unresolved).toBe(false);
      firstBodyAt = c!.at;
      expect(c!.energyAfter).toBeLessThanOrEqual(c!.energyBefore + 1e-7);
      expect(c!.positionCorrection).toBe(0);
    }
    if(i%40===0) { expect(reload(a)).toEqual(reload(b)); b=reload(b); }
  }
  expect(firstBodyAt!).toBeGreaterThan(footAt!);
  expect(firstBodyAt!).toBeLessThan(recorded.initial.time + 0.025);
  expect(a.decisionIndex).toBeGreaterThan(recorded.initial.decisionIndex);
}, 15_000);
