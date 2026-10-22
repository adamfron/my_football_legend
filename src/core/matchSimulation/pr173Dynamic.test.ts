// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDynamicFixture as createPolicyDynamicFixture } from './pr173Fixtures';
import { createLegacyMatchFixture } from '../../../scripts/legacyMatchFixture';
import {
  projectDynamicIntervention,
  earliestDynamicIntervention,
  dynamicInterventionSchema,
} from './dynamicIntervention';
import { tacticalMatchStateSchema } from './matchState';
import { playerContactGeometry } from './ballContactGeometry';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { resolveReceptionOutcome } from './passReception';
import { prepareReceptionContinuation } from './receptionContinuation';
import { resolveMatchAction, enumerateAvailableActions } from './matchActions';
import { enumerateFirstTimePasses } from './firstTimePassing';
import { deriveMovementCapability } from './locomotion';
import { advanceMatchFitness } from './matchFitness';
import { OffensiveContinuationTracker } from './offensiveContinuationFunnel';
import { applyPlayerDecision, projectPlayerDecisionOpportunity } from './playerDecision';
import { createPr173ResearchFixture } from '../../../scripts/pr173ResearchFixtures';

const createDynamicFixture: typeof createPolicyDynamicFixture = (
  input,
  create = createLegacyMatchFixture,
) => createPolicyDynamicFixture(input, create);

describe('PR173 bounded relative-motion intervention', () => {
  it('distinguishes equal-position opposite momentum without changing state or RNG', () => {
    const f = createDynamicFixture({ scenario: 'pr173-winger-cut-1b' });
    const p = f.state.players.find((p) => p.id === f.defenderId)!;
    const before = structuredClone(f.state),
      target = { x: 72, y: 15 };
    const away = projectDynamicIntervention(p, target);
    const toward = projectDynamicIntervention(
      {
        ...p,
        velocity: { x: -p.velocity.x, y: -p.velocity.y },
        facingAngle: p.facingAngle + Math.PI,
      },
      target,
    );
    expect(away.seconds).toBeGreaterThan(toward.seconds + 0.5);
    expect(dynamicInterventionSchema.safeParse(away).success).toBe(true);
    expect(f.state).toEqual(before);
    expect(projectDynamicIntervention(p, target)).toEqual(away);
  });
  it('can rank a farther aligned cover body ahead of a nearer misaligned presser', () => {
    const f = createDynamicFixture({ scenario: 'pr173-winger-cut-1b' });
    const p = f.state.players.find((p) => p.id === f.defenderId)!;
    const target = { x: 72, y: 15 };
    const nearer = projectDynamicIntervention(p, target);
    const farther = projectDynamicIntervention(
      { ...p, position: { x: 74.5, y: 18 }, velocity: { x: -3.6, y: -4.8 }, facingAngle: -2.5 },
      target,
    );
    expect(farther.distance).toBeGreaterThan(nearer.distance);
    expect(farther.seconds).toBeLessThan(nearer.seconds);
  });
  it('retains immediate physical foot access for an overshooting defender', () => {
    const f = createDynamicFixture({ scenario: 'pr173-winger-cut-1b' });
    const p = f.state.players.find((p) => p.id === f.defenderId)!;
    const target = playerContactGeometry(p).leftFoot;
    expect(projectDynamicIntervention(p, target)).toMatchObject({
      seconds: 0,
      currentFootAccess: true,
    });
  });
  it('uses agility, facing and depleted physical reserves in the bounded turn', () => {
    const f = createDynamicFixture({ scenario: 'pr173-winger-cut-1b' });
    const p = f.state.players.find((p) => p.id === f.defenderId)!;
    const target = { x: 72, y: 15 };
    const skilled = structuredClone(p);
    skilled.profile.attributes.agility = 95;
    const weak = structuredClone(p);
    weak.profile.attributes.agility = 15;
    expect(projectDynamicIntervention(skilled, target).seconds).toBeLessThan(
      projectDynamicIntervention(weak, target).seconds,
    );
    const tired = structuredClone(skilled);
    tired.fitness!.burstReadiness = 0.01;
    expect(projectDynamicIntervention(tired, target).seconds).toBeGreaterThan(
      projectDynamicIntervention(skilled, target).seconds,
    );
    const aligned = { ...skilled, velocity: { x: 3, y: 0 }, facingAngle: Math.PI / 2 };
    const backwards = { ...aligned, facingAngle: -Math.PI / 2 };
    expect(projectDynamicIntervention(backwards, { x: 74, y: 12.5 }).seconds).toBeGreaterThan(
      projectDynamicIntervention(aligned, { x: 74, y: 12.5 }).seconds,
    );
  });
  it('considers cover but excludes dismissed and physically unavailable defenders', () => {
    const f = createDynamicFixture({ scenario: 'pr173-winger-cut-1b', cover: true });
    const actor = f.state.players.find((p) => p.id === f.actorId)!;
    const cover = f.state.players.find((p) => p.id === f.coverId)!;
    const target = { ...cover.position };
    expect(earliestDynamicIntervention(f.state, actor, target)).toEqual({
      seconds: 0,
      defenderId: cover.id,
    });
    cover.injury = {
      id: 'pr173-unable',
      playerId: cover.id,
      at: f.state.time,
      status: 'unable',
      mechanism: 'movement',
      injuryType: 'muscle',
      assessmentRequired: false,
      recoveryDays: 7,
    };
    expect(earliestDynamicIntervention(f.state, actor, target).defenderId).not.toBe(cover.id);
  });
  it.each([false, true])(
    'mirrors coordinates and preserves a valid full state in either period (%s)',
    (secondHalf) => {
      const normal = createDynamicFixture({ scenario: 'pr173-winger-cut-1b', secondHalf });
      const mirror = createDynamicFixture({
        scenario: 'pr173-winger-cut-1b',
        secondHalf,
        mirrored: true,
      });
      expect(tacticalMatchStateSchema.safeParse(normal.state).success).toBe(true);
      expect(tacticalMatchStateSchema.safeParse(mirror.state).success).toBe(true);
      const a = normal.state.players.find((p) => p.id === normal.defenderId)!;
      const b = mirror.state.players.find((p) => p.id === mirror.defenderId)!;
      expect(projectDynamicIntervention(a, { x: 72, y: 15 }).seconds).toBeCloseTo(
        projectDynamicIntervention(b, { x: 33, y: 53 }).seconds,
        8,
      );
    },
  );
});

