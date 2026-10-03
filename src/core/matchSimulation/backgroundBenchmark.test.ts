import { describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { runBackgroundBenchmark } from './backgroundBenchmark';
import { runMatchFlowBatch } from './matchFlowCalibration';
import * as matchSimulation from './matchSimulation';

const world = createCanonicalWorldDatabase();
const session = createSingleMatchSession(world, {
  homeClubId: world.clubs[0]!.id,
  awayClubId: world.clubs[1]!.id,
  seed: 'pr148-background-terminal',
  control: { mode: 'spectator' },
});

describe('canonical terminal states in legacy calibration runners', () => {
  it('stops the background runner after abandonment and records actual clock advancement', () => {
    const step = vi.spyOn(matchSimulation, 'stepTacticalMatch').mockImplementationOnce((state) => ({
      ...state,
      time: 0.025,
      status: 'abandoned',
      termination: { reason: 'insufficient_players', at: 0.025, team: 'home', activePlayers: 6 },
    }));
    try {
      const result = runBackgroundBenchmark(session, { canonicalMinutes: 5, mode: 'core' });
      expect(step).toHaveBeenCalledTimes(1);
      expect(result.performance.ticksExecuted).toBe(1);
      expect(result.performance.canonicalSecondsAdvanced).toBe(0.025);
      expect(result.final).toMatchObject({
        time: 0.025,
        status: 'abandoned',
        termination: { reason: 'insufficient_players' },
      });
      expect(result.performance.rendererCallsBackground).toBe(0);
    } finally {
      step.mockRestore();
    }
  });

  it('exports abandonment from the flow batch without iterating frozen snapshots', () => {
    const step = vi.spyOn(matchSimulation, 'stepTacticalMatch').mockImplementationOnce((state) => ({
      ...state,
      time: 0.025,
      status: 'abandoned',
      termination: { reason: 'insufficient_players', at: 0.025, team: 'away', activePlayers: 6 },
    }));
    try {
      const result = runMatchFlowBatch({ canonicalSeconds: 5400, sessions: [session] });
      expect(step).toHaveBeenCalledTimes(1);
      expect(result.sessions[0]!.completion).toMatchObject({
        canonicalSeconds: 0.025,
        status: 'abandoned',
        termination: { reason: 'insufficient_players' },
      });
      expect(result.totals.minutes).toBeCloseTo(0.025 / 60, 7);
    } finally {
      step.mockRestore();
    }
  });

  it('advances the second half when a legacy flow benchmark requests 90 minutes', () => {
    const step = vi.spyOn(matchSimulation, 'stepTacticalMatch').mockImplementation((state) => ({
      ...state,
      time: state.time < 2700 ? 2700 : 5400,
      status: state.time < 2700 ? 'half_time' : 'full_time',
    }));
    try {
      const result = runMatchFlowBatch({ canonicalSeconds: 5400, sessions: [session] });
      expect(step).toHaveBeenCalledTimes(2);
      expect(result.sessions[0]!.completion).toMatchObject({
        canonicalSeconds: 5400,
        status: 'full_time',
      });
      expect(result.totals.minutes).toBe(90);
    } finally {
      step.mockRestore();
    }
  });
});
