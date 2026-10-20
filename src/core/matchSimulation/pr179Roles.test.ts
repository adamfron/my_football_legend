// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createReformFixture } from '../../../scripts/pr177Fixtures';
import {
  TACTICAL_ROLES,
  assignTacticalRoles,
  changeTacticalRole,
  rolePlanSchema,
  rolesForPlayer,
  roleSuitability,
  tacticalRoleFor,
} from './tacticalRoles';
import {
  roleMovementTarget,
  deriveTacticalRolePhase,
  forecastWaiting,
  roleControlledValue,
  roleReceivingTargets,
} from './roleTactics';
import { rankAvailableActionsForAI, resolveMatchAction } from './matchActions';
import { evaluateStateValueAction, stateValueEvaluationSchema } from './decisionStateValue';
import {
  configureMatchPolicy,
  RoleExperimentRecorder,
  roleExperimentExportSchema,
} from './roleExperiment';
import { withRankingObserver } from './decisionObservation';
import { deriveTacticalTargets } from './tacticalPositioning';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema } from './matchState';
import { deriveMovementCapability } from './locomotion';
import { enumerateStateValueActions } from './decisionPolicy';
import { PRIMARY_DECISION_POLICIES } from './decisionPolicyConfig';

const fixture = () => {
  const f = createReformFixture('stationary-winger');
  f.state.decisionPolicy = 'role-intent-v1';
  f.state.rolePlan = assignTacticalRoles(f.state);
  return f;
};
describe('PR179 shared tactical instructions and canonical decisions', () => {
  it('covers every formation slot with a validated bounded catalogue', () => {
    const { state } = fixture();
    expect(TACTICAL_ROLES).toHaveLength(29);
    expect(new Set(TACTICAL_ROLES.map((r) => r.id)).size).toBe(29);
    expect(rolePlanSchema.safeParse(assignTacticalRoles(state)).success).toBe(true);
    for (const player of state.players)
      expect(rolesForPlayer(player).some((r) => r.id === tacticalRoleFor(state, player).id)).toBe(
        true,
      );
    expect(assignTacticalRoles(state)).toEqual(assignTacticalRoles(structuredClone(state)));
    expect(tacticalMatchStateSchema.safeParse(state).success).toBe(true);
  });
  it.each(['attacking_fullback', 'inverted_fullback', 'defensive_fullback'] as const)(
    'changes %s movement while preserving athlete and motor limits',
    (role) => {
      const { state, actor } = fixture();
      const player = state.players.find(
        (p) => p.team === actor.team && p.slot.position === 'left_back',
      )!;
      const changed = changeTacticalRole(state, player.id, role);
      const targets = deriveTacticalTargets(changed);
      const target = targets.find((p) => p.id === player.id)!;
      expect(target.position).toEqual(player.position);
      expect(target.velocity).toEqual(player.velocity);
      expect(target.profile.attributes).toEqual(player.profile.attributes);
      expect(deriveMovementCapability(target)).toEqual(deriveMovementCapability(player));
      const inverted = roleMovementTarget(
        changeTacticalRole(state, player.id, 'inverted_fullback'),
        player,
        player.target,
      );
      const wide = roleMovementTarget(
        changeTacticalRole(state, player.id, 'attacking_fullback'),
        player,
        player.target,
      );
      expect(Math.abs(inverted.y - wide.y)).toBeGreaterThan(8);
    },
  );
  it('a live winger switch changes receiving targets and actual movement over a physical continuation', () => {
    const { state, runner } = fixture();
    const wide = changeTacticalRole(state, runner.id, 'traditional_winger');
    const short = changeTacticalRole(state, runner.id, 'wide_playmaker');
    expect(roleMovementTarget(wide, runner, runner.target).x).toBeGreaterThan(
      roleMovementTarget(short, runner, runner.target).x + 5,
    );
    expect(
      roleReceivingTargets(wide, state.players.find((p) => p.id === state.ball.ownerId)!),
    ).not.toEqual(
      roleReceivingTargets(short, state.players.find((p) => p.id === state.ball.ownerId)!),
    );
    const run = (input: typeof state) => {
      let s = input;
      for (let i = 0; i < 80; i++) s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
      return s.players.find((p) => p.id === runner.id)!;
    };
    const a = run(wide),
      b = run(short);
    expect(a.position).not.toEqual(b.position);
    expect(Math.hypot(a.velocity.x, a.velocity.y)).toBeLessThanOrEqual(
      deriveMovementCapability(a).maximumSprintSpeed + 0.1,
    );
  });
  it('false nine and advanced forward offer different depth with the same body', () => {
    const { state, actor } = fixture();
    const striker = state.players.find(
      (p) => p.team === actor.team && p.slot.position === 'striker',
    )!;
    const target = (role: 'false_nine' | 'advanced_forward') =>
      roleMovementTarget(changeTacticalRole(state, striker.id, role), striker, striker.target);
    expect(target('advanced_forward').x).toBeGreaterThan(target('false_nine').x + 4);
  });
  it('attribute suitability changes without an overall bonus and roles grant no acceleration', () => {
    const { state, runner } = fixture();
    const winger = TACTICAL_ROLES.find((r) => r.id === 'traditional_winger')!;
    const slow = structuredClone(runner),
      fast = structuredClone(runner);
    slow.profile.attributes.pace = 25;
    fast.profile.attributes.pace = 95;
    expect(roleSuitability(fast, winger)).toBeGreaterThan(roleSuitability(slow, winger));
    expect(deriveMovementCapability(fast).acceleration).toBeGreaterThan(
      deriveMovementCapability(slow).acceleration,
    );
    expect(changeTacticalRole(state, runner.id, 'traditional_winger').players).toBe(state.players);
  });
  it('coach allocations respond to cover, condition and visible tactical evidence without mutating inputs', () => {
    const { state } = fixture(),
      copy = structuredClone(state);
    const plan = assignTacticalRoles(state);
    expect(state).toEqual(copy);
    for (const side of ['home', 'away'] as const) {
      const roles = state.players
        .filter((p) => p.team === side)
        .map((p) => TACTICAL_ROLES.find((r) => r.id === plan.assignments[p.id])!);
      expect(roles.filter((r) => r.instructions.includes('cover')).length).toBeGreaterThanOrEqual(
        3,
      );
    }
    const tired = structuredClone(state.players[0]!);
    tired.fitness!.longTermCapacity = 0.3;
    tired.fitness!.burstReadiness = 0.3;
    expect(roleSuitability(tired, rolesForPlayer(tired)[0]!)).toBeLessThan(
      roleSuitability(state.players[0]!, rolesForPlayer(tired)[0]!),
    );
  });
  it('phase changes with ownership and defensive organisation at identical ball coordinates', () => {
    const { state, actor, opponents } = fixture();
    const before = deriveTacticalRolePhase(state, actor.team);
    const s = structuredClone(state);
    s.lastPossessionChange = {
      at: s.time - 0.1,
      from: 'away',
      to: 'home',
      cause: 'interception',
      winnerId: actor.id,
    };
    opponents.forEach((p) => {
      s.players.find((a) => a.id === p.id)!.position.x = 15;
    });
    expect(deriveTacticalRolePhase(s, actor.team)).toBe('rapid_transition');
    expect(deriveTacticalRolePhase(s, 'away')).toBe('defensive_transition');
    expect(before).not.toBe('rapid_transition');
    delete s.ball.ownerId;
    expect(deriveTacticalRolePhase(s, actor.team)).toBe('ball_recovery');
  });
  it('R1 values football endpoints differently and never awards width with no box partner', () => {
    const { state, runner } = fixture();
    state.decisionPolicy = 'role-value-v1';
    const wide = changeTacticalRole(state, runner.id, 'traditional_winger');
    const inside = changeTacticalRole(state, runner.id, 'inside_forward');
    const point = { x: 88, y: 34 };
    expect(roleControlledValue(inside, runner, point, 1)).toBeGreaterThan(
      roleControlledValue(wide, runner, point, 1),
    );
    expect(roleControlledValue(wide, runner, { x: 75, y: 8 }, 1)).toBeGreaterThanOrEqual(0);
  });
  it.each(['role-value-v1', 'role-intent-v1', 'phase-role-hybrid-v1'] as const)(
    '%s has normalised feasible branches and repeatable ranks',
    (policy) => {
      const { state, actor } = fixture();
      state.decisionPolicy = policy;
      const before = structuredClone(state),
        ranking = rankAvailableActionsForAI(state, actor.id);
      expect(ranking.length).toBeLessThanOrEqual(48);
      for (const { action } of ranking)
        expect(
          stateValueEvaluationSchema.safeParse(evaluateStateValueAction(state, actor, action))
            .success,
        ).toBe(true);
      expect(ranking).toEqual(rankAvailableActionsForAI(state, actor.id));
      expect(state).toEqual(before);
    },
  );
  it('waiting forecasts real intervention/support rather than possession age or a universal penalty', () => {
    const { state, actor, opponents } = fixture();
    const far = forecastWaiting(state, actor);
    opponents[0]!.position = { x: actor.position.x + 2, y: actor.position.y };
    const near = forecastWaiting(state, actor);
    expect(near.diagnostic.intervention).toBeGreaterThan(far.diagnostic.intervention);
    expect(near.diagnostic.reason).toBe('opponent_intervention');
    const action = { type: 'hold' as const, actorId: actor.id };
    const value = evaluateStateValueAction(state, actor, action)!.value;
    state.ballOwnershipStartedAt = 0;
    expect(evaluateStateValueAction(state, actor, action)!.value).toBe(value);
  });
  it('does not replace human, loose-ball or restart destinations with role duties', () => {
    const { state, runner } = fixture();
    state.controlledFootballerId = runner.id;
    state.playerAgencyEnabled = true;
    expect(roleMovementTarget(state, runner, runner.target)).toEqual(runner.target);
    state.playerAgencyEnabled = false;
    delete state.ball.ownerId;
    expect(roleMovementTarget(state, runner, runner.target)).toEqual(runner.target);
    expect(() => changeTacticalRole(state, runner.id, 'sweeper_keeper')).toThrow();
    expect(() => configureMatchPolicy(state, 'role-intent-v1')).toThrow();
  });
  it('observer equality includes complete canonical state and separates selection from releases', () => {
    const { state } = fixture();
    const recorder = new RoleExperimentRecorder(state);
    let observed = structuredClone(state),
      plain = structuredClone(state);
    for (let i = 0; i < 80; i++) {
      const before = observed;
      observed = withRankingObserver(recorder.ranking, () =>
        stepTacticalMatchAfterDecisionProbe(observed, 0.025),
      );
      recorder.observe(before, observed);
      plain = stepTacticalMatchAfterDecisionProbe(plain, 0.025);
    }
    expect(observed).toEqual(plain);
    expect(recorder.trace.some((e) => e.kind === 'ranking_sample')).toBe(true);
  });
  it('a fake repeated observer frame does not duplicate an action or possession loss', () => {
    const { state, actor } = fixture();
    const recorder = new RoleExperimentRecorder(state);
    const next = resolveMatchAction(state, { type: 'hold', actorId: actor.id });
    recorder.observe(state, next);
    recorder.observe(next, next);
    expect(recorder.trace.filter((e) => e.kind === 'selected_action')).toHaveLength(1);
    expect(roleExperimentExportSchema.shape.schema.value).toBe('mfl-role-experiment-v1');
  });
  it('a fast traditional winger considers a physically planned invitation ahead of its current position', () => {
    const { state, actor, runner } = fixture();
    const changed = changeTacticalRole(state, runner.id, 'traditional_winger');
    expect(roleMovementTarget(changed, runner, runner.target).x).toBeGreaterThan(runner.position.x);
    const candidates = enumerateStateValueActions(changed, actor).filter(
      (a) => a.type === 'pass' && a.receiverId === runner.id && a.target.x > runner.position.x,
    );
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates)
      if (c.type === 'pass') expect(c.deliveryPlan?.feasible).not.toBe(false);
  });
  it.each(PRIMARY_DECISION_POLICIES)(
    '%s retains the same physical release for the same chosen action',
    (policy) => {
      const { state, actor, runner } = fixture();
      const action = {
        type: 'pass' as const,
        actorId: actor.id,
        receiverId: runner.id,
        target: runner.position,
        intent: 'progressive' as const,
      };
      const reference = resolveMatchAction(
        { ...state, decisionPolicy: 'state-value-v1' },
        action,
        'human_selected',
      );
      const result = resolveMatchAction(
        { ...state, decisionPolicy: policy },
        action,
        'human_selected',
      );
      expect(result.ball).toEqual(reference.ball);
      expect(result.lastPassDiagnostic).toEqual(reference.lastPassDiagnostic);
    },
  );
  it.each(['role-value-v1', 'role-intent-v1', 'phase-role-hybrid-v1'] as const)(
    '%s recognises an executable unguarded-goal shot regardless of a midfield duty',
    (policy) => {
      const { state, actor } = createReformFixture('moderate-shot');
      state.decisionPolicy = policy;
      actor.position = { x: 99, y: 34 };
      state.ball = { ...actor.position, ownerId: actor.id, height: 0, velocity: { x: 0, y: 0 } };
      for (const p of state.players.filter((p) => p.team !== actor.team))
        p.position = { x: 65, y: p.position.y };
      const rank = rankAvailableActionsForAI(state, actor.id);
      expect(rank[0]?.action.type).toBe('shot');
      const released = resolveMatchAction(state, rank[0]!.action);
      expect(released.ball.travelKind).toBe('shot');
      expect(released.ball.shot).toBeDefined();
      expect(
        Math.hypot(released.ball.velocity?.x ?? 0, released.ball.velocity?.y ?? 0),
      ).toBeGreaterThan(0);
    },
  );
});
