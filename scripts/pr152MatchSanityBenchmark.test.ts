// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createCalibrationSession } from './matchCalibrationBenchmark';
import {
  createPr152BenchmarkConfig,
  pr152Distribution,
  runPr152MatchSanity,
} from './pr152MatchSanityBenchmark';

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
    expect(normal.performance.rendererCallsBackground).toBeNull();
    expect(normal.performance.rendererEvidence).toBe(
      'headless_unavailable_use_RunningLab_instrumentation',
    );
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
    expect({ ...npc.canonical.controlled, presentationCoverage: null }).toEqual({
      ...controlled.canonical.controlled,
      presentationCoverage: null,
    });
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

  it('keeps full, extended, key and player policies independent of canonical human inputs', () => {
    const session = createCalibrationSession(world, 'balanced-balanced', 'pr152-policy-parity');
    const policies = [
      'full_match',
      'extended_match',
      'key_match',
      'player_extended',
      'key_player',
    ] as const;
    const results = policies.map((presentationPolicy) =>
      runPr152MatchSanity(session, { minutes: 1, presentationPolicy }),
    );
    for (const result of results) {
      expect(result.hashes).toEqual(results[0]!.hashes);
      expect(result.canonical.teams).toEqual(results[0]!.canonical.teams);
      expect(result.presentation.prompts).toBe(results[0]!.presentation.prompts);
    }
    expect(results[0]!.presentation.hiddenCanonicalSeconds).toBe(0);
    expect(results[4]!.presentation.hiddenCanonicalSeconds).toBeGreaterThan(0);
  }, 60000);

  it('measures capture observer work without changing canonical football', () => {
    const session = createCalibrationSession(world, 'balanced-balanced', 'pr152-capture-parity');
    const normal = runPr152MatchSanity(session, { minutes: 0.25 });
    const capture = runPr152MatchSanity(session, { minutes: 0.25, observerMode: 'capture' });
    expect(capture.hashes).toEqual(normal.hashes);
    expect(capture.canonical).toEqual(normal.canonical);
    expect(normal.performance.captureRecorderCalls).toBe(0);
    expect(capture.performance.captureRecorderCalls).toBeGreaterThan(0);
    expect(capture.invariantFailures).toEqual([]);
  }, 60000);

  it('offers a fast matrix covering roles, strengths and measured observation modes', () => {
    const config = createPr152BenchmarkConfig(['--matrix=quick']);
    expect(config.positions).toEqual(['central_midfielder', 'left_back', 'striker']);
    expect(config.scenarios).toEqual(['balanced-balanced', 'weak-strong']);
    expect(config.observerModes).toEqual(['normal', 'capture']);
    expect(config.seeds).toHaveLength(2);
    expect(
      createPr152BenchmarkConfig([
        '--matrix=acceptance',
        '--minutes=5',
        '--position=striker',
        '--observer-modes=normal',
      ]).minutes,
    ).toEqual([5]);
    expect(createPr152BenchmarkConfig(['--position=striker']).positions).toEqual(['striker']);
    expect(() => createPr152BenchmarkConfig(['--matrix=unknown'])).toThrow('Unknown matrix');
  });
});
