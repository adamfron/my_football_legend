import { describe, expect, it, vi } from 'vitest';
import { MATCH_PRESENTATION_POLICIES, type MatchMomentCandidate } from './matchMoment';
import {
  advanceBackgroundBatch,
  appendMomentCandidate,
  isMomentEpisodeResolved,
} from './matchPresentation';

const candidate = (
  detectedAt: number,
  kind: MatchMomentCandidate['kind'],
  importance: number,
  requiresHumanDecision = false,
): MatchMomentCandidate => ({
  kind,
  importance,
  actorIds: [],
  reasons: [kind],
  controlledPlayerInvolved: requiresHumanDecision,
  requiresHumanDecision,
  detectedAt,
  suggestedLeadInSeconds: 2,
});

describe('match presentation runtime', () => {
  it('clusters a shot, parry and rebound into one episode until danger is quiet', () => {
    const shot = appendMomentCandidate(undefined, candidate(10, 'shot', 0.9));
    const parry = appendMomentCandidate(shot, candidate(10.4, 'goalkeeper_intervention', 0.82));
    const rebound = appendMomentCandidate(parry, candidate(11.1, 'shot', 0.92));

    expect(rebound.id).toBe(shot.id);
    expect(rebound.candidates.map((item) => item.kind)).toEqual([
      'shot',
      'goalkeeper_intervention',
      'shot',
    ]);
    expect(isMomentEpisodeResolved(rebound, candidate(12, 'routine', 0.08), 12)).toBe(false);
    expect(isMomentEpisodeResolved(rebound, candidate(14.2, 'routine', 0.08), 14.2)).toBe(true);
  });

  it('uses every fixed canonical tick and gives identical all-AI results', () => {
    const advance = vi.fn((state: number, dt: number) => state + dt);
    const result = advanceBackgroundBatch({
      state: 0,
      maxTicks: 400,
      policy: MATCH_PRESENTATION_POLICIES.key_player,
      advance,
      project: (time) => candidate(time, 'routine', 0.08),
      isRunning: () => true,
    });
    const continuous = Array.from({ length: 400 }).reduce<number>((time) => time + 0.025, 0);

    expect(result.state).toBeCloseTo(continuous, 10);
    expect(result.ticksProcessed).toBe(400);
    expect(advance).toHaveBeenCalledTimes(400);
    expect(new Set(advance.mock.calls.map((call) => call[1]))).toEqual(new Set([0.025]));
  });

  it('stops before a surfaced decision and deterministically proxies a suppressed one', () => {
    const surface = advanceBackgroundBatch({
      state: 5,
      maxTicks: 10,
      policy: MATCH_PRESENTATION_POLICIES.key_player,
      advance: (state: number) => state + 1,
      project: (time) => candidate(time, 'player_decision', 0.8, true),
      isRunning: () => true,
    });
    expect(surface).toMatchObject({ state: 5, ticksProcessed: 0, stopReason: 'human_decision' });

    const run = () =>
      advanceBackgroundBatch({
        state: 5,
        maxTicks: 1,
        policy: MATCH_PRESENTATION_POLICIES.key_player,
        advance: (state: number) => state + 1,
        project: (time) => candidate(time, 'player_decision', 0.4, true),
        resolveSuppressedDecision: (state: number) => state * 2,
        isRunning: () => true,
      }).state;
    expect(run()).toBe(11);
    expect(run()).toBe(11);
  });

  it('full match is the zero-filter policy', () => {
    const result = advanceBackgroundBatch({
      state: 0,
      maxTicks: 10,
      policy: MATCH_PRESENTATION_POLICIES.full_match,
      advance: (state: number) => state + 1,
      project: (time) => candidate(time, 'box_entry', 0.2),
      isRunning: () => true,
    });
    expect(result.stopReason).toBe('surface_moment');
    expect(result.ticksProcessed).toBe(0);
  });
});
