import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  resolveCanonicalShot,
  resolveMatchAction,
  stepTacticalMatch,
} from '.';

const world = createCanonicalWorldDatabase();
const makeState = (seed: string) => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  const shooter = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
  )!;
  shooter.position = { x: 91, y: 34 };
  state.ball = { ...shooter.position, ownerId: shooter.id };
  state.currentPressure = 0;
  return { state, shooter };
};

describe('canonical shot resolver v2', () => {
  it('is seed deterministic while different seeds alter execution error', () => {
    const first = makeState('shot-same');
    const action = {
      type: 'shot' as const,
      actorId: first.shooter.id,
      target: { x: 105, y: 34 },
      goalTarget: { horizontal: 0.45, vertical: 0.3 },
      intent: 'placed' as const,
    };
    expect(resolveCanonicalShot(first.state, action)).toEqual(
      resolveCanonicalShot(first.state, action),
    );
    const other = makeState('shot-other');
    expect(
      resolveCanonicalShot(other.state, { ...action, actorId: other.shooter.id }).error,
    ).not.toEqual(resolveCanonicalShot(first.state, action).error);
  });

  it('classifies goal-plane geometry, including wide, over and frame contacts', () => {
    const { state, shooter } = makeState('geometry');
    shooter.profile.attributes.finishing = 100;
    shooter.profile.attributes.technique = 100;
    shooter.profile.attributes.composure = 100;
    const shot = (horizontal: number, vertical: number) =>
      resolveCanonicalShot(state, {
        type: 'shot',
        actorId: shooter.id,
        target: { x: 105, y: 34 },
        goalTarget: { horizontal, vertical },
        intent: 'placed',
      });
    expect(shot(2.5, 0.3).classification).toBe('wide');
    expect(shot(0, 2.5).classification).toBe('over');
    expect(['post', 'wide', 'on_target']).toContain(shot(1, 0.3).classification);
  });

  it('only considers defenders intersecting the reachable shot corridor', () => {
    const blocked = makeState('block-search');
    const defender = blocked.state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    defender.position = { x: 97, y: 34 };
    Object.assign(defender.profile.attributes, {
      positioning: 100,
      gameReading: 100,
      agility: 100,
      aggression: 100,
    });
    const distant = structuredClone(blocked.state);
    distant.players.find((player) => player.id === defender.id)!.position = { x: 97, y: 50 };
    const action = {
      type: 'shot' as const,
      actorId: blocked.shooter.id,
      target: { x: 105, y: 34 },
      goalTarget: { horizontal: 0, vertical: 0.25 },
      intent: 'placed' as const,
    };
    const distantResult = resolveCanonicalShot(distant, action);
    expect(distantResult.blockerId).toBeUndefined();
    const seeds = Array.from({ length: 30 }, (_, index) => {
      const sample = structuredClone(blocked.state);
      sample.seed = `block-${index}`;
      return resolveCanonicalShot(sample, action);
    });
    expect(seeds.some((result) => result.blockerId === defender.id)).toBe(true);
  });

  it('routes a header shot through the same flight and keeps continuations finite', () => {
    const { state, shooter } = makeState('header-pipeline');
    const launched = resolveMatchAction(state, {
      type: 'header',
      actorId: shooter.id,
      target: { x: 105, y: 34 },
      intent: 'header_shot',
    });
    expect(launched.ball.travelKind).toBe('header');
    let current = launched;
    for (let index = 0; index < 100; index += 1) current = stepTacticalMatch(current, 0.1);
    expect(current.lastShot).toEqual(expect.objectContaining({ shooterId: shooter.id }));
    expect(Number.isFinite(current.ball.x) && Number.isFinite(current.ball.y)).toBe(true);
    expect(
      current.ball.ownerId || current.ball.looseSince !== undefined || current.restart,
    ).toBeTruthy();
  });
});
