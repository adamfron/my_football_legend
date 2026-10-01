import { describe, expect, it } from 'vitest';
import { runCalibrationShotFunnel, shotFunnelFamilySchema } from './calibrationShotFunnel';

describe('bounded canonical shot calibration probe', () => {
  it('releases every supported family and repeats the same physical outcomes for fixed fixtures', () => {
    const first = runCalibrationShotFunnel(2);
    expect(first).toEqual(runCalibrationShotFunnel(2));
    expect(first.map((sample) => sample.family)).toEqual(shotFunnelFamilySchema.options);
    for (const sample of first) {
      expect(sample.attempts).toBe(2);
      expect(sample.unresolved).toBe(0);
      // Passive body deflections are physical keeper contacts, but require no pre-reaction save.
      expect(sample.keeperContacts).toBeGreaterThanOrEqual(sample.saves);
      expect(sample.keeperContacts).toBeLessThanOrEqual(sample.saves + sample.blocks);
      expect(sample.goals + sample.saves + sample.blocks).toBeLessThanOrEqual(sample.attempts);
    }
  });
});
