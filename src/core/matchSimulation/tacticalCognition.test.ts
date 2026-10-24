import { describe, expect, it } from 'vitest';
import {
  createCognitionFixture,
  runTacticalPatternTrial,
  auditDecisionSnapshot,
} from './tacticalCognitionLab';
import {
  familiaritySchema,
  learnPattern,
  revisePattern,
  observeTacticalScene,
  recognisePattern,
  RESEARCH_COACHES,
  makeTacticalAdvice,
  receiveTacticalAdvice,
  judgeContextualOptions,
} from './tacticalCognition';
import {
  runDirectedContactTrial,
  runKeeperEncounter,
  runDecisionTimingTrial,
} from './attributeCognitionLab';
import { playerContactGeometry } from './ballContactGeometry';
import { resolveCanonicalShot } from './shotResolver';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import {
  validateResearchDecision,
  type ResearchPolicyInput,
  type ResearchPolicyDecision,
} from './decisionResearchProtocol';

const fixture = () => createCognitionFixture('counter_support', 'pr186-tests');
const familiar = (f = fixture(), value = 0.9) =>
  familiaritySchema.parse({
    pattern: 'counter_support',
    signature: 'v1',
    roleId: 'advanced_forward',
    partnerId: f.sourceId,
    system: value,
    role: value,
    partner: value,
  });

