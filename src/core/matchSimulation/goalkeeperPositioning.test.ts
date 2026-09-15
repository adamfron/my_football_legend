import { describe, expect, it } from 'vitest';
import { deriveGoalkeeperBasePosition } from './goalkeeperPositioning';

describe('goalkeeper positioning geometry', () => {
  it('moves along the ball-to-goal-centre relationship and narrows nearby angles', () => {
    const central = deriveGoalkeeperBasePosition({ x: 70, y: 34 }, 'home');
    const wide = deriveGoalkeeperBasePosition({ x: 70, y: 60 }, 'home');
    const nearby = deriveGoalkeeperBasePosition({ x: 18, y: 34 }, 'home');
    expect(wide.y).toBeGreaterThan(central.y);
    expect(nearby.x).toBeGreaterThan(central.x);
  });

  it('mirrors the same geometry for the opposite goal', () => {
    const home = deriveGoalkeeperBasePosition({ x: 35, y: 25 }, 'home');
    const away = deriveGoalkeeperBasePosition({ x: 70, y: 43 }, 'away');
    expect(away.x).toBeCloseTo(105 - home.x);
    expect(away.y).toBeCloseTo(68 - home.y);
  });
});
