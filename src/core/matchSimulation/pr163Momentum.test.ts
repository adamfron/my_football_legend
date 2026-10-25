// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createOffensiveScenario as createPolicyScenario } from './pr163Fixtures';
import { createLegacyMatchFixture } from '../../../scripts/legacyMatchFixture';
import { enumerateCarryChoices, projectCarryOpportunity } from './carryOpportunity';
import { classifyPass } from './passClassification';
import { matchActionSchema, tacticalMatchStateSchema } from './matchState';
import { resolveMatchAction, rankAvailableActionsForAI, scoreActionForAI } from './matchActions';
import { deriveCarryExecution } from './carryExecution';
import type { MatchAction } from './matchState';
import { prepareReceptionContinuation, shouldLetPassRun } from './receptionContinuation';
import { resolveGroundPassClaim, resolveContinuousGroundPassClaim } from './passClaimResolver';
import { FIXED_MATCH_DT, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { OffensiveContinuationTracker } from './offensiveContinuationFunnel';
import { enumerateNpcSpacePasses } from './spacePassing';
import { derivePassDifficulty } from './passExecution';
import { resolveReceptionOutcome } from './passReception';
import { projectPlayerDecisionOpportunity } from './playerDecision';

const createOffensiveScenario: typeof createPolicyScenario = (
  scenario,
  seed,
  create = createLegacyMatchFixture,
) => createPolicyScenario(scenario, seed, create);

describe('PR163 offensive momentum and contestable reception', () => {
  it('keeps a physically evasive controlled dribble valuable when a free sprint corridor is blocked', () => {
    const f = createOffensiveScenario('npc_equivalent', 'pr163-dribble-contest');
    const actor = f.state.players.find((p) => p.id === f.wingerId)!;
    const defender = f.state.players.find((p) => p.id === f.defenderId)!;
    defender.position = { x: actor.position.x + 3, y: actor.position.y + 2.4 };
    defender.velocity = { x: 0, y: 0 };
    f.state.ballOwnershipStartedAt = f.state.time;
    Object.assign(actor.profile.attributes, {
      dribbling: 75,
      agility: 75,
      pace: 75,
      composure: 75,
    });
    const action: MatchAction = {
      type: 'carry',
      actorId: actor.id,
      target: { x: actor.position.x + 10, y: actor.position.y + 8 },
      movementMode: 'dribble',
    };
    expect(projectCarryOpportunity(f.state, actor, action.target).freeDistance).toBe(0);
    expect(scoreActionForAI(f.state, actor.id, action)).toBeGreaterThan(
      scoreActionForAI(f.state, actor.id, { type: 'hold', actorId: actor.id }),
    );
    const executed = resolveMatchAction(f.state, action);
    const route = deriveCarryExecution(executed, actor, executed.ballCarrierIntent!);
    expect(route.mode).toBe('evade');
    expect(route.blockerId).toBe(defender.id);
    expect(route.localTarget).not.toEqual(action.target);
    expect(route.projectedControl).toBeLessThan(1);
  });
  it('records technical failure after a real intentional bypass as a failed run-on', () => {
    const f = createOffensiveScenario('failed_control', 'pr163-case-2');
    const tracker = new OffensiveContinuationTracker();
    let state = resolveMatchAction(f.state, f.action);
    // A poor rating alone no longer forces a failed contact. This negative control
    // deliberately presents an oblique outside surface to the arriving ball.
    state.receptionPreparation!.contactSurface = 'outside';
    tracker.observe(f.state, state);
    for (let tick = 0; tick < 160 && !state.lastResolvedPass?.finalResult; tick++) {
      const previous = state;
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      tracker.observe(previous, state);
    }
    expect(state.lastResolvedPass?.finalResult).toBe('technical_error');
    expect(tracker.snapshot().counts.bypassed_early_contact).toBe(1);
    expect(tracker.snapshot().counts.first_touch_failure).toBe(1);
    expect(tracker.snapshot().counts.run_on_failed).toBe(1);
    expect(tracker.snapshot().counts.result_completed ?? 0).toBe(0);
  });
  it('deduplicates an old completed pass retained beside a later unclaimed flight', () => {
    const f = createOffensiveScenario('elite_winger', 'pr163-result-ledger');
    const released = resolveMatchAction(f.state, f.action);
    let state = released;
    for (let tick = 0; tick < 160 && !state.lastResolvedPass?.finalResult; tick++)
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    expect(state.lastResolvedPass?.finalResult).toBe('completed');
    const tracker = new OffensiveContinuationTracker();
    tracker.observe(f.state, released);
    tracker.observe(released, state);
    const stale = state.lastResolvedPass!;
    const newer = {
      ...state,
      time: state.time + 2,
      lastPassDiagnostic: {
        ...stale,
        passId: 'pr163-later-unclaimed',
        releasedAt: state.time + 1,
        resolvedAt: state.time + 2,
        finalResult: 'unclaimed' as const,
      },
    };
    delete newer.lastPassDiagnostic.actualReceiverId;
    for (let sample = 0; sample < 20; sample++) tracker.observe(state, newer);
    const counts = tracker.snapshot().counts;
    expect(counts.released).toBe(2);
    expect(counts.result_completed).toBe(1);
    expect(counts.result_unclaimed).toBe(1);
    expect(counts.first_legal_opportunity).toBe(1);
    const recovered = {
      ...newer,
      time: newer.time + 2,
      lastPassDiagnostic: {
        ...stale,
        passId: 'pr163-self-reclaim',
        releasedAt: newer.time + 1,
        resolvedAt: newer.time + 2,
        actualReceiverId: stale.passerId,
      },
    };
    for (let sample = 0; sample < 10; sample++) tracker.observe(newer, recovered);
    expect(tracker.snapshot().counts.result_completed).toBe(1);
    expect(tracker.snapshot().counts.passer_reclaimed).toBe(1);
  });
  it.each(['pr163-case-1', 'pr163-case-2', 'pr163-case-3'])(
    'keeps a prepared accurate lofted switch receivable without overrunning high flight: %s',
    (seed) => {
      const f = createOffensiveScenario('accurate_switch', seed);
      let state = resolveMatchAction(f.state, f.action);
      const passId = state.lastPassDiagnostic!.passId;
      for (let tick = 0; tick < 160 && !state.lastResolvedPass?.finalResult; tick++)
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(state.lastResolvedPass?.passId).toBe(passId);
      expect(state.lastResolvedPass?.finalResult, JSON.stringify(state.lastReceptionOutcome)).toBe(
        'completed',
      );
      expect(state.lastResolvedPass?.actualReceiverId).toBe(f.passerId);
    },
  );
  it('keeps long backward legacy passes readable without direct attack semantics', () => {
    const legacy = matchActionSchema.parse({
      type: 'pass',
      actorId: 'a',
      receiverId: 'b',
      target: { x: 30, y: 58 },
      intent: 'direct',
    });
    expect(legacy.type).toBe('pass');
    expect(classifyPass({ x: 70, y: 10 }, { x: 30, y: 58 }, 'home', 'direct')).toEqual({
      length: 'long',
      direction: 'backward',
      purpose: 'switch',
      delivery: 'ground',
    });
  });
  it('offers different sprint corridors and suppresses them when burst reserves are depleted', () => {
    const { state, wingerId } = createOffensiveScenario('elite_winger', 'pr163-choices');
    const actor = state.players.find((p) => p.id === wingerId)!;
    state.ball = { ...actor.position, ownerId: actor.id };
    const sprint = enumerateCarryChoices(state, actor).filter(
      (a) => a.type === 'carry' && a.movementMode === 'sprint',
    );
    expect(sprint.length).toBeGreaterThan(0);
    expect(sprint.every((a) => a.type === 'carry' && a.target.x - actor.position.x >= 12)).toBe(
      true,
    );
    actor.fitness!.burstReadiness = 0.15;
    expect(
      enumerateCarryChoices(state, actor).some(
        (a) => a.type === 'carry' && a.movementMode === 'sprint',
      ),
    ).toBe(false);
  });
  it('discounts a route intercepted by an approaching defender instead of rewarding arbitrary target depth', () => {
    const { state, wingerId, defenderId } = createOffensiveScenario('elite_winger', 'pr163-route');
    const actor = state.players.find((p) => p.id === wingerId)!;
    const target = { x: 90, y: 11 };
    const open = projectCarryOpportunity(state, actor, target, 'sprint');
    const defender = state.players.find((p) => p.id === defenderId)!;
    defender.position = { x: 69, y: 11 };
    defender.velocity = { x: -3, y: 0 };
    expect(projectCarryOpportunity(state, actor, target, 'sprint').freeDistance).toBeLessThan(
      open.freeDistance,
    );
  });
  it('does not plan before awareness or commit an autonomous human reception action', () => {
    const { state, action, wingerId } = createOffensiveScenario('human_winger', 'pr163-human');
    const released = resolveMatchAction(state, action);
    const receiver = released.players.find((p) => p.id === wingerId)!;
    expect(
      prepareReceptionContinuation(released, receiver, receiver.position)?.continuation,
    ).toBeUndefined();
    released.time = released.receptionPreparation!.awarenessAt + 0.1;
    expect(
      prepareReceptionContinuation(released, receiver, receiver.position)?.continuation,
    ).toBeUndefined();
    expect(released.ball.ownerId).toBeUndefined();
  });
  it('lets a real pass run without ownership, credit or a fabricated public touch', () => {
    const { state, action, wingerId } = createOffensiveScenario('let_ball_run', 'pr163-run-on');
    const released = resolveMatchAction(state, action);
    const receiver = released.players.find((p) => p.id === wingerId)!;
    released.time = released.receptionPreparation!.awarenessAt + 0.1;
    released.ball = {
      ...released.ball,
      x: 64,
      y: 11,
      height: 0.11,
      velocity: { x: 6, y: 0, z: 0 },
    };
    receiver.position = { x: 64.4, y: 11 };
    released.receptionPreparation!.runOn = {
      target: { x: 69, y: 11 },
      contactAt: released.time + 0.8,
      expiresAt: released.time + 1,
    };
    const before = JSON.stringify(released);
    expect(shouldLetPassRun(released, receiver, released.ball)).toBe(true);
    expect(
      resolveContinuousGroundPassClaim(released, { x: 64, y: 11 }, { x: 64.5, y: 11 })?.playerId,
    ).not.toBe(receiver.id);
    expect(resolveGroundPassClaim(released, released.ball, 1.05).playerId).not.toBe(receiver.id);
    expect(released.ball.ownerId).toBeUndefined();
    expect(released.lastPassDiagnostic?.finalResult).toBeUndefined();
    expect(JSON.stringify(released)).toBe(before);
  });
  it('reconsiders non-contact for a defender, changed trajectory, reached waypoint and human decision', () => {
    const { state, action, wingerId, defenderId } = createOffensiveScenario(
      'let_ball_run',
      'pr163-invalidate',
    );
    const released = resolveMatchAction(state, action);
    const receiver = released.players.find((p) => p.id === wingerId)!;
    released.time = released.receptionPreparation!.awarenessAt + 0.1;
    released.ball = { ...released.ball, x: 64, y: 11, height: 0.11, velocity: { x: 6, y: 0 } };
    released.receptionPreparation!.runOn = {
      target: { x: 69, y: 11 },
      contactAt: released.time + 0.8,
      expiresAt: released.time + 1,
    };
    const defender = released.players.find((p) => p.id === defenderId)!;
    defender.position = { x: 65, y: 11 };
    expect(shouldLetPassRun(released, receiver, released.ball)).toBe(false);
    defender.position = { x: 85, y: 34 };
    released.ball.velocity = { x: -6, y: 0 };
    expect(shouldLetPassRun(released, receiver, released.ball)).toBe(false);
    released.ball.velocity = { x: 6, y: 0 };
    released.ball.x = 68;
    expect(shouldLetPassRun(released, receiver, released.ball)).toBe(false);
  });
  it('generates bounded spaces for a prospective stationary runner and respects release-time offside', () => {
    const { state, passerId, wingerId } = createOffensiveScenario('elite_winger', 'pr163-space');
    const passer = state.players.find((p) => p.id === passerId)!;
    const runner = state.players.find((p) => p.id === wingerId)!;
    const options = enumerateNpcSpacePasses(state, passer);
    expect(options.length).toBeLessThanOrEqual(3);
    expect(options.length).toBeGreaterThan(0);
    runner.position.x = 104;
    expect(
      enumerateNpcSpacePasses(state, passer).some(
        (a) => a.type === 'space_pass' && a.target.y < 20,
      ),
    ).toBe(false);
  });
  it('retains physical long-pass difficulty and meaningful skill/pressure costs in matched geometry', () => {
    const { state, passerId, defenderId } = createOffensiveScenario(
      'elite_winger',
      'pr163-difficulty',
    );
    const passer = state.players.find((p) => p.id === passerId)!;
    const defender = state.players.find((p) => p.id === defenderId)!;
    passer.position = { x: 15, y: 34 };
    passer.facingAngle = Math.PI / 2;
    defender.position = { x: 95, y: 5 };
    const short = derivePassDifficulty(state, passer, { x: 25, y: 34 }, 'progressive', 'ground');
    const long = derivePassDifficulty(state, passer, { x: 65, y: 34 }, 'progressive', 'ground');
    expect(long.uncertaintyMetres).toBeGreaterThan(short.uncertaintyMetres);
    passer.profile.attributes.passing = 20;
    defender.position = { x: 16, y: 34 };
    expect(
      derivePassDifficulty(state, passer, { x: 65, y: 34 }, 'progressive', 'ground')
        .uncertaintyMetres,
    ).toBeGreaterThan(long.uncertaintyMetres);
  });
  it('allows failed moving control and preserves actual incoming height/weak-foot evidence', () => {
    const { state, wingerId } = createOffensiveScenario('failed_control', 'pr163-failed');
    const receiver = state.players.find((p) => p.id === wingerId)!;
    state.ball = { ...receiver.position, height: 0.6, velocity: { x: 20, y: 0, z: -1 } };
    receiver.velocity = { x: 7, y: 0 };
    receiver.facingAngle = -Math.PI / 2;
    expect(['failed_control', 'heavy_touch']).toContain(
      resolveReceptionOutcome(state, receiver, receiver.position).kind,
    );
    expect(
      resolveReceptionOutcome(state, receiver, receiver.position).quality?.incomingHeight,
    ).toBe(0.6);
  });
  it('observer/ranking repetition changes no canonical state and stepping remains identical', () => {
    const fixture = createOffensiveScenario('directional_touch', 'pr163-parity');
    let observed = resolveMatchAction(fixture.state, fixture.action);
    let plain = structuredClone(observed);
    const tracker = new OffensiveContinuationTracker();
    for (let i = 0; i < 160; i++) {
      const previous = observed;
      observed = stepTacticalMatchAfterDecisionProbe(observed, FIXED_MATCH_DT);
      plain = stepTacticalMatchAfterDecisionProbe(plain, FIXED_MATCH_DT);
      tracker.observe(previous, observed);
      if (i % 20 === 0 && observed.ball.ownerId)
        rankAvailableActionsForAI(observed, observed.ball.ownerId);
    }
    expect(observed).toEqual(plain);
    expect(tacticalMatchStateSchema.safeParse(observed).success).toBe(true);
    expect(tracker.snapshot().version).toBe(2);
  });
  it('human and NPC execute the same selected physical sprint and retain a meaningful human reception decision', () => {
    const { state, action } = createOffensiveScenario('npc_equivalent', 'pr163-execution');
    const controlled = {
      ...structuredClone(state),
      playerAgencyEnabled: true,
      controlledFootballerId: action.actorId,
    };
    let human = resolveMatchAction(controlled, action, 'human_selected');
    let npc = resolveMatchAction(structuredClone(state), action, 'autonomous_npc');
    expect(human.ball).toEqual(npc.ball);
    expect(human.ballCarrierIntent?.target).toEqual(npc.ballCarrierIntent?.target);
    for (let tick = 0; tick < 12; tick++) {
      human = stepTacticalMatchAfterDecisionProbe(human, FIXED_MATCH_DT);
      npc = stepTacticalMatchAfterDecisionProbe(npc, FIXED_MATCH_DT);
      const h = human.players.find((p) => p.id === action.actorId)!;
      const n = npc.players.find((p) => p.id === action.actorId)!;
      expect(human.ball).toEqual(npc.ball);
      expect(h.position).toEqual(n.position);
      expect(h.velocity).toEqual(n.velocity);
      expect(h.fitness).toEqual(n.fitness);
    }
    const f = createOffensiveScenario('human_winger', 'pr163-decision');
    const actor = f.state.players.find((p) => p.id === f.wingerId)!;
    f.state.ball = { ...actor.position, ownerId: actor.id };
    f.state.onBallPreparation = {
      ...f.state.onBallPreparation!,
      actorId: actor.id,
      gainedAt: 18,
      readyAt: 18.2,
    };
    f.state.ballOwnershipStartedAt = 18;
    f.state.actionCooldown = 0;
    expect(projectPlayerDecisionOpportunity(f.state)).toBeDefined();
  });
});
