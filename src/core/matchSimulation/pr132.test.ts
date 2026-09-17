import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  deriveOnBallPreparation,
  matchStateToFrame,
  pitchPointSchema,
  preparationMarginForAction,
  toPitchPoint,
} from '.';

const world = createCanonicalWorldDatabase();
const makeState = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr132-geometry-rhythm',
      control: { mode: 'spectator' },
    }),
  );

describe('PR132 possession rhythm and geometry integrity', () => {
  it('requires more preparation for a badly aligned long action than simple support', () => {
    const state = makeState();
    const actor = state.players.find((player) => player.id === state.ball.ownerId)!;
    actor.position = { x: 50, y: 34 };
    actor.facingAngle = Math.PI;
    state.ball = { x: 50, y: 34, ownerId: actor.id, velocity: { x: 12, y: 0 } };
    state.onBallPreparation = deriveOnBallPreparation(state, actor, 'clean_control');
    const near = state.players.find((player) => player.team === actor.team && player.id !== actor.id)!;
    near.position = { x: 54, y: 34 };
    const support = { type: 'pass' as const, actorId: actor.id, receiverId: near.id, target: near.position, intent: 'support' as const };
    const shot = { type: 'shot' as const, actorId: actor.id, target: { x: 105, y: 34 }, intent: 'driven' as const };
    expect(preparationMarginForAction(state, actor, shot)).toBeLessThan(
      preparationMarginForAction(state, actor, support),
    );
  });

  it('converts every physical boundary into a schema-safe PitchPoint', () => {
    for (const point of [{ x: -20, y: 34 }, { x: 140, y: 34 }, { x: 40, y: -9 }, { x: 40, y: 90 }])
      expect(() => pitchPointSchema.parse(toPitchPoint(point))).not.toThrow();
  });

  it('hides AI carry targets but retains a human-selected carry reticle', () => {
    const state = makeState();
    const actor = state.players.find((player) => player.id === state.ball.ownerId)!;
    state.ballCarrierIntent = {
      actorId: actor.id, type: 'carry', target: { x: 40, y: 30 }, startedAt: 0, expiresAt: 3,
      estimatedArrival: 2, startPosition: actor.position, closestPointReached: actor.position,
      humanSelected: false,
    };
    expect(matchStateToFrame(state).carryTarget).toBeUndefined();
    state.ballCarrierIntent.humanSelected = true;
    expect(matchStateToFrame(state).carryTarget).toEqual({ x: 40, y: 30 });
  });
});
