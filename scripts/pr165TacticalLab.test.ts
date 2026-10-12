// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions';
import {
  createMarkingFixture,
  createPassLabFixture,
  experimentalMarkingAssignments,
  runMarkingLab,
  runPassLab,
} from './pr165TacticalLab';

describe('PR165 bounded tactical experiments', () => {
  it('offers all simultaneous outlet families, observes immutable ranking and genuine physical flight/contact', () => {
    const fixture = createPassLabFixture('baseline', 'pr165-lab-test');
    const before = structuredClone(fixture.state);
    const ranking = rankAvailableActionsForAI(fixture.state, fixture.actorId);
    expect(fixture.state).toEqual(before);
    for (const id of Object.values(fixture.outlets))
      expect(ranking.some((r) => r.action.type === 'pass' && r.action.receiverId === id)).toBe(
        true,
      );
    const rows = runPassLab(['baseline'], ['pr165-lab-test']);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.physical?.released)).toBe(true);
    expect(rows.every((r) => r.physical!.flightSamples.length > 0)).toBe(true);
    expect(rows.every((r) => r.physical!.result !== null || r.physical!.censored)).toBe(true);
    expect(rows.some((r) => r.physical!.actualContact !== null)).toBe(true);
    expect(
      rows.every((r) => r.predictedCompletion === r.physical!.predictedCompletionAtRelease),
    ).toBe(true);
    expect(runPassLab(['baseline'], ['pr165-lab-test'])).toEqual(rows);
  }, 30000);

  it('separates an unoffered lofted short pass from ranked options and physical failures', () => {
    const rows = runPassLab(['lofted'], ['pr165-lab-test']);
    const central = rows.find((r) => r.outlet === 'central_short')!;
    expect(central.availability).toBe('not_offered');
    expect(central.rank).toBeNull();
    expect(central.physical).toBeNull();
    expect(rows.some((r) => r.availability === 'offered_not_first' && r.physical?.released)).toBe(
      true,
    );
  }, 30000);

  it('bounds one-to-one responsibility and leaves the source formation and canonical state unchanged', () => {
    const fixture = createMarkingFixture('striker_drops', 'pr165-mark-test');
    const before = structuredClone(fixture.state);
    const assignments = experimentalMarkingAssignments(fixture.state, fixture.threatIds);
    expect(fixture.state).toEqual(before);
    expect(new Set(assignments.map((a) => a.defenderId)).size).toBe(assignments.length);
    expect(new Set(assignments.map((a) => a.threatId)).size).toBe(assignments.length);
    expect(assignments.every((a) => a.target.x >= 55 && a.target.x <= 105)).toBe(true);
    expect(assignments.length).toBeLessThanOrEqual(4);
  });

  it('records purposeful dynamic movement/fatigue, handoffs and actual canonical probe outcomes without installing a policy', () => {
    const rows = runMarkingLab(['handoff', 'dm_flank_cover'], ['pr165-mark-test']);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.history).toHaveLength(4);
      expect(row.final.movementMetres).toBeGreaterThan(0);
      expect(row.final.capacitySpent).toBeGreaterThan(0);
      expect(row.physicalProbe.released).toBe(true);
      expect(row.physicalProbe.result !== null || row.physicalProbe.censored).toBe(true);
    }
    expect(rows.filter((r) => r.policy === 'experimental').some((r) => r.handoffs > 0)).toBe(true);
    expect(
      rows
        .find((r) => r.scenario === 'dm_flank_cover' && r.policy === 'experimental')!
        .history.some((h) => h.assignments.some((a) => a.reason === 'flank_cover')),
    ).toBe(true);
    expect(runMarkingLab(['handoff', 'dm_flank_cover'], ['pr165-mark-test'])).toEqual(rows);
  }, 30000);
});
