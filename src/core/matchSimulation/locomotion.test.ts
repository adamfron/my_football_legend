import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, projectLocomotion } from '.';

const stateFor = () => {
  const world = createCanonicalWorldDatabase();
  return createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'locomotion-contract',
      control: { mode: 'spectator' },
    }),
  );
};

describe('locomotion intensity', () => {
  it('distinguishes structural adjustment, depth sprint, and contain deterministically', () => {
    const state = stateFor();
    const player = state.players.find(
      (candidate) => candidate.profile.primaryPosition !== 'goalkeeper',
    )!;
    player.target = { x: player.position.x + 2, y: player.position.y };
    expect(projectLocomotion(state, player).intensity).toBe('walk');
    state.playerMovementIntent = {
      actorId: player.id,
      type: 'run_in_behind',
      target: { x: player.position.x + 20, y: player.position.y },
      startedAt: state.time,
      expiresAt: state.time + 3,
    };
    const sprint = projectLocomotion(state, player, state.playerMovementIntent.target);
    expect(sprint.intensity).toBe('sprint');
    state.playerMovementIntent = { ...state.playerMovementIntent, type: 'hold_shape' };
    expect(projectLocomotion(state, player, state.playerMovementIntent.target).intensity).not.toBe(
      'sprint',
    );
  });

  it('uses pace for sprint capability and keeps jog clearly below sprint', () => {
    const state = stateFor();
    const players = state.players.filter(
      (candidate) => candidate.profile.primaryPosition !== 'goalkeeper',
    );
    const slow = players.reduce((a, b) =>
      a.profile.attributes.pace < b.profile.attributes.pace ? a : b,
    );
    const fast = players.reduce((a, b) =>
      a.profile.attributes.pace > b.profile.attributes.pace ? a : b,
    );
    const target = { x: slow.position.x + 20, y: slow.position.y };
    state.playerMovementIntent = {
      actorId: slow.id,
      type: 'run_in_behind',
      target,
      startedAt: 0,
      expiresAt: 3,
    };
    const slowSprint = projectLocomotion(state, slow, target);
    state.playerMovementIntent = {
      actorId: fast.id,
      type: 'run_in_behind',
      target,
      startedAt: 0,
      expiresAt: 3,
    };
    const fastSprint = projectLocomotion(state, fast, target);
    expect(fastSprint.targetSpeed).toBeGreaterThan(slowSprint.targetSpeed);
    delete state.playerMovementIntent;
    slow.target = { x: slow.position.x + 4, y: slow.position.y };
    expect(projectLocomotion(state, slow).targetSpeed).toBeLessThan(slowSprint.targetSpeed);
  });
});
