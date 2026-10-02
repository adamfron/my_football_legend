import { describe, expect, it } from 'vitest';
import { shouldPublishBackgroundState } from './backgroundPublication';
import type { TacticalMatchState } from '../../core/matchSimulation/matchState';

const snapshot = (time: number, status = 'first_half', homeScore = 0) =>
  ({ time, status, score: { home: homeScore, away: 0 } }) as TacticalMatchState;

describe('hidden canonical state publication', () => {
  it('coalesces background display updates without reading canonical time as a scheduling budget', () => {
    const previous = snapshot(2);
    const current = snapshot(80);
    expect(shouldPublishBackgroundState(previous, current, 100)).toBe(false);
    expect(shouldPublishBackgroundState(previous, current, 250)).toBe(true);
    expect(previous.time).toBe(2);
    expect(current.time).toBe(80);
  });

  it('publishes decisions, period transitions and scores immediately', () => {
    const previous = snapshot(10);
    expect(shouldPublishBackgroundState(previous, snapshot(10), 0, true)).toBe(true);
    expect(shouldPublishBackgroundState(previous, snapshot(2700, 'half_time'), 0)).toBe(true);
    expect(shouldPublishBackgroundState(previous, snapshot(20, 'first_half', 1), 0)).toBe(true);
  });
});
