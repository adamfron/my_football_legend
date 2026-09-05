import { describe, expect, it } from 'vitest';
import type { PlayerAttributes } from '../types/domain';
import {
  changeEffortTendency,
  deriveInitialEffort,
  effectiveMatchEffort,
} from './playerPreferences';

const attributes = (value: number): PlayerAttributes => ({
  firstTouch: 50,
  dribbling: 50,
  heading: 50,
  setPieces: 50,
  concentration: 50,
  aggression: 50,
  strength: 50,
  agility: 50,
  jumping: 50,
  reflexes: 10,
  handling: 10,
  oneOnOnes: 10,
  goalkeeperSweeping: 10,
  goalkeeperKicking: 10,
  goalkeeperThrowing: 10,
  technique: 50,
  passing: 50,
  pace: 50,
  stamina: 50,
  finishing: 50,
  tackling: 50,
  positioning: 50,
  leadership: 50,
  composure: 50,
  gameReading: 50,
  determination: value,
  ambition: value,
  professionalism: value,
});

describe('behavioural effort tendencies', () => {
  it('is deterministic and personality-led', () => {
    expect(deriveInitialEffort('same', attributes(70))).toEqual(
      deriveInitialEffort('same', attributes(70)),
    );
    const low = deriveInitialEffort('comparison', attributes(10));
    const high = deriveInitialEffort('comparison', attributes(90));
    expect(high.trainingEffort).toBeGreaterThan(low.trainingEffort);
    expect(high.matchEffort).toBeGreaterThan(low.matchEffort);
  });

  it('changes by one, clamps habits, and keeps temporary intensity separate', () => {
    expect(changeEffortTendency(3, 1)).toBe(4);
    expect(changeEffortTendency(5, 1)).toBe(5);
    expect(changeEffortTendency(1, -1)).toBe(1);
    expect(effectiveMatchEffort(3, 1)).toBe(4);
    expect(effectiveMatchEffort(3, 1)).not.toBe(3);
  });
});
