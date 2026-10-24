import { describe, expect, it } from 'vitest';
import { createCognitionFixture } from './tacticalCognitionLab';
import { observeBoundedScene } from './boundedPerception';
import {
  constructBoundedCandidates,
  runBoundedPolicy,
  type BoundedCandidate,
} from './boundedDecision';
import {
  boundedExperimentSchema,
  boundedPolicySchema,
  boundedRuntimeSchema,
} from './boundedIntelligenceState';
import {
  advanceBoundedPatterns,
  boundedPatternTarget,
  inspectBoundedAction,
  withBoundedObserver,
} from './boundedIntelligence';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { resolveMatchAction } from './matchActions';
import { tacticalMatchStateSchema } from './matchState';
import { DEFAULT_DECISION_POLICY } from './decisionPolicyConfig';

const fixture = () => {
  const f = createCognitionFixture('press_triangle', 'pr187-development-tests');
  f.state.decisionPolicy = 'opportunity-driven-v1';
  f.state.boundedExperiment = boundedExperimentSchema.parse({
    knowledge: { system: 0.9, role: 0.9, partner: 0.9 },
  });
  return f;
};
const scene = () => {
  const f = fixture();
  return observeBoundedScene(f.state, f.state.players.find((p) => p.id === f.sourceId)!);
};

