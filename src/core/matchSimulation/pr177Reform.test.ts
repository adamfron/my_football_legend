// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createReformFixture } from '../../../scripts/pr177Fixtures';
import { enumerateStateValueActions } from './decisionPolicy';
import { rankAvailableActionsForAI, resolveMatchAction, scoreActionForAI, deriveLeadPass } from './matchActions';
import { deriveFeasiblePassPlans, derivePassLaunchPlan } from './passLaunchPlan';
import { evaluateStateValueAction, stateValueEvaluationSchema, turnoverStateValue } from './decisionStateValue';
import { evaluateTransitionOpportunity } from './attackingTransition';
import { canReconsiderDecision, canReleaseControlledAction, markDecisionEvaluated } from './decisionReadiness';
import { authoritativeMovementTarget, selectMovementProposal } from './movementAuthority';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema } from './matchState';

describe('PR177 consequence policy and physical contracts', () => {
  it('generates an independent run for a stationary fast winger without an accepted lead', () => {
    const { state, actor, runner } = createReformFixture('stationary-winger');
    expect(deriveLeadPass(state, actor, runner)).toBeUndefined();
    const actions = enumerateStateValueActions(state, actor);
    const space = actions.filter((a) => a.type === 'pass' && a.receiverId === runner.id && a.requestedSpace);
    expect(space.length).toBeGreaterThan(0); expect(actions.length).toBeLessThanOrEqual(48);
    expect(runner.velocity).toEqual({ x: 0, y: 0 });
  });
  it('keeps every evaluated branch finite, normalised and independent of mutation', () => {
    const { state, actor } = createReformFixture('central-moderate-pressure');
    const before = structuredClone(state);
    for (const action of enumerateStateValueActions(state, actor)) {
      const result = evaluateStateValueAction(state, actor, action);
      if (result) expect(stateValueEvaluationSchema.safeParse(result).success).toBe(true);
    }
    expect(state).toEqual(before);
  });
  it('replaces old scoring units and does not make game reading a risk penalty', () => {
    const { state, actor, runner } = createReformFixture('central-moderate-pressure');
    const plan = deriveFeasiblePassPlans(state, actor, runner, runner.position, 'progressive')[0]!;
    const action = { type: 'pass' as const, actorId: actor.id, receiverId: runner.id, target: runner.position, intent: 'progressive' as const, deliveryPlan: plan };
    actor.profile.attributes.gameReading = 20;
    const low = scoreActionForAI(state, actor.id, action);
    actor.profile.attributes.gameReading = 99;
    expect(scoreActionForAI(state, actor.id, action)).toBeGreaterThanOrEqual(low - 1e-8);
    expect(Math.abs(low)).toBeLessThan(1);
  });
  it.each([5, 10, 15, 25, 35, 45, 60])('keeps %dm ground and loft plans inside the release energy envelope', (metres) => {
    const { state, actor, runner } = createReformFixture('long-switch');
    actor.position = { x: 5, y: 34 }; state.ball = { ...actor.position, ownerId: actor.id };
    const target = { x: 5 + metres, y: 34 }; runner.position = target;
    for (const delivery of ['ground', 'lofted'] as const) {
      const plan = derivePassLaunchPlan(state, actor, runner, target, 'direct', delivery);
      expect(plan.speed).toBeLessThanOrEqual(30 + 1e-8);
      expect(Math.hypot(plan.velocity.x, plan.velocity.y, plan.velocity.z)).toBeCloseTo(plan.speed, 9);
      const released = resolveMatchAction(state, { type: 'pass', actorId: actor.id, receiverId: runner.id, target, intent: 'direct', delivery, deliveryPlan: plan }, 'dev_ai_selected');
      expect(released.ball.launchElevation).toBeCloseTo(plan.elevation, 9);
      expect(released.ball.launchSpeed).toBeLessThanOrEqual(30);
      expect(released.receptionPreparation?.expectedArrivalTime).toBeCloseTo(state.time + plan.predictedArrivalTime, 9);
    }
  });
  it('offers distinct feasible arrival speeds instead of one direct deadline', () => {
    const { state, actor, runner } = createReformFixture('long-switch');
    const plans = deriveFeasiblePassPlans(state, actor, runner, runner.position, 'direct', true);
    expect(plans.length).toBeGreaterThanOrEqual(2); expect(plans.length).toBeLessThanOrEqual(3);
    expect(plans[0]!.predictedArrivalTime).not.toBe(plans[1]!.predictedArrivalTime);
  });
  it('does not grant a new contact just because perception is ready', () => {
    const { state, actor } = createReformFixture('carry-v-recycle');
    expect(canReconsiderDecision(state, actor)).toBe(true);
    state.ball.x += 3;
    expect(canReleaseControlledAction(state, actor)).toBe(false);
    state.ball.x = actor.position.x;
    state.lastGroundContact = { actorId: actor.id, at: state.time, region: 'left_foot', point: actor.position, incomingVelocity: { x: 0, y: 0 }, outgoingVelocity: { x: 0, y: 0 }, retained: true, executed: true, physicalCount: 1 };
    expect(canReleaseControlledAction(state, actor)).toBe(false);
  });
  it('bounds ranking frequency while recognising a changed corridor before the hold cooldown', () => {
    const { state, actor, runner } = createReformFixture('stationary-winger');
    state.decisionReadiness = markDecisionEvaluated(state, actor); state.actionCooldown = 1.6;
    state.time += 0.05; runner.position.x += 5;
    expect(canReconsiderDecision(state, actor)).toBe(false);
    state.time += 0.3;
    expect(canReconsiderDecision(state, actor)).toBe(true);
  });
  it('respects human movement over a competing reception and keeps momentum', () => {
    const { state, actor } = createReformFixture('first-time');
    const target = { x: 22, y: 24 }, before = structuredClone(actor.velocity);
    state.playerMovementIntent = { actorId: actor.id, type: 'attack_space', target, startedAt: state.time, expiresAt: state.time + 2 };
    expect(authoritativeMovementTarget(state, actor, { x: 90, y: 34 })).toEqual(target);
    expect(actor.velocity).toEqual(before);
    expect(selectMovementProposal([{ authority: 'human', target, validUntil: state.time + 2, episode: 99 }], state.time, 100)).toBeUndefined();
  });
  it.each(['corner-counter', 'blocked-shot-counter', 'free-kick-counter', 'weak-v-strong', 'press-escape'] as const)('recognises exposed opponents after %s without guaranteeing a result', (scenario) => {
    const { state, actor } = createReformFixture(scenario);
    const opportunity = evaluateTransitionOpportunity(state, actor);
    expect(opportunity.active).toBe(true); expect(opportunity.opponentsAhead).toBeGreaterThan(0);
    state.time += 9;
    expect(evaluateTransitionOpportunity(state, actor).active).toBe(false);
  });
  it('prices a loss using actual defensive cover', () => {
    const { state, actor } = createReformFixture('weak-v-strong');
    const covered = turnoverStateValue(state, actor, { x: 45, y: 34 }, 1);
    state.players.filter((p) => p.team === actor.team && p.id !== actor.id).forEach((p) => { p.position = { x: 80, y: 34 }; });
    expect(turnoverStateValue(state, actor, { x: 45, y: 34 }, 1)).toBeLessThan(covered);
  });
  it('preserves a restart retriever route instead of prematurely taking the setup position', () => {
    const { state, actor } = createReformFixture('clearance');
    const retrieve = { x: 80, y: 75 };
    state.scenario = 'throw_in';
    state.restart = { phase: 'preparing', origin: 'live_event', spot: { x: 80, y: 68 }, restartTeam: actor.team,
      startedAt: state.time, takerId: actor.id, targets: { [actor.id]: { x: 80, y: 67.6 } }, roles: {}, executionChoices: ['short_pass'], retrieval: { playerId: actor.id, stage: 'approach' } };
    expect(authoritativeMovementTarget(state, actor, retrieve)).toEqual(retrieve);
  });
  it('replays a policy deterministically and round-trips its runtime schema', () => {
    const { state, actor } = createReformFixture('central-moderate-pressure');
    expect(rankAvailableActionsForAI(state, actor.id)).toEqual(rankAvailableActionsForAI(state, actor.id));
    const run = () => { let s = structuredClone(state); for (let i = 0; i < 80; i++) s = stepTacticalMatchAfterDecisionProbe(s, 0.025); return s; };
    expect(run()).toEqual(run());
    expect(tacticalMatchStateSchema.parse(state).decisionPolicy).toBe('state-value-v1');
  });
});
