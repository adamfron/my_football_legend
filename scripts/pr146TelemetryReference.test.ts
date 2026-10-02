import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatch,
} from '../src/core/matchSimulation/matchSimulation';
import {
  assertTelemetryInvariants,
  createMatchFlowTelemetry,
  matchFlowTelemetrySchema,
  observeMatchFlow,
} from '../src/core/matchSimulation/matchFlowTelemetry';

describe('PR147 complete telemetry reference (PR146 observer contract)', () => {
  // PR147 intentionally changes canonical duels, fouls and restarts, with defensive access
  // using the shared football orientation convention (sin(theta), cos(theta)). Freeze its entire telemetry
  // output with the same seeds/duration and unchanged all-field hash assertion. The historical
  // PR145→146 equivalence evidence remains in docs/performance/PR146-results.json; its old hashes
  // were 015e6495f4560e3f5cc5b9f579679dc79db7c5948443ab1d1637ad776ff2e9e1 (a) and
  // 8dc0c4e14544e549659965b3a941a46918fd90cea026d789f8b4afe3518eb88c (b).
  it.each([
    ['pr146-flow-reference:a', '2766af2ddef26ddbe30072b38f7904ef8104e8a01562c392314ef5137db34d0d'],
    ['pr146-flow-reference:b', 'b2f91e381b5d77e4a5dff30da7d684c56e4026b73e7360f0190a4c2335d13c0e'],
  ])('preserves every exported canonical telemetry field for %s', (seed, expectedHash) => {
    const world = createCanonicalWorldDatabase();
    let state = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed,
        control: { mode: 'spectator' },
      }),
    );
    let telemetry = createMatchFlowTelemetry(seed);
    for (let tick = 0; tick < 2_400; tick++) {
      const previous = state;
      state = stepTacticalMatch(state, FIXED_MATCH_DT);
      telemetry = observeMatchFlow(telemetry, previous, state);
    }
    assertTelemetryInvariants(telemetry);
    matchFlowTelemetrySchema.parse(telemetry);
    const stableJson = JSON.stringify(telemetry, (_key, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, (value as Record<string, unknown>)[key]]),
          )
        : value,
    );
    expect(createHash('sha256').update(stableJson).digest('hex')).toBe(expectedHash);
  });
});
