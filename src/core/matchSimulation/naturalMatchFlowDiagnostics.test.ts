import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { findPitchBoundaryCrossing } from './pitchBoundary';
import { naturalMatchFlowDiagnosticsSchema } from './naturalMatchFlowDiagnostics';
const receipt = () => {
  const value = JSON.parse(
    readFileSync('docs/performance/pr192/natural-flow-laboratory-v5.json', 'utf8'),
  );
  return value.receiptArchive
    ? JSON.parse(gunzipSync(readFileSync(value.receiptArchive.path)).toString('utf8'))
    : value;
};
describe('PR192 real boundary, deflection and restart evidence', () => {
  it('requires the entire ball over the line and awards from the actual last touch', () => {
    expect(findPitchBoundaryCrossing({ x: 50, y: 0.2 }, { x: 50, y: -0.1 })).toBeUndefined();
    expect(findPitchBoundaryCrossing({ x: 50, y: 0.2 }, { x: 50, y: -0.12 })?.boundary).toBe(
      'touchline_top',
    );
    const rows = receipt().rows;
    expect(rows.find((r: { id: string }) => r.id === 'ground-parallel').award).toBeNull();
    expect(rows.find((r: { id: string }) => r.id === 'ground-angled').award.scenario).toBe(
      'throw_in',
    );
    expect(rows.find((r: { id: string }) => r.id === 'goal-line-defender').award.scenario).toBe(
      'corner',
    );
    expect(rows.find((r: { id: string }) => r.id === 'goal-line-attacker').award.scenario).toBe(
      'goal_kick',
    );
    expect(rows.every((r: { observerNeutral: boolean }) => r.observerNeutral)).toBe(true);
    for (const row of rows)
      expect(naturalMatchFlowDiagnosticsSchema.safeParse(row.diagnostics).success).toBe(true);
  });
  it('keeps real posts, blocks and keeper parry outcomes distinct', () => {
    const rows = receipt().rows;
    expect(rows.find((r: { id: string }) => r.id === 'post').lastContact.kind).toBe('left_post');
    expect(rows.find((r: { id: string }) => r.id === 'crossbar').lastContact.kind).toBe('crossbar');
    expect(rows.find((r: { id: string }) => r.id === 'outfield-block').lastContact.kind).toBe(
      'defender',
    );
    const parry = rows.find((r: { id: string }) => r.id === 'keeper-parry');
    expect(parry.lastContact.kind).toBe('goalkeeper');
    expect(parry.award.scenario).toBe('corner');
  });
  it('reports actual restart preparation and keeps elapsed time separate from added time', () => {
    for (const row of receipt().restartRows) {
      expect(row.executedAt).not.toBeNull();
      expect(row.blockers).toEqual([]);
      expect(row.report.time.ballInPlaySeconds + row.report.time.deadBallSeconds).toBeCloseTo(
        row.elapsed,
      );
      expect(row.report.time.humanDecisionPauseSeconds).toBe(0);
      expect(Object.keys(row.report.diagnostics.retrievalStageSeconds).length).toBeGreaterThan(0);
    }
  });
  it('lifts a grounded throw-in ball through actual heights while preserving quick free kicks', () => {
    const rows = receipt().restartRows;
    const before = rows.find(
      (r: { scenario: string; nearby: boolean; preparation: boolean }) =>
        r.scenario === 'throw_in' && r.nearby && !r.preparation,
    );
    const after = rows.find(
      (r: { scenario: string; nearby: boolean; preparation: boolean }) =>
        r.scenario === 'throw_in' && r.nearby && r.preparation,
    );
    expect(before.elapsed).toBeLessThan(0.3);
    expect(after.elapsed).toBeGreaterThan(1);
    expect(
      after.pickupTrace.some((s: { height: number }) => s.height > 0.5 && s.height < 1.5),
    ).toBe(true);
    const free = rows.filter(
      (r: { scenario: string; nearby: boolean }) => r.scenario === 'free_kick' && r.nearby,
    );
    expect(free[0].elapsed).toBe(free[1].elapsed);
    expect(free[0].elapsed).toBeLessThan(1);
  });
});