describe('isolated tactical cognition research', () => {
  it('learns relevant exposure, distinguishes adaptability and preserves unaffected knowledge', () => {
    const f = fixture(),
      p = f.state.players.find((p) => p.id === f.runnerIds[0])!;
    const low = structuredClone(p),
      high = structuredClone(p);
    low.profile.hiddenProfile.adaptability = 10;
    high.profile.hiddenProfile.adaptability = 90;
    const initial = familiar(f, 0.1),
      exposure = { kind: 'cooperation' as const, meaningful: true, compatibility: 1 };
    expect(learnPattern(initial, high, { ...exposure, kind: 'idle' })).toEqual(initial);
    expect(learnPattern(initial, high, { ...exposure, meaningful: false })).toEqual(initial);
    expect(learnPattern(initial, high, exposure).system).toBeGreaterThan(
      learnPattern(initial, low, exposure).system,
    );
    const revised = revisePattern(initial, 'v2', 0.6);
    expect(revised.system).toBeCloseTo(0.06);
    expect(revised.role).toBe(initial.role);
    expect(revised.partner).toBe(initial.partner);
    expect(initial.system).toBe(0.1);
  });
  it('reveals only a bounded current scene and is independent of hidden opponent profiles', () => {
    const f = fixture(),
      actor = f.state.players.find((p) => p.id === f.runnerIds[0])!;
    const before = structuredClone(f.state),
      o = observeTacticalScene(f.state, actor, 'counter_support');
    for (const p of f.state.players.filter((p) => p.team !== actor.team))
      p.profile.attributes.gameReading = 1;
    expect(observeTacticalScene(f.state, actor, 'counter_support')).toEqual(o);
    expect(o.visible.some((p) => 'profile' in p || 'target' in p)).toBe(false);
    expect(
      o.visible.every(
        (p) => Math.hypot(p.position.x - actor.position.x, p.position.y - actor.position.y) < 36.3,
      ),
    ).toBe(true);
    expect(before.players.find((p) => p.id === actor.id)!.position).toEqual(actor.position);
  });
  it.each(['counter_support', 'playmaker_run', 'press_triangle'] as const)(
    'moves %s with canonical acceleration and releases a real pass',
    (pattern) => {
      const experienced = runTacticalPatternTrial({ pattern, seed: 'paired', familiarity: 0.9 });
      const novice = runTacticalPatternTrial({ pattern, seed: 'paired', familiarity: 0.1 });
      expect(experienced).toEqual(
        runTacticalPatternTrial({ pattern, seed: 'paired', familiarity: 0.9 }),
      );
      expect(experienced.traces[0]!.recognitionAt!).toBeLessThan(novice.traces[0]!.recognitionAt!);
      expect(experienced.participants[0]!.movedMetres).toBeGreaterThanOrEqual(
        novice.participants[0]!.movedMetres,
      );
      expect(experienced.samples[0]!.positions[0]).toEqual(novice.samples[0]!.positions[0]);
      expect(experienced.passReleased).toBe(true);
      expect(experienced.release.action?.type).toBe('pass');
      if (pattern === 'playmaker_run' && experienced.release.action?.type === 'pass') {
        expect(experienced.release.action.target.x - 35).toBeGreaterThan(30);
      }
      expect(experienced.defensiveCover).toBe(2);
    },
  );
  it('refuses novel triggers, incompatible roles and absent cover', () => {
    const playmaker = createCognitionFixture('playmaker_run', 'expired-preparation');
    playmaker.state.time = 11;
    const runner = playmaker.state.players.find((p) => p.id === playmaker.runnerIds[0])!;
    expect(observeTacticalScene(playmaker.state, runner, 'playmaker_run').trigger).toBeNull();
    expect(
      runTacticalPatternTrial({
        pattern: 'counter_support',
        seed: 'negative',
        familiarity: 1,
        novel: true,
      }).traces[0]!.reasons,
    ).toContain('not_visible');
    expect(
      runTacticalPatternTrial({
        pattern: 'press_triangle',
        seed: 'negative',
        familiarity: 1,
        noCover: true,
      }).traces[0]!.reasons,
    ).toContain('no_cover');
    const f = fixture(),
      actor = f.state.players.find((p) => p.id === f.runnerIds[0])!,
      o = observeTacticalScene(f.state, actor, 'counter_support');
    expect(
      recognisePattern(
        o,
        actor,
        { ...familiar(f), roleId: 'traditional_keeper' },
        RESEARCH_COACHES.system,
        'prepared',
      ).reasons,
    ).toContain('role_obligation');
  });
  it('keeps recognition separate from physical ability', () => {
    const input = { pattern: 'counter_support' as const, seed: 'physical', familiarity: 0.9 };
    const low = runTacticalPatternTrial({ ...input, physicalSkill: 20 });
    const high = runTacticalPatternTrial({ ...input, physicalSkill: 100 });
    expect(low.traces).toEqual(high.traces);
    expect(low.participants[0]!.movedMetres).toBeLessThan(high.participants[0]!.movedMetres);
  });
  it('limits advice to an observed source, recipient, range and validity interval', () => {
    const f = fixture(),
      leader = f.state.players.find((p) => p.id === f.runnerIds[1])!,
      actor = f.state.players.find((p) => p.id === f.runnerIds[0])!;
    leader.facingAngle = Math.PI / 2;
    leader.profile.attributes.leadership = 90;
    leader.profile.attributes.gameReading = 90;
    const o = observeTacticalScene(f.state, leader, 'counter_support');
    const advice = makeTacticalAdvice(o, leader, actor.id, 'counter_support', { x: 70, y: 30 });
    expect(advice).toBeDefined();
    const recipient = observeTacticalScene(f.state, actor, 'counter_support');
    expect(['accepted', 'misunderstood']).toContain(
      receiveTacticalAdvice(advice!, recipient, actor),
    );
    expect(receiveTacticalAdvice(advice!, { ...recipient, at: advice!.expiresAt }, actor)).toBe(
      'unavailable',
    );
    expect(
      makeTacticalAdvice(o, leader, actor.id, 'counter_support', { x: 100, y: 2 }),
    ).toBeUndefined();
    expect(receiveTacticalAdvice({ ...advice!, sourceId: 'unseen' }, recipient, actor)).toBe(
      'unavailable',
    );
  });
  it('allows bounded discretion but never invents unavailable actions or outcome quality', () => {
    const f = fixture(),
      actor = f.state.players[0]!;
    const options = [
      {
        id: 'team',
        value: 0.1,
        personalAppeal: 0,
        risk: 0.2,
        compliant: true,
        feasible: true,
        observed: true,
      },
      {
        id: 'personal',
        value: 0.09,
        personalAppeal: 1,
        risk: 0.5,
        compliant: false,
        feasible: true,
        observed: true,
      },
    ];
    const context = {
      match: 'chasing' as const,
      personalIncentive: 1,
      fatigue: 0,
      pressure: 0,
      confidence: 1,
      coach: RESEARCH_COACHES.trusting,
    };
    const r = judgeContextualOptions(options, context, actor);
    expect(r.selected).toBe('personal');
    expect(r.teamValueRegret).toBeLessThanOrEqual(0.02);
    expect(r.instructionCompliance).toBe(false);
    expect(r.executionQuality).toBeNull();
    expect(r.outcomeQuality).toBeNull();
    expect(
      judgeContextualOptions([{ ...options[0]!, feasible: false }], context, actor).selected,
    ).toBeNull();
    expect(
      judgeContextualOptions(options, { ...context, match: 'protecting' }, actor).selected,
    ).toBe('team');
    expect(
      judgeContextualOptions([options[0]!, { ...options[1]!, value: -0.5 }], context, actor)
        .selected,
    ).toBe('team');
  });
  it('shadow inspection leaves physical state and subsequent deterministic ticks identical', () => {
    const f = fixture(),
      before = structuredClone(f.state);
    auditDecisionSnapshot(f.state, f.sourceId);
    observeTacticalScene(f.state, f.state.players[0]!, 'counter_support');
    expect(f.state).toEqual(before);
    let a = f.state,
      b = before;
    for (let i = 0; i < 40; i++) {
      a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
      b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
    }
    expect(a).toEqual(b);
  });
});

