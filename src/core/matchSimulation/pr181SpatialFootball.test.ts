// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSpatialFixture } from '../../../scripts/pr181SpatialFixtures';
import {
  deriveTacticalTargets,
  deriveDepthRunAssignments,
  constrainTargetOnside,
} from './tacticalPositioning';
import { observeDepthThreats, deriveDepthDefence, timedDepthTarget } from './depthThreat';
import { deriveAerialAssignments, aerialAssignmentSchema } from './aerialPositioning';
import { enumerateCarryChoices, carryRaceArrival } from './carryOpportunity';
import { deriveCrossOpportunities } from './crossOpportunity';
import {
  derivePressingPlan,
  beginDefensiveChallenge,
  resolveDefensiveChallenge,
} from './defensiveChallenges';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { projectLocomotion, deriveMovementCapability } from './locomotion';
import { captureOffsideSnapshot, isOffsideOffence } from './offside';
import { evaluateAerialContact, evaluateAerialPressure, resolveAerialDuel } from './aerialPlay';
import { tacticalMatchStateSchema } from './matchState';
import { PRIMARY_DECISION_POLICIES } from './decisionPolicyConfig';

describe('PR181 physical attacking space and defensive resistance', () => {
  it('does not pull legal own-half movement behind an opponent line beyond halfway', () => {
    expect(constrainTargetOnside({ x: 50, y: 20 }, 40, 'home')).toEqual({ x: 50, y: 20 });
    expect(constrainTargetOnside({ x: 55, y: 20 }, 65, 'away')).toEqual({ x: 55, y: 20 });
    expect(constrainTargetOnside({ x: 70, y: 20 }, 40, 'home').x).toBeLessThan(52.5);
    expect(constrainTargetOnside({ x: 30, y: 20 }, 65, 'away').x).toBeGreaterThan(52.5);
  });
  it.each(PRIMARY_DECISION_POLICIES)('uses shared physical depth targets in %s', (policy) => {
    const { state, striker } = createSpatialFixture('depth');
    state.decisionPolicy = policy;
    const target = deriveTacticalTargets(state).find((p) => p.id === striker.id)!;
    expect(target.position).toEqual(striker.position);
    expect(target.target.x).toBeGreaterThan(66);
    expect(projectLocomotion(state, target).intensity).toBe('sprint');
    expect(
      tacticalMatchStateSchema.safeParse({ ...state, players: deriveTacticalTargets(state) })
        .success,
    ).toBe(true);
  });
  it('compensates a false nine through a teammate, preserving the drop', () => {
    const { state, striker, runner } = createSpatialFixture('false-nine');
    const runs = deriveDepthRunAssignments(state, striker.team);
    expect(runs[0]?.playerId).toBe(runner.id);
    expect(runs[0]?.role).toBe('compensate_drop');
    expect(
      deriveTacticalTargets(state).find((p) => p.id === striker.id)!.idealTarget.x,
    ).toBeLessThan(60);
  });
  it('responds to a moving onside threat and holds against a stationary or offside one', () => {
    const { state, striker } = createSpatialFixture('depth');
    expect(observeDepthThreats(state).some((t) => t.credible)).toBe(true);
    expect(deriveDepthDefence(state).some((t) => t.intention === 'track')).toBe(true);
    striker.velocity.x = 0;
    expect(deriveDepthDefence(state)).toHaveLength(0);
    striker.velocity.x = 4;
    striker.position.x = 72;
    expect(deriveDepthDefence(state)).toHaveLength(0);
  });
  it('retains runner tracking when the same defender is nearest to the carrier', () => {
    const { state, actor, striker } = createSpatialFixture('depth');
    actor.position = { x: 55, y: 28 };
    state.ball = { ...state.ball, x: 55.35, y: 28 };
    state.actionCooldown = 0.6;
    for (const p of state.players.filter(
      (p) => p.team !== actor.team && p.slot.position !== 'goalkeeper',
    ))
      p.position = { x: 66, y: 62 };
    const marker = state.players.find(
      (p) => p.team !== actor.team && p.slot.position === 'center_back',
    )!;
    marker.position = { x: 66, y: 28 };
    striker.position = { x: 61, y: 28 };
    state.nearestChallengerId = marker.id;
    expect(deriveDepthDefence(state).find((a) => a.defenderId === marker.id)?.intention).toBe(
      'track',
    );
    const next = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    expect(next.players.find((p) => p.id === marker.id)!.velocity.x).toBeGreaterThan(0);
  });
  it('times preparation without moving a body or rewriting the release snapshot', () => {
    const { state, actor, striker } = createSpatialFixture('depth');
    striker.position.x = 65;
    state.actionCooldown = 1.1;
    const waiting = timedDepthTarget(state, actor, striker, 24);
    state.actionCooldown = 0;
    const launching = timedDepthTarget(state, actor, striker, 24);
    expect(waiting.x).toBeLessThan(launching.x);
    const action = {
      type: 'pass' as const,
      actorId: actor.id,
      receiverId: striker.id,
      target: launching,
      intent: 'through' as const,
    };
    const legal = captureOffsideSnapshot(state, action);
    striker.position.x = 70;
    expect(isOffsideOffence(legal, striker.id)).toBe(false);
    expect(isOffsideOffence(captureOffsideSnapshot(state, action), striker.id)).toBe(true);
  });
  it('prices facing direction and fatigue in a real race, without changing speed attributes', () => {
    const { state, defender } = createSpatialFixture('wing-backward');
    const target = { x: defender.position.x + 10, y: defender.position.y };
    const away = carryRaceArrival(state, defender, target);
    defender.facingAngle = Math.PI / 2;
    expect(carryRaceArrival(state, defender, target)).toBeLessThan(away);
    const fresh = createSpatialFixture('isolated'),
      tired = createSpatialFixture('tired');
    expect(deriveMovementCapability(tired.actor).acceleration).toBeLessThan(
      deriveMovementCapability(fresh.actor).acceleration,
    );
    expect(
      enumerateCarryChoices(fresh.state, fresh.actor).some(
        (a) => a.type === 'carry' && a.movementMode === 'sprint',
      ),
    ).toBe(true);
  });
  it('an isolated slower fullback delays; an exposed touch admits engagement', () => {
    const { state, defender, actor } = createSpatialFixture('isolated');
    const delay = derivePressingPlan(state, defender.id)!;
    expect(delay.intention).toBe('contain');
    expect(delay.behaviour).toBe('show_outside');
    state.ball.x = actor.position.x + 2;
    expect(derivePressingPlan(state, defender.id)!.intention).toBe('engage');
  });
  it('a committed missed lunge preserves momentum and requires physical balance recovery', () => {
    const { state, defender, actor } = createSpatialFixture('isolated');
    defender.position = { x: actor.position.x + 2, y: actor.position.y + 1 };
    defender.facingAngle = -Math.PI / 2;
    defender.profile.attributes.aggression = 95;
    defender.velocity = { x: -3, y: 0 };
    let next = beginDefensiveChallenge(
      state,
      { type: 'challenge', actorId: defender.id, opponentId: actor.id, technique: 'committed' },
      'human_selected',
    );
    expect(next.defensiveChallenge).toBeDefined();
    next = { ...next, time: next.time + 1.3 };
    const resolved = resolveDefensiveChallenge(next);
    const recovering = resolved.state.players.find((p) => p.id === defender.id)!;
    expect(recovering.velocity).toEqual(defender.velocity);
    expect(recovering.challengeRecovery!.until).toBeGreaterThan(next.time);
  });
  it('offers reachable delivery types, refuses an empty box, and retains marked contests', () => {
    const target = createSpatialFixture('cross-target');
    const crosses = deriveCrossOpportunities(target.state, target.actor);
    expect(new Set(crosses.map((c) => c.intent)).size).toBeGreaterThanOrEqual(2);
    expect(crosses.every((c) => c.receiverArrival <= c.ballArrival + 0.25)).toBe(true);
    const empty = createSpatialFixture('empty-box');
    expect(deriveCrossOpportunities(empty.state, empty.actor)).toHaveLength(0);
    const marked = createSpatialFixture('marked-box');
    expect(deriveCrossOpportunities(marked.state, marked.actor).length).toBeGreaterThan(0);
  });
  it('both teams pursue an attainable canonical flight without a manufactured header', () => {
    const { state } = createSpatialFixture('aerial');
    const assignments = deriveAerialAssignments(state);
    expect(new Set(assignments.map((a) => a.team)).size).toBe(2);
    for (const a of assignments) expect(aerialAssignmentSchema.safeParse(a).success).toBe(true);
    const targets = deriveTacticalTargets(state);
    for (const a of assignments) {
      const player = targets.find((p) => p.id === a.playerId)!;
      expect(player.target).toEqual(a.target);
      expect(evaluateAerialContact(player, state.ball)).toBeUndefined();
    }
    expect(state.ball.ownerId).toBeUndefined();
  });
  it('a shoulder challenger changes contact pressure but cannot win a physically remote ball', () => {
    const { state, striker, defender } = createSpatialFixture('aerial');
    state.ball = { ...state.ball, x: 70, y: 31, height: 2, velocity: { x: 6, y: 0, z: -2 } };
    striker.position = { x: 70, y: 30.7 };
    defender.position = { x: 71.2, y: 31 };
    defender.spatialMovement = {
      kind: 'aerial_challenge',
      target: { x: 70, y: 31 },
      until: state.time + 0.25,
    };
    const pressure = evaluateAerialPressure(state, striker);
    expect(pressure.pressure).toBeGreaterThan(0);
    expect(pressure.challengerIds).toContain(defender.id);
    expect(evaluateAerialContact(defender, state.ball)).toBeUndefined();
    const duel = resolveAerialDuel(state, [striker, defender]);
    expect(duel.contestants.map((p) => p.id)).toEqual([striker.id]);
    expect(duel.challengerIds).toContain(defender.id);
    defender.position.x = 85;
    expect(evaluateAerialPressure(state, striker).pressure).toBe(0);
    expect(resolveAerialDuel(state, [defender]).winner).toBeUndefined();
  });
  it('replays complete canonical states deterministically with finite acceleration', () => {
    const { state, striker } = createSpatialFixture('depth');
    const run = () => {
      let s = structuredClone(state),
        peak = striker.position.x;
      for (let i = 0; i < 80; i++) {
        s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
        peak = Math.max(peak, s.players.find((p) => p.id === striker.id)!.position.x);
      }
      return { state: s, peak };
    };
    const a = run(),
      b = run();
    expect(a).toEqual(b);
    const player = a.state.players.find((p) => p.id === striker.id)!;
    expect(a.peak).toBeGreaterThan(striker.position.x + 0.2);
    expect(Math.hypot(player.velocity.x, player.velocity.y)).toBeLessThanOrEqual(
      deriveMovementCapability(player).maximumSprintSpeed + 0.1,
    );
  });
});
