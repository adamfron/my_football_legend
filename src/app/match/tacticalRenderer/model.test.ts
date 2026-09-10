import { describe, expect, it } from 'vitest';
import { createTacticalScenarios } from './scenarios';
import {
  finalFrame,
  interpolateFrame,
  tacticalToWorld,
  validateRenderFrame,
  worldToTactical,
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
  it('identifies invalid canonical coordinates instead of projecting a blank frame', () => {
    const frame = structuredClone(createTacticalScenarios()[0]!.sequence.frames[0]!);
    frame.players[0]!.x = Number.NaN;
    expect(validateRenderFrame(frame)).toContain(
      `invalid player coordinate for ${frame.players[0]!.id}`,
    );
    const valid = createTacticalScenarios()[0]!.sequence.frames[0]!;
    expect(validateRenderFrame(valid)).toBeUndefined();
  });
});
