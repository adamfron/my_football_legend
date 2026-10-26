import { describe, it, expect } from 'vitest';
import { createTransitionFixture, runTransitionLab } from './transitionLaboratory';
import { observeBoundedScene } from './boundedPerception';
import { constructBoundedCandidates, runBoundedPolicy } from './boundedDecision';
import {
  estimateUsefulContact,
  estimatePassWindow,
  observedOffsideAssessment,
  transitionRuntimeSchema,
} from './opportunityWindows';
import { evaluateStrategicClearance } from './strategicClearance';
import {
  transitionRunTarget,
  advanceTransitionRuns,
  advanceTransitionDefence,
} from './transitionMovement';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import { beginDefensiveChallenge, resolveDefensiveChallenge } from './defensiveChallenges';
import { distance } from './matchSpace';

const fixture = () => createTransitionFixture({ id: 'regression', scenario: 'counterattack' });
describe('PR193 observed opportunities and physical consequences', () => {
  it('holds the counterattack carrier until the explicitly prescribed delayed autonomous release', () => {
    const r = runTransitionLab({
      id: 'delayed-autonomy',
      scenario: 'counterattack',
      delay: 0.5,
      seconds: 2,
    });
    expect(
      r.samples
        .filter((s) => s.at < r.initial.time + 0.5)
        .every((s) => s.action !== 'carry' && s.action !== 'pass'),
    ).toBe(true);
    expect(
      r.traces.filter((t) => t.released).every((t) => t.at >= r.initial.time + 0.5 - 1e-8),
    ).toBe(true);
    expect(r.traces.some((t) => t.released)).toBe(true);
  });
  it('actually holds the prescribed delayed pass without inserting an autonomous carry', () => {
    for (const delay of [0.2, 0.5, 1]) {
      const r = runTransitionLab({
        id: 'delayed-release',
        scenario: 'contact_race',
        delay,
        seconds: 2,
      });
      expect(r.actions[0]?.type).toBe('pass');
      const release = r.traces.find(
        (t) => t.stage === 'attempt' && t.action?.type === 'pass' && t.released,
      );
      expect(release).toBeDefined();
      expect(release!.at - r.initial.time).toBeGreaterThanOrEqual(delay - 1e-8);
    }
  });
  it('attributes a prescribed delivery and clearance without inventing an intentional shot', () => {
    const r = runTransitionLab({ id: 'incidental-identity', scenario: 'deflection', seconds: 2 });
    expect(r.intentContacts[0]?.objective).toBe('pass');
    expect(r.intentContacts.some((c) => c.objective === 'clearance' && c.contact.available)).toBe(
      true,
    );
    expect(r.actions.some((a) => a.type === 'shot')).toBe(false);
    expect(
      (r.final as unknown as TacticalMatchState).statistics?.players.reduce(
        (n, p) => n + p.shots,
        0,
      ),
    ).toBe(0);
  });
  it('tracks a visible dangerous runner during flight, without reading its private run intention', () => {
    const f = fixture(),
      p = f.state.players.find((p) => p.id === f.defenderId)!,
      runner = f.state.players.find((p) => p.id === f.runnerId)!;
    p.position = { x: 76, y: 35 };
    p.facingAngle = -Math.PI / 2;
    runner.position = { x: 72, y: 31 };
    runner.velocity = { x: 4, y: 0 };
    delete f.state.ball.ownerId;
    f.state.ball.velocity = { x: 12, y: 0, z: 0 };
    const before = structuredClone(f.state);
    const next = advanceTransitionDefence(f.state);
    expect(next.players.find((q) => q.id === p.id)?.transitionMark?.runnerId).toBe(runner.id);
    expect(next.players.map((q) => q.position)).toEqual(before.players.map((q) => q.position));
    runner.target = { x: 2, y: 66 };
    runner.profile.attributes.pace = 1;
    expect(
      advanceTransitionDefence(f.state).players.find((q) => q.id === p.id)?.transitionMark,
    ).toEqual(next.players.find((q) => q.id === p.id)?.transitionMark);
  });
  it('constructs lawful late-match and fatigue conditions rather than weakening their schemas', () => {
    for (const variant of ['fatigued', 'chasing', 'protecting'] as const) {
      const f = createTransitionFixture({ id: variant, scenario: 'counterattack', variant });
      expect(tacticalMatchStateSchema.safeParse(f.state).success).toBe(true);
      if (variant !== 'fatigued') expect(step(f.state, 0.025).status).toBe('second_half');
    }
  });
  it('distinguishes distance, momentum, useful posture and intended-action readiness', () => {
    const target = { x: 10, y: 0 };
    const near = estimateUsefulContact(
      { position: { x: 6, y: 0 }, velocity: { x: -5, y: 0 }, facing: -Math.PI / 2 },
      target,
    );
    const far = estimateUsefulContact(
      { position: { x: 3, y: 0 }, velocity: { x: 5, y: 0 }, facing: Math.PI / 2 },
      target,
    );
    expect(far.playableSeconds).toBeLessThan(near.playableSeconds);
    expect(near.actionSeconds).toBeGreaterThanOrEqual(near.playableSeconds);
    const wrongPosture = estimateUsefulContact(
      { position: target, velocity: { x: 0, y: 0 }, facing: Math.PI },
      target,
      7.6,
      5.2,
      0,
      0.3,
    );
    expect(wrongPosture.playableSeconds).toBeGreaterThan(wrongPosture.locationSeconds);
  });
  it('does not certify offside from a partial line with an unseen goalkeeper', () => {
    const f = fixture(),
      p = f.state.players.find((p) => p.id === f.carrierId)!;
    const s = observeBoundedScene(f.state, p);
    expect(s.visible.some((p) => p.keeper && p.team !== s.team)).toBe(false);
    const pass = constructBoundedCandidates(s).find((c) => c.id === `pass:${f.runnerId}:through`)!;
    expect(
      observedOffsideAssessment(s, f.state.players.find((p) => p.id === f.runnerId)!.position)
        .uncertain,
    ).toBe(true);
    expect(pass.legal).toBe(true);
    expect(pass.feasible).toBe(s.contactReady);
    expect(pass.opportunity!.contactMargin).toBeGreaterThan(0);
  });
  it('does not let an expiring low-value option pre-empt a better durable opportunity', () => {
    const f = fixture(),
      p = f.state.players.find((p) => p.id === f.carrierId)!;
    const scene = observeBoundedScene(f.state, p),
      candidates = constructBoundedCandidates(scene);
    const decision = runBoundedPolicy('opportunity-driven-v1', { scene, candidates });
    expect(decision.selectedCandidateId).toBe(`pass:${f.runnerId}:through`);
    expect(candidates.some((c) => c.opportunity && c.risk > 0.5)).toBe(true);
  });
  it('keeps timing forecasts bounded and lets a moving defender close a lane', () => {
    const f = fixture(),
      p = f.state.players.find((p) => p.id === f.carrierId)!;
    const s = observeBoundedScene(f.state, p),
      receiver = s.visible.find((q) => q.id === f.runnerId)!;
    const foe = s.visible.find((q) => q.team !== s.team)!;
    foe.position = { x: 68, y: 40 };
    foe.velocity = { x: 0, y: -5 };
    foe.facing = Math.PI;
    s.visible = [receiver, foe];
    const window = estimatePassWindow(s, receiver.id, { x: 76, y: 31 }, 1.3, 0)!;
    expect(window.samples).toHaveLength(9);
    expect(window.samples[0]!.margin).toBeGreaterThan(window.samples[5]!.margin);
    expect(window.closesAt).not.toBeNull();
    expect(
      estimatePassWindow({ ...s, ball: null }, receiver.id, receiver.position, 1, 0),
    ).toBeUndefined();
  });
  it('never reads hidden opponent ratings or intentions when evaluating a window or clearance', () => {
    const f = fixture(),
      p = f.state.players.find((p) => p.id === f.carrierId)!;
    const before = constructBoundedCandidates(observeBoundedScene(f.state, p));
    for (const q of f.state.players.filter((q) => q.team !== p.team)) {
      q.profile.attributes.pace = 1;
      q.profile.attributes.gameReading = 100;
      q.target = { x: 1, y: 67 };
    }
    expect(constructBoundedCandidates(observeBoundedScene(f.state, p))).toEqual(before);
  });
  it('executes an unscripted delivery and preserves meaningful runs throughout flight', () => {
    const r = runTransitionLab({ id: 'run-flight', scenario: 'counterattack', seconds: 3 });
    expect(r.actions[0]?.type).toBe('pass');
    expect(r.samples.some((s) => !s.ownerId && s.runs.some((p) => p.kind === 'pass_and_run'))).toBe(
      true,
    );
    expect(r.samples.some((s) => s.runs.some((p) => p.kind === 'third_man'))).toBe(true);
    const run = r.samples.flatMap((s) => s.runs).find((p) => p.kind === 'pass_and_run')!;
    const moved = r.samples
      .flatMap((s) => s.players.filter((p) => p.id === run.actorId))
      .some((p) => distance(p.position, run.origin) > 1.5);
    expect(moved).toBe(true);
    expect(r.samples.some((s) => s.ball.x > 75)).toBe(true);
    expect(r.contactFacts.some((c) => c.executed)).toBe(true);
  });
  it('cancels runs for stoppages and explicit human control without resetting positions', () => {
    const f = fixture(),
      actor = f.state.players.find((p) => p.id === f.carrierId)!;
    f.state.transitionRuntime = transitionRuntimeSchema.parse({
      lastScanAt: 9,
      runs: [
        {
          actorId: actor.id,
          sourceId: actor.id,
          kind: 'pass_and_run',
          origin: actor.position,
          target: { x: 66, y: 30 },
          observedAt: 9,
          recognisedAt: 9.2,
          expiresAt: 13,
          reason: 'observed',
        },
      ],
    });
    delete f.state.ball.ownerId;
    expect(transitionRunTarget(f.state, actor)).toBeDefined();
    f.state.playerAgencyEnabled = true;
    f.state.controlledFootballerId = actor.id;
    expect(transitionRunTarget(f.state, actor)).toBeUndefined();
    const before = f.state.players.map((p) => p.position);
    const next = advanceTransitionRuns(f.state);
    expect(next.transitionRuntime?.runs).toEqual([]);
    expect(next.players.map((p) => p.position)).toEqual(before);
  });
  it('pairs controlled recovery and a finite touchline clearance on identical geometry', () => {
    const control = runTransitionLab({
      id: 'control',
      scenario: 'clearance',
      variant: 'control',
      lane: 'left',
      seconds: 2,
    });
    const touch = runTransitionLab({
      id: 'touch',
      scenario: 'clearance',
      variant: 'touchline',
      lane: 'left',
      seconds: 2,
    });
    expect(touch.initial).toEqual(control.initial);
    expect(control.final.lastChallenge?.outcome).toBe('clean_win');
    expect(touch.final.lastRestartAward?.scenario).toBe('throw_in');
    expect(touch.final.lastRestartAward?.team).toBe('home');
    expect(touch.final.lastBoundaryCrossing?.lastTouchPlayerId).toBe(
      touch.final.lastChallenge?.actorId,
    );
    expect(
      touch.contactFacts.some(
        (c) => c.actorId === touch.final.lastChallenge?.actorId && c.surfaceContact?.available,
      ),
    ).toBe(true);
    expect(touch.samples.some((s) => !s.ownerId && s.ball.y < -0.11)).toBe(true);
  });
  it('an intended clearance cannot redirect an unreachable ball or manufacture a last touch', () => {
    const f = createTransitionFixture({ id: 'unreachable', scenario: 'clearance', lane: 'left' });
    const p = f.state.players.find((p) => p.id === f.defenderId)!;
    p.position = { x: 94, y: 3.5 };
    const begun = beginDefensiveChallenge(
      f.state,
      {
        type: 'challenge',
        actorId: p.id,
        opponentId: f.carrierId,
        technique: 'standing',
        clearance: { kind: 'touchline', target: { x: 90, y: -1 } },
      },
      'dev_ai_selected',
    );
    begun.time += 0.2;
    const resolved = resolveDefensiveChallenge(begun);
    expect(resolved.physicalClearance).not.toBe(true);
    expect(resolved.state.ball).toEqual(f.state.ball);
  });
  it('derives clearance value from context and retains the opponent restart cost', () => {
    const f = createTransitionFixture({
      id: 'clearance-cost',
      scenario: 'clearance',
      lane: 'left',
    });
    const p = f.state.players.find((p) => p.id === f.defenderId)!;
    const decision = evaluateStrategicClearance(observeBoundedScene(f.state, p))!;
    expect(decision.alternatives).toHaveLength(5);
    expect(
      decision.alternatives
        .filter((a) => a.possession === 'opponent_restart')
        .every((a) => a.opponentThreat > 0),
    ).toBe(true);
    expect(decision.selected.kind).toBe('control');
    const crowded = createTransitionFixture({ id: 'dangerous', scenario: 'crowded', lane: 'left' });
    const q = crowded.state.players.find((p) => p.id === crowded.defenderId)!;
    expect(
      evaluateStrategicClearance(observeBoundedScene(crowded.state, q))!.selected.kind,
    ).not.toBe('control');
  });
  it('is deterministic with a deliberately mutating detached observer', () => {
    const config = { id: 'neutrality', scenario: 'counterattack' as const, seconds: 2 };
    const bare = runTransitionLab(config),
      observed = runTransitionLab(config, (s) => {
        s.ball.x = -999;
        s.players.length = 0;
        s.runs.length = 0;
      });
    expect(observed).toEqual(bare);
  });
  it('keeps experiments absent in historical saves and rejects invalid new state', () => {
    const f = fixture();
    delete f.state.experimentalTransitionIntelligence;
    delete f.state.experimentalStrategicClearances;
    const parsed = tacticalMatchStateSchema.parse(f.state);
    expect(parsed.experimentalTransitionIntelligence).toBeUndefined();
    expect(parsed.transitionRuntime).toBeUndefined();
    expect(
      transitionRuntimeSchema.safeParse({ lastScanAt: 1, runs: [{ actorId: 'x' }] }).success,
    ).toBe(false);
    const next = step(f.state, 0.025);
    expect(next.transitionRuntime).toBeUndefined();
  });
});
