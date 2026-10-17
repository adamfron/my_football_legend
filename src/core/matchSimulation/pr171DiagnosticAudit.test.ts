// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AttackingFunnelTracker } from './attackingFunnel';
import { AttackingFunnelAudit } from './attackingFunnelAudit';
import { rankAvailableActionsForAI, resolveMatchAction } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import {
  shotProbeFixture,
  centralProbe,
  restartProbe,
  boundaryProbe,
} from '../../../scripts/pr171Probes';

describe('PR171 read-only attacking audit', () => {
  it('does not count an old pass republished after presentation retention as a new release', () => {
    const { state } = shotProbeFixture('edge_midfielder');
    const action = rankAvailableActionsForAI(state, state.ball.ownerId!).find(
      (r) => r.action.type === 'pass',
    )!.action;
    const released = resolveMatchAction(state, action, 'autonomous_npc');
    const audit = new AttackingFunnelAudit();
    audit.observe(state, released);
    const before = audit.snapshot().periods['home:1']!.passReleases;
    expect(before).toBe(1);
    const passEvent = released.actionEvents!.find(
      (e) => e.kind === 'pass' || e.kind === 'through_pass',
    )!;
    for (let i = 0; i < 700; i++) {
      const previous = { ...released, time: 601 + i, actionEventSequence: 10 + i };
      audit.observe(previous, {
        ...previous,
        time: previous.time + 0.025,
        actionEventSequence: 11 + i,
        actionEvents: [{ ...passEvent, id: `other-${i}`, kind: 'recovery', sequence: 10 + i }],
      });
    }
    audit.observe(
      { ...released, time: 1400, actionEventSequence: 800 },
      {
        ...released,
        time: 1400.025,
        actionEventSequence: 801,
        actionEvents: [{ ...passEvent, sequence: 800 }],
      },
    );
    expect(audit.snapshot().periods['home:1']!.passReleases).toBe(1);
    expect(audit.snapshot().periods['home:1']!.republishedPassEvents).toBe(1);
  });
  it('preserves the full canonical state with audit enabled, disabled and repeated observations', () => {
    const run = (observed: boolean) => {
      let { state } = shotProbeFixture('unmarked_striker', 'pr171-equivalence');
      const tracker = new AttackingFunnelTracker(undefined, true, true);
      for (let i = 0; i < 80; i++) {
        const previous = state;
        state = stepTacticalMatchAfterDecisionProbe(state);
        const frozen = JSON.stringify(state);
        if (observed) {
          tracker.observe(previous, state);
          const first = tracker.snapshot(state.time);
          tracker.observe(previous, state);
          expect(tracker.snapshot(state.time)).toEqual(first);
          expect(JSON.stringify(state)).toBe(frozen);
        }
      }
      return state;
    };
    expect(run(true)).toEqual(run(false));
  });
  it('bounds retained traces and identity caches while totals continue', () => {
    const audit = new AttackingFunnelAudit();
    const { state } = shotProbeFixture('unmarked_striker');
    const ranking = rankAvailableActionsForAI(state, state.ball.ownerId!);
    for (let i = 0; i < 700; i++) {
      audit.observe(
        { ...state, time: i },
        {
          ...state,
          time: i + 1,
          actionEventSequence: i + 1,
          actionEvents: [
            {
              id: `probe-${i}`,
              sequence: i,
              at: i + 1,
              kind: 'recovery',
              actorId: state.ball.ownerId!,
              team: 'home',
              position: state.ball,
              outcome: 'controlled',
              cause: 'fixture',
            },
          ],
        },
      );
      audit.observeRanking(state, ranking);
    }
    const result = audit.snapshot();
    expect(result.retainedIdentityCount).toBeLessThanOrEqual(512);
    expect(result.samples).toHaveLength(64);
    expect(result.periods['home:1']!['event:recovery']).toBe(700);
    expect(result.periods['home:1']!.rankingSamples).toBe(700);
  });
  it('attributes elapsed time to the source period and excludes restart setup', () => {
    const audit = new AttackingFunnelAudit();
    const { state } = shotProbeFixture('unmarked_striker');
    audit.observe({ ...state, time: 10 }, { ...state, time: 10.025 });
    audit.observe(
      { ...state, time: 20, endsSwitched: true },
      { ...state, time: 20.025, endsSwitched: true },
    );
    const result = audit.snapshot();
    expect(result.periods['home:1']!.liveSeconds).toBeCloseTo(0.025);
    expect(result.periods['home:2']!.liveSeconds).toBeCloseTo(0.025);
    expect(result.players[state.ball.ownerId!]!.controlledSeconds).toBeCloseTo(0.05);
  });
  it('keeps option generation and ranking forecasts distinct from actual selections', () => {
    const result = centralProbe('open');
    expect(result.canonicalUnchangedByEvaluation).toBe(true);
    const samples = result.audit!.samples;
    expect(samples).toHaveLength(1);
    expect(samples[0]!.central.some((p) => p.id === result.centralId)).toBe(true);
    expect(result.audit!.periods['home:1']!.shotSelectionsObserved ?? 0).toBe(0);
  });
  it.each(['open', 'pressured', 'wide_competitor', 'gifted', 'ordinary'] as const)(
    'records current policy without mutating the %s central probe',
    (context) => {
      const result = centralProbe(context);
      expect(result.passes.length).toBeGreaterThan(0);
      expect(result.canonicalUnchangedByEvaluation).toBe(true);
    },
  );
});

describe('PR171 reproducible state-transition evidence', () => {
  it.each([false, true])(
    'classifies the last physical touch in both directions: switched=%s',
    (switched) => {
      expect(boundaryProbe(true, switched).scenario).toBe('corner');
      expect(boundaryProbe(false, switched).scenario).toBe('goal_kick');
      expect(boundaryProbe(true, switched, true).scenario).toBe('goal_kick');
      expect(boundaryProbe(false, switched, true).scenario).toBe('corner');
    },
  );
  it('captures indirect-free-kick readiness separately from human availability', () => {
    const result = restartProbe('indirect');
    expect(result.start.legal.ready).toBe(false);
    expect(result.start.phase).toBe('preparing');
    expect(result.firstLegal).not.toBeNull();
    expect(result.firstPrompt).not.toBeNull();
  });
});