describe('bounded decision boundary and distinct mechanisms', () => {
  it('does not inherit hidden ratings, opposition instructions, targets, stateful RNG or unseen positions', () => {
    const f = fixture(),
      actor = f.state.players.find((p) => p.id === f.sourceId)!;
    const before = inspectBoundedAction(f.state, actor);
    const changed = structuredClone(f.state);
    for (const p of changed.players.filter((p) => p.team !== actor.team)) {
      p.profile.attributes.finishing = 1;
      p.profile.attributes.reflexes = 100;
      p.profile.hiddenProfile.adaptability = 1;
      p.target = { x: 99, y: 66 };
      if (!before.scene.visible.some((v) => v.id === p.id)) p.position = { x: 2, y: 1 };
    }
    changed.teams.away.tacticalPreferences = { ...changed.teams.home.tacticalPreferences! };
    changed.decisionIndex += 900;
    expect(inspectBoundedAction(changed, changed.players.find((p) => p.id === actor.id)!)).toEqual(
      before,
    );
    expect(JSON.stringify(before.scene)).not.toContain('hiddenProfile');
    expect(JSON.stringify(before.scene)).not.toContain('decisionIndex');
  });
  it('does not disclose uncommunicated teammate patterns to the carrier', () => {
    const f = fixture(),
      a = f.state.players.find((p) => p.id === f.sourceId)!;
    const before = observeBoundedScene(f.state, a);
    f.state = advanceBoundedPatterns(f.state);
    expect(observeBoundedScene(f.state, a).patterns).toEqual(before.patterns);
  });
  const contrasts = () => {
    const s = scene(),
      receiver = s.visible.find((p) => p.team === s.team)!;
    s.config.coach.creativeFreedom = 1;
    s.intent = {
      actorId: s.observerId,
      candidateKey: 'combination',
      goal: 'progress',
      startedAt: 9,
      expiresAt: 11,
      dependencies: [receiver.id],
      signature: s.signature,
    };
    const base = {
      provenance: 'bounded-geometry-v1' as const,
      evidenceIds: [receiver.id],
      observedAt: s.at,
      closesAt: s.at + 2,
      readyAt: s.at - 0.1,
      benefit: 0.08,
      risk: 0.2,
      confidence: 0.9,
      progress: 10,
      goal: 'progress' as const,
      compliant: true,
      feasible: true,
      forecast: null,
    };
    const candidates: BoundedCandidate[] = [
      {
        ...base,
        id: 'window',
        action: { type: 'carry', actorId: s.observerId, target: { x: 70, y: 34 } },
        closesAt: s.at + 0.4,
        benefit: 0.07,
        risk: 0.4,
      },
      {
        ...base,
        id: 'combination',
        action: {
          type: 'pass',
          actorId: s.observerId,
          receiverId: receiver.id,
          target: receiver.position,
          intent: 'progressive',
          delivery: 'ground',
        },
        benefit: 0.075,
        risk: 0.4,
      },
      {
        ...base,
        id: 'possession',
        action: { type: 'carry', actorId: s.observerId, target: { x: 64, y: 40 } },
        benefit: 0.077,
        risk: 0.3,
        goal: 'retain',
      },
      {
        ...base,
        id: 'hold',
        action: { type: 'hold', actorId: s.observerId },
        benefit: 0.05,
        risk: 0.1,
        goal: 'retain',
      },
    ];
    return { scene: s, candidates };
  };
  it('chooses three different actions for three explainable mechanisms on identical evidence', () => {
    const input = contrasts(),
      copy = structuredClone(input);
    const results = boundedPolicySchema.options.map((p) => runBoundedPolicy(p, input));
    expect(results.map((r) => r.selectedCandidateId)).toEqual([
      'window',
      'combination',
      'possession',
    ]);
    expect(results[1]!.measured.evaluations).toBe(1);
    expect(results[0]!.reasons).toContain('useful_window_closes_before_next_deliberation');
    expect(input).toEqual(copy);
  });
  it('cancels a failed receiver dependency and changed coaching instructions', () => {
    const input = contrasts();
    input.scene.intent!.dependencies = ['absent_runner'];
    const result = runBoundedPolicy('hierarchical-intent-v1', input);
    expect(result.reasons).toContain('cancel:receiver_unavailable');
    expect(result.continuation).not.toBe('continue');
    input.scene.intent!.signature = 'old-instructions';
    expect(runBoundedPolicy('hierarchical-intent-v1', input).reasons).toContain(
      'cancel:coaching_changed',
    );
  });
  it('rejects invalid provenance anywhere in the menu and expires opportunities without release', () => {
    const input = contrasts();
    input.candidates[2]!.action.actorId = 'wrong_actor';
    expect(() => runBoundedPolicy('opportunity-driven-v1', input)).toThrow('provenance');
    input.candidates[2]!.action.actorId = input.scene.observerId;
    input.candidates[1]!.action = {
      type: 'pass',
      actorId: input.scene.observerId,
      receiverId: 'unseen',
      target: { x: 70, y: 34 },
      intent: 'support',
    };
    expect(() => runBoundedPolicy('hierarchical-intent-v1', input)).toThrow('receiver');
    for (const c of input.candidates) {
      c.action = { type: 'hold', actorId: input.scene.observerId };
      c.closesAt = input.scene.at;
    }
    expect(runBoundedPolicy('opportunity-driven-v1', input).selectedCandidateId).toBeNull();
  });
  it('bounds actual enumeration work, copies inputs, and forecasts only three techniques', () => {
    const s = scene(),
      copy = structuredClone(s),
      c = constructBoundedCandidates(s);
    expect(c.length).toBeLessThanOrEqual(48);
    for (const p of boundedPolicySchema.options) {
      const d = runBoundedPolicy(p, { scene: s, candidates: c });
      expect(d.measured.evaluations).toBeLessThanOrEqual(48);
      expect(d.measured.forecasts).toBeLessThanOrEqual(3);
    }
    expect(s).toEqual(copy);
    expect(constructBoundedCandidates({ ...s, ball: null })).toEqual([]);
  });
  it('cannot override a clearly better team option with an injected personal incentive', () => {
    const input = contrasts();
    input.scene.config.personalIncentive = 1;
    input.candidates[2]!.benefit = 0.5;
    expect(runBoundedPolicy('contextual-judgment-v1', input).selectedCandidateId).toBe(
      'possession',
    );
    expect(runBoundedPolicy('contextual-judgment-v1', input).regret).toBe(0);
  });
});