describe('canonical attribute discrimination and mismatch receipts', () => {
  it('separates recognition, body preparation and actual release in a closing window', () => {
    const input = { seed: 'pr186-timing-debug', familiarity: 0.9, closingOpponent: true };
    const fast = runDecisionTimingTrial({ ...input, mode: 'motor', preparationSeconds: 0.1 });
    const unprepared = runDecisionTimingTrial({ ...input, mode: 'motor', preparationSeconds: 1.2 });
    const hesitant = runDecisionTimingTrial({
      ...input,
      mode: 'deliberate',
      preparationSeconds: 0.1,
    });
    expect(fast.initialShotAvailable).toBe(true);
    expect(fast.releasedAt).not.toBeNull();
    expect(fast.releasedAt!).toBeGreaterThan(fast.recognisedAt);
    expect(unprepared.recognisedAt).toBe(fast.recognisedAt);
    expect(unprepared.intentionAt).not.toBeNull();
    expect(unprepared.releasedAt).toBeNull();
    expect(unprepared.intendedOutcome).toBeNull();
    expect(unprepared.cancellationReason).toBe('control_lost_before_release');
    expect(hesitant.initialShotAvailable).toBe(true);
    expect(hesitant.releasedAt).toBeNull();
  });
  it('separates identical header reach from heading-dependent physical placement', () => {
    const input = {
      seed: 'heading-paired',
      attribute: 'heading' as const,
      contact: 'header' as const,
    };
    const low = runDirectedContactTrial({ ...input, band: 20 }),
      high = runDirectedContactTrial({ ...input, band: 100 });
    expect(low.eligibleAt).toBe(high.eligibleAt);
    expect(low.reached).toBe(true);
    expect(low.executedAt).not.toBeNull();
    expect(low.launch).not.toEqual(high.launch);
    expect(low.targetError).not.toBe(high.targetError);
    expect(runDirectedContactTrial({ ...input, band: 100, height: 3 }).reached).toBe(false);
  });
  it('isolates composure under pressure with a no-pressure negative control', () => {
    const input = {
      seed: 'composure-paired',
      attribute: 'composure' as const,
      contact: 'foot' as const,
    };
    const low = runDirectedContactTrial({ ...input, band: 20 }),
      high = runDirectedContactTrial({ ...input, band: 100 });
    expect(low.launch).toEqual(high.launch);
    expect(runDirectedContactTrial({ ...input, band: 20, pressure: true }).launch).not.toEqual(
      runDirectedContactTrial({ ...input, band: 100, pressure: true }).launch,
    );
  });
  it('runs a goalkeeper closing episode and a meaningful physical sweeping race', () => {
    const closing = runKeeperEncounter({
      seed: 'keeper-paired',
      exercise: 'closing',
      attribute: 'oneOnOnes',
      band: 60,
      releaseAfter: 0,
    });
    expect(closing.approach).toBe(true);
    expect(closing.shotReleasedAt).not.toBeNull();
    expect(closing.scheduledShotOutcome).not.toBeNull();
    expect(closing.samples.length).toBeGreaterThan(10);
    const sweep = runKeeperEncounter({
      seed: 'keeper-paired',
      exercise: 'sweep',
      attribute: 'goalkeeperSweeping',
      band: 60,
      passTargetX: 96,
    });
    expect(sweep.meaningfulSweep).toBe(true);
    expect(sweep.keeperMetres).toBeGreaterThan(0);
  });
  it('records a real shot-technique valuation collapse without retuning gameplay', () => {
    const f = fixture(),
      actor = f.state.players.find((p) => p.id === f.sourceId)!;
    actor.position = { x: 88, y: 34 };
    actor.velocity = { x: 0, y: 0 };
    f.state.ball = { ...playerContactGeometry(actor).rightFoot, ownerId: actor.id, height: 0.11 };
    delete f.state.onBallPreparation;
    const audit = auditDecisionSnapshot(f.state, actor.id),
      shots = audit.candidates.filter((c) => c.action.type === 'shot' && c.value !== null);
    expect(shots.length).toBeGreaterThanOrEqual(2);
    expect(new Set(shots.map((c) => c.goalExpectation)).size).toBe(1);
    const launches = shots.map(
      (c) =>
        resolveCanonicalShot(f.state, c.action as Extract<typeof c.action, { type: 'shot' }>)
          .launchVelocity,
    );
    expect(new Set(launches.map((v) => JSON.stringify(v))).size).toBeGreaterThan(1);
    expect(audit.shotMenuMissing).toBe(0);
  });
});

