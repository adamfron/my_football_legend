import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { resolveMatchAction } from './matchActions';
import { applyRestartScenario } from './restartScenarios';
import { deriveRestartGeometry, restartInfluence } from './restartGeometry';
import {
  deriveMovementCapability,
  movementCapabilitySchema,
  movementCapacityModifiersSchema,
  projectLocomotion,
  sprintSpeedAt,
} from './locomotion';
import { createMatchStatistics, observePlayerMatchStats } from './playerMatchStats';
import { distance, type TeamSide } from './matchSpace';
import type { TacticalMatchState } from './matchState';
import { runShotParityBenchmark, shotParitySummarySchema } from './shotParityBenchmark';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr151-physics') =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );

describe('PR151 athlete movement capability', () => {
  it('derives distinct intensities, acceleration and sustained burst capacity from attributes', () => {
    const state = fixture();
    const player = state.players.find((p) => p.profile.primaryPosition !== 'goalkeeper')!;
    Object.assign(player.profile.attributes, { pace: 30, agility: 30, strength: 30, stamina: 20 });
    const slow = deriveMovementCapability(player);
    Object.assign(player.profile.attributes, { pace: 90, agility: 90, strength: 90, stamina: 90 });
    const fast = deriveMovementCapability(player);
    expect(movementCapabilitySchema.safeParse(fast).success).toBe(true);
    expect(fast.maximumSprintSpeed).toBeGreaterThan(slow.maximumSprintSpeed);
    expect(fast.acceleration).toBeGreaterThan(slow.acceleration);
    expect(fast.walkSpeed).toBeLessThan(fast.jogSpeed);
    expect(fast.jogSpeed).toBeLessThan(fast.runSpeed);
    expect(fast.runSpeed).toBeLessThan(fast.sustainedSprintSpeed);
    expect(fast.sustainedSprintSpeed / fast.maximumSprintSpeed).toBeGreaterThan(
      slow.sustainedSprintSpeed / slow.maximumSprintSpeed,
    );
    expect(sprintSpeedAt(slow, 2)).toBe(slow.maximumSprintSpeed);
    expect(sprintSpeedAt(slow, 8)).toBe(slow.sustainedSprintSpeed);
    expect(sprintSpeedAt(slow, 100)).toBe(slow.sustainedSprintSpeed);
    const modifiers = movementCapacityModifiersSchema.parse({ speed: 0.8, acceleration: 0.75 });
    expect(deriveMovementCapability(player, modifiers).maximumSprintSpeed).toBeCloseTo(
      fast.maximumSprintSpeed * 0.8,
    );
    expect(deriveMovementCapability(player, modifiers).acceleration).toBeCloseTo(
      fast.acceleration * 0.75,
    );
    expect(deriveMovementCapability(player, movementCapacityModifiersSchema.parse({}))).toEqual(
      fast,
    );
  });

  it('interpolates a chosen sprint through physical acceleration for both control modes', () => {
    const state = fixture();
    delete state.restart;
    state.scenario = 'open_play';
    state.time = 10;
    state.actionCooldown = 20;
    const player = state.players.find(
      (p) => p.team === 'home' && p.profile.primaryPosition === 'striker',
    )!;
    for (const p of state.players) {
      p.position = { x: p.team === 'home' ? 15 : 90, y: 5 };
      p.velocity = { x: 0, y: 0 };
    }
    player.position = { x: 40, y: 34 };
    player.facingAngle = Math.PI / 2;
    state.ball = { ...player.position, ownerId: player.id };
    const carry = resolveMatchAction(state, {
      type: 'carry',
      actorId: player.id,
      target: { x: 65, y: 34 },
      movementMode: 'sprint',
    });
    const human = structuredClone(carry);
    human.controlledFootballerId = player.id;
    const npc = stepTacticalMatchAfterDecisionProbe(carry);
    const controlled = stepTacticalMatchAfterDecisionProbe(human);
    const moving = npc.players.find((p) => p.id === player.id)!;
    expect(moving.velocity).toEqual(controlled.players.find((p) => p.id === player.id)!.velocity);
    expect(Math.hypot(moving.velocity.x, moving.velocity.y)).toBeLessThanOrEqual(
      deriveMovementCapability(player).acceleration * FIXED_MATCH_DT + 0.000001,
    );
    expect(projectLocomotion(carry, player).intensity).toBe('sprint');
  });
});

