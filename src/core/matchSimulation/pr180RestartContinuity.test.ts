import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { deriveRestartLegalReadiness } from './restartLaws';
import { tacticalMatchStateSchema } from './matchState';
import type { TacticalMatchState } from './matchState';
const files = [
  'pr180-dev-ss-1-role-intent-v1-restart-state.json.gz',
  'pr180-dev-sw-1-phase-role-hybrid-v1-restart-state.json.gz',
  'pr180-dev-sw-2-role-intent-v1-restart-state.json.gz',
];
describe('PR180 real two-player-wall contact regressions', () => {
  it.each(files)('walks out of the actual body trap and releases legally: %s', (file) => {
    const frozen: TacticalMatchState = JSON.parse(
      gunzipSync(readFileSync(`docs/performance/pr180-evidence/${file}`)).toString(),
    );
    tacticalMatchStateSchema.parse(frozen);
    for (const policy of [
      'legacy-pr176',
      'state-value-v1',
      'role-value-v1',
      'role-intent-v1',
      'phase-role-hybrid-v1',
    ] as const) {
      let state: TacticalMatchState = { ...structuredClone(frozen), decisionPolicy: policy };
      const award = state.restart!.awardId,
        started = state.time,
        ball = { ...state.ball };
      let physicallyReady = false,
        ticks = 0,
        releasedAt = 0;
      for (; ticks < 400 && state.restart?.awardId === award; ticks++) {
        physicallyReady ||= deriveRestartLegalReadiness(state).ready;
        state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
        releasedAt = Math.max(releasedAt, state.restart?.executedAt ?? 0);
        if (state.restart?.phase !== 'release' && state.restart?.awardId === award)
          expect(Math.hypot(state.ball.x - ball.x, state.ball.y - ball.y)).toBeLessThan(0.15);
      }
      expect(physicallyReady).toBe(true);
      expect(state.restart?.awardId).not.toBe(award);
      expect(state.time - started).toBeLessThan(10);
      expect(ticks).toBeGreaterThan(1);
      expect(releasedAt).toBeGreaterThanOrEqual(started);
    }
  });
});
