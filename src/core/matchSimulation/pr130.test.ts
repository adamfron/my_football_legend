import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  deriveCarryExecution,
  derivePassLaunchPlan,
  resolveContinuousGroundPassClaim,
} from '.';

const world = createCanonicalWorldDatabase();
const stateFor = (seed: string) =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );

describe('PR130 pass and contact calibration', () => {
  it('launches a short support pass softer than a progressive 20 metre pass', () => {
    const state = stateFor('pass-speed');
    const passer = state.players.find((p) => p.id === state.ball.ownerId)!;
    const receiver = state.players.find((p) => p.team === passer.team && p.id !== passer.id)!;
    const short = derivePassLaunchPlan(
      state,
      passer,
      receiver,
      { x: passer.position.x + 7, y: passer.position.y },
      'support',
    );
    const medium = derivePassLaunchPlan(
      state,
      passer,
      receiver,
      { x: passer.position.x + 20, y: passer.position.y },
      'progressive',
    );
    expect(short.speed).toBeLessThan(medium.speed);
    expect(short.speed).toBeLessThan(13);
    expect(short.predictedArrivalTime).toBeGreaterThan(0.4);
  });

  it('orders receiver contact before a later touchline crossing', () => {
    const state = stateFor('boundary-contact');
    const passer = state.players.find((p) => p.id === state.ball.ownerId)!;
    const receiver = state.players.find((p) => p.team === passer.team && p.id !== passer.id)!;
    receiver.position = { x: 50, y: 0.45 };
    const claim = resolveContinuousGroundPassClaim(state, { x: 49, y: 1 }, { x: 51, y: -0.2 });
    expect(claim?.playerId).toBe(receiver.id);
    expect(claim!.segmentFraction).toBeLessThan(1 / 1.2);
  });
});

describe('PR130 contextual carry', () => {
  it('selects burst in an open long lane and preserves the human target', () => {
    const state = stateFor('carry-burst');
    const actor = state.players.find((p) => p.id === state.ball.ownerId)!;
    actor.velocity = { x: actor.team === 'home' ? 4 : -4, y: 0 };
    state.players
      .filter((p) => p.team !== actor.team)
      .forEach((p) => {
        p.position.y = p.position.y < 34 ? 0 : 68;
      });
    const target = {
      x: actor.position.x + (actor.team === 'home' ? 18 : -18),
      y: actor.position.y,
    };
    const intent = {
      actorId: actor.id,
      type: 'carry' as const,
      target,
      startedAt: 0,
      expiresAt: 8,
      estimatedArrival: 3,
      startPosition: actor.position,
      closestPointReached: actor.position,
      humanSelected: true,
    };
    const plan = deriveCarryExecution(state, actor, intent);
    expect(plan.mode).toBe('burst');
    expect(intent.target).toEqual(target);
  });

  it('creates a local evade target without replacing the final destination', () => {
    const state = stateFor('carry-evade');
    const actor = state.players.find((p) => p.id === state.ball.ownerId)!;
    const target = {
      x: actor.position.x + (actor.team === 'home' ? 14 : -14),
      y: actor.position.y,
    };
    const defender = state.players.find(
      (p) => p.team !== actor.team && p.profile.primaryPosition !== 'goalkeeper',
    )!;
    defender.position = {
      x: actor.position.x + (actor.team === 'home' ? 4 : -4),
      y: actor.position.y,
    };
    const intent = {
      actorId: actor.id,
      type: 'carry' as const,
      target,
      startedAt: 0,
      expiresAt: 8,
      estimatedArrival: 3,
      startPosition: actor.position,
      closestPointReached: actor.position,
      humanSelected: true,
    };
    const plan = deriveCarryExecution(state, actor, intent);
    expect(plan.mode).toBe('evade');
    expect(plan.localTarget).not.toEqual(target);
    expect(intent.target).toEqual(target);
  });
});
