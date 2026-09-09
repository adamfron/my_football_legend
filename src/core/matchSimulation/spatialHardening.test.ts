import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { captureOffsideSnapshot, isOffsideOffence } from './offside';
import { predictReachableRun, evaluateRunSpace } from './reachableSpace';

const state = () => {
  const world = createCanonicalWorldDatabase();
  return createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      control: { mode: 'spectator' },
      seed: 'spatial-hardening',
    }),
  );
};

describe('release-time offside', () => {
  it('uses ball and second-last opponent, and does not continuously re-evaluate a legal run', () => {
    const match = state();
    const passer = match.players.find((p) => p.id === match.ball.ownerId)!;
    const runner = match.players.find((p) => p.team === passer.team && p.id !== passer.id)!;
    const defenders = match.players.filter((p) => p.team !== passer.team);
    defenders.forEach((p, index) => {
      p.position.x = index < 2 ? 80 - index * 5 : 65;
    });
    runner.position.x = 74;
    match.ball.x = 76;
    const action = {
      type: 'pass',
      actorId: passer.id,
      receiverId: runner.id,
      target: { x: 90, y: runner.position.y },
      intent: 'through',
    } as const;
    const snapshot = captureOffsideSnapshot(match, action)!;
    expect(snapshot.offsideLineX).toBe(76);
    expect(isOffsideOffence(snapshot, runner.id)).toBe(false);
    runner.position.x = 95;
    expect(isOffsideOffence(snapshot, runner.id)).toBe(false);
  });

  it('flags only an involved attacker and exempts a goal kick', () => {
    const match = state();
    const passer = match.players.find((p) => p.id === match.ball.ownerId)!;
    const attackers = match.players.filter((p) => p.team === passer.team && p.id !== passer.id);
    const runner = attackers[0]!;
    match.players
      .filter((p) => p.team !== passer.team)
      .forEach((p) => {
        p.position.x = 70;
      });
    runner.position.x = 85;
    const action = {
      type: 'pass',
      actorId: passer.id,
      receiverId: runner.id,
      target: runner.position,
      intent: 'progressive',
    } as const;
    const snapshot = captureOffsideSnapshot(match, action)!;
    expect(isOffsideOffence(snapshot, runner.id)).toBe(true);
    expect(isOffsideOffence(snapshot, attackers[1]!.id)).toBe(false);
    match.scenario = 'goal_kick';
    match.restart = {
      restartTeam: passer.team,
      phase: 'setup',
      startedAt: 0,
      takerId: passer.id,
      targets: {},
      executionChoices: [],
      roles: {},
    };
    expect(captureOffsideSnapshot(match, action)!.offsidePlayerIds).toEqual([]);
  });
});

describe('shared reachable-space prediction', () => {
  it('is deterministic, immutable and follows diagonal velocity within its horizon', () => {
    const match = state();
    const player = match.players[0]!;
    player.velocity = { x: 3, y: 4 };
    player.target = { x: player.position.x + 15, y: player.position.y + 15 };
    const before = structuredClone(player);
    const a = predictReachableRun(player);
    expect(predictReachableRun(player)).toEqual(a);
    expect(player).toEqual(before);
    expect(a.points.at(-1)!.position.x).toBeGreaterThan(a.origin.x);
    expect(a.points.at(-1)!.position.y).toBeGreaterThan(a.origin.y);
    expect(a.points.at(-1)!.t).toBeLessThanOrEqual(2.5);
  });

  it('does not invent a large lead for a stationary runner and prices defender arrival', () => {
    const match = state();
    const passer = match.players.find((p) => p.id === match.ball.ownerId)!;
    const runner = match.players.find((p) => p.team === passer.team && p.id !== passer.id)!;
    runner.velocity = { x: 0, y: 0 };
    runner.target = { ...runner.position };
    expect(predictReachableRun(runner).points.at(-1)!.position).toEqual(runner.position);
    runner.velocity = { x: 5, y: 2 };
    runner.target = { x: runner.position.x + 20, y: runner.position.y + 8 };
    const open = evaluateRunSpace(match, passer, runner)!;
    const defender = match.players.find((p) => p.team !== runner.team)!;
    defender.position = { ...open.target };
    expect(evaluateRunSpace(match, passer, runner)!.utility).toBeLessThan(open.utility);
  });
});
