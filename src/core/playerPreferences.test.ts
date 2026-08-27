import { describe, expect, it } from 'vitest';
import type { PlayerAttributes } from '../types/domain';
import {
  changeEffortTendency,
  deriveInitialEffort,
  effectiveMatchEffort,
} from './playerPreferences';

const attributes = (value: number): PlayerAttributes => ({
  technique: 50,
  vision: 50,
  pace: 50,
  stamina: 50,
  finishing: 50,
  defending: 50,
  leadership: 50,
  composure: 50,
  spatialAwareness: 50,
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
