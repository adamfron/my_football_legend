import { describe, expect, it } from 'vitest';
import { FORMATIONS } from '../footballerWorld';
import {
  createFormationBenchmarkMatch,
  createFormationBenchmarkSession,
} from './benchmarkFixtures';
import { AttackingFunnelTracker } from './attackingFunnel';
import { FIXED_MATCH_DT, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';

describe('PR162 benchmark contracts', () => {
  it('constructs every legal native XI with equal attributes, auxiliaries and genuine bench identities', () => {
    for (const opponent of Object.keys(FORMATIONS) as Array<keyof typeof FORMATIONS>) {
      const session = createFormationBenchmarkSession({ opponent, seed: 'fixture' });
      const ids = new Set<string>();
      for (const team of [session.home, session.away]) {
        expect(team.players).toHaveLength(11);
        expect(team.players[0]!.slot.position).toBe('goalkeeper');
        expect(team.strength).toBe(50);
        for (const p of [...team.players, ...team.bench!]) {
          expect(ids.has(p.footballerId)).toBe(false);
          ids.add(p.footballerId);
          expect(Object.values(p.profile.attributes).every((v) => v === 50)).toBe(true);
          expect(Object.values(p.profile.hiddenProfile).every((v) => v === 50)).toBe(true);
          expect(Object.values(p.profile.positionFamiliarity).every((v) => v === 1)).toBe(true);
          expect(p.condition).toBe(100);
          expect(p.injury).toBeUndefined();
        }
      }
    }
  });
  it('retains logical identities/profiles through reversal and never shares mutable profiles', () => {
    const a = createFormationBenchmarkSession({ opponent: '4-3-3', seed: 'paired' });
    const b = createFormationBenchmarkSession({
      opponent: '4-3-3',
      seed: 'paired',
      reversed: true,
    });
    expect(a.home).toEqual(b.away);
    expect(a.away).toEqual(b.home);
    a.home.players[0]!.profile.attributes.passing = 1;
    expect(b.away.players[0]!.profile.attributes.passing).toBe(50);
  });
  it('observes without changing the complete canonical state, identities or seeded progression', () => {
    let a = createFormationBenchmarkMatch({ opponent: '4-4-2', seed: 'parity' }).state;
    let b = structuredClone(a);
    const tracker = new AttackingFunnelTracker();
    for (let tick = 0; tick < 240; tick++) {
      const previous = a;
      a = stepTacticalMatchAfterDecisionProbe(a, FIXED_MATCH_DT);
      b = stepTacticalMatchAfterDecisionProbe(b, FIXED_MATCH_DT);
      const frozen = JSON.stringify(a);
      tracker.observe(previous, a);
      expect(JSON.stringify(a)).toBe(frozen);
      expect(a).toEqual(b);
    }
    expect(tracker.snapshot(a.time).teams.home.possessions).toBe(1);
  });
  it('separates unique possessions from repeated controlled final-third and box transitions', () => {
    const state = createFormationBenchmarkMatch({ opponent: '4-4-2', seed: 'stages' }).state;
    const tracker = new AttackingFunnelTracker(
      {
        ranking: () => [],
        opportunity: () => {
          throw new Error('No advanced decision probe expected');
        },
        executable: () => false,
        delay: () => 0,
      },
      false,
    );
    state.actionCooldown = 100;
    // Disable candidate probes while still measuring physical controlled entries.
    const next = (x: number, time: number) => ({
      ...state,
      time,
      ball: { ...state.ball, x, y: 34 },
    });
    // Opportunity probe runs independently in advanced territory; provide the real pure evaluator.
    const actual = new AttackingFunnelTracker(
      {
        ranking: () => [],
        opportunity: () => ({ category: 'non_viable' }) as never,
        executable: () => false,
        delay: () => 0,
      },
      false,
    );
    let previous = state;
    for (const [i, x] of [50, 72, 60, 90, 80, 90].entries()) {
      const n = next(x, i + 1);
      actual.observe(previous, n);
      previous = n;
    }
    const t = actual.snapshot(6).teams.home;
    expect(t.possessions).toBe(1);
    expect(t.stages.final_entry).toBe(1);
    expect(t.events.final_entry).toBe(2);
    expect(t.stages.box_entry).toBe(1);
    expect(t.events.box_entry).toBe(2);
    expect(t.conversions.shot_after_box).toBe(0);
    expect(tracker.snapshot(0).teams.home.conversions.shot_after_box).toBeNull();
  });
  it('does not create controlled possessions from an unowned loose ball', () => {
    const state = createFormationBenchmarkMatch({ opponent: '4-3-3', seed: 'loose' }).state;
    const tracker = new AttackingFunnelTracker();
    const loose = { ...state, ball: { x: 90, y: 34 }, time: 1 };
    tracker.observe(state, loose);
    expect(tracker.snapshot(1).teams.home.possessions).toBe(0);
  });
});
