import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import {
  calibrationBenchmarkConfigSchema,
  calibrationReportSchema,
  createCalibrationReport,
  createCalibrationSession,
  runCalibrationBenchmark,
  summarizeCalibrationDistribution,
} from './matchCalibrationBenchmark';

const world = createCanonicalWorldDatabase();

describe('PR148 deterministic discipline and cadence calibration export', () => {
  it('exports actual raw counts, player detail and per-90 rates with repeatable hashes', () => {
    const session = createCalibrationSession(world, 'balanced-balanced', 'export-regression');
    const first = runCalibrationBenchmark(session, 'balanced-balanced', {
      canonicalMinutes: 0.2,
      batchTicks: 1,
    });
    const second = runCalibrationBenchmark(session, 'balanced-balanced', {
      canonicalMinutes: 0.2,
      batchTicks: 73,
    });
    expect(first.hashes).toEqual(second.hashes);
    expect(first.raw).toEqual(second.raw);
    expect(first.agency).toEqual(second.agency);
    expect(first.canonicalMinutes).toBeCloseTo(0.2, 7);
    expect(first.players).toHaveLength(22);
    expect(first.players.filter((player) => player.controlled)).toHaveLength(1);
    expect(first.controlledPossessionSeconds).toBe(second.controlledPossessionSeconds);
    expect(first.tacticalFouls).toBe(second.tacticalFouls);
    expect(first.tacticalFouls).toBeLessThanOrEqual(first.raw.fouls);
    expect(first.tacticalFouls).toBe(
      first.players.reduce((total, player) => total + (player.tacticalFouls ?? 0), 0),
    );
    expect(
      first.players.reduce((total, player) => total + (player.possessionSeconds ?? 0), 0),
    ).toBeLessThanOrEqual(first.canonicalMinutes * 60 + 1e-7);
    expect(first.raw.touches).toBe(
      first.players.reduce((total, player) => total + player.raw.touches, 0),
    );
    expect(first.raw.passesAttempted).toBe(
      first.players.reduce((total, player) => total + player.raw.passesAttempted, 0),
    );
    expect(first.per90.touches).toBeCloseTo((first.raw.touches * 90) / first.canonicalMinutes, 7);
    expect(first.performance.rendererCallsBackground).toBe(0);
    expect(first.performance.ticks).toBe(480);
    const report = createCalibrationReport(
      [first, second],
      { canonicalMinutes: 0.2 },
      'test-revision',
    );
    expect(calibrationReportSchema.safeParse(JSON.parse(JSON.stringify(report))).success).toBe(
      true,
    );
    expect(report.distributions.per90.fouls?.samples).toBe(2);
    expect(report.distributions.playerRaw.touches?.samples).toBe(44);
    expect(report.distributions.outfieldPlayerPer90.distanceMetres?.samples).toBe(40);
  }, 30_000);

  it('defines representative attribute-controlled fixtures without mutating the world', () => {
    const balanced = createCalibrationSession(world, 'balanced-balanced', 'fixture');
    const aggressive = createCalibrationSession(world, 'aggressive-defenders', 'fixture');
    const weak = createCalibrationSession(world, 'weak-strong', 'fixture');
    expect(weak.home.strength).toBeLessThan(weak.away.strength);
    const defender = aggressive.away.players.find(
      (player) => player.profile.primaryPosition !== 'goalkeeper',
    )!;
    expect(defender.profile.attributes.aggression).toBe(95);
    expect(defender.profile.attributes.composure).toBe(35);
    expect(world.footballers[defender.footballerId]!.profile.attributes.aggression).not.toBe(95);
    expect(
      balanced.away.players.find((player) => player.footballerId === defender.footballerId)?.profile
        .attributes.aggression,
    ).not.toBe(95);
  });

  it('reports the distribution rather than one seed and validates benchmark input', () => {
    const distribution = summarizeCalibrationDistribution([2, 4, 6, 8]);
    expect(distribution).toMatchObject({ samples: 4, minimum: 2, maximum: 8, mean: 5 });
    expect(distribution.p25).toBeLessThanOrEqual(distribution.median);
    expect(distribution.median).toBeLessThanOrEqual(distribution.p75);
    expect(summarizeCalibrationDistribution([])).toMatchObject({
      samples: 0,
      mean: 0,
      minimum: 0,
      maximum: 0,
    });
    expect(calibrationBenchmarkConfigSchema.safeParse({ canonicalMinutes: 91 }).success).toBe(
      false,
    );
    expect(calibrationBenchmarkConfigSchema.safeParse({ batchTicks: 0 }).success).toBe(false);
  });
});
