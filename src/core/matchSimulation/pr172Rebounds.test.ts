// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveBallRebound, findFirstBallContact } from './ballFlight';
import { shotProbeFixture } from '../../../scripts/pr171Probes';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { attacksRight } from './matchSpace';
import { assertMatchStatisticsInvariants } from './playerMatchStats';

describe('PR172 physical deflections', () => {
  it.each(['home', 'away'] as const)(
    'mirrors actual contact normals in both halves for %s',
    (team) => {
      for (const endsSwitched of [false, true])
        for (const kind of ['defender', 'goalkeeper'] as const) {
          const dir = (team === 'home' ? 1 : -1) * (endsSwitched ? -1 : 1);
          const incoming = { x: dir * 25, y: 2, z: 1 };
          const normal = { x: dir * -0.3, y: Math.sqrt(0.91), z: 0 };
          const actual = resolveBallRebound(kind, incoming, { team, endsSwitched }, undefined, {
            surfaceNormal: normal,
          });
          const reference = resolveBallRebound(kind, { ...incoming, x: 25 }, 'home', undefined, {
            surfaceNormal: { ...normal, x: -0.3 },
          });
          expect(actual.velocity.x).toBeCloseTo(reference.velocity.x * dir, 12);
          expect(actual.velocity.y).toBeCloseTo(reference.velocity.y, 12);
          expect(actual.velocity.z).toBeCloseTo(reference.velocity.z, 12);
          expect(actual.velocity.x * dir).toBeGreaterThan(0);
        }
    },
  );
  it('distinguishes head-on, glancing, parry-away and partial contacts without adding energy', () => {
    const incoming = { x: 25, y: 2, z: 1 };
    const normal = { x: -0.5, y: Math.sqrt(0.75), z: 0 };
    const velocities = ['parry', 'parry_away', 'failed_save'].map(
      (goalkeeperAction) =>
        resolveBallRebound('goalkeeper', incoming, 'home', undefined, {
          surfaceNormal: normal,
          point: { x: 103, y: 36, z: 1 },
          goalkeeperAction: goalkeeperAction as 'parry' | 'parry_away' | 'failed_save',
        }).velocity,
    );
    expect(new Set(velocities.map((v) => JSON.stringify(v))).size).toBe(3);
    for (const kind of ['defender', 'goalkeeper'] as const)
      for (const nx of [-1, -0.9, -0.6, -0.3, -0.1])
        for (const sign of [-1, 1]) {
          const v = resolveBallRebound(kind, incoming, 'home', undefined, {
            surfaceNormal: { x: nx, y: sign * Math.sqrt(1 - nx * nx), z: 0 },
          }).velocity;
          expect(Math.hypot(v.x, v.y, v.z)).toBeLessThanOrEqual(
            Math.hypot(incoming.x, incoming.y, incoming.z),
          );
        }
    expect(
      resolveBallRebound('defender', incoming, 'home', undefined, {
        surfaceNormal: { x: -1, y: 0, z: 0 },
      }).velocity.x,
    ).toBeLessThan(0);
    expect(resolveBallRebound('defender', { x: 0.1, y: 0, z: 0 }, 'home').velocity.x).toBeCloseTo(
      -0.038,
    );
  });
  it('uses the CCD capsule surface and does not reflect a separating overlap back inward', () => {
    const c = findFirstBallContact({
      previous: { x: 90, y: 34.7, z: 1 },
      next: { x: 100, y: 34.7, z: 1 },
      attackingTeam: 'home',
      candidates: [
        { kind: 'defender', playerId: 'cb', centre: { x: 95, y: 34, z: 1 }, radius: 0.72 },
      ],
    })!;
    expect(c.surfaceNormal!.x).toBeLessThan(0);
    expect(c.surfaceNormal!.y).toBeGreaterThan(0);
    const v = resolveBallRebound('defender', { x: 20, y: 0, z: 0 }, 'home', undefined, {
      surfaceNormal: { x: 1, y: 0, z: 0 },
    }).velocity;
    expect(v.x).toBeGreaterThan(0);
  });
  it.each([false, true])(
    'generates a corner from a real glancing defender contact, switched=%s',
    (endsSwitched) => {
      const { state: initial, actorId } = shotProbeFixture('unmarked_striker');
      initial.endsSwitched = endsSwitched;
      initial.players = initial.players.map((p) => ({ ...p, endsSwitched }));
      const actor = initial.players.find((p) => p.id === actorId)!;
      const dir = attacksRight(actor) ? 1 : -1;
      actor.position = { x: endsSwitched ? 15 : 90, y: 34 };
      actor.facingAngle = endsSwitched ? Math.PI : 0;
      initial.ball = { ...actor.position, ownerId: actorId, height: 0.11 };
      let state = resolveMatchAction(
        initial,
        {
          type: 'shot',
          actorId,
          intent: 'driven',
          contact: 'settled',
          target: { x: endsSwitched ? 0 : 105, y: 38 },
        },
        'autonomous_npc',
      );
      const id = state.ball.shot!.shotId;
      const blocker = state.players.find((p) => p.team !== actor.team && !isMatchGoalkeeper(p))!;
      // Prescribed flight at the contact site isolates the same CCD/response/boundary path.
      state.players = state.players.map((p) => ({
        ...p,
        position:
          p.id === blocker.id ? { x: endsSwitched ? 0.4 : 104.6, y: 37.2 } : { x: 52, y: 15 },
        velocity: { x: 0, y: 0 },
      }));
      state.ball = {
        ...state.ball,
        x: endsSwitched ? 0.9 : 104.1,
        y: 38,
        height: 0.9,
        velocity: { x: dir * 25, y: 0, z: 0 },
      };
      state.actionCooldown = 100;
      let touched = false;
      for (let i = 0; i < 80 && !state.restart; i++) {
        state = stepTacticalMatchAfterDecisionProbe(state);
        if (state.lastBallContact?.playerId === blocker.id) touched = true;
      }
      expect(touched).toBe(true);
      expect(state.lastShot!.shotId).toBe(id);
      expect(state.ball.lastTouchPlayerId).toBe(blocker.id);
      expect(state.scenario).toBe('corner');
      expect(state.restart!.restartTeam).toBe(actor.team);
      expect(state.statistics!.players.reduce((n, p) => n + p.shots, 0)).toBe(1);
      assertMatchStatisticsInvariants(state.statistics!);
    },
  );
});
