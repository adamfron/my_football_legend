// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { runReactiveTacticsBenchmark } from './benchmarkReactiveTactics';

describe('PR151 deterministic physical team adaptation benchmark', () => {
  it('changes executed build-up/support and real AI recycling across several seeds', () => {
    const result = runReactiveTacticsBenchmark();
    for (const seed of result.seeds) {
      expect(seed.canonicalPressWins).toBeGreaterThanOrEqual(2);
      expect(seed.buildUpLineAfterMetres).toBeLessThan(seed.buildUpLineBeforeMetres - 1);
      expect(seed.supportOutlets).toBe(2);
      expect(seed.supportDistanceAfterMetres).toBeLessThan(seed.supportDistanceBeforeMetres * 0.6);
      expect(seed.recycleChoicesAfter).toBeGreaterThan(seed.recycleChoicesBefore);
      expect(seed.weakTeamWidthAfterMetres).toBeLessThan(seed.weakTeamWidthBeforeMetres);
      expect(seed.weakTeamLineAfterMetres).toBeLessThan(seed.weakTeamLineBeforeMetres);
      expect(seed.weakTeamAttackingOutlets).toBeGreaterThan(0);
      expect(seed.safeDoublePress).toBe(true);
      expect(seed.unsafeDoublePressDeclined).toBe(true);
    }
    expect(runReactiveTacticsBenchmark()).toEqual(result);
  });
});
