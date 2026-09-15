import { describe, expect, it } from 'vitest';
import {
  classifyRelativeMovement,
  integrateFacing,
  movementModeSpeedFactor,
} from './playerOrientation';

describe('canonical body orientation', () => {
  it('turns high-agility players faster without snapping', () => {
    const low = integrateFacing(0, Math.PI, 20, 0, 0.1);
    const high = integrateFacing(0, Math.PI, 90, 0, 0.1);
    expect(Math.abs(high)).toBeGreaterThan(Math.abs(low));
    expect(Math.abs(high)).toBeLessThan(Math.PI);
  });

  it('separates retreat direction from facing and limits backpedal speed', () => {
    expect(classifyRelativeMovement(0, { x: 0, y: -5 }, 5)).toBe('backpedal');
    expect(classifyRelativeMovement(0, { x: 0, y: -12 }, 12)).toBe('turn_and_run');
    expect(movementModeSpeedFactor('backpedal')).toBeLessThan(movementModeSpeedFactor('forward'));
  });
});
