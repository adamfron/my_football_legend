import { describe, expect, it } from 'vitest';
import { createTacticalScenarios } from './scenarios';
import {
  finalFrame,
  interpolateFrame,
  tacticalToWorld,
  validateRenderFrame,
  worldToTactical,
  derivePlayerAppearance,
  PLAYER_LOCAL_FORWARD_AXIS,
  mapGoalPlanePointerToIntent,
  deriveShotAimCameraPose,
  deriveOwnedBallPose,
  shotAimIntentToGoalPoint,
  matchCameraPreferencesSchema,
  selectScreenSpacePlayerCandidate,
  updateTacticalCameraPose,
} from './model';

describe('tactical presentation model', () => {
  it('round-trips canonical and presentation coordinates', () => {
    const point = { x: 78.25, y: 12.5 };
    const world = tacticalToWorld(point);
    expect(worldToTactical({ x: world.x, z: world.z })).toEqual(point);
  });
  it('converts canonical corners and centre to renderer coordinates', () => {
    expect(tacticalToWorld({ x: 0, y: 0 })).toEqual({ x: -52.5, y: 0, z: -34 });
    expect(tacticalToWorld({ x: 52.5, y: 34 }, 2)).toEqual({ x: 0, y: 2, z: 0 });
    expect(tacticalToWorld({ x: 105, y: 68 })).toEqual({ x: 52.5, y: 0, z: 34 });
  });
  it('interpolates endpoints, midpoint, IDs and ball height', () => {
    const sequence = createTacticalScenarios()[2]!.sequence;
    expect(interpolateFrame(sequence, 0)).toBe(sequence.frames[0]);
    const midpoint = interpolateFrame(sequence, 800);
    expect(midpoint.players.map(({ id }) => id)).toEqual(
      sequence.frames[0]!.players.map(({ id }) => id),
    );
    expect(midpoint.ball.x).toBe(65);
    expect(midpoint.ball.height).toBe(1.75);
    expect(interpolateFrame(sequence, 1600)).toBe(sequence.frames[1]);
    expect(interpolateFrame(sequence, 3200)).toBe(sequence.frames[2]);
    expect(finalFrame(sequence)).toBe(sequence.frames[2]);
  });
  it('generates all scenarios deterministically', () => {
    expect(createTacticalScenarios()).toEqual(createTacticalScenarios());
    expect(createTacticalScenarios().map(({ id }) => id)).toEqual([
      'progressive-pass',
      'interception',
      'shot',
    ]);
  });
  it('derives stable presentation identity independently of canonical state', () => {
    expect(PLAYER_LOCAL_FORWARD_AXIS).toBe('+Z');
    expect(derivePlayerAppearance('footballer_pro_9_17')).toEqual(
      derivePlayerAppearance('footballer_pro_9_17'),
    );
    const identities = new Set(
      ['player-a', 'player-b', 'player-c', 'player-d'].map(
        (id) => derivePlayerAppearance(id).hairStyle,
      ),
    );
    expect(identities.size).toBeGreaterThan(1);
  });
  it('identifies invalid canonical coordinates instead of projecting a blank frame', () => {
    const frame = structuredClone(createTacticalScenarios()[0]!.sequence.frames[0]!);
    frame.players[0]!.x = Number.NaN;
    expect(validateRenderFrame(frame)).toContain(
      `invalid player coordinate for ${frame.players[0]!.id}`,
    );
    const valid = createTacticalScenarios()[0]!.sequence.frames[0]!;
    expect(validateRenderFrame(valid)).toBeUndefined();
  });
  it('places the shot camera behind either team relative to the opponent goal', () => {
    const home = deriveShotAimCameraPose('home', { x: 80, y: 34 });
    const away = deriveShotAimCameraPose('away', { x: 25, y: 34 });
    expect(home.position.x).toBeLessThan(80 - 52.5);
    expect(home.lookAt.x).toBeGreaterThan(home.position.x);
    expect(home.opponentGoal).toBe('away');
    expect(away.position.x).toBeGreaterThan(25 - 52.5);
    expect(away.lookAt.x).toBeLessThan(away.position.x);
    expect(away.opponentGoal).toBe('home');
  });
  it('maps a touch-sized goal plane to normalized shot intention', () => {
    expect(
      mapGoalPlanePointerToIntent(300, 20, { left: 100, top: 20, width: 200, height: 120 }),
    ).toEqual({ horizontal: 1, vertical: 1 });
    expect(
      mapGoalPlanePointerToIntent(0, 200, { left: 100, top: 20, width: 200, height: 120 }),
    ).toEqual({ horizontal: -1, vertical: 0 });
    expect(
      mapGoalPlanePointerToIntent(200, 80, { left: 100, top: 20, width: 200, height: 120 }),
    ).toEqual({ horizontal: 0, vertical: 0.5 });
  });
  it('keeps visual left and right shooter-relative when teams change ends', () => {
    const left = { horizontal: -1, vertical: 0.5 };
    const right = { horizontal: 1, vertical: 0.5 };
    expect(shotAimIntentToGoalPoint('home', left).y).toBeGreaterThan(
      shotAimIntentToGoalPoint('home', right).y,
    );
    expect(shotAimIntentToGoalPoint('away', left).y).toBeLessThan(
      shotAimIntentToGoalPoint('away', right).y,
    );
    expect(shotAimIntentToGoalPoint('home', { horizontal: 0, vertical: 0.5 })).toMatchObject({
      x: 105,
      y: 34,
      height: 1.22,
    });
  });
  it('keeps overview stable while action and player focus follow their current target', () => {
    const overview = { preset: 'overview' as const, zoom: 0.5 };
    expect(updateTacticalCameraPose(overview, { x: 10, y: 10 })).toEqual(
      updateTacticalCameraPose(overview, { x: 90, y: 60 }),
    );
    expect(
      updateTacticalCameraPose({ preset: 'action', zoom: 0.5 }, { x: 10, y: 10 }).lookAt,
    ).not.toEqual(
      updateTacticalCameraPose({ preset: 'action', zoom: 0.5 }, { x: 90, y: 60 }).lookAt,
    );
    expect(
      updateTacticalCameraPose(
        { preset: 'player_focus', zoom: 0.5 },
        { x: 10, y: 10 },
        { x: 40, y: 20 },
      ).lookAt,
    ).toEqual(tacticalToWorld({ x: 40, y: 20 }));
  });
  it('projects an owned ball to the feet without changing a ball in flight', () => {
    const frame = structuredClone(createTacticalScenarios()[0]!.sequence.frames[0]!);
    frame.ball = { x: frame.players[0]!.x, y: frame.players[0]!.y, ownerId: frame.players[0]!.id };
    expect(deriveOwnedBallPose(frame)).not.toEqual(frame.ball);
    frame.ball.height = 1;
    expect(deriveOwnedBallPose(frame)).toBe(frame.ball);
  });
  it('validates bounded camera preferences', () => {
    expect(matchCameraPreferencesSchema.safeParse({ preset: 'action', zoom: 0.7 }).success).toBe(
      true,
    );
    expect(matchCameraPreferencesSchema.safeParse({ preset: 'free', zoom: 2 }).success).toBe(false);
  });
  it('uses a minimum screen radius and resolves overlapping players deterministically', () => {
    const candidates = [
      { playerId: 'near-irrelevant', x: 101, y: 100, depth: 0.1, actionable: false },
      { playerId: 'target-b', x: 104, y: 100, depth: 0.2, actionable: true },
      { playerId: 'target-a', x: 104, y: 100, depth: 0.2, actionable: true },
    ];
    expect(selectScreenSpacePlayerCandidate(candidates, { x: 100, y: 100 }, 18)?.playerId).toBe(
      'target-a',
    );
    expect(selectScreenSpacePlayerCandidate(candidates, { x: 140, y: 100 }, 18)).toBeUndefined();
  });
});
