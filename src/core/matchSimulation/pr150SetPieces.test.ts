import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { applyRestartScenario } from './restartScenarios';
import { deriveRestartGeometry } from './restartGeometry';

const world = createCanonicalWorldDatabase();
const fixture = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr150-advanced-free-kick',
      control: { mode: 'spectator' },
    }),
  );

describe('parametric advanced free-kick responsibility', () => {
  it.each(['home', 'away'] as const)(
    'places credible attacking targets and counter cover for %s',
    (side) => {
      const state = fixture();
      const ball = { x: side === 'home' ? 83 : 22, y: 34 };
      const geometry = deriveRestartGeometry(state, 'free_kick_close', side, ball);
      const roles = Object.values(geometry.roles).map((role) => role.key);
      for (const key of [
        'rebound_attacker',
        'short_option',
        'edge_support',
        'rest_defence',
        'wall',
      ])
        expect(roles).toContain(key);
      expect(roles.some((role) => role === 'secondary_taker' || role === 'recycle_support')).toBe(
        true,
      );
      const attackers = state.players.filter(
        (player) => player.team === side && player.id !== geometry.taker.id,
      );
      const direction = side === 'home' ? 1 : -1;
      const ahead = attackers.filter(
        (player) => (geometry.targets[player.id]!.x - ball.x) * direction > 2,
      );
      expect(ahead.length).toBeGreaterThanOrEqual(3);
      const cover = attackers.filter((player) => geometry.roles[player.id]?.key === 'rest_defence');
      expect(cover.length).toBeGreaterThanOrEqual(2);
      expect(
        cover.every((player) => (geometry.targets[player.id]!.x - ball.x) * direction < -10),
      ).toBe(true);
      expect(deriveRestartGeometry(state, 'free_kick_close', side, ball)).toEqual(geometry);
      const restart = applyRestartScenario(state, 'free_kick_close', {
        restartTeam: side,
        restartPoint: ball,
      });
      expect(restart.restart?.roles).toEqual(geometry.roles);
      const crossingPlan = deriveRestartGeometry(state, 'free_kick_close', side, ball, {
        selectedAction: {
          type: 'cross',
          actorId: geometry.taker.id,
          target: { x: side === 'home' ? 96 : 9, y: 41 },
          intent: 'floated',
        },
      });
      const crossingRoles = Object.values(crossingPlan.roles).map((role) => role.key);
      for (const key of ['near_post_target', 'central_target', 'far_post_target', 'rest_defence'])
        expect(crossingRoles).toContain(key);
    },
  );
});
