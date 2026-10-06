// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { runReactiveTacticsBenchmark } from './benchmarkReactiveTactics';

describe('PR151 deterministic physical team adaptation benchmark', () => {
  it('changes executed build-up/support and real AI recycling across several seeds', () => {
    const result = runReactiveTacticsBenchmark();
    for (const seed of result.seeds) {
      expect(seed.canonicalPressWins).toBeGreaterThanOrEqual(2);
      expect(seed.buildUpLineAfterMetres).toBeLessThan(seed.buildUpLineBeforeMetres - 1);
      expect(seed.supportOutlets).toBeGreaterThanOrEqual(2);
      expect(seed.supportOutlets).toBeLessThanOrEqual(4);
      // PR154 also supplies immediate support in the neutral run. Learned pressure
      // retains that connection rather than being its sole activation mechanism.
      expect(seed.supportDistanceAfterMetres).toBeLessThan(seed.supportDistanceBeforeMetres);
      // Expected-value selection now avoids this dangerous route before historical losses.
      expect(seed.recycleChoicesAfter).toBeGreaterThanOrEqual(seed.recycleChoicesBefore);
      expect(seed.recycleChoicesAfter).toBeGreaterThan(0);
      expect(seed.weakTeamWidthAfterMetres).toBeLessThan(seed.weakTeamWidthBeforeMetres);
      expect(seed.weakTeamLineAfterMetres).toBeLessThan(seed.weakTeamLineBeforeMetres);
      expect(seed.weakTeamAttackingOutlets).toBeGreaterThan(0);
      expect(seed.safeDoublePress).toBe(true);
      expect(seed.unsafeDoublePressDeclined).toBe(true);
    }
    expect(runReactiveTacticsBenchmark()).toEqual(result);
  });
});