describe('PR151 penalty legality and live rebound', () => {
  it.each(['home', 'away'] as const)(
    'places legal rebound candidates for %s over multiple seeds',
    (side: TeamSide) => {
      for (const seed of ['penalty-a', 'penalty-b', 'penalty-c', 'penalty-d']) {
        const state = fixture(seed);
        const geometry = deriveRestartGeometry(state, 'penalty', side);
        const keeper = state.players.find(
          (p) => p.team !== side && p.profile.primaryPosition === 'goalkeeper',
        )!;
        expect(geometry.targets[keeper.id]).toEqual({ x: side === 'home' ? 105 : 0, y: 34 });
        expect(geometry.targets[geometry.taker.id]).toEqual(geometry.ball);
        for (const player of state.players.filter(
          (p) => p.id !== geometry.taker.id && p.id !== keeper.id,
        )) {
          const point = geometry.targets[player.id]!;
          const towardGoal = side === 'home' ? point.x : 105 - point.x;
          expect(towardGoal).toBeLessThanOrEqual(88.5);
          expect(distance(point, geometry.ball)).toBeGreaterThanOrEqual(9.15);
          expect(towardGoal).toBeLessThan(94);
        }
        const nearEdge = state.players.filter((p) => {
          const point = geometry.targets[p.id]!;
          const x = side === 'home' ? point.x : 105 - point.x;
          return (
            p.profile.primaryPosition !== 'goalkeeper' &&
            p.id !== geometry.taker.id &&
            x >= 81 &&
            x < 88.5
          );
        });
        expect(nearEdge.length).toBeGreaterThanOrEqual(12);
        expect(deriveRestartGeometry(state, 'penalty', side)).toEqual(geometry);
      }
    },
  );

  it.each(['home', 'away'] as const)(
    'dissolves penalty setup on the kick and permits immediate %s rebound pursuit',
    (side) => {
      const restart = applyRestartScenario(fixture(), 'penalty', { restartTeam: side });
      const taker = restart.players.find((p) => p.id === restart.restart!.takerId)!;
      const kicked = resolveMatchAction(restart, {
        type: 'shot',
        actorId: taker.id,
        intent: 'driven',
        target: { x: side === 'home' ? 105 : 0, y: 34 },
        goalTarget: { horizontal: 0.2, vertical: 0.3 },
      });
      expect(kicked.ball.shot?.context).toBe('penalty');
      expect(kicked.restart).toBeUndefined();
      expect(kicked.scenario).toBe('open_play');
      expect(restartInfluence(kicked)).toBe(0);
      expect(kicked.players.map((p) => p.position)).toEqual(restart.players.map((p) => p.position));
      const rebound: TacticalMatchState = {
        ...kicked,
        actionCooldown: 20,
        ball: { x: side === 'home' ? 91 : 14, y: 28, looseSince: kicked.time },
      };
      const next = stepTacticalMatchAfterDecisionProbe(rebound);
      expect(next.restart).toBeUndefined();
      expect(
        next.players.some(
          (p) =>
            p.profile.primaryPosition !== 'goalkeeper' &&
            Math.hypot(p.velocity.x, p.velocity.y) > 0,
        ),
      ).toBe(true);
      for (const player of next.players)
        expect(
          distance(player.position, rebound.players.find((p) => p.id === player.id)!.position),
        ).toBeLessThan(0.3);
      expect(stepTacticalMatchAfterDecisionProbe(rebound)).toEqual(next);
    },
  );
});

describe('PR151 control episode regression', () => {
  it('keeps forty carry intentions and 1600 physical substeps inside one public touch until release', () => {
    const initial = fixture();
    delete initial.restart;
    initial.scenario = 'open_play';
    const [actor, teammate] = initial.players.filter(
      (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
    );
    initial.ball = { x: 30, y: 34 };
    let previous: TacticalMatchState = {
      ...initial,
      time: 1,
      ball: { x: 30, y: 34, ownerId: actor!.id },
    };
    let stats = observePlayerMatchStats(createMatchStatistics(initial), initial, previous);
    for (let tick = 0; tick < 1600; tick++) {
      const carried =
        tick % 40 === 0
          ? resolveMatchAction(previous, {
              type: 'carry',
              actorId: actor!.id,
              target: { x: 90, y: 34 },
            })
          : previous;
      const next = {
        ...carried,
        time: previous.time + FIXED_MATCH_DT,
        players: carried.players.map((p) =>
          p.id === actor!.id ? { ...p, position: { x: 30 + (tick + 1) * 0.025, y: 34 } } : p,
        ),
      };
      stats = observePlayerMatchStats(stats, previous, next);
      previous = next;
    }
    const released = resolveMatchAction(previous, {
      type: 'pass',
      actorId: actor!.id,
      receiverId: teammate!.id,
      target: teammate!.position,
      intent: 'support',
    });
    stats = observePlayerMatchStats(stats, previous, released);
    expect(stats.players.find((p) => p.playerId === actor!.id)).toMatchObject({
      touches: 1,
      carries: 40,
      passesAttempted: 1,
    });
    expect(stats.activeControlEpisode).toBeUndefined();
  });
});

describe('PR151 actual human/NPC shooting paths', () => {
  it('reproduces equivalent launches, targets, keeper inputs and physical results across contexts', () => {
    const template = fixture();
    const result = runShotParityBenchmark(template, { repeats: 1 });
    expect(shotParitySummarySchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      pairs: 36,
      canonicalLaunchDifferences: 0,
      targetMenuDifferences: 0,
      keeperInputDifferences: 0,
      physicalResultDifferences: 0,
      maximumPairedErrorDelta: 0,
    });
    expect(result.human).toEqual(result.npc);
    expect(result.human.unresolved).toBe(0);
    expect(result.human.horizontalErrorStdDev).toBeGreaterThan(0);
    expect(result.human.savePercent).toBeGreaterThan(0);
    expect(result.human.goalPercent).toBeGreaterThan(0);
    expect(runShotParityBenchmark(template, { repeats: 1 })).toEqual(result);
  }, 60000);
});
