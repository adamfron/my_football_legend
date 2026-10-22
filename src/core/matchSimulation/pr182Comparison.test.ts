// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { PRIMARY_DECISION_POLICIES } from './decisionPolicyConfig';
import { createTacticalMatch, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { captureMatchTactics, fixtureIdentity, RoleExperimentRecorder } from './roleExperiment';
import { changeTacticalRole } from './tacticalRoles';
import { createMatchFlowTelemetry, observeMatchFlow } from './matchFlowTelemetry';
import { compactMatchComparison, matchComparisonSchema } from './matchComparison';

describe('PR182 repeatable owner comparison', () => {
  it('preserves complete squads, formations, preferences and explicit roles across all five policies', () => {
    const world = createCanonicalWorldDatabase();
    const session = createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr182-frozen-owner',
      control: { mode: 'spectator' },
    });
    let initial = createTacticalMatch(session);
    const winger = initial.players.find((p) => p.slot.position.includes('winger'))!;
    initial = changeTacticalRole(initial, winger.id, 'wide_playmaker');
    session.frozenTactics = captureMatchTactics(initial);
    const states = PRIMARY_DECISION_POLICIES.map((decisionPolicy) => {
      const replay = { ...session, setup: { ...session.setup, decisionPolicy } };
      expect(fixtureIdentity(replay)).toBe(fixtureIdentity(session));
      const { decisionPolicy: policy, ...state } = createTacticalMatch(replay);
      expect(policy).toBe(decisionPolicy);
      return state;
    });
    const physicalInputs = (s: (typeof states)[number]) => ({
      seed: s.seed,
      time: s.time,
      decisionIndex: s.decisionIndex,
      ball: s.ball,
      teams: s.teams,
      bench: s.bench,
      roles: s.rolePlan,
      players: s.players.map((p) => ({
        id: p.id,
        profile: p.profile,
        fitness: p.fitness,
        slot: p.slot,
        slotIndex: p.slotIndex,
        position: p.position,
        velocity: p.velocity,
        facingAngle: p.facingAngle,
        neutralAnchor: p.neutralAnchor,
      })),
    });
    for (const state of states) expect(physicalInputs(state)).toEqual(physicalInputs(states[0]!));
    expect(states[0]!.rolePlan!.initial[winger.id]).toBe('wide_playmaker');
    expect(() => captureMatchTactics({ ...initial, time: 1 })).toThrow();
  });
  it('exports compact canonical totals with identity, observed scope, roles and errors', () => {
    const world = createCanonicalWorldDatabase();
    const session = createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr182-export',
      control: { mode: 'spectator' },
    });
    let state = createTacticalMatch(session),
      flow = createMatchFlowTelemetry('pr182-export');
    const recorder = new RoleExperimentRecorder(state);
    for (let i = 0; i < 80; i++) {
      const before = state;
      state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
      recorder.observe(before, state);
      flow = observeMatchFlow(flow, before, state);
    }
    const comparison = compactMatchComparison(
      recorder.export(session, state, 'test-source', 'node'),
      flow,
      ['example diagnostic'],
    );
    expect(matchComparisonSchema.safeParse(comparison).success).toBe(true);
    expect(comparison.metrics.passAttempts).toBe(
      comparison.official.home.passesAttempted + comparison.official.away.passesAttempted,
    );
    expect(comparison.sourceRevision).toBe('test-source');
    expect(comparison.errors).toEqual(['example diagnostic']);
    expect(JSON.stringify(comparison).length).toBeLessThan(25000);
  });
});