describe('PR173 actual reception and dynamic movement contracts', () => {
  it.each([false, true])(
    'imparts a finite directional impulse at the contact point without a preplanned carry (%s)',
    (mirrored) => {
      const f = createDynamicFixture({ scenario: 'pr173-reception-pressure-1a', mirrored });
      f.state.playerAgencyEnabled = true;
      f.state.controlledFootballerId = f.actorId;
      let state = f.state;
      for (let tick = 0; tick < 40 && !state.lastReceptionOutcome; tick++)
        state = stepTacticalMatchAfterDecisionProbe(state);
      const outcome = state.lastReceptionOutcome!;
      expect(outcome.kind).toBe('directional_control');
      expect(state.onBallPreparation?.plannedCarry).toBeUndefined();
      expect(state.ball.x).toBeCloseTo(outcome.contactPoint.x, 8);
      expect(state.ball.y).toBeCloseTo(outcome.contactPoint.y, 8);
      expect(state.ball.velocity).toBeDefined();
      expect(Math.hypot(outcome.retainedVelocity!.x, outcome.retainedVelocity!.y)).toBeGreaterThan(
        0.7,
      );
      const next = stepTacticalMatchAfterDecisionProbe(state);
      expect(Math.hypot(next.ball.x - state.ball.x, next.ball.y - state.ball.y)).toBeLessThan(0.5);
    },
  );
  it('preserves human directional intent over an autonomous proposal while charging a physical turn', () => {
    const f = createDynamicFixture({ scenario: 'pr173-reception-pressure-1a' });
    const actor = f.state.players.find((p) => p.id === f.actorId)!;
    f.state.receptionPreparation!.continuation = {
      target: { x: 76, y: 18 },
      mode: 'carry',
      createdAt: 19,
      expiresAt: 22,
      incomingVelocity: { x: 8, y: 0 },
    };
    f.state.pendingReceptionIntent = {
      actorId: actor.id,
      action: { type: 'carry', actorId: actor.id, target: { x: 76, y: 5 } },
      createdAt: 20,
      expiresAt: 22,
      ballEpisode: 'pr173-flight',
    };
    const before = structuredClone(f.state);
    const outcome = resolveReceptionOutcome(f.state, actor, actor.position);
    expect(outcome.resultingPoint!.y).toBeLessThan(actor.position.y);
    expect(outcome.retainedVelocity!.y).toBe(0);
    expect(outcome.momentumRetention).toBeLessThan(1);
    expect(f.state).toEqual(before);
  });
  it('keeps difficult fast receptions uncertain and skill dependent', () => {
    const strong = createDynamicFixture({ scenario: 'pr173-reception-pressure-1a', passSpeed: 22 });
    const weak = createDynamicFixture({
      scenario: 'pr173-reception-pressure-1a',
      passSpeed: 22,
      skill: 20,
    });
    const a = strong.state.players.find((p) => p.id === strong.actorId)!,
      b = weak.state.players.find((p) => p.id === weak.actorId)!;
    const good = resolveReceptionOutcome(strong.state, a, a.position),
      bad = resolveReceptionOutcome(weak.state, b, b.position);
    expect(bad.quality!.score).toBeLessThan(good.quality!.score);
    expect(['heavy_touch', 'failed_control']).toContain(bad.kind);
  });
  it('can preserve a previously feasible run under misaligned proximity and still reject a covering foot', () => {
    const f = createDynamicFixture({ scenario: 'pr173-reception-pressure-1a' });
    const actor = f.state.players.find((p) => p.id === f.actorId)!,
      defender = f.state.players.find((p) => p.id === f.defenderId)!;
    defender.position = { x: 68, y: 12.5 };
    defender.velocity = { x: -6, y: 0 };
    defender.facingAngle = -Math.PI / 2;
    const continuation = {
      target: { x: 88, y: 10 },
      mode: 'sprint' as const,
      createdAt: 19,
      expiresAt: 22,
      incomingVelocity: { x: 8, y: 0 },
    };
    f.state.receptionPreparation!.continuation = continuation;
    expect(prepareReceptionContinuation(f.state, actor, actor.position)?.continuation).toEqual(
      continuation,
    );
    const cover = f.state.players.find((p) => p.id === f.coverId)!;
    cover.position = { x: 70, y: 10 };
    cover.velocity = { x: -2, y: 0 };
    cover.facingAngle = -Math.PI / 2;
    expect(
      prepareReceptionContinuation(f.state, actor, actor.position)?.continuation,
    ).toBeUndefined();
  });
  it('does not replace a pending human reception choice or manufacture a return pass', () => {
    const f = createDynamicFixture({ scenario: 'pr173-reception-pressure-1a' });
    f.state.playerAgencyEnabled = true;
    f.state.controlledFootballerId = f.actorId;
    const actor = f.state.players.find((p) => p.id === f.actorId)!;
    expect(prepareReceptionContinuation(f.state, actor, actor.position)).toEqual(
      f.state.receptionPreparation,
    );
    // A meaningful incoming menu needs at least 0.35s of real flight remaining.
    f.state.ball.x = 64;
    f.state.ball.travelKind = 'through_ball';
    const layoff = enumerateFirstTimePasses(f.state, f.actorId).find(
      (a) => a.receiverId === f.supportId,
    )!;
    expect(layoff.firstTime).toBe(true);
    const opportunity = projectPlayerDecisionOpportunity(f.state)!;
    expect(opportunity.kind).toBe('incoming_ball');
    const option = opportunity.options.find(
      (o) => o.kind === 'action' && o.action.type === 'pass' && o.action.receiverId === f.supportId,
    )!;
    const selected = applyPlayerDecision(f.state, opportunity, option.id);
    // Selection arms contact; no pass or shot can be silently executed early.
    expect(selected.pendingReceptionIntent?.action).toMatchObject({
      type: 'pass',
      firstTime: true,
    });
    expect(selected.ball).toEqual(f.state.ball);
  });
  it.each(['pr173-winger-cut-1b', 'pr173-momentum-duel-2a'] as const)(
    'executes %s with bounded acceleration and angular motion',
    (scenario) => {
      const f = createDynamicFixture({ scenario });
      const state = resolveMatchAction(f.state, f.action),
        actor = state.players.find((p) => p.id === f.actorId)!;
      const next = stepTacticalMatchAfterDecisionProbe(state),
        moved = next.players.find((p) => p.id === f.actorId)!;
      const delta = Math.hypot(
        moved.velocity.x - actor.velocity.x,
        moved.velocity.y - actor.velocity.y,
      );
      expect(delta).toBeLessThanOrEqual(
        deriveMovementCapability(actor).acceleration * 0.025 + 1e-8,
      );
      expect(Math.abs(moved.facingAngle - actor.facingAngle)).toBeLessThan(0.16);
      expect(next.ball.lastTouchPlayerId).toBe(actor.id);
      expect(next.defensiveTelemetry?.fouls ?? 0).toBe(0);
    },
  );
  it('keeps short passing options available at 1% burst readiness and recovers during sustained light work', () => {
    const f = createDynamicFixture({ scenario: 'pr173-winger-cut-1b', readiness: 0.01 });
    const actor = f.state.players.find((p) => p.id === f.actorId)!;
    expect(
      enumerateAvailableActions(f.state, actor.id).some(
        (a) => a.type === 'pass' && a.receiverId === f.supportId,
      ),
    ).toBe(true);
    for (let tick = 0; tick < 400; tick++)
      actor.fitness = advanceMatchFitness(actor, {
        dt: 0.025,
        speed: 1.5,
        previousSpeed: 1.5,
        distance: 1.5 * 0.025,
        turnRadians: 0,
      });
    expect(actor.fitness!.burstReadiness).toBeGreaterThan(0.05);
    expect(actor.fitness!.workload.seconds).toBeCloseTo(10);
  });
  it('can release a real first-time layoff and continue an explicitly selected run without stopping', () => {
    const f = createPr173ResearchFixture({ opening: 'layoff_run', cover: false, mirrored: false });
    let state = f.state,
      releaseSpeed: number | undefined,
      minimumAfterRelease = Infinity;
    for (let tick = 0; tick < 40; tick++) {
      state = stepTacticalMatchAfterDecisionProbe(state);
      const actor = state.players.find((p) => p.id === f.actorId)!;
      if (state.lastPassDiagnostic?.passerId === actor.id) {
        const speed = Math.hypot(actor.velocity.x, actor.velocity.y);
        releaseSpeed ??= speed;
        minimumAfterRelease = Math.min(minimumAfterRelease, speed);
      }
    }
    expect(releaseSpeed).toBeGreaterThan(1.5);
    expect(minimumAfterRelease).toBeGreaterThan(0.7);
    expect(state.players.find((p) => p.id === f.actorId)!.position.x).toBeGreaterThan(70);
    expect(state.playerMovementIntent?.target).toEqual({ x: 80, y: 17 });
  });
  it('keeps detailed continuity observations bounded, deduplicated and completely read-only', () => {
    const f = createDynamicFixture({ scenario: 'pr173-reception-pressure-1a' });
    let state = f.state,
      plain = structuredClone(state);
    const tracker = new OffensiveContinuationTracker(true);
    for (let tick = 0; tick < 40; tick++) {
      const previous = state;
      state = stepTacticalMatchAfterDecisionProbe(state);
      plain = stepTacticalMatchAfterDecisionProbe(plain);
      tracker.observe(previous, state);
      tracker.observe(previous, state);
    }
    expect(state).toEqual(plain);
    expect(tracker.snapshot().firstTouches).toHaveLength(1);
    expect(tracker.snapshot().counts.result_completed).toBe(1);
  });
});