describe('canonical integration, familiarity and compatibility', () => {
  it('deduplicates clipped carry destinations at the touchline without losing the decision', () => {
    const s = scene();
    s.position = { x: 104, y: 68 };
    s.ball!.position = { x: 104.4, y: 68 };
    s.intent = null;
    const candidates = constructBoundedCandidates(s);
    expect(new Set(candidates.map((c) => c.id)).size).toBe(candidates.length);
    for (const policy of boundedPolicySchema.options)
      expect(() => runBoundedPolicy(policy, { scene: s, candidates })).not.toThrow();
  });
  it('observes an out-of-pitch ball and cancels patterns without a pitch-schema crash', () => {
    const f = fixture();
    let s = advanceBoundedPatterns(f.state);
    s = { ...s, time: s.time + 0.2, ball: { ...s.ball, x: 105.2 } };
    expect(
      observeBoundedScene(s, s.players.find((p) => p.id === f.sourceId)!).ball!.position.x,
    ).toBe(105.2);
    s = advanceBoundedPatterns(s);
    expect(Object.values(s.boundedRuntime!.patterns).every((p) => p.cancelled === 'stoppage')).toBe(
      true,
    );
  });
  it('familiarity changes recognition without changing bodies or physical capability', () => {
    const f = fixture(),
      before = structuredClone(f.state.players);
    const high = advanceBoundedPatterns(f.state);
    const lowState = structuredClone(f.state);
    lowState.boundedExperiment!.knowledge = { system: 0.1, role: 0.1, partner: 0.1 };
    const low = advanceBoundedPatterns(lowState);
    const id = f.runnerIds[0]!;
    expect(high.boundedRuntime!.patterns[id]).toBeDefined();
    expect(high.boundedRuntime!.patterns[id]!.recognisedAt).toBeLessThan(
      low.boundedRuntime!.patterns[id]!.recognisedAt,
    );
    expect(high.players).toEqual(before);
    expect(low.players).toEqual(before);
    const actor = high.players.find((p) => p.id === id)!;
    expect(boundedPatternTarget(high, actor)).toBeUndefined();
    high.time = high.boundedRuntime!.patterns[id]!.recognisedAt + 0.01;
    expect(boundedPatternTarget(high, actor)).toBeDefined();
  });
  it('cancels an actual live pattern when possession, cover or instructions contradict it', () => {
    const f = fixture();
    let s = advanceBoundedPatterns(f.state);
    s = { ...s, time: s.time + 0.2, ball: { ...s.ball, ownerId: f.opponentId } };
    s = advanceBoundedPatterns(s);
    expect(s.boundedRuntime!.patterns[f.runnerIds[0]!]!.cancelled).toBe('lost_possession_or_sight');
  });
  it.each(boundedPolicySchema.options)(
    'executes deterministic ordinary match ticks under %s',
    (policy) => {
      const f = fixture();
      f.state.decisionPolicy = policy;
      const run = (observed: boolean) => {
        let s = structuredClone(f.state);
        let attempts = 0;
        withBoundedObserver(
          observed
            ? (t) => {
                if (t.stage === 'attempt') attempts++;
                if (t.scene) t.scene.position.x = 0;
              }
            : undefined,
          () => {
            for (let i = 0; i < 80; i++) s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
          },
        );
        tacticalMatchStateSchema.parse(s);
        return { s, attempts };
      };
      const bare = run(false),
        observed = run(true);
      expect(observed.s).toEqual(bare.s);
      expect(observed.attempts).toBeGreaterThan(0);
      const saved = tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(observed.s)));
      expect(saved.boundedRuntime).toEqual(observed.s.boundedRuntime);
      let restored = saved as unknown as typeof observed.s,
        uninterrupted = observed.s;
      for (let i = 0; i < 40; i++) {
        restored = stepTacticalMatchAfterDecisionProbe(restored, 0.025);
        uninterrupted = stepTacticalMatchAfterDecisionProbe(uninterrupted, 0.025);
      }
      const physical = (s: typeof observed.s) =>
        JSON.stringify({
          players: s.players,
          ball: s.ball,
          statistics: s.statistics,
          runtime: s.boundedRuntime,
        });
      expect(JSON.parse(physical(restored))).toEqual(JSON.parse(physical(uninterrupted)));
    },
  );
  it('does not bypass physical preparation or change the default', () => {
    const f = fixture(),
      a = f.state.players.find((p) => p.id === f.sourceId)!;
    f.state.onBallPreparation!.readyAt = 100;
    const request = {
      type: 'shot' as const,
      actorId: a.id,
      intent: 'driven' as const,
      target: { x: 105, y: 34 },
    };
    const next = resolveMatchAction(f.state, request);
    expect(next.ball.shot).toBeUndefined();
    expect(DEFAULT_DECISION_POLICY).toBe('state-value-v1');
    expect(boundedRuntimeSchema.parse({}).intent).toBeNull();
  });
});
