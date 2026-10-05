// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createCalibrationSession } from './matchCalibrationBenchmark';
import { pr152Distribution, runPr152MatchSanity } from './pr152MatchSanityBenchmark';

const world = createCanonicalWorldDatabase();

describe('PR152 deterministic sanity driver', () => {
  it('keeps ordinary collection cheap and DEV observation causally inert with deterministic repeated football', () => {
    const session = createCalibrationSession(world, 'balanced-balanced', 'pr152-driver');
    const normal = runPr152MatchSanity(session, { minutes: 1 });
    const dev = runPr152MatchSanity(session, { minutes: 1, observerMode: 'dev' });
    const repeat = runPr152MatchSanity(session, { minutes: 1 });
    expect(dev.hashes).toEqual(normal.hashes);
    expect(repeat.hashes).toEqual(normal.hashes);
    expect(dev.canonical).toEqual(normal.canonical);
    expect(normal.invariantFailures).toEqual([]);
    expect(normal.performance.detailedObserverCalls).toBe(0);
    expect(dev.performance.detailedObserverCalls).toBeGreaterThan(0);
    expect(normal.performance.rendererCallsBackground).toBe(0);
    expect(
      normal.presentation.hiddenCanonicalSeconds + normal.presentation.visibleCanonicalSeconds,
    ).toBeCloseTo(normal.canonical.canonicalSeconds, 7);
    const coverage = normal.canonical.controlled!.presentationCoverage!;
    expect(coverage.hidden.possessionEpisodes + coverage.visiblePossessionEpisodes).toBe(
      normal.canonical.controlled!.possessionEpisodes,
    );
  }, 60000);

  it('measures the same identified footballer when human control is disabled or removed', () => {
    const session = createCalibrationSession(world, 'balanced-balanced', 'pr152-driver-equivalent');
    const controlled = runPr152MatchSanity(session, {
      minutes: 1,
      variant: 'controlled_autonomous',
    });
    const npc = runPr152MatchSanity(session, { minutes: 1, variant: 'npc' });
    expect(npc.hashes.behaviour).toBe(controlled.hashes.behaviour);
    expect(npc.hashes.statistics).toBe(controlled.hashes.statistics);
    expect(npc.positionalInvolvement).toEqual(controlled.positionalInvolvement);
    expect(npc.canonical.controlled).toEqual(controlled.canonical.controlled);
    expect(controlled.presentation.prompts).toBe(0);
    expect(npc.presentation.prompts).toBe(0);
  }, 60000);

  it('uses true medians for odd/even multi-seed distributions', () => {
    expect(pr152Distribution([7, 1, 3, 9])).toEqual({
      samples: 4,
      minimum: 1,
      median: 5,
      maximum: 9,
      mean: 5,
    });
    expect(pr152Distribution([9, 1, 4]).median).toBe(4);
  });
});