describe('PR187 executable policy boundary', () => {
  const pair = () => {
    const f = fixture(),
      actor = f.state.players.find((p) => p.id === f.runnerIds[0])!;
    const observation = observeTacticalScene(f.state, actor, 'counter_support');
    const input: ResearchPolicyInput = {
      observation,
      patterns: [],
      currentIntent: null,
      candidates: [
        {
          id: 'hold',
          action: { type: 'hold', actorId: actor.id },
          feasible: true,
          evidenceIds: [actor.id],
          closesAt: 11,
        },
      ],
      budget: { evaluations: 8, forecasts: 1 },
    };
    const decision: ResearchPolicyDecision = {
      policy: 'opportunity_driven',
      observedAt: 10,
      recognisedAt: 10.2,
      selectedCandidateId: 'hold',
      intention: null,
      continuation: 'new',
      evidenceIds: [actor.id],
      reasons: ['visible_window'],
      evaluations: 1,
      forecasts: 0,
    };
    return { input, decision };
  };
  it.each(['opportunity_driven', 'hierarchical_intent', 'contextual_judgment'] as const)(
    'validates the shared invariants for %s',
    (policy) => {
      const { input, decision } = pair();
      expect(validateResearchDecision(input, { ...decision, policy }).policy).toBe(policy);
    },
  );
  it('rejects privileged evidence, expired windows, agency changes and excess work', () => {
    const { input, decision } = pair();
    expect(() =>
      validateResearchDecision(input, { ...decision, evidenceIds: ['hidden_opponent'] }),
    ).toThrow('Unobserved');
    expect(() => validateResearchDecision(input, { ...decision, recognisedAt: 12 })).toThrow(
      'Unavailable',
    );
    expect(() => validateResearchDecision(input, { ...decision, evaluations: 9 })).toThrow(
      'budget',
    );
    expect(() =>
      validateResearchDecision(input, { ...decision, continuation: 'continue' }),
    ).toThrow('Expired');
    input.candidates[0]!.action.actorId = 'another_player';
    expect(() => validateResearchDecision(input, decision)).toThrow('agency');
  });
});
