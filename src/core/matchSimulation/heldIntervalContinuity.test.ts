// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { playerBodyClearance } from './playerBodyContact';
import { substitutionEntryBodies } from './substitutions';

const incident = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr216/restart-overlap-origin-keeper-v1.json.gz')).toString(),
) as { initial: TacticalMatchState; terminal: TacticalMatchState };
const reload = (s: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;

it('keeps braking substitution bodies separate through the recorded restart and native reloads', () => {
  let a = reload(incident.initial),
    b = reload(a),
    impacts = 0;
  const ids = ['geometry:opponent:3', 'geometry:opponent:8'];
  const [beforeFirst, beforeSecond] = ids.map((id) => a.players.find((p) => p.id === id)!);
  expect(playerBodyClearance(beforeFirst!, beforeSecond!)).toBeGreaterThan(0);
  for (let i = 0; i < 400; i++) {
    const previous = a;
    a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
    b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
    expect(a.executionWitnesses?.unresolved).toBeUndefined();
    const [first, second] = ids.map((id) => a.players.find((p) => p.id === id)!);
    expect(playerBodyClearance(first!, second!)).toBeGreaterThanOrEqual(-1e-7);
    for (const c of a.multiBodyResolutions ?? []) {
      impacts += c.impulses.filter(j => j.kind === 'impact').length;
      expect(c.energyAfter).toBeLessThanOrEqual(c.energyBefore + 1e-7);
      for (const axis of ['x', 'y'] as const)
        expect(c.momentumAfter[axis] - c.momentumBefore[axis]).toBeCloseTo(c.boundaryImpulse[axis], 8);
    }
    if (previous.substitutionState?.pending.length && i === 0) {
      expect({ ...a.ball, continuousBodyContacts: undefined }).toEqual({
        ...previous.ball,
        continuousBodyContacts: undefined,
      });
      expect(a.players.find(p=>p.id===ids[0])!.samples).toBe(previous.players.find(p=>p.id===ids[0])!.samples + 1);
    }
    if (i % 40 === 0) {
      expect(reload(a)).toEqual(reload(b));
      b = reload(b);
    }
  }
  expect(impacts).toBeGreaterThan(0);
  expect(a.time).toBeGreaterThan(2140.425);
  expect(a.substitutionState?.completed.length).toBeGreaterThan(incident.initial.substitutionState!.completed.length);
});

it('keeps a cleared entrant solid against a player occupying the entry gate before granting eligibility', () => {
  const failure = JSON.parse(gunzipSync(readFileSync(
    'docs/performance/pr216/substitution-exception-v10.json.gz',
  )).toString()) as { recent: TacticalMatchState[] };
  const initial = reload(failure.recent[0]!);
  let a = initial, b = reload(a), impacts = 0;
  for (let i = 0; i < 1600; i++) {
    a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
    b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
    expect(a.executionWitnesses?.unresolved).toBeUndefined();
    const entrant = a.players.find(p => p.id === 'geometry:opponent:12') ??
      substitutionEntryBodies(a).find(p => p.id === 'geometry:opponent:12');
    const blocker = a.players.find(p => p.id === 'geometry:anchor:13')!;
    if (entrant) expect(playerBodyClearance(entrant, blocker)).toBeGreaterThanOrEqual(-1e-7);
    impacts += (a.multiBodyResolutions ?? []).flatMap(c => c.impulses)
      .filter(c => c.kind === 'impact' && c.participants.includes('geometry:opponent:12')).length;
    if (i % 40 === 0) { expect(reload(a)).toEqual(reload(b)); b = reload(b); }
  }
  expect(impacts).toBeGreaterThan(0);
  expect(a.substitutionState!.completed.length).toBeGreaterThan(initial.substitutionState!.completed.length);
  expect(a.players.some(p => p.id === 'geometry:opponent:12')).toBe(true);
  expect(a.decisionIndex).toBeGreaterThan(initial.decisionIndex);
}, 20_000);
