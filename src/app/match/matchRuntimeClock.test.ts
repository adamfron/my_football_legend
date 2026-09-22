import { describe, expect, it } from 'vitest';
import { FIXED_MATCH_DT } from '../../core/matchSimulation';
import {
  accrueSimulationDebt,
  availableFixedTicks,
  consumeFixedTicks,
  createMatchRuntimeClock,
  pauseSimulationClock,
} from './matchRuntimeClock';

describe('canonical runtime clock', () => {
  it('retains a long frame gap without capping and uses the fixed 0.025 second tick', () => {
    const clock = accrueSimulationDebt(createMatchRuntimeClock(100), 10_100, 1);
    expect(FIXED_MATCH_DT).toBe(0.025);
    expect(availableFixedTicks(clock)).toBe(400);
    expect(consumeFixedTicks(clock, 120).debtSeconds).toBeCloseTo(7);
  });

  it.each([1, 4, 8, 16])('changes tick count rather than dt at x%i', (speed) => {
    const clock = accrueSimulationDebt(createMatchRuntimeClock(0), 1_000, speed);
    expect(availableFixedTicks(clock)).toBe(speed * 40);
  });

  it('discards thinking time while a player decision is open', () => {
    const owed = accrueSimulationDebt(createMatchRuntimeClock(0), 5_000, 4);
    const paused = pauseSimulationClock(owed, 20_000);
    expect(availableFixedTicks(accrueSimulationDebt(paused, 20_100, 1))).toBe(4);
  });
});
