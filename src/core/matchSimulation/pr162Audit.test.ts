import { describe, expect, it } from 'vitest';
import { FORMATIONS } from '../footballerWorld';
import {
  createFormationBenchmarkMatch,
  createFormationBenchmarkSession,
} from './benchmarkFixtures';
import { AttackingFunnelTracker } from './attackingFunnel';
import { FIXED_MATCH_DT, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { shotDiagnosticSchema } from './matchState';

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
  it('counts a physical release before its later goal closes possession, without double counting the outcome', () => {
    const initial = createFormationBenchmarkMatch({ opponent: '4-4-2', seed: 'shot-stage' }).state;
    initial.actionCooldown = 100;
    const tracker = new AttackingFunnelTracker({
      ranking: () => [],
      opportunity: () => ({ category: 'non_viable' }) as never,
      executable: () => false,
      delay: () => 0,
    });
    const middle = { ...initial, time: 1, ball: { ...initial.ball, x: 50, y: 34 } };
    const box = { ...initial, time: 2, ball: { ...initial.ball, x: 90, y: 34 } };
    tracker.observe(initial, middle);
    tracker.observe(middle, box);
    const shot = shotDiagnosticSchema.parse({
      shotId: 'physical-release',
      shooterId: box.ball.ownerId,
      releasedAt: 2.025,
      context: 'open_play',
      distance: 15,
      angle: 1,
      pressure: 0,
      blockingDefenders: 0,
      baseXg: 0.5,
      effectiveScoringExpectation: 0.5,
      shooterExecutionQuality: 0.5,
      intendedTarget: { horizontal: 0, vertical: 1 },
      actualTarget: { horizontal: 0, vertical: 1 },
      error: { horizontal: 0, vertical: 0 },
      speed: 20,
      classification: 'on_target',
    });
    const release = { ...box, time: 2.025, ball: { x: 90, y: 34, shot } };
    tracker.observe(box, release);
    expect(tracker.snapshot(2.025).teams.home.events.shot_release).toBe(1);
    const goal = {
      ...release,
      time: 3,
      lastShot: { ...shot, outcome: 'goal' as const },
      ball: { x: 105, y: 34 },
      postGoal: {
        goalId: 'goal',
        scoringTeam: 'home' as const,
        kickoffTeam: 'away' as const,
        startedAt: 3,
        urgent: false,
        retrieverId: shot.shooterId,
        reactionUntil: 4,
        targets: {},
      },
    };
    tracker.observe(release, goal);
    tracker.observe(goal, { ...goal, time: 4 });
    const totals = tracker.snapshot(4).teams.home;
    expect(totals.events.shot_release).toBe(1);
    expect(totals.stages.shot).toBe(1);
    expect(totals.conversions.shot_after_final).toBe(1);
    expect(totals.conversions.shot_after_box).toBe(1);
  });
  it('attributes a release resolved in the same step before a stoppage closes the attacking sequence', () => {
    const initial = createFormationBenchmarkMatch({
      opponent: '4-4-2',
      seed: 'instant-shot',
    }).state;
    initial.actionCooldown = 100;
    const tracker = new AttackingFunnelTracker({
      ranking: () => [],
      opportunity: () => ({ category: 'non_viable' }) as never,
      executable: () => false,
      delay: () => 0,
    });
    const entry = { ...initial, time: 1, ball: { ...initial.ball, x: 50, y: 34 } };
    const final = { ...entry, time: 2, ball: { ...entry.ball, x: 75 } };
    tracker.observe(initial, entry);
    tracker.observe(entry, final);
    const stopped = {
      ...final,
      time: 3,
      status: 'half_time' as const,
      lastShot: { shotId: 'instant', shooterId: final.ball.ownerId! } as NonNullable<
        typeof final.lastShot
      >,
      ball: { x: 105, y: 34 },
    };
    tracker.observe(final, stopped);
    expect(tracker.snapshot(3).teams.home.conversions.shot_after_final).toBe(1);
  });
});
